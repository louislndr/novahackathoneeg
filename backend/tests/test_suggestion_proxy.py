"""Tests for the credential-free Cloud Run suggestion proxy and its client.

No real network call and no Google Cloud credentials anywhere in this file --
httpx.MockTransport stands in for the network, and MockSuggestionService/
FailingSuggestionService (imported from test_backend) stand in for Vertex AI.
"""

import httpx
import pytest
from fastapi.testclient import TestClient

from frictionfix.suggestion_proxy import create_proxy_app
from frictionfix.suggestions import RemoteSuggestionService, SuggestionContext, SuggestionUnavailable
from test_backend import MockSuggestionService, FailingSuggestionService


def context(**kwargs):
    return SuggestionContext(page_url="/checkout", element_id="submit", friction_score=0.4,
                             severity="medium", evidence=["backtrack", "rage_clicks"], **kwargs)


# --- RemoteSuggestionService (the client side, used by the main app) ---

def test_remote_service_round_trip_via_mock_transport():
    mock = MockSuggestionService()

    def handler(request):
        assert request.headers["authorization"] == "Bearer secret-token"
        return httpx.Response(200, json=mock.result.model_dump())

    client = httpx.Client(transport=httpx.MockTransport(handler))
    service = RemoteSuggestionService("https://proxy.example", "secret-token", client=client)
    result = service.suggest(context())
    assert result == mock.result


def test_remote_service_non_200_raises_unavailable():
    client = httpx.Client(transport=httpx.MockTransport(
        lambda request: httpx.Response(503, text="proxy misconfigured")))
    service = RemoteSuggestionService("https://proxy.example", "t", client=client)
    with pytest.raises(SuggestionUnavailable):
        service.suggest(context())


def test_remote_service_network_error_raises_unavailable():
    def handler(request):
        raise httpx.ConnectError("connection refused", request=request)
    client = httpx.Client(transport=httpx.MockTransport(handler))
    service = RemoteSuggestionService("https://proxy.example", "t", client=client)
    with pytest.raises(SuggestionUnavailable):
        service.suggest(context())


def test_remote_service_malformed_body_raises_unavailable():
    client = httpx.Client(transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json={"not": "a suggestion"})))
    service = RemoteSuggestionService("https://proxy.example", "t", client=client)
    with pytest.raises(SuggestionUnavailable):
        service.suggest(context())


# --- The proxy app itself (what actually runs on Cloud Run) ---

def proxy_client(suggestion_service, shared_token="secret-token"):
    app = create_proxy_app(suggestion_service=suggestion_service, shared_token=shared_token)
    return TestClient(app)


def suggestion_payload(**kwargs):
    return {"page_url": "/checkout", "element_id": "submit", "friction_score": 0.4,
           "severity": "medium", "evidence": ["backtrack", "rage_clicks"]} | kwargs


def test_proxy_rejects_missing_or_wrong_token():
    client = proxy_client(MockSuggestionService())
    assert client.post("/suggest", json=suggestion_payload()).status_code == 401
    assert client.post("/suggest", json=suggestion_payload(),
                       headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_proxy_accepts_correct_token_and_returns_suggestion():
    mock = MockSuggestionService()
    client = proxy_client(mock)
    response = client.post("/suggest", json=suggestion_payload(),
                           headers={"Authorization": "Bearer secret-token"})
    assert response.status_code == 200
    assert response.json() == mock.result.model_dump()
    assert len(mock.calls) == 1


def test_proxy_refuses_to_serve_when_misconfigured_with_no_token():
    client = proxy_client(MockSuggestionService(), shared_token=None)
    response = client.post("/suggest", json=suggestion_payload(),
                           headers={"Authorization": "Bearer anything"})
    assert response.status_code == 500


def test_proxy_maps_suggestion_unavailable_to_503():
    client = proxy_client(FailingSuggestionService())
    response = client.post("/suggest", json=suggestion_payload(),
                           headers={"Authorization": "Bearer secret-token"})
    assert response.status_code == 503
    assert client.get("/health").status_code == 200


def test_proxy_rate_limits_over_the_cap():
    client = proxy_client(MockSuggestionService())
    headers = {"Authorization": "Bearer secret-token"}
    statuses = [client.post("/suggest", json=suggestion_payload(), headers=headers).status_code
               for _ in range(21)]
    assert statuses.count(200) == 20
    assert statuses[-1] == 429
