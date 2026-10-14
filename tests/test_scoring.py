import pytest

from cabinet.agents import _points_date, _points_evenement, _points_personnage, _points_questions, judge_final


@pytest.mark.parametrize(
    ("ecart", "attendu"),
    [(0, 20), (1, 15), (-10, 15), (11, 10), (50, 10), (51, 5), (100, 5), (101, 3), (200, 3), (201, 0), (9999, 0)],
)
def test_points_date_paliers(ecart, attendu):
    assert _points_date(ecart) == attendu


def test_points_evenement():
    assert _points_evenement(True) == 40
    assert _points_evenement(False) == 0


@pytest.mark.parametrize(
    ("personnage", "temoin", "attendu"), [(True, True, 15), (True, False, 10), (False, True, 5), (False, False, 0)]
)
def test_points_personnage(personnage, temoin, attendu):
    assert _points_personnage(personnage, temoin) == attendu


@pytest.mark.parametrize(("nb", "attendu"), [(0, 25), (6, 25), (7, 23), (12, 13), (18, 1), (19, 0), (40, 0)])
def test_points_questions(nb, attendu):
    assert _points_questions(nb) == attendu


class _FakeClient:
    """Faux client Anthropic : renvoie un verdict JSON fixe, sans aucun appel réseau."""

    def __init__(self, text):
        self.calls = 0
        self.messages = self
        self._text = text

    def create(self, **_kwargs):
        self.calls += 1
        block = type("Block", (), {"type": "text", "text": self._text})()
        return type("Msg", (), {"content": [block], "stop_reason": "end_turn"})()


SCENARIO = {
    "evenement_secret": "Bataille de Waterloo",
    "epoque_secrete": "1815",
    "personnage_important": "temoin_2",
    "temoin_2": {"identite_secrete": "Napoléon"},
}


def test_judge_final_max_score_is_100():
    client = _FakeClient('{"evenement_correct": true, "annees_ecart": 0, "personnage_correct": true}')
    guesses = {"evenement": "Waterloo", "epoque": "1815", "personnage": "Napoléon", "temoin_associe": 2}
    verdict = judge_final(SCENARIO, guesses, nb_questions=6, client=client)
    assert verdict["score"] == 100
    assert verdict["verdict_correct"] is True
    assert verdict["temoin_reel_index"] == 2


def test_judge_final_wrong_witness_and_missing_fields():
    client = _FakeClient("{}")
    guesses = {"evenement": "?", "epoque": "?", "personnage": "?", "temoin_associe": 1}
    verdict = judge_final(SCENARIO, guesses, nb_questions=8, client=client)
    assert verdict["points"] == {"evenement": 0, "date": 0, "personnage": 0, "questions": 21}
    assert verdict["score"] == 21
    assert verdict["verdict_correct"] is False
