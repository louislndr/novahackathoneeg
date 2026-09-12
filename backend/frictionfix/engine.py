"""Team: TO FILL | Members: TO FILL. Observation-session lifecycle and evidence routing."""

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
from .friction import FrictionEngine
from .schemas import SessionConfig, EEGChunk, CalibrationLabel
from .signal import WindowBuffer, extract_features, FEATURE_NAMES

STALE_SECONDS = 4.0
CLIENT_TS_TOLERANCE_SECONDS = 5.0
MAX_EVENTS_PER_SECOND = 40


class RateLimitExceeded(Exception):
    """Too many events/gaze observations arrived in the last second for this session."""


class Session:
    def __init__(self, config: SessionConfig, clock=time.time):
        self.id = str(uuid4())
        self.config = config
        self.clock = clock
        self.created_at = clock()
        self.phase = "setup"
        self.started_at = None
        self.ended_at = None
        self.end_reason = None
        self.current_page = None
        self.current_element = None
        self.events = []
        self.event_ids = set()
        self.last_client_ts = None
        self.recent_receipts = deque()
        self.gaze = []
        self.gaze_ids = set()
        self.friction = FrictionEngine(config)
        self.pending_auto_suggest = []
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
            raise ValueError("Start one calibration interval at a time while calibrating")
        self._reset_signal()
        self.active_trial = {"id": str(uuid4()), "started_at": self.clock(), "windows": []}
        return self.active_trial["id"]

    def end_trial(self, outcome: CalibrationLabel):
        if self.phase != "calibrating" or not self.active_trial:
            raise ValueError("No active calibration interval")
        trial = self.active_trial
        now = self.clock()
        self.tick()
        if len(trial["windows"]) < 2 or self.quality != "usable":
            raise ValueError("Need two consecutive usable EEG windows immediately before the label")
        elapsed = now - trial["started_at"]
        label_map = {"low_friction": 0, "high_friction": 1, "invalid": None}
        record = {
            "trial_id": trial["id"], "elapsed_seconds": elapsed,
            "label": outcome.label, "target": label_map[outcome.label],
            "features": np.mean(trial["windows"][-2:], axis=0).tolist(),
        }
        self.trials.append(record)
        self.active_trial = None
        return record

    def cancel_trial(self):
        if self.phase != "calibrating" or self.active_trial is None:
            raise ValueError("No active calibration interval")
        self.active_trial = None
        self._reset_signal()

    def fit(self):
        if self.phase != "calibrating" or self.active_trial:
            raise ValueError("Finish or cancel the active interval before fitting")
        usable = [{"features": t["features"], "label": t["target"]}
                  for t in self.trials if t["target"] is not None]
        self.model, self.calibration_report = fit_calibration(usable)
        self.phase = "ready"
        self._reset_signal()

    def start_observation(self):
        if self.phase not in {"setup", "ready"}:
            raise ValueError("Observation can start only once, after setup or calibration")
        self.phase = "observing"
        self.started_at = self.clock()
        self._reset_signal()

    def end_observation(self, reason=None):
        if self.phase == "ended":
            return  # ending an already-ended session is a safe no-op (retry-safe)
        if self.phase != "observing":
            raise ValueError("Start observation before ending it")
        closed = self.friction.flush()
        if self.config.auto_suggest:
            self.pending_auto_suggest.extend(r for r in closed if r["severity"] == "high")
        self.ended_at = self.clock()
        self.phase = "ended"
        self.end_reason = reason

    def ingest(self, chunk: EEGChunk):
        if self.phase == "ended":
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
            if self.phase == "observing" and self.model is not None and len(self.windows) == 2:
                vector = np.mean(self.windows, axis=0).reshape(1, -1)
                self.risk_score = float(self.model.predict_proba(vector)[0, 1])
                self.high_windows = (self.high_windows + 1
                                     if self.risk_score >= self.config.risk_threshold else 0)
                if self.high_windows >= self.config.consecutive_windows:
                    elapsed = self.clock() - self.started_at
                    page = self.current_page or self.config.website_url
                    self.friction.ingest_eeg_risk(page, self.current_element, elapsed)
        self.tick()

    def _check_rate_limit(self):
        now = self.clock()
        self.recent_receipts.append(now)
        while self.recent_receipts and now - self.recent_receipts[0] > 1.0:
            self.recent_receipts.popleft()
        if len(self.recent_receipts) > MAX_EVENTS_PER_SECOND:
            raise RateLimitExceeded("Too many events in the last second; throttle the client")

    def _check_timestamp(self, client_ts):
        elapsed = self.clock() - self.started_at
        if client_ts > elapsed + CLIENT_TS_TOLERANCE_SECONDS:
            raise ValueError("Client timestamp is further ahead of elapsed observation time than allowed")
        if self.last_client_ts is not None and client_ts < self.last_client_ts - CLIENT_TS_TOLERANCE_SECONDS:
            raise ValueError("Client timestamp rewinds further than the allowed reordering tolerance")
        self.last_client_ts = max(self.last_client_ts or 0.0, client_ts)

    def record_event(self, event):
        if event.event_id in self.event_ids:
            previous = next(e for e in self.events if e["event"]["event_id"] == event.event_id)
            if previous["event"] != event.model_dump():
                raise ValueError("event_id was already used for different content")
            return
        if self.phase != "observing":
            raise ValueError("Start observation before recording events; ended sessions are immutable")
        self._check_rate_limit()
        self._check_timestamp(event.client_ts)
        self.current_page = event.page_url
        if event.type == "element_enter":
            self.current_element = event.element_id
        elif event.type == "element_leave" and self.current_element == event.element_id:
            self.current_element = None
        self.friction.ingest_event(event)
        self.event_ids.add(event.event_id)
        self.events.append({"event": event.model_dump(),
                            "received_at_seconds": self.clock() - self.started_at})
        self.tick()

    def record_gaze(self, observation):
        if observation.observation_id in self.gaze_ids:
            previous = next(g for g in self.gaze if g["observation"]["observation_id"] == observation.observation_id)
            if previous["observation"] != observation.model_dump():
                raise ValueError("observation_id was already used for different content")
            return
        if self.phase != "observing":
            raise ValueError("Start observation before recording gaze; ended sessions are immutable")
        self._check_rate_limit()
        self._check_timestamp(observation.timestamp)
        self.friction.ingest_gaze(observation)
        self.gaze_ids.add(observation.observation_id)
        self.gaze.append({"observation": observation.model_dump(),
                          "received_at_seconds": self.clock() - self.started_at})
        self.tick()

    def events_export(self):
        return [e["event"] | {"received_at_seconds": e["received_at_seconds"]} for e in self.events]

    def gaze_export(self):
        return [g["observation"] | {"received_at_seconds": g["received_at_seconds"]} for g in self.gaze]

    def tick(self):
        now = self.clock()
        if self.last_window_at is not None and now - self.last_window_at > STALE_SECONDS:
            self.quality = "stale"
            self.risk_score = None
            self.high_windows = 0
            self.windows.clear()
        if self.started_at is not None and self.phase != "ended":
            closed = self.friction.tick(now - self.started_at)
            if self.config.auto_suggest:
                self.pending_auto_suggest.extend(r for r in closed if r["severity"] == "high")

    def view(self):
        self.tick()
        now = self.ended_at if self.ended_at is not None else self.clock()
        return {
            "session_id": self.id, "phase": self.phase, "config": self.config.model_dump(),
            "created_at": self.created_at, "started_at": self.started_at, "ended_at": self.ended_at,
            "end_reason": self.end_reason,
            "context": {"page_url": self.current_page, "element_id": self.current_element},
            "metrics": {
                "elapsed_seconds": now - self.started_at if self.started_at is not None else 0,
                "event_count": len(self.events), "gaze_count": len(self.gaze),
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
                "trial_count": len(self.trials),
                "low_friction_trials": sum(t["label"] == "low_friction" for t in self.trials),
                "high_friction_trials": sum(t["label"] == "high_friction" for t in self.trials),
                "invalid_trials": sum(t["label"] == "invalid" for t in self.trials),
                "active_trial_id": self.active_trial["id"] if self.active_trial else None,
                "active_trial_usable_windows": len(self.active_trial["windows"]) if self.active_trial else 0,
            },
            "friction": self.friction.summary(),
        }


class SessionStore:
    """Persist snapshots and event/gaze/friction logs; do not pickle models or save raw EEG."""

    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, document TEXT NOT NULL)")
        self.db.commit()

    def save(self, session):
        payload = session.view() | {
            "events": session.events_export(), "gaze": session.gaze_export(),
            "calibration_trials": session.trials, "friction_events": session.friction.closed,
        }
        self.db.execute("INSERT OR REPLACE INTO sessions VALUES (?, ?)",
                        (session.id, json.dumps(payload, allow_nan=False)))
        self.db.commit()

    def load(self, session_id):
        row = self.db.execute("SELECT document FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            raise KeyError(session_id)
        data = json.loads(row[0])
        data["archived"] = True
        if data["phase"] != "ended":
            data["phase"] = "interrupted"
        data["eeg"]["quality"] = "disconnected"
        data["eeg"]["risk_score"] = None
        data["eeg"]["features"] = None
        data["calibration"]["ready"] = False
        return data


class Manager:
    def __init__(self, path, clock=time.time):
        self.store = SessionStore(path)
        self.clock = clock
        self.sessions = {}
        self.lock = threading.RLock()

    def create(self, config):
        session = Session(config, self.clock)
        if config.calibration_session_id:
            previous = self.sessions.get(config.calibration_session_id)
            if previous is None or previous.model is None:
                raise ValueError("Calibration must exist in this server process; recalibrate after restart")
            for field in ("participant_id", "source", "sample_rate", "channel_names"):
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
            data |= {"events": session.events_export(), "gaze": session.gaze_export(),
                     "calibration_trials": session.trials, "friction_events": session.friction.closed}
        return data

    def friction_events(self, session_id):
        session = self.sessions.get(session_id)
        if session is None:
            return self.store.load(session_id).get("friction_events", [])
        session.tick()
        return session.friction.closed
