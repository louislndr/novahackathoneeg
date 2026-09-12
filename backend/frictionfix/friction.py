"""Team: TO FILL | Members: TO FILL. Friction-episode aggregation and transparent scoring.

Connects behavioural, gaze and experimental-EEG evidence to a (page, element) location
and turns sufficiently strong, sufficiently corroborated evidence into a friction event.
The score is a documented, fixed-weight sum of which evidence TYPES were present in a
short window -- not a validated probability of confusion. See EVIDENCE_WEIGHTS below for
the exact contribution of each evidence type.
"""

from dataclasses import dataclass, field
from uuid import uuid4

# Fixed and documented so the score stays auditable. Thresholds for whether a given
# event/gaze/EEG signal counts as evidence at all are configurable per session
# (SessionConfig); these weights are not, so "0.82" always means the same thing.
EVIDENCE_WEIGHTS = {
    "elevated_eeg_risk": 0.35,
    "long_gaze_dwell": 0.25,
    "rage_clicks": 0.30,
    "repeated_clicks": 0.15,
    "scroll_reversals": 0.10,
    "backtrack": 0.10,
    "input_error": 0.15,
    "inactivity": 0.15,
}


def severity_for(score: float) -> str:
    if score >= 0.7:
        return "high"
    if score >= 0.4:
        return "medium"
    return "low"


@dataclass
class _Episode:
    page_url: str
    element_id: str | None
    started_at: float
    last_at: float
    evidence: set = field(default_factory=set)


class FrictionEngine:
    """One instance per session. All timestamps are elapsed seconds since observation
    start, on whichever clock the evidence source uses (frontend-relative for
    behaviour/gaze, backend-receipt-relative for EEG -- see engine.py). These clocks are
    not hard-synchronized; the merge window is intentionally generous to tolerate that,
    and this approximation is disclosed rather than presented as exact alignment.
    """

    def __init__(self, config):
        self.policy = config.policy
        self.long_gaze_dwell_ms = config.long_gaze_dwell_ms
        self.min_gaze_confidence = config.min_gaze_confidence
        self.rage_click_min_count = config.rage_click_min_count
        self.repeated_click_min_count = config.repeated_click_min_count
        self.scroll_reversal_min_count = config.scroll_reversal_min_count
        self.inactivity_min_ms = config.inactivity_min_ms
        self.merge_window = config.episode_merge_window_seconds
        self.min_friction_score = config.min_friction_score
        self.open: dict[tuple, _Episode] = {}
        self.closed: list[dict] = []

    def ingest_event(self, event):
        if self.policy == "observe":
            return
        page, element = event.page_url, event.element_id
        if event.type == "rage_click" and event.click_count >= self.rage_click_min_count:
            self._add(page, element, "rage_clicks", event.client_ts)
        elif event.type == "repeated_click" and event.click_count >= self.repeated_click_min_count:
            self._add(page, element, "repeated_clicks", event.client_ts)
        elif event.type == "scroll_reversal" and event.reversal_count >= self.scroll_reversal_min_count:
            self._add(page, element, "scroll_reversals", event.client_ts)
        elif event.type == "backtrack":
            self._add(page, element, "backtrack", event.client_ts)
        elif event.type == "input_error":
            self._add(page, element, "input_error", event.client_ts)
        elif event.type == "inactivity" and event.duration_ms >= self.inactivity_min_ms:
            self._add(page, element, "inactivity", event.client_ts)

    def ingest_gaze(self, observation):
        if self.policy == "observe":
            return
        if observation.dwell_ms >= self.long_gaze_dwell_ms and observation.confidence >= self.min_gaze_confidence:
            self._add(observation.page_url, observation.element_id, "long_gaze_dwell", observation.timestamp)

    def ingest_eeg_risk(self, page_url, element_id, at_seconds):
        if self.policy != "combined":
            return
        self._add(page_url, element_id, "elevated_eeg_risk", at_seconds)

    def _add(self, page_url, element_id, evidence_type, at_seconds):
        key = (page_url, element_id)
        episode = self.open.get(key)
        if episode is not None and at_seconds - episode.last_at > self.merge_window:
            self._finalize(key)
            episode = None
        if episode is None:
            episode = _Episode(page_url=page_url, element_id=element_id,
                               started_at=at_seconds, last_at=at_seconds)
            self.open[key] = episode
        episode.last_at = max(episode.last_at, at_seconds)
        episode.evidence.add(evidence_type)

    def tick(self, now_seconds):
        """Close episodes that have gone quiet. Call after any evidence-producing
        ingest and periodically (e.g. on session.tick()) so episodes close even without
        new evidence arriving."""
        newly_closed = []
        for key in [k for k, ep in self.open.items() if now_seconds - ep.last_at > self.merge_window]:
            result = self._finalize(key)
            if result:
                newly_closed.append(result)
        return newly_closed

    def flush(self):
        """Finalize every open episode regardless of quiet time. Call when observation ends."""
        newly_closed = []
        for key in list(self.open.keys()):
            result = self._finalize(key)
            if result:
                newly_closed.append(result)
        return newly_closed

    def _finalize(self, key):
        episode = self.open.pop(key)
        score = round(min(1.0, sum(EVIDENCE_WEIGHTS[e] for e in episode.evidence)), 3)
        if score < self.min_friction_score:
            return None
        record = {
            "friction_event_id": str(uuid4()),
            "page_url": episode.page_url,
            "element_id": episode.element_id,
            "friction_score": score,
            "severity": severity_for(score),
            "evidence": sorted(episode.evidence),
            "started_at": episode.started_at,
            "ended_at": episode.last_at,
            "source_mode": self.policy,
            "suggestion": None,
        }
        self.closed.append(record)
        return record

    def summary(self):
        by_severity = {}
        for record in self.closed:
            by_severity[record["severity"]] = by_severity.get(record["severity"], 0) + 1
        return {"total": len(self.closed), "open_episodes": len(self.open), "by_severity": by_severity}
