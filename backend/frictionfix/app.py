"""Team: TO FILL | Members: TO FILL. Local HTTP and WebSocket experiment API."""

import asyncio
from contextlib import asynccontextmanager
import os
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .engine import Manager
from .schemas import SessionConfig, EEGChunk, BehaviorEvent, TrialOutcome, Comparison


def create_app(data_path=None, clock=None):
    path = data_path or os.environ.get("FRICTIONFIX_DB", str(Path(__file__).resolve().parents[1] / "data" / "sessions.sqlite3"))
    manager = Manager(path, **({"clock": clock} if clock else {}))

    @asynccontextmanager
    async def lifespan(app):
        yield
        manager.store.db.close()

    app = FastAPI(title="FrictionFix Backend", version="0.1.0", lifespan=lifespan,
                  description="Local usability experiment API. Replay is explicitly labelled. No validated mind-reading claim.")
    app.state.manager = manager
    origins = os.environ.get("FRICTIONFIX_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000").split(",")
    app.add_middleware(CORSMiddleware, allow_origins=origins,
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    @app.exception_handler(ValueError)
    async def bad_request(request, exc):
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(KeyError)
    async def not_found(request, exc):
        return JSONResponse(status_code=404, content={"detail": "Session not found or no longer active"})

    def mutate(session_id, method, argument=None):
        with manager.lock:
            session = manager.active(session_id)
            result = getattr(session, method)(argument) if argument is not None else getattr(session, method)()
            manager.store.save(session)
            return session.view() | ({"result": result} if result is not None else {})

    @app.get("/health")
    def health():
        return {"status": "ok", "version": "0.1.0", "hardware_connected": "see individual session EEG quality"}

    @app.post("/sessions", status_code=201)
    def create_session(config: SessionConfig):
        with manager.lock:
            return manager.create(config)

    @app.get("/sessions/{session_id}")
    def session_state(session_id: str):
        with manager.lock:
            return manager.view(session_id)

    @app.post("/sessions/{session_id}/start")
    def start_task(session_id: str):
        return mutate(session_id, "start_task")

    @app.post("/sessions/{session_id}/events")
    def behavior(session_id: str, event: BehaviorEvent):
        return mutate(session_id, "record_event", event)

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
    def trial_end(session_id: str, outcome: TrialOutcome):
        return mutate(session_id, "end_trial", outcome)

    @app.post("/sessions/{session_id}/calibration/trials/cancel")
    def trial_cancel(session_id: str):
        return mutate(session_id, "cancel_trial")

    @app.post("/sessions/{session_id}/calibration/fit")
    def calibration_fit(session_id: str):
        return mutate(session_id, "fit")

    @app.get("/sessions/{session_id}/export")
    def export(session_id: str):
        with manager.lock:
            payload = manager.view(session_id, export=True)
            # Use known UUID from the record, not untrusted URL text, in the filename.
            return JSONResponse(payload, headers={
                "Content-Disposition": f'attachment; filename="frictionfix-{payload["session_id"]}.json"'})

    @app.post("/compare")
    def compare(body: Comparison):
        with manager.lock:
            return manager.compare(body.session_ids)

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
