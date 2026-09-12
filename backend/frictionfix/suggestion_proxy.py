"""Team: TO FILL | Members: TO FILL. Standalone Cloud Run proxy for Gemini suggestions.

Deploy this separately from the main FastAPI app (see README.md). It holds the only
real Google Cloud credential (its own Cloud Run service-account identity via
Application Default Credentials) so a teammate's local backend can request suggestions
with nothing more than this proxy's URL and a shared bearer token -- no gcloud, no IAM
grant, no GCP credential of their own. The shared token is still a secret (private
channel, never committed) but a much narrower one than a real Cloud API key: if it
leaks, the blast radius is "someone can call this rate-limited proxy," not "someone has
your GCP key."
"""

from collections import deque
import os
import time

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse

from .schemas import StrictModel, SuggestionResult
from .suggestions import SuggestionContext, SuggestionUnavailable, VertexGeminiSuggestionService

MAX_REQUESTS_PER_MINUTE = 20


class ProxySuggestionRequest(StrictModel):
    page_url: str
    element_id: str | None = None
    friction_score: float
    severity: str
    evidence: list[str]
    element_type: str | None = None
    element_description: str | None = None
    behavior_summary: dict | None = None
    gaze_summary: dict | None = None
    eeg_summary: dict | None = None


def create_proxy_app(suggestion_service=None, shared_token=None, clock=time.time):
    suggestion_service = suggestion_service or VertexGeminiSuggestionService()
    shared_token = shared_token if shared_token is not None else os.environ.get("FRICTIONFIX_PROXY_TOKEN")
    recent_requests = deque()

    app = FastAPI(title="FrictionFix suggestion proxy", version="0.1.0",
                  description="Credential-free relay to Gemini/Vertex AI for teammates. "
                             "Never returns a fabricated suggestion; degrades to an error instead.")

    @app.exception_handler(SuggestionUnavailable)
    async def suggestion_unavailable(request, exc):
        return JSONResponse(status_code=503, content={"detail": f"Gemini suggestion unavailable: {exc}"})

    def check_rate_limit():
        now = clock()
        recent_requests.append(now)
        while recent_requests and now - recent_requests[0] > 60:
            recent_requests.popleft()
        if len(recent_requests) > MAX_REQUESTS_PER_MINUTE:
            raise HTTPException(status_code=429, detail="Too many suggestion requests in the last minute")

    def check_auth(authorization: str | None):
        if not shared_token:
            raise HTTPException(status_code=500, detail="Proxy is misconfigured: no shared token is set")
        expected = f"Bearer {shared_token}"
        if not authorization or authorization != expected:
            raise HTTPException(status_code=401, detail="Missing or invalid bearer token")

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.post("/suggest", response_model=SuggestionResult)
    def suggest(body: ProxySuggestionRequest, authorization: str | None = Header(default=None)):
        check_auth(authorization)
        check_rate_limit()
        context = SuggestionContext(**body.model_dump())
        return suggestion_service.suggest(context)

    return app


app = create_proxy_app()
