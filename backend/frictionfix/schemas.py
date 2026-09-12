"""Team: TO FILL | Members: TO FILL. Validated public API contract."""

from typing import Annotated, Literal, Union
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class SessionConfig(StrictModel):
    participant_id: str = Field(min_length=1, max_length=80)
    website_url: str = Field(min_length=1, max_length=2048)
    website_name: str | None = Field(default=None, max_length=120)
    observation_label: str | None = Field(default=None, max_length=200)
    known_element_ids: list[str] | None = Field(default=None, min_length=1, max_length=500)
    source: Literal["live", "replay", "manual"] = "manual"
    policy: Literal["combined", "behavior_only", "observe"] = "combined"
    sample_rate: float = Field(default=512, ge=128, le=2048)
    channel_names: list[str] = Field(default_factory=lambda: [
        "F3", "Fz", "F4", "FC1", "FC2", "C3", "Cz", "C4", "P3", "Pz", "P4", "Oz"
    ], min_length=2, max_length=64)
    calibration_session_id: str | None = None

    # Friction-evidence thresholds. The scoring weights themselves are fixed and
    # documented in friction.py so the score stays auditable; only these
    # evidence-worthiness thresholds are configurable per session.
    risk_threshold: float = Field(default=0.7, ge=0.5, le=0.99)
    consecutive_windows: int = Field(default=3, ge=2, le=10)
    long_gaze_dwell_ms: float = Field(default=3000, ge=200, le=60_000)
    min_gaze_confidence: float = Field(default=0.5, ge=0, le=1)
    rage_click_min_count: int = Field(default=3, ge=2, le=50)
    repeated_click_min_count: int = Field(default=3, ge=2, le=50)
    scroll_reversal_min_count: int = Field(default=2, ge=1, le=50)
    inactivity_min_ms: float = Field(default=8000, ge=1000, le=300_000)
    episode_merge_window_seconds: float = Field(default=8.0, ge=1, le=120)
    min_friction_score: float = Field(default=0.3, ge=0, le=1)
    auto_suggest: bool = False

    @model_validator(mode="after")
    def validate_lists(self):
        for name in ("known_element_ids", "channel_names"):
            values = getattr(self, name)
            if values is None:
                continue
            if any(not v.strip() or len(v) > 80 for v in values):
                raise ValueError(f"{name} must contain short, nonempty identifiers")
            if len(set(v.lower() for v in values)) != len(values):
                raise ValueError(f"{name} must contain unique identifiers")
        excluded = {"m1", "m2", "eog", "heog", "veog", "a1", "a2"}
        if any(c.lower() in excluded for c in self.channel_names):
            raise ValueError("Select EEG channels only; exclude EOG and mastoids")
        if self.sample_rate != int(self.sample_rate):
            raise ValueError("This prototype requires an integer sample rate")
        return self


class EEGChunk(StrictModel):
    sequence: int = Field(ge=0)
    source: Literal["live", "replay"]
    units: Literal["uV", "V"]
    samples: list[list[float]] = Field(min_length=1, max_length=8192)
    # Source-clock time of FIRST sample, seconds. Never compare directly to wall clock.
    start_time: float = Field(ge=0)


class CalibrationLabel(StrictModel):
    """Researcher/participant-supplied label for one independent calibration interval.

    Never derived from booking-form correctness. 'invalid' intervals are recorded for
    transparency but excluded from the fitted dataset (e.g. contaminated signal, a
    mislabelled attempt).
    """
    label: Literal["low_friction", "high_friction", "invalid"]


MetadataValue = Union[str, int, float, bool]


class EventBase(StrictModel):
    event_id: str = Field(min_length=1, max_length=100)
    page_url: str = Field(min_length=1, max_length=2048)
    # Seconds since the session's /start call, per the frontend's own clock. Using a
    # relative offset (not epoch time) avoids needing wall-clock synchronization with
    # the backend or with EEG source-clock time.
    client_ts: float = Field(ge=0, le=86_400)
    element_id: str | None = Field(default=None, min_length=1, max_length=120)
    metadata: dict[str, MetadataValue] | None = None

    @field_validator("metadata")
    @classmethod
    def bounded_metadata(cls, value):
        if value is None:
            return value
        if len(value) > 10:
            raise ValueError("metadata may contain at most 10 keys")
        for key, item in value.items():
            if not key.strip() or len(key) > 40:
                raise ValueError("metadata keys must be short, nonempty identifiers")
            if isinstance(item, str) and len(item) > 200:
                raise ValueError("metadata string values must be at most 200 characters")
        return value


class ElementEnterEvent(EventBase):
    type: Literal["element_enter"]
    element_id: str = Field(min_length=1, max_length=120)
    x: float | None = None
    y: float | None = None


class ElementLeaveEvent(EventBase):
    type: Literal["element_leave"]
    element_id: str = Field(min_length=1, max_length=120)
    duration_ms: float = Field(ge=0, le=3_600_000)


class ElementClickEvent(EventBase):
    type: Literal["element_click"]
    element_id: str = Field(min_length=1, max_length=120)
    x: float
    y: float


class RepeatedClickEvent(EventBase):
    type: Literal["repeated_click"]
    element_id: str = Field(min_length=1, max_length=120)
    click_count: int = Field(ge=2, le=1000)
    duration_ms: float = Field(ge=0, le=3_600_000)


class RageClickEvent(EventBase):
    type: Literal["rage_click"]
    element_id: str = Field(min_length=1, max_length=120)
    click_count: int = Field(ge=2, le=1000)
    duration_ms: float = Field(ge=0, le=3_600_000)
    x: float | None = None
    y: float | None = None


class ScrollEvent(EventBase):
    type: Literal["scroll"]
    direction: Literal["up", "down"]
    scroll_y: float | None = None


class ScrollReversalEvent(EventBase):
    type: Literal["scroll_reversal"]
    reversal_count: int = Field(ge=2, le=1000)


class BacktrackEvent(EventBase):
    type: Literal["backtrack"]
    previous_page_url: str = Field(min_length=1, max_length=2048)


class InputErrorEvent(EventBase):
    type: Literal["input_error"]
    element_id: str = Field(min_length=1, max_length=120)


class NavigationEvent(EventBase):
    type: Literal["navigation"]
    previous_page_url: str | None = Field(default=None, max_length=2048)


class InactivityEvent(EventBase):
    type: Literal["inactivity"]
    duration_ms: float = Field(ge=0, le=3_600_000)


class ObservationEndEvent(EventBase):
    type: Literal["observation_end"]
    reason: Literal["completed", "abandoned", "navigated_away", "tab_closed"] | None = None


BehaviorEvent = Annotated[
    Union[
        ElementEnterEvent, ElementLeaveEvent, ElementClickEvent, RepeatedClickEvent,
        RageClickEvent, ScrollEvent, ScrollReversalEvent, BacktrackEvent,
        InputErrorEvent, NavigationEvent, InactivityEvent, ObservationEndEvent,
    ],
    Field(discriminator="type"),
]


class GazeObservation(StrictModel):
    """Already-computed gaze data from the frontend's own eye-tracking pipeline.

    This backend does not implement eye tracking; it only validates, timestamps and
    stores what the frontend already calculated.
    """
    observation_id: str = Field(min_length=1, max_length=100)
    element_id: str | None = Field(default=None, min_length=1, max_length=120)
    page_url: str = Field(min_length=1, max_length=2048)
    # Same seconds-since-start convention as EventBase.client_ts.
    timestamp: float = Field(ge=0, le=86_400)
    x: float | None = None
    y: float | None = None
    dwell_ms: float = Field(ge=0, le=3_600_000)
    confidence: float = Field(ge=0, le=1)
    viewport_width: int | None = Field(default=None, ge=1, le=20_000)
    viewport_height: int | None = Field(default=None, ge=1, le=20_000)


class SuggestionRequest(StrictModel):
    """Optional context the frontend can supply when asking for a Gemini suggestion."""
    element_type: str | None = Field(default=None, max_length=60)
    element_description: str | None = Field(default=None, max_length=300)


class SuggestionResult(StrictModel):
    problem: str = Field(max_length=400)
    suggestion: str = Field(max_length=400)
    priority: Literal["low", "medium", "high"]
    rationale: str = Field(max_length=400)


class EndRequest(StrictModel):
    reason: Literal["completed", "abandoned", "navigated_away"] | None = None
