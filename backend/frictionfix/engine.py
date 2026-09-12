"""Team: TO FILL | Members: TO FILL. Experiment lifecycle and closed-loop policy."""

from collections import deque
from dataclasses import asdict
import json
from pathlib import Path
import sqlite3
import threading
import time
from uuid import uuid4
import numpy as np

from .calibration import fit_calibration
from .schemas import SessionConfig, BehaviorEvent, EEGChunk, TrialOutcome
from .signal import WindowBuffer, extract_features, FEATURE_NAMES

STALE_SECONDS = 4.0


class Session:
    def __init__(self, config: SessionConfig, clock=time.time):
        self.id = str(uuid4())
        self.config = config
        self.clock = clock
        self.created_at = clock()
        self.phase = "setup"
        self.layout = config.initial_layout
        self.started_at = None
        self.ended_at = None
        self.field_started = None
        self.focused_field = None
        self.fields = {f: {"errors": 0, "valid": False, "focused_seconds": 0.0}
                       for f in config.field_ids}
        self.events = []
        self.event_ids = set()
        self.recent_errors = deque()
        self.layout_changes = []
        self.pending_adaptation = None
        self.buffer = WindowBuffer(config.sample_rate, len(config.channel_names))
        self.windows = deque(maxlen=2)
        self.total_windows = 0
        self.rejected_windows = 0
        self.last_window_at = None
        self.quality = "disconnected"
        self.quality_details = None
        self.latest_features = None
        self.risk_score = None
        self.high_windows = 0
        self.model = None
        self.calibration_report = None
        self.trials = []
        self.active_trial = None

    def _reset_signal(self):
        self.buffer.clear_samples()
        self.windows.clear()
        self.last_window_at = None
        self.risk_score = None
        self.high_windows = 0
        self.quality = "waiting"

    def start_calibration(self):
        if self.phase != "setup" or self.config.source == "manual":
            raise ValueError("Calibration requires a setup session with live or replay EEG")
        if self.model is not None:
            raise ValueError("This session already has a calibration model")
        self.phase = "calibrating"
        self._reset_signal()

    def start_trial(self):
        if self.phase != "calibrating" or self.active_trial:
            raise ValueError("Start one calibration trial at a time while calibrating")
        self._reset_signal()
        self.active_trial = {"id": str(uuid4()), "started_at": self.clock(), "windows": []}
        return self.active_trial["id"]

    def end_trial(self, outcome: TrialOutcome):
        if self.phase != "calibrating" or not self.active_trial:
            raise ValueError("No active calibration trial")
        trial = self.active_trial
        now = self.clock()
        self.tick()
        if len(trial["windows"]) < 2 or self.quality != "usable":
            raise ValueError("Need two consecutive usable EEG windows immediately before the outcome")
        elapsed = now - trial["started_at"]
        # Only EEG from this trial, received before outcome submission, is used.
        record = {
            "trial_id": trial["id"], "elapsed_seconds": elapsed,
            "success": outcome.success, "errors": outcome.errors,
            "label": int(not outcome.success or outcome.errors > 0
                         or elapsed >= self.config.hesitation_seconds),
            "features": np.mean(trial["windows"][-2:], axis=0).tolist(),
        }
        self.trials.append(record)
        self.active_trial = None
        return record

    def cancel_trial(self):
        if self.phase != "calibrating" or self.active_trial is None:
            raise ValueError("No active calibration trial")
        self.active_trial = None
        self._reset_signal()

    def fit(self):
        if self.phase != "calibrating" or self.active_trial:
            raise ValueError("Finish or cancel the active trial before fitting")
        self.model, self.calibration_report = fit_calibration(self.trials)
        self.phase = "ready"
        self._reset_signal()

    def start_task(self):
        if self.phase not in {"setup", "ready"}:
            raise ValueError("Task can start only once, after setup or calibration")
        self.phase = "running"
        self.started_at = self.clock()
        self._reset_signal()

    def ingest(self, chunk: EEGChunk):
        if self.phase in {"completed", "abandoned"}:
            raise ValueError("Session has ended")
        if self.config.source == "manual" or chunk.source != self.config.source:
            raise ValueError("Chunk source must match the session; replay cannot masquerade as live")
        samples = np.asarray(chunk.samples, dtype=float)
        if chunk.units == "V":
            samples = samples * 1e6
        windows, gap = self.buffer.push(samples, chunk.sequence, chunk.start_time)
        if gap or (self.last_window_at is not None
                   and self.clock() - self.last_window_at > STALE_SECONDS):
            self.windows.clear()
            self.high_windows = 0
            self.risk_score = None
            self.quality = "waiting"
            if self.active_trial:
                self.active_trial["windows"].clear()
        for window in windows:
            result = extract_features(window, self.config.sample_rate)
            self.total_windows += 1
            self.last_window_at = self.clock()
            self.quality = result.quality
            self.quality_details = asdict(result) | {"features": None}
            if result.features is None:
                self.rejected_windows += 1
                self.windows.clear()
                self.risk_score = None
                self.high_windows = 0
                self.latest_features = None
                if self.active_trial:
                    self.active_trial["windows"].clear()
                continue
            self.latest_features = dict(zip(FEATURE_NAMES, result.features))
            self.windows.append(result.features)
            if self.phase == "calibrating" and self.active_trial:
                self.active_trial["windows"].append(result.features)
            if self.phase == "running" and self.model is not None and len(self.windows) == 2:
                vector = np.mean(self.windows, axis=0).reshape(1, -1)
                self.risk_score = float(self.model.predict_proba(vector)[0, 1])
                self.high_windows = (self.high_windows + 1
                                     if self.risk_score >= self.config.risk_threshold else 0)
        self.tick()

    def _close_focus(self, now):
        if self.focused_field is not None:
            self.fields[self.focused_field]["focused_seconds"] += now - self.field_started
        self.focused_field = None
        self.field_started = None

    def record_event(self, event: BehaviorEvent):
        if event.event_id in self.event_ids:
            previous = next(e for e in self.events if e["event_id"] == event.event_id)
            if any(previous[k] != v for k, v in event.model_dump().items()):
                raise ValueError("event_id was already used for different content")
            return
        if self.phase != "running":
            raise ValueError("Start the task before recording events; ended sessions are immutable")
        now = self.clock()
        if event.type.startswith("field_"):
            if event.field_id not in self.fields:
                raise ValueError("Unknown or missing field_id")
            if event.type == "field_validation" and event.correct is None:
                raise ValueError("field_validation requires correct: true or false")
        if event.type == "field_focus":
            if self.focused_field != event.field_id:
                self._close_focus(now)
                self.focused_field, self.field_started = event.field_id, now
        elif event.type == "field_blur":
            if self.focused_field == event.field_id:
                self._close_focus(now)
        elif event.type == "field_changed":
            self.fields[event.field_id]["valid"] = False
        elif event.type == "field_validation":
            self.fields[event.field_id]["valid"] = event.correct
            if not event.correct:
                self.fields[event.field_id]["errors"] += 1
                self.recent_errors.append(now)
        elif event.type == "layout_changed":
            self.tick()
            if event.layout is None or event.reason is None:
                raise ValueError("layout_changed requires layout and reason")
            if event.layout == self.layout:
                raise ValueError("Requested layout is already active")
            if event.reason == "adaptation":
                pending = self.pending_adaptation
                if not pending or event.request_id != pending["request_id"] or event.layout != "guided":
                    raise ValueError("No matching pending adaptation request")
            self.layout_changes.append({
                "at_seconds": now - self.started_at, "from": self.layout,
                "to": event.layout, "reason": event.reason,
                "request_id": event.request_id,
            })
            self.layout = event.layout
            self.pending_adaptation = None
            self.high_windows = 0
        elif event.type in {"task_complete", "task_abandon"}:
            if event.type == "task_complete" and not all(f["valid"] for f in self.fields.values()):
                raise ValueError("All fields must have a current successful validation before completion")
            self._close_focus(now)
            self.ended_at = now
            self.phase = "completed" if event.type == "task_complete" else "abandoned"
            self.pending_adaptation = None
        self.event_ids.add(event.event_id)
        self.events.append(event.model_dump() | {"at_seconds": now - self.started_at})
        self.tick()

    def tick(self):
        now = self.clock()
        if self.last_window_at is not None and now - self.last_window_at > STALE_SECONDS:
            self.quality = "stale"
            self.risk_score = None
            self.high_windows = 0
            self.windows.clear()
        while self.recent_errors and now - self.recent_errors[0] > 15:
            self.recent_errors.popleft()
        if self.phase != "running":
            return
        hesitation = self.field_started is not None and now - self.field_started >= self.config.hesitation_seconds
        behavioral = bool(self.recent_errors) or hesitation
        eeg = (self.config.source != "manual" and self.model is not None
               and self.quality == "usable"
               and self.high_windows >= self.config.consecutive_windows)
        policy = self.config.policy
        should_request = behavioral and (policy == "behavior_only" or (policy == "combined" and eeg))
        if self.pending_adaptation and not should_request:
            self.pending_adaptation = None
        if self.layout == "conventional" and not self.pending_adaptation and should_request:
            self.pending_adaptation = {
                "request_id": str(uuid4()), "layout": "guided", "policy": policy,
                "reason": "errors_or_hesitation" if policy == "behavior_only" else "eeg_plus_errors_or_hesitation",
                "source": self.config.source, "risk_score": self.risk_score,
                "at_seconds": now - self.started_at,
            }

    def view(self):
        self.tick()
        now = self.ended_at if self.ended_at is not None else self.clock()
        fields = {name: dict(value) for name, value in self.fields.items()}
        if self.focused_field:
            fields[self.focused_field]["focused_seconds"] += now - self.field_started
        return {
            "session_id": self.id, "phase": self.phase, "config": self.config.model_dump(),
            "created_at": self.created_at, "started_at": self.started_at, "ended_at": self.ended_at,
            "layout": self.layout, "adaptation_request": self.pending_adaptation,
            "metrics": {
                "elapsed_seconds": now - self.started_at if self.started_at is not None else 0,
                "errors": sum(f["errors"] for f in fields.values()),
                "completed": self.phase == "completed", "fields": fields,
                "layout_changes": list(self.layout_changes),
            },
            "eeg": {
                "source": self.config.source, "quality": self.quality,
                "quality_details": self.quality_details, "risk_score": self.risk_score,
                "features": self.latest_features if self.quality == "usable" else None,
                "last_window_age_seconds": self.clock() - self.last_window_at if self.last_window_at is not None else None,
                "total_windows": self.total_windows, "rejected_windows": self.rejected_windows,
                "consecutive_high_windows": self.high_windows,
            },
            "calibration": {
                "ready": self.model is not None, "report": self.calibration_report,
                "trial_count": len(self.trials), "fluent_trials": sum(t["label"] == 0 for t in self.trials),
                "difficulty_proxy_trials": sum(t["label"] == 1 for t in self.trials),
                "active_trial_id": self.active_trial["id"] if self.active_trial else None,
                "active_trial_usable_windows": len(self.active_trial["windows"]) if self.active_trial else 0,
            },
        }


class ExperimentStore:
    """Persist snapshots and event logs; do not pickle models or save raw EEG/typed data."""

    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, document TEXT NOT NULL)")
        self.db.commit()

    def save(self, session):
        payload = session.view() | {"events": session.events, "calibration_trials": session.trials}
        self.db.execute("INSERT OR REPLACE INTO sessions VALUES (?, ?)",
                        (session.id, json.dumps(payload, allow_nan=False)))
        self.db.commit()

    def load(self, session_id):
        row = self.db.execute("SELECT document FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            raise KeyError(session_id)
        data = json.loads(row[0])
        data["archived"] = True
        if data["phase"] not in {"completed", "abandoned"}:
            data["phase"] = "interrupted"
        data["adaptation_request"] = None
        data["eeg"]["quality"] = "disconnected"
        data["eeg"]["risk_score"] = None
        data["eeg"]["features"] = None
        data["calibration"]["ready"] = False
        return data


class Manager:
    def __init__(self, path, clock=time.time):
        self.store = ExperimentStore(path)
        self.clock = clock
        self.sessions = {}
        self.lock = threading.RLock()

    def create(self, config):
        session = Session(config, self.clock)
        if config.calibration_session_id:
            previous = self.sessions.get(config.calibration_session_id)
            if previous is None or previous.model is None:
                raise ValueError("Calibration must exist in this server process; recalibrate after restart")
            for field in ("participant_id", "source", "sample_rate", "channel_names", "task_key", "hesitation_seconds"):
                if getattr(previous.config, field) != getattr(config, field):
                    raise ValueError(f"Calibration mismatch: {field}")
            session.model = previous.model
            session.calibration_report = previous.calibration_report
        self.sessions[session.id] = session
        self.store.save(session)
        return session.view()

    def active(self, session_id):
        if session_id not in self.sessions:
            raise KeyError(session_id)
        return self.sessions[session_id]

    def view(self, session_id, export=False):
        session = self.sessions.get(session_id)
        if session is None:
            return self.store.load(session_id)
        data = session.view()
        if export:
            data |= {"events": session.events, "calibration_trials": session.trials}
        return data

    def compare(self, ids):
        if len(set(ids)) != len(ids):
            raise ValueError("Choose distinct sessions")
        sessions = [self.view(i) for i in ids]
        reasons = []
        if any(s["phase"] != "completed" for s in sessions):
            reasons.append("All runs must be completed; incomplete times are not comparable.")
        for field in ("participant_id", "task_key", "field_ids", "source"):
            if any(s["config"][field] != sessions[0]["config"][field] for s in sessions):
                reasons.append(f"Runs differ in {field}.")
        if any(s["metrics"]["layout_changes"] for s in sessions):
            reasons.append("A layout switched mid-run; use separate fixed-layout runs for comparison.")
        if {s["config"]["initial_layout"] for s in sessions} != {"conventional", "guided"}:
            reasons.append("Include both conventional and guided layouts.")
        delta = None
        if not reasons:
            grouped = {layout: [s["metrics"] for s in sessions if s["config"]["initial_layout"] == layout]
                       for layout in ("conventional", "guided")}
            means = {layout: {key: float(np.mean([m[key] for m in metrics]))
                              for key in ("elapsed_seconds", "errors")} for layout, metrics in grouped.items()}
            delta = {
                "mean_by_layout": means,
                "seconds_saved": means["conventional"]["elapsed_seconds"] - means["guided"]["elapsed_seconds"],
                "errors_reduced": means["conventional"]["errors"] - means["guided"]["errors"],
            }
        return {"eligible_descriptive_comparison": not reasons, "reasons": reasons,
                "sessions": sessions, "difference": delta,
                "interpretation": "Observed results only. Practice/order effects and task equivalence require experimental control; this does not isolate EEG's benefit."}
