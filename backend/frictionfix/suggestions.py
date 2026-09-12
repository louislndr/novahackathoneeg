"""Team: TO FILL | Members: TO FILL. Gemini-via-Vertex-AI improvement suggestions.

Uses the official Google Gen AI SDK (`google-genai`) configured for Vertex AI with
Application Default Credentials -- never a Google AI Studio API key. This module is
optional: if `google-genai` is not installed, or GOOGLE_CLOUD_PROJECT/LOCATION are not
set, or Vertex AI is unreachable, `suggest()` raises SuggestionUnavailable and the rest
of the backend keeps working. See README.md for Windows PowerShell setup (gcloud auth
application-default login, enabling the Vertex AI API, required environment variables).
"""

from dataclasses import dataclass
import os

from .schemas import SuggestionResult

DEFAULT_MODEL = "gemini-2.5-flash"
DEFAULT_TIMEOUT_MS = 10_000

try:
    from google import genai
    from google.genai import types as genai_types
    from google.genai import errors as genai_errors
    from google.auth import exceptions as google_auth_exceptions
    GENAI_IMPORT_ERROR = None
except ImportError as exc:  # google-genai is an optional extra; keep the app usable without it.
    genai = genai_types = genai_errors = google_auth_exceptions = None
    GENAI_IMPORT_ERROR = exc


class SuggestionUnavailable(Exception):
    """Vertex AI could not produce a suggestion right now. Never fabricate a fallback
    suggestion and present it as Gemini's; surface this to the caller instead."""


@dataclass
class SuggestionContext:
    page_url: str
    element_id: str | None
    friction_score: float
    severity: str
    evidence: list
    element_type: str | None = None
    element_description: str | None = None
    behavior_summary: dict | None = None
    gaze_summary: dict | None = None
    eeg_summary: dict | None = None


class SuggestionService:
    """Abstraction so Vertex AI can be swapped for a mock/fake in tests."""

    def suggest(self, context: SuggestionContext) -> SuggestionResult:
        raise NotImplementedError


def _build_prompt(context: SuggestionContext) -> str:
    return (
        "You are a website usability analyst reviewing experimental behavioural and "
        "physiological evidence from ONE participant naturally browsing a website. "
        "This evidence indicates a LIKELY friction point, not proof of confusion or a "
        "measured design defect. Respond with a specific, actionable suggestion.\n\n"
        f"Page URL: {context.page_url}\n"
        f"Element ID: {context.element_id or 'not tied to a specific element'}\n"
        f"Element type: {context.element_type or 'unknown'}\n"
        f"Element description: {context.element_description or 'not provided'}\n"
        f"Friction score (0-1, higher means more corroborating evidence): {context.friction_score}\n"
        f"Severity: {context.severity}\n"
        f"Evidence types present: {', '.join(context.evidence) or 'none'}\n"
        f"Browser-behaviour summary: {context.behavior_summary or 'unavailable'}\n"
        f"Gaze summary: {context.gaze_summary or 'unavailable'}\n"
        f"Experimental EEG summary: {context.eeg_summary or 'unavailable'}\n"
    )


class VertexGeminiSuggestionService(SuggestionService):
    def __init__(self, project=None, location=None, model=None, timeout_ms=DEFAULT_TIMEOUT_MS):
        self.project = project or os.environ.get("GOOGLE_CLOUD_PROJECT")
        self.location = location or os.environ.get("GOOGLE_CLOUD_LOCATION")
        self.model = model or os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)
        self.timeout_ms = timeout_ms
        self._client = None

    def _get_client(self):
        if GENAI_IMPORT_ERROR is not None:
            raise SuggestionUnavailable(
                "google-genai is not installed; install the backend[gemini] extra") from GENAI_IMPORT_ERROR
        if not self.project or not self.location:
            raise SuggestionUnavailable(
                "GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables must be set")
        if self._client is None:
            try:
                self._client = genai.Client(vertexai=True, project=self.project, location=self.location)
            except google_auth_exceptions.GoogleAuthError as exc:
                raise SuggestionUnavailable(f"Google Cloud authentication is not configured: {exc}") from exc
        return self._client

    def suggest(self, context: SuggestionContext) -> SuggestionResult:
        client = self._get_client()
        try:
            response = client.models.generate_content(
                model=self.model,
                contents=_build_prompt(context),
                config=genai_types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=SuggestionResult,
                    http_options=genai_types.HttpOptions(timeout=self.timeout_ms),
                ),
            )
        except genai_errors.APIError as exc:
            raise SuggestionUnavailable(f"Vertex AI request failed: {exc}") from exc
        except google_auth_exceptions.GoogleAuthError as exc:
            raise SuggestionUnavailable(f"Google Cloud authentication is not configured: {exc}") from exc
        except Exception as exc:  # network/timeout/unexpected SDK errors -- degrade, don't crash the API
            raise SuggestionUnavailable(f"Unexpected error calling Vertex AI: {exc}") from exc
        parsed = getattr(response, "parsed", None)
        if parsed is None:
            raise SuggestionUnavailable("Vertex AI returned a response that did not match the expected schema")
        return parsed
