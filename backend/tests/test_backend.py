"""Signal-integrity, behaviour/gaze validation, friction-scoring and Gemini-mocking
integration tests. Synthetic EEG only; no hardware, webcam or Google Cloud credentials."""

import json
import numpy as np
import pytest
from pydantic import TypeAdapter
from fastapi.testclient import TestClient
from frictionfix.app import create_app
from frictionfix.engine import Session, Manager, RateLimitExceeded
from frictionfix.schemas import (SessionConfig, EEGChunk, CalibrationLabel, BehaviorEvent,
                                 GazeObservation, SuggestionResult)
from frictionfix.signal import extract_features, WindowBuffer
from frictionfix.suggestions import SuggestionContext, SuggestionUnavailable, VertexGeminiSuggestionService

EventAdapter = TypeAdapter(BehaviorEvent)


class Clock:
    def __init__(self):
        self.now = 1000.0
    def __call__(self):
        return self.now
    def advance(self, seconds):
        self.now += seconds


def wave(freq=10, seed=1, channels=2):
    rng = np.random.default_rng(seed)
    t = np.arange(256) / 128
    return np.column_stack([12 * np.sin(2 * np.pi * freq * t + i * .2)
                            + rng.normal(0, .5, len(t)) for i in range(channels)])


def config(**kwargs):
    return SessionConfig(**({"participant_id": "test", "website_url": "https://example.test",
                             "sample_rate": 128, "channel_names": ["F3", "F4"]} | kwargs))


def event(n, type_, page_url="/pricing", client_ts=0.0, **kwargs):
    return EventAdapter.validate_python(
        {"event_id": str(n), "type": type_, "page_url": page_url, "client_ts": client_ts} | kwargs)


def gaze(n, page_url="/pricing", timestamp=0.0, dwell_ms=100, confidence=0.9, **kwargs):
    return GazeObservation(observation_id=str(n), page_url=page_url, timestamp=timestamp,
                           dwell_ms=dwell_ms, confidence=confidence, **kwargs)


def push(session, clock, freq=10, bad=False):
    clock.advance(2)
    seq = session.buffer.last_sequence + 1
    samples = np.zeros((256, 2)) if bad else wave(freq, seed=seq)
    session.ingest(EEGChunk(sequence=seq, source=session.config.source, units="uV",
                            samples=samples.tolist(), start_time=seq * 2))


def train_session(clock):
    session = Session(config(source="replay"), clock)
    session.start_calibration()
    for i in range(8):
        session.start_trial()
        freq = 6 if i % 2 else 10
        push(session, clock, freq)
        push(session, clock, freq)
        label = "high_friction" if i % 2 else "low_friction"
        session.end_trial(CalibrationLabel(label=label))
    session.fit()
    return session


class MockSuggestionService:
    def __init__(self, result=None):
        self.calls = []
        self.result = result or SuggestionResult(
            problem="Users hesitate while comparing the pricing plans.",
            suggestion="Reduce the number of columns and highlight the differences.",
            priority="medium", rationale="Repeated clicks and elevated experimental EEG risk were observed.")

    def suggest(self, context):
        self.calls.append(context)
        return self.result


class FailingSuggestionService:
    def suggest(self, context):
        raise SuggestionUnavailable("simulated Vertex AI outage")


# --- Signal processing (unchanged from the EEG pipeline; generic, not booking-specific) ---

def test_alpha_features_and_quality():
    result = extract_features(wave(), 128)
    assert result.quality == "usable"
    assert result.features[4] > .8
    assert extract_features(np.zeros((256, 2)), 128).quality == "poor"
    assert extract_features(wave() * 100, 128).quality == "poor"
    dirty = wave()
    dirty[10, 0] = np.nan
    assert extract_features(dirty, 128).quality == "poor"


def test_dc_offsets_do_not_reject_valid_ant_signals():
    plain = extract_features(wave(), 128)
    offset = extract_features(wave() + np.array([20000, -18000]), 128)
    assert offset.quality == "usable"
    np.testing.assert_allclose(plain.features, offset.features, atol=1e-8)


def test_chunk_gaps_duplicates_and_shape():
    buffer = WindowBuffer(128, 2)
    windows, gap = buffer.push(wave()[:128], 0, 0)
    assert not windows and not gap
    windows, gap = buffer.push(wave()[:128], 2, 2)
    assert not windows and gap
    with pytest.raises(ValueError, match="sequence"):
        buffer.push(wave()[:128], 2, 3)
    with pytest.raises(ValueError, match="backwards"):
        buffer.push(wave()[:128], 3, 1)
    with pytest.raises(ValueError, match="channels"):
        buffer.push(np.zeros((128, 3)), 3, 3)
    windows, _ = buffer.push(wave()[:128], 3, 3)
    assert len(windows) == 1


def test_volt_conversion():
    clock = Clock()
    session = Session(config(source="live"), clock)
    session.ingest(EEGChunk(sequence=0, start_time=0, source="live", units="V", samples=(wave()/1e6).tolist()))
    assert session.quality == "usable"
    assert session.latest_features["alpha_fraction"] > .8


def test_manual_rejects_mismatched_source():
    clock = Clock()
    session = Session(config(), clock)
    with pytest.raises(ValueError, match="source"):
        session.ingest(EEGChunk(sequence=0, start_time=0, source="replay", units="uV", samples=wave().tolist()))


# --- Session lifecycle without a predefined task ---

def test_session_config_generalized_no_task_required():
    cfg = SessionConfig(participant_id="p1", website_url="https://shop.example.com")
    assert cfg.source == "manual"
    assert cfg.known_element_ids is None


def test_observation_lifecycle_and_end_is_idempotent():
    clock = Clock()
    session = Session(config(), clock)
    with pytest.raises(ValueError, match="Start observation"):
        session.record_event(event(1, "navigation", page_url="/"))
    session.start_observation()
    with pytest.raises(ValueError, match="once"):
        session.start_observation()
    session.end_observation("completed")
    session.end_observation()  # retry after ending is safe
    assert session.phase == "ended"
    assert session.end_reason == "completed"
    with pytest.raises(ValueError, match="immutable"):
        session.record_event(event(2, "navigation", page_url="/"))


# --- Behaviour events: idempotency, strict validation, timestamps, rate limiting ---

def test_event_idempotency_and_conflict():
    clock = Clock()
    session = Session(config(), clock)
    session.start_observation()
    session.record_event(event(1, "navigation", page_url="/", client_ts=0))
    session.record_event(event(1, "navigation", page_url="/", client_ts=0))  # retry is safe
    with pytest.raises(ValueError, match="different content"):
        session.record_event(event(1, "navigation", page_url="/other", client_ts=0))


def test_timestamp_ordering_and_future_rejected():
    clock = Clock()
    session = Session(config(), clock)
    session.start_observation()
    clock.advance(10)
    session.record_event(event(1, "navigation", page_url="/", client_ts=10))
    with pytest.raises(ValueError, match="rewinds"):
        session.record_event(event(2, "navigation", page_url="/", client_ts=1))
    with pytest.raises(ValueError, match="ahead"):
        session.record_event(event(3, "navigation", page_url="/", client_ts=9999))


def test_rate_limit_exceeded():
    clock = Clock()
    session = Session(config(), clock)
    session.start_observation()
    for i in range(40):
        session.record_event(event(i, "navigation", page_url="/", client_ts=0))
    with pytest.raises(RateLimitExceeded):
        session.record_event(event(999, "navigation", page_url="/", client_ts=0))


def test_http_rejects_event_with_wrong_fields_for_type(tmp_path):
    clock = Clock()
    app = create_app(tmp_path / "sessions.sqlite3", clock)
    with TestClient(app) as client:
        sid = client.post("/sessions", json=config().model_dump()).json()["session_id"]
        client.post(f"/sessions/{sid}/start")
        missing_xy = {"event_id": "1", "type": "element_click", "page_url": "/", "client_ts": 0, "element_id": "btn"}
        assert client.post(f"/sessions/{sid}/events", json=missing_xy).status_code == 422
        wrong_field = {"event_id": "2", "type": "navigation", "page_url": "/", "client_ts": 0, "click_count": 5}
        assert client.post(f"/sessions/{sid}/events", json=wrong_field).status_code == 422
        unknown_type = {"event_id": "3", "type": "keystroke", "page_url": "/", "client_ts": 0}
        assert client.post(f"/sessions/{sid}/events", json=unknown_type).status_code == 422


# --- Gaze ingestion ---

def test_gaze_idempotency_and_evidence_gating():
    clock = Clock()
    session = Session(config(long_gaze_dwell_ms=1000, min_gaze_confidence=0.6, min_friction_score=0.2), clock)
    session.start_observation()
    clock.advance(5)
    session.record_gaze(gaze(1, page_url="/pricing", element_id="cta", timestamp=5, dwell_ms=500, confidence=0.9))
    assert session.friction.summary()["total"] == 0  # below dwell threshold: stored, no evidence
    session.record_gaze(gaze(1, page_url="/pricing", element_id="cta", timestamp=5, dwell_ms=500, confidence=0.9))
    with pytest.raises(ValueError, match="different content"):
        session.record_gaze(gaze(1, page_url="/other", element_id="cta", timestamp=5, dwell_ms=500, confidence=0.9))
    session.record_gaze(gaze(2, page_url="/pricing", element_id="cta", timestamp=6, dwell_ms=1500, confidence=0.9))
    clock.advance(20)
    session.tick()
    assert session.friction.summary()["total"] == 1
    assert session.friction.closed[0]["evidence"] == ["long_gaze_dwell"]


# --- Friction-event engine: scoring, dedup, episode merge/close ---

def test_below_threshold_evidence_produces_no_friction_event():
    clock = Clock()
    session = Session(config(), clock)
    session.start_observation()
    clock.advance(1)
    session.record_event(event(1, "input_error", page_url="/checkout", client_ts=1, element_id="card-number"))
    clock.advance(20)
    session.tick()
    assert session.friction.summary()["total"] == 0


def test_friction_scoring_dedup_and_source_attribution():
    clock = Clock()
    session = Session(config(), clock)
    session.start_observation()
    clock.advance(1)
    t = clock.now - session.started_at
    session.record_event(event(1, "rage_click", page_url="/checkout", client_ts=t,
                               element_id="submit", click_count=5, duration_ms=800))
    session.record_event(event(2, "rage_click", page_url="/checkout", client_ts=t + 0.5,
                               element_id="submit", click_count=6, duration_ms=900))  # deduped
    clock.advance(0.5)
    t2 = clock.now - session.started_at
    session.record_event(event(3, "backtrack", page_url="/checkout", client_ts=t2,
                               element_id="submit", previous_page_url="/cart"))
    clock.advance(20)
    session.tick()
    records = session.friction.closed
    assert len(records) == 1
    record = records[0]
    assert record["evidence"] == ["backtrack", "rage_clicks"]
    assert record["friction_score"] == pytest.approx(0.40)
    assert record["severity"] == "medium"
    assert record["element_id"] == "submit"
    assert record["page_url"] == "/checkout"
    assert record["source_mode"] == "combined"


def test_new_episode_starts_after_quiet_gap():
    clock = Clock()
    session = Session(config(), clock)
    session.start_observation()
    clock.advance(1)
    t = clock.now - session.started_at
    session.record_event(event(1, "rage_click", page_url="/checkout", client_ts=t,
                               element_id="submit", click_count=5, duration_ms=800))
    clock.advance(20)
    session.tick()
    assert len(session.friction.closed) == 1
    clock.advance(1)
    t2 = clock.now - session.started_at
    session.record_event(event(2, "rage_click", page_url="/checkout", client_ts=t2,
                               element_id="submit", click_count=5, duration_ms=800))
    clock.advance(20)
    session.tick()
    assert len(session.friction.closed) == 2
    ids = {r["friction_event_id"] for r in session.friction.closed}
    assert len(ids) == 2


def test_high_severity_combines_eeg_gaze_and_clicks():
    clock = Clock()
    session = train_session(clock)
    session.start_observation()
    clock.advance(1)
    t0 = clock.now - session.started_at
    session.record_event(event(1, "navigation", page_url="/pricing", client_ts=t0))
    session.record_event(event(2, "element_enter", page_url="/pricing", client_ts=t0, element_id="pricing-table"))
    for _ in range(4):
        push(session, clock, freq=6)
    assert session.high_windows >= session.config.consecutive_windows
    t = clock.now - session.started_at
    session.record_event(event(3, "repeated_click", page_url="/pricing", client_ts=t,
                               element_id="pricing-table", click_count=4, duration_ms=500))
    session.record_gaze(gaze(4, page_url="/pricing", element_id="pricing-table",
                             timestamp=t + 0.1, dwell_ms=4000, confidence=0.9))
    clock.advance(20)
    session.tick()
    high = [r for r in session.friction.closed if r["severity"] == "high"]
    assert high
    assert set(high[0]["evidence"]) >= {"elevated_eeg_risk", "long_gaze_dwell", "repeated_clicks"}
    assert high[0]["element_id"] == "pricing-table"


def test_behavior_only_policy_excludes_eeg_evidence():
    clock = Clock()
    trained = train_session(clock)
    session = Session(config(source="replay", policy="behavior_only"), clock)
    session.model = trained.model
    session.calibration_report = trained.calibration_report
    session.start_observation()
    for _ in range(4):
        push(session, clock, freq=6)
    assert session.high_windows >= session.config.consecutive_windows  # EEG still scored
    clock.advance(20)
    session.tick()
    assert session.friction.summary()["total"] == 0  # but excluded from friction evidence


def test_observe_policy_produces_no_friction_events():
    clock = Clock()
    session = Session(config(policy="observe"), clock)
    session.start_observation()
    clock.advance(1)
    t = clock.now - session.started_at
    session.record_event(event(1, "rage_click", page_url="/checkout", client_ts=t,
                               element_id="submit", click_count=10, duration_ms=500))
    session.record_gaze(gaze(2, page_url="/checkout", element_id="submit", timestamp=t,
                             dwell_ms=9000, confidence=0.99))
    clock.advance(20)
    session.tick()
    assert session.friction.summary()["total"] == 0
    assert len(session.events) == 1
    assert len(session.gaze) == 1


# --- Calibration: researcher-labelled intervals, not booking correctness ---

def test_bad_or_stale_calibration_and_minimum_trials():
    clock = Clock()
    session = Session(config(source="replay"), clock)
    session.start_calibration()
    session.start_trial()
    push(session, clock)
    with pytest.raises(ValueError, match="two consecutive"):
        session.end_trial(CalibrationLabel(label="low_friction"))
    push(session, clock)
    clock.advance(5)
    with pytest.raises(ValueError, match="two consecutive"):
        session.end_trial(CalibrationLabel(label="low_friction"))
    session.cancel_trial()
    with pytest.raises(ValueError, match="eight independent"):
        session.fit()


def test_invalid_calibration_trials_are_excluded_from_fit():
    clock = Clock()
    session = Session(config(source="replay"), clock)
    session.start_calibration()
    labels = (["low_friction"] * 4) + (["high_friction"] * 4) + ["invalid"]
    for label in labels:
        session.start_trial()
        freq = 6 if label == "high_friction" else 10
        push(session, clock, freq)
        push(session, clock, freq)
        session.end_trial(CalibrationLabel(label=label))
    assert len(session.trials) == 9
    session.fit()
    assert session.calibration_report["trial_count"] == 8
    assert session.calibration_report["low_friction_trials"] == 4
    assert session.calibration_report["high_friction_trials"] == 4


def test_clone_rejects_mismatched_calibration(tmp_path):
    clock = Clock()
    manager = Manager(tmp_path / "db.sqlite3", clock)
    original = train_session(clock)
    manager.sessions[original.id] = original
    for change in ({"participant_id": "someone-else"}, {"source": "live"}):
        with pytest.raises(ValueError, match="mismatch"):
            manager.create(config(source="replay", calibration_session_id=original.id).model_copy(update=change))
    result = manager.create(config(source="replay", calibration_session_id=original.id))
    assert result["calibration"]["ready"]
    manager.store.db.close()


# --- HTTP API: lifecycle, friction endpoint, export, persistence ---

@pytest.fixture
def api(tmp_path):
    clock = Clock()
    app = create_app(tmp_path / "sessions.sqlite3", clock)
    with TestClient(app) as client:
        yield client, clock, app


def test_http_lifecycle_friction_and_export(api):
    client, clock, app = api
    response = client.post("/sessions", json=config().model_dump())
    assert response.status_code == 201
    sid = response.json()["session_id"]
    assert client.get("/health").status_code == 200
    assert client.post(f"/sessions/{sid}/start").status_code == 200
    clock.advance(1)
    t = 1.0
    assert client.post(f"/sessions/{sid}/events", json=event(1, "rage_click", page_url="/checkout",
        client_ts=t, element_id="submit", click_count=5, duration_ms=500).model_dump()).status_code == 200
    assert client.post(f"/sessions/{sid}/events", json=event(2, "backtrack", page_url="/checkout",
        client_ts=t + 0.2, element_id="submit", previous_page_url="/cart").model_dump()).status_code == 200
    clock.advance(20)
    friction = client.get(f"/sessions/{sid}/friction-events").json()["friction_events"]
    assert len(friction) == 1
    assert friction[0]["severity"] == "medium"
    assert client.post(f"/sessions/{sid}/end", json={"reason": "completed"}).status_code == 200
    exported = client.get(f"/sessions/{sid}/export")
    body = exported.json()
    assert len(body["events"]) == 2
    assert len(body["friction_events"]) == 1
    assert "attachment" in exported.headers["content-disposition"]
    assert client.get("/sessions/missing").status_code == 404


def test_export_never_contains_raw_eeg_samples(api):
    client, clock, app = api
    sid = client.post("/sessions", json=config(source="live").model_dump()).json()["session_id"]
    client.post(f"/sessions/{sid}/start")
    chunk = {"sequence": 0, "start_time": 0, "source": "live", "units": "uV", "samples": wave().tolist()}
    assert client.post(f"/sessions/{sid}/eeg", json=chunk).status_code == 200
    client.post(f"/sessions/{sid}/end", json={})
    exported = client.get(f"/sessions/{sid}/export").json()
    assert exported["eeg"]["quality"] == "usable"
    assert "samples" not in json.dumps(exported)


def test_http_nonfinite_and_ragged_samples(api):
    client, _, _ = api
    sid = client.post("/sessions", json=config(source="live").model_dump()).json()["session_id"]
    client.post(f"/sessions/{sid}/start")
    base = {"sequence": 0, "start_time": 0, "source": "live", "units": "uV"}
    assert client.post(f"/sessions/{sid}/eeg", json=base | {"samples": [[1, 2], [3]]}).status_code == 400
    response = client.post(f"/sessions/{sid}/eeg",
        content=json.dumps(base | {"samples": [[float('nan'), 1]]}), headers={"Content-Type": "application/json"})
    assert response.status_code in {400, 422}


def test_websocket_and_cors(api):
    client, _, _ = api
    sid = client.post("/sessions", json=config().model_dump()).json()["session_id"]
    with client.websocket_connect(f"/sessions/{sid}/ws", headers={"origin": "http://localhost:5173"}) as ws:
        assert ws.receive_json()["session_id"] == sid
    response = client.options("/sessions", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_interrupted_session_is_not_resumed(tmp_path):
    clock = Clock()
    path = tmp_path / "state.sqlite3"
    original = Manager(path, clock)
    sid = original.create(config())["session_id"]
    session = original.active(sid)
    session.start_observation()
    original.store.save(session)
    original.store.db.close()
    restarted = Manager(path, clock)
    assert restarted.view(sid)["phase"] == "interrupted"
    restarted.store.db.close()


# --- Gemini suggestions: mocked, cached, and unavailable-error behaviour ---

def test_suggestion_mock_is_structured_and_cached(tmp_path):
    clock = Clock()
    mock = MockSuggestionService()
    app = create_app(tmp_path / "sessions.sqlite3", clock, suggestion_service=mock)
    with TestClient(app) as client:
        sid = client.post("/sessions", json=config().model_dump()).json()["session_id"]
        client.post(f"/sessions/{sid}/start")
        client.post(f"/sessions/{sid}/events", json=event(1, "rage_click", page_url="/checkout",
            client_ts=0, element_id="submit", click_count=5, duration_ms=500).model_dump())
        client.post(f"/sessions/{sid}/events", json=event(2, "backtrack", page_url="/checkout",
            client_ts=0.2, element_id="submit", previous_page_url="/cart").model_dump())
        clock.advance(20)
        friction = client.get(f"/sessions/{sid}/friction-events").json()["friction_events"]
        assert len(friction) == 1
        fid = friction[0]["friction_event_id"]
        response = client.post(f"/sessions/{sid}/friction-events/{fid}/suggestion",
            json={"element_type": "button", "element_description": "Submit order button"})
        assert response.status_code == 200
        body = response.json()
        assert body["priority"] in {"low", "medium", "high"}
        assert set(body) == {"problem", "suggestion", "priority", "rationale"}
        assert len(mock.calls) == 1
        response2 = client.post(f"/sessions/{sid}/friction-events/{fid}/suggestion", json={})
        assert response2.status_code == 200
        assert response2.json() == body
        assert len(mock.calls) == 1  # cached: no second Gemini call


def test_suggestion_unavailable_returns_503_and_api_still_works(tmp_path):
    clock = Clock()
    app = create_app(tmp_path / "sessions.sqlite3", clock, suggestion_service=FailingSuggestionService())
    with TestClient(app) as client:
        sid = client.post("/sessions", json=config().model_dump()).json()["session_id"]
        client.post(f"/sessions/{sid}/start")
        client.post(f"/sessions/{sid}/events", json=event(1, "rage_click", page_url="/checkout",
            client_ts=0, element_id="submit", click_count=5, duration_ms=500).model_dump())
        client.post(f"/sessions/{sid}/events", json=event(2, "backtrack", page_url="/checkout",
            client_ts=0.2, element_id="submit", previous_page_url="/cart").model_dump())
        clock.advance(20)
        fid = client.get(f"/sessions/{sid}/friction-events").json()["friction_events"][0]["friction_event_id"]
        response = client.post(f"/sessions/{sid}/friction-events/{fid}/suggestion", json={})
        assert response.status_code == 503
        assert client.get("/health").status_code == 200
        assert client.get(f"/sessions/{sid}").status_code == 200


def test_vertex_service_unavailable_without_credentials(monkeypatch):
    monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
    monkeypatch.delenv("GOOGLE_CLOUD_LOCATION", raising=False)
    service = VertexGeminiSuggestionService()
    context = SuggestionContext(page_url="/x", element_id="y", friction_score=0.5,
                                severity="medium", evidence=["backtrack"])
    with pytest.raises(SuggestionUnavailable):
        service.suggest(context)
