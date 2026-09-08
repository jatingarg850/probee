"""Sanity checks for the server module structure (not the old tool-calling logic)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import llm as srv  # noqa: E402


def test_health_service_name():
    """Health endpoint returns the correct service name for this recipe."""
    import asyncio
    result = asyncio.run(srv.health())
    assert result["service"] == "handoff-mock"
    assert result["status"] == "ok"
