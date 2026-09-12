"""Team: TO FILL | Members: TO FILL. Local HTTP and WebSocket FrictionFix API."""

import asyncio
from contextlib import asynccontextmanager
import os
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .engine import Manager, RateLimitExceeded
from .schemas import (SessionConfig, EEGChunk, BehaviorEvent, GazeObservation,
                      CalibrationLabel, EndRequest, SuggestionRequest)
from .suggestions import SuggestionContext, SuggestionUnavailable, VertexGeminiSuggestionService


def _summarize_for_suggestion(session, record):
    page, element = record["page_url"], record["element_id"]
    behavior_summary = {}
    for e in session.events_export():
        if e["page_url"] == page and e.get("element_id") == element:
            behavior_summary[e["type"]] = behavior_summary.get(e["type"], 0) + 1
    matching_gaze = [g for g in session.gaze_export()
                     if g["page_url"] == page and g.get("element_id") == element]
    gaze_summary = None
    if matching_gaze:
        gaze_summary = {
            "observation_count": len(matching_gaze),
            "avg_dwell_ms": sum(g["dwell_ms"] for g in matching_gaze) / len(matching_gaze),
            "avg_confidence": sum(g["confidence"] for g in matching_gaze) / len(matching_gaze),
        }
    eeg_summary = None
    if record["source_mode"] == "combined":
        eeg_summary = {"quality": session.quality, "risk_score": session.risk_score}
    return behavior_summary, gaze_summary, eeg_summary


def create_app(data_path=None, clock=None, suggestion_service=None):
    path = data_path or os.environ.get("FRICTIONFIX_DB", str(Path(__file__).resolve().parents[1] / "data" / "sessions.sqlite3"))
    manager = Manager(path, **({"clock": clock} if clock else {}))
    suggestion_service = suggestion_service or VertexGeminiSuggestionService()

    def run_auto_suggestions(session):
        pending, session.pending_auto_suggest = session.pending_auto_suggest, []
        for record in pending:
            if record["suggestion"] is not None:
                continue
            behavior_summary, gaze_summary, eeg_summary = _summarize_for_suggestion(session, record)
            context = SuggestionContext(
                page_url=record["page_url"], element_id=record["element_id"],
                friction_score=record["friction_score"], severity=record["severity"],
                evidence=record["evidence"], behavior_summary=behavior_summary,
                gaze_summary=gaze_summary, eeg_summary=eeg_summary,
            )
            try:
                record["suggestion"] = suggestion_service.suggest(context).model_dump()
            except SuggestionUnavailable:
                pass  # best-effort; the researcher can still request one explicitly later

    @asynccontextmanager
    async def lifespan(app):
        yield
        manager.store.db.close()

    app = FastAPI(title="FrictionFix Backend", version="0.2.0", lifespan=lifespan,
                  description="Local website-friction observation API. Replay is explicitly "
                             "labelled. Friction events describe likely difficulty supported "
                             "by experimental/behavioural evidence, not a validated diagnosis.")
    app.state.manager = manager
    origins = os.environ.get("FRICTIONFIX_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000").split(",")
    app.add_middleware(CORSMiddleware, allow_origins=origins,
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    @app.exception_handler(ValueError)
    async def bad_request(request, exc):
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(KeyError)
    async def not_found(request, exc):
        return JSONResponse(status_code=404, content={"detail": "Session or resource not found"})

    @app.exception_handler(RateLimitExceeded)
    async def rate_limited(request, exc):
        return JSONResponse(status_code=429, content={"detail": str(exc)})

    @app.exception_handler(SuggestionUnavailable)
    async def suggestion_unavailable(request, exc):
        return JSONResponse(status_code=503, content={"detail": f"Gemini suggestion unavailable: {exc}"})

    def mutate(session_id, method, argument=None):
        with manager.lock:
            session = manager.active(session_id)
            result = getattr(session, method)(argument) if argument is not None else getattr(session, method)()
            run_auto_suggestions(session)
            manager.store.save(session)
            return session.view() | ({"result": result} if result is not None else {})

    @app.get("/health")
    def health():
        return {"status": "ok", "version": "0.2.0", "hardware_connected": "see individual session EEG quality"}

    @app.post("/sessions", status_code=201)
    def create_session(config: SessionConfig):
        with manager.lock:
            return manager.create(config)

    @app.get("/sessions/{session_id}")
    def session_state(session_id: str):
        with manager.lock:
            return manager.view(session_id)

    @app.post("/sessions/{session_id}/start")
    def start_observation(session_id: str):
        return mutate(session_id, "start_observation")

    @app.post("/sessions/{session_id}/end")
    def end_observation(session_id: str, body: EndRequest = EndRequest()):
        return mutate(session_id, "end_observation", body.reason)

    @app.post("/sessions/{session_id}/events")
    def behavior(session_id: str, event: BehaviorEvent):
        return mutate(session_id, "record_event", event)

    @app.post("/sessions/{session_id}/gaze")
    def gaze(session_id: str, observation: GazeObservation):
        return mutate(session_id, "record_gaze", observation)

    @app.post("/sessions/{session_id}/eeg")
    def eeg(session_id: str, chunk: EEGChunk):
        return mutate(session_id, "ingest", chunk)

    @app.post("/sessions/{session_id}/calibration/start")
    def calibration_start(session_id: str):
        return mutate(session_id, "start_calibration")

    @app.post("/sessions/{session_id}/calibration/trials/start")
    def trial_start(session_id: str):
        return mutate(session_id, "start_trial")

    @app.post("/sessions/{session_id}/calibration/trials/end")
    def trial_end(session_id: str, outcome: CalibrationLabel):
        return mutate(session_id, "end_trial", outcome)

    @app.post("/sessions/{session_id}/calibration/trials/cancel")
    def trial_cancel(session_id: str):
        return mutate(session_id, "cancel_trial")

    @app.post("/sessions/{session_id}/calibration/fit")
    def calibration_fit(session_id: str):
        return mutate(session_id, "fit")

    @app.get("/sessions/{session_id}/friction-events")
    def friction_events(session_id: str):
        with manager.lock:
            return {"friction_events": manager.friction_events(session_id)}

    @app.post("/sessions/{session_id}/friction-events/{friction_event_id}/suggestion")
    def request_suggestion(session_id: str, friction_event_id: str, extra: SuggestionRequest = SuggestionRequest()):
        with manager.lock:
            session = manager.active(session_id)
            record = next((r for r in session.friction.closed if r["friction_event_id"] == friction_event_id), None)
            if record is None:
                raise KeyError(friction_event_id)
            if record["suggestion"] is None:
                behavior_summary, gaze_summary, eeg_summary = _summarize_for_suggestion(session, record)
                context = SuggestionContext(
                    page_url=record["page_url"], element_id=record["element_id"],
                    friction_score=record["friction_score"], severity=record["severity"],
                    evidence=record["evidence"], element_type=extra.element_type,
                    element_description=extra.element_description,
                    behavior_summary=behavior_summary, gaze_summary=gaze_summary, eeg_summary=eeg_summary,
                )
                record["suggestion"] = suggestion_service.suggest(context).model_dump()
                manager.store.save(session)
            return record["suggestion"]

    @app.get("/sessions/{session_id}/export")
    def export(session_id: str):
        with manager.lock:
            payload = manager.view(session_id, export=True)
            # Use known UUID from the record, not untrusted URL text, in the filename.
            return JSONResponse(payload, headers={
                "Content-Disposition": f'attachment; filename="frictionfix-{payload["session_id"]}.json"'})

    @app.websocket("/sessions/{session_id}/ws")
    async def state_socket(websocket: WebSocket, session_id: str):
        origin = websocket.headers.get("origin")
        if origin and origin not in origins:
            await websocket.close(code=1008)
            return
        await websocket.accept()
        try:
            while True:
                with manager.lock:
                    state = manager.view(session_id)
                await websocket.send_json(state)
                await asyncio.sleep(0.5)
        except KeyError:
            await websocket.close(code=1008, reason="Session not found")
        except WebSocketDisconnect:
            pass

    return app


app = create_app()
