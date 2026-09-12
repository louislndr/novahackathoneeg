"""Behavioural, signal-integrity and closed-loop integration tests. Synthetic EEG only."""

import json
import numpy as np
import pytest
from fastapi.testclient import TestClient
from frictionfix.app import create_app
from frictionfix.engine import Session, Manager
from frictionfix.schemas import SessionConfig, BehaviorEvent, EEGChunk, TrialOutcome
from frictionfix.signal import extract_features, WindowBuffer


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
    return SessionConfig(**({"participant_id": "test", "field_ids": ["name", "date"],
                             "sample_rate": 128, "channel_names": ["F3", "F4"]} | kwargs))


def event(n, kind, **kwargs):
    return BehaviorEvent(event_id=str(n), type=kind, **kwargs)


def push(session, clock, freq=10, bad=False):
    clock.advance(2)
    seq = session.buffer.last_sequence + 1
    samples = np.zeros((256, 2)) if bad else wave(freq, seed=seq)
    session.ingest(EEGChunk(sequence=seq, source=session.config.source, units="uV",
                            samples=samples.tolist(), start_time=seq * 2))


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


def test_manual_cannot_accept_replay_and_no_uncalibrated_auto():
    clock = Clock()
    session = Session(config(), clock)
    session.start_task()
    session.record_event(event(1, "field_focus", field_id="name"))
    clock.advance(20)
    assert session.view()["adaptation_request"] is None
    with pytest.raises(ValueError, match="source"):
        session.ingest(EEGChunk(sequence=0, start_time=0, source="replay", units="uV", samples=wave().tolist()))


def test_metrics_idempotency_edits_and_completion():
    clock = Clock()
    session = Session(config(), clock)
    session.start_task()
    session.record_event(event(1, "field_focus", field_id="name"))
    clock.advance(3)
    session.record_event(event(2, "field_focus", field_id="name"))
    bad = event(3, "field_validation", field_id="name", correct=False)
    session.record_event(bad)
    session.record_event(bad)
    assert session.view()["metrics"]["errors"] == 1
    with pytest.raises(ValueError, match="different content"):
        session.record_event(event(3, "field_validation", field_id="name", correct=True))
    session.record_event(event(4, "field_validation", field_id="name", correct=True))
    session.record_event(event(5, "field_validation", field_id="date", correct=True))
    session.record_event(event(6, "field_changed", field_id="name"))
    with pytest.raises(ValueError, match="successful validation"):
        session.record_event(event(7, "task_complete"))
    session.record_event(event(8, "field_validation", field_id="name", correct=True))
    clock.advance(7)
    session.record_event(event(9, "task_complete"))
    clock.advance(20)
    state = session.view()
    assert state["metrics"]["elapsed_seconds"] == 10
    assert state["metrics"]["fields"]["name"]["focused_seconds"] == 10
    session.record_event(event(9, "task_complete"))  # retry after completion is safe
    with pytest.raises(ValueError, match="immutable"):
        session.record_event(event(10, "field_changed", field_id="name"))


def test_behavior_only_request_requires_acknowledgment():
    clock = Clock()
    session = Session(config(policy="behavior_only"), clock)
    session.start_task()
    session.record_event(event(1, "field_focus", field_id="name"))
    clock.advance(13)
    state = session.view()
    assert state["layout"] == "conventional"
    request = state["adaptation_request"]
    assert request["policy"] == "behavior_only"
    with pytest.raises(ValueError, match="matching"):
        session.record_event(event(2, "layout_changed", layout="guided", reason="adaptation", request_id="wrong"))
    session.record_event(event(3, "layout_changed", layout="guided", reason="adaptation", request_id=request["request_id"]))
    assert session.view()["layout"] == "guided"


def train_session(clock):
    session = Session(config(source="replay"), clock)
    session.start_calibration()
    for i in range(8):
        session.start_trial()
        freq = 6 if i % 2 else 10
        push(session, clock, freq)
        push(session, clock, freq)
        session.end_trial(TrialOutcome(success=not bool(i % 2), errors=i % 2))
    session.fit()
    return session


def test_full_calibration_and_eeg_behavior_adaptation():
    clock = Clock()
    session = train_session(clock)
    assert session.calibration_report["trial_count"] == 8
    assert session.calibration_report["cv_balanced_accuracy"] == 1.0  # constructed separable signals
    session.start_task()
    for _ in range(4):
        push(session, clock, freq=6)
    assert session.risk_score > .7
    assert session.pending_adaptation is None  # EEG alone is insufficient
    session.record_event(event(1, "field_validation", field_id="name", correct=False))
    assert session.pending_adaptation is not None
    push(session, clock, bad=True)
    assert session.view()["adaptation_request"] is None
    assert session.risk_score is None
    for _ in range(4):
        push(session, clock, freq=6)
    assert session.view()["adaptation_request"] is not None
    clock.advance(5)
    assert session.view()["eeg"]["quality"] == "stale"
    assert session.view()["adaptation_request"] is None


def test_bad_or_stale_calibration_and_minimum_trials():
    clock = Clock()
    session = Session(config(source="replay"), clock)
    session.start_calibration()
    session.start_trial()
    push(session, clock)
    with pytest.raises(ValueError, match="two consecutive"):
        session.end_trial(TrialOutcome(success=True, errors=0))
    push(session, clock)
    clock.advance(5)
    with pytest.raises(ValueError, match="two consecutive"):
        session.end_trial(TrialOutcome(success=True, errors=0))
    session.cancel_trial()
    with pytest.raises(ValueError, match="eight independent"):
        session.fit()


def test_volt_conversion():
    clock = Clock()
    session = Session(config(source="live"), clock)
    session.ingest(EEGChunk(sequence=0, start_time=0, source="live", units="V", samples=(wave()/1e6).tolist()))
    assert session.quality == "usable"
    assert session.latest_features["alpha_fraction"] > .8


def test_clone_rejects_other_person_or_replay_to_live(tmp_path):
    clock = Clock()
    manager = Manager(tmp_path / "db.sqlite3", clock)
    original = train_session(clock)
    manager.sessions[original.id] = original
    for change in ({"participant_id": "someone-else"}, {"source": "live"}, {"task_key": "other-task"}):
        with pytest.raises(ValueError, match="mismatch"):
            manager.create(config(source="replay", calibration_session_id=original.id).model_copy(update=change))
    result = manager.create(config(source="replay", calibration_session_id=original.id))
    assert result["calibration"]["ready"]
    manager.store.db.close()


@pytest.fixture
def api(tmp_path):
    clock = Clock()
    app = create_app(tmp_path / "sessions.sqlite3", clock)
    with TestClient(app) as client:
        yield client, clock, app


def test_http_errors_exports_and_restart(api, tmp_path):
    client, clock, app = api
    response = client.post("/sessions", json=config().model_dump())
    assert response.status_code == 201
    sid = response.json()["session_id"]
    assert client.get("/health").status_code == 200
    assert client.post(f"/sessions/{sid}/start").status_code == 200
    assert client.post(f"/sessions/{sid}/events", json=event(1, "field_focus", field_id="typo").model_dump()).status_code == 400
    clock.advance(2)
    for i, field in enumerate(["name", "date"]):
        assert client.post(f"/sessions/{sid}/events", json=event(i+2, "field_validation", field_id=field, correct=True).model_dump()).status_code == 200
    assert client.post(f"/sessions/{sid}/events", json=event(5, "task_complete").model_dump()).status_code == 200
    exported = client.get(f"/sessions/{sid}/export")
    assert exported.json()["metrics"]["completed"]
    assert len(exported.json()["events"]) == 3
    assert "attachment" in exported.headers["content-disposition"]
    assert client.get("/sessions/missing").status_code == 404
    # New manager reads archived results, never resumes stale calibration or tasks.
    other = Manager(tmp_path / "sessions.sqlite3", clock)
    assert other.view(sid)["phase"] == "completed"
    assert other.view(sid)["archived"]
    other.store.db.close()


def test_http_nonfinite_and_ragged_samples(api):
    client, _, _ = api
    sid = client.post("/sessions", json=config(source="live").model_dump()).json()["session_id"]
    base = {"sequence": 0, "start_time": 0, "source": "live", "units": "uV"}
    assert client.post(f"/sessions/{sid}/eeg", json=base | {"samples": [[1,2],[3]]}).status_code == 400
    response = client.post(f"/sessions/{sid}/eeg", content=json.dumps(base | {"samples": [[float('nan'), 1]]}), headers={"Content-Type": "application/json"})
    assert response.status_code in {400, 422}


def test_comparison_rejects_mixed_runs_and_observes_real_times(api):
    client, clock, _ = api
    ids = []
    for layout, duration in [("conventional", 20), ("guided", 10)]:
        sid = client.post("/sessions", json=config(initial_layout=layout, policy="observe").model_dump()).json()["session_id"]
        ids.append(sid)
        client.post(f"/sessions/{sid}/start")
        clock.advance(duration)
        for i, field in enumerate(["name", "date"]):
            client.post(f"/sessions/{sid}/events", json=event(i, "field_validation", field_id=field, correct=True).model_dump())
        client.post(f"/sessions/{sid}/events", json=event(4, "task_complete").model_dump())
    response = client.post("/compare", json={"session_ids": ids}).json()
    assert response["eligible_descriptive_comparison"]
    assert response["difference"]["seconds_saved"] == 10
    assert client.post("/compare", json={"session_ids": [ids[0], ids[0]]}).status_code == 400


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
    session.start_task()
    original.store.save(session)
    original.store.db.close()
    restarted = Manager(path, clock)
    assert restarted.view(sid)["phase"] == "interrupted"
    assert restarted.view(sid)["adaptation_request"] is None
    restarted.store.db.close()
