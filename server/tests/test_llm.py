"""Contract tests for the mock LLM endpoint in isolation (no Agora, no mount)."""
from fastapi.testclient import TestClient

import llm


def _client():
    return TestClient(llm.app)


def test_health():
    r = _client().get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_streaming_sse_contract():
    r = _client().post("/chat/completions", json={
        "model": "test-model", "messages": [{"role": "user", "content": "hi"}], "stream": True})
    assert r.status_code == 200
    assert "text/event-stream" in r.headers["content-type"]
    body = r.text
    assert '"role": "assistant"' in body or '"role":"assistant"' in body
    assert '"finish_reason": "stop"' in body or '"finish_reason":"stop"' in body
    assert body.rstrip().endswith("data: [DONE]")


def test_non_streaming_rejected():
    r = _client().post("/chat/completions", json={
        "model": "test-model", "messages": [{"role": "user", "content": "hi"}], "stream": False})
    assert r.status_code == 400
