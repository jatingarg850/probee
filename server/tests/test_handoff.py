import os, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import llm as s  # noqa: E402


def _u(text):
    return [s.UserMessage(role="user", content=text)]


def fresh_db():
    path = os.path.join(tempfile.mkdtemp(), "itin.db")
    return s.get_db(path), path


def test_triage_when_no_intent_and_no_trip():
    conn, _ = fresh_db()
    assert s.derive_persona(conn, "hello there") == "triage"


def test_booking_when_intent_and_no_trip():
    conn, _ = fresh_db()
    assert s.derive_persona(conn, "i want to book a flight to paris") == "booking"


def test_search_returns_deterministic_options():
    conn, _ = fresh_db()
    reply = s.run_agent_turn(conn, _u("find me flights to paris"))
    assert "morning" in reply.lower() and "420" in reply


def test_book_then_trip_support_and_recall():
    conn, path = fresh_db()
    s.run_agent_turn(conn, _u("flights to paris"))
    book = s.run_agent_turn(conn, _u("book the morning one"))
    assert "booked" in book.lower() and "trip support" in book.lower()
    conn2 = s.get_db(path)
    assert s.derive_persona(conn2, "anything") == "trip_support"
    recall = s.run_agent_turn(conn2, _u("what's my itinerary"))
    assert "paris" in recall.lower() and "morning" in recall.lower()


def test_cancel_clears_itinerary():
    conn, path = fresh_db()
    s.run_agent_turn(conn, _u("flights to paris"))
    s.run_agent_turn(conn, _u("book the cheapest"))
    cancel = s.run_agent_turn(conn, _u("cancel my trip"))
    assert "cancel" in cancel.lower()
    assert s.derive_persona(s.get_db(path), "x") == "triage"
