"""The LLM endpoint is mounted into the server app and stays agora-free."""


def test_llm_health_is_mounted_under_slash_llm(client):
    response = client.get("/llm/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_llm_chat_completions_reachable_through_mount(client):
    response = client.post("/llm/chat/completions", json={
        "model": "test-model", "messages": [{"role": "user", "content": "hi"}], "stream": True})
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    assert response.text.rstrip().endswith("data: [DONE]")


def test_llm_module_has_no_agora_dependency():
    import ast
    import inspect
    import llm

    tree = ast.parse(inspect.getsource(llm))
    roots = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                roots.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom) and node.module:
            roots.add(node.module.split(".")[0])
    agora = sorted(r for r in roots if r.startswith("agora"))
    assert not agora, f"llm.py must not import an Agora SDK; found: {agora}"
