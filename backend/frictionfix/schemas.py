"""Team: TO FILL | Members: TO FILL. Validated public API contract."""

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class SessionConfig(StrictModel):
    participant_id: str = Field(min_length=1, max_length=80)
    task_key: str = Field(default="booking-v1", min_length=1, max_length=80)
    field_ids: list[str] = Field(min_length=1, max_length=40)
    source: Literal["live", "replay", "manual"] = "manual"
    initial_layout: Literal["conventional", "guided"] = "conventional"
    policy: Literal["combined", "behavior_only", "observe"] = "combined"
    sample_rate: float = Field(default=512, ge=128, le=2048)
    channel_names: list[str] = Field(default_factory=lambda: [
        "F3", "Fz", "F4", "FC1", "FC2", "C3", "Cz", "C4", "P3", "Pz", "P4", "Oz"
    ], min_length=2, max_length=64)
    hesitation_seconds: float = Field(default=12, ge=5, le=120)
    risk_threshold: float = Field(default=0.7, ge=0.5, le=0.99)
    consecutive_windows: int = Field(default=3, ge=2, le=10)
    calibration_session_id: str | None = None

    @model_validator(mode="after")
    def validate_lists(self):
        for name in ("field_ids", "channel_names"):
            values = getattr(self, name)
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


class BehaviorEvent(StrictModel):
    event_id: str = Field(min_length=1, max_length=100)
    type: Literal["field_focus", "field_blur", "field_changed", "field_validation",
                  "layout_changed", "task_complete", "task_abandon"]
    field_id: str | None = None
    correct: bool | None = None
    layout: Literal["conventional", "guided"] | None = None
    reason: Literal["manual", "adaptation"] | None = None
    request_id: str | None = None


class TrialOutcome(StrictModel):
    success: bool
    errors: int = Field(ge=0, le=100)


class Comparison(StrictModel):
    session_ids: list[str] = Field(min_length=2, max_length=20)
