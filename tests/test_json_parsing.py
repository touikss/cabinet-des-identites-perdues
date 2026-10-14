import json

import pytest

from cabinet.agents import _call_json, _parse_json_response


def test_parse_plain_json():
    assert _parse_json_response('{"a": 1}') == {"a": 1}


def test_parse_fenced_json():
    assert _parse_json_response('```json\n{"a": 1}\n```') == {"a": 1}
    assert _parse_json_response('```\n{"a": 1}\n```') == {"a": 1}


def test_parse_invalid_raises():
    with pytest.raises(json.JSONDecodeError):
        _parse_json_response("pas du json")


class _ScriptedClient:
    """Faux client renvoyant une suite de (texte, stop_reason) prédéfinie."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = 0
        self.messages = self

    def create(self, **_kwargs):
        text, stop = self.replies[self.calls]
        self.calls += 1
        block = type("Block", (), {"type": "text", "text": text})()
        return type("Msg", (), {"content": [block], "stop_reason": stop})()


def test_call_json_retries_after_truncation():
    client = _ScriptedClient([('{"a": ', "max_tokens"), ('{"a": 1}', "end_turn")])
    assert _call_json(client, "m", "s", "u") == {"a": 1}
    assert client.calls == 2


def test_call_json_retries_after_invalid_json():
    client = _ScriptedClient([("oups", "end_turn"), ('{"ok": true}', "end_turn")])
    assert _call_json(client, "m", "s", "u") == {"ok": True}


def test_call_json_gives_up_after_two_attempts():
    client = _ScriptedClient([("{", "max_tokens"), ("{", "max_tokens")])
    with pytest.raises(ValueError, match="non parsable"):
        _call_json(client, "m", "s", "u")
    assert client.calls == 2
