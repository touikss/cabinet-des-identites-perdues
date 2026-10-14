from cabinet.agents import REDACTED, _build_redactor, redact, strip_stage_directions


def _scenario(**overrides):
    scenario = {
        "evenement_secret": "Bataille de Waterloo",
        "epoque_secrete": "1815",
        "noms_interdits": ["Wellington", "Mont-Saint-Jean"],
        "temoin_1": {"identite_secrete": "un tambour anonyme"},
        "temoin_2": {"identite_secrete": "Napoléon Bonaparte"},
        "temoin_3": {"identite_secrete": "ab"},  # trop court : ignoré
    }
    scenario.update(overrides)
    return scenario


def test_redacts_forbidden_and_secret_names_case_insensitively():
    redactor = _build_redactor(_scenario())
    out = redact("Wellington et napoléon bonaparte étaient là en 1815.", redactor)
    assert out == f"{REDACTED} et {REDACTED} étaient là en {REDACTED}."


def test_longest_name_wins_over_substring():
    redactor = _build_redactor(_scenario(noms_interdits=["Napoléon"]))
    assert redact("Napoléon Bonaparte", redactor) == REDACTED


def test_short_names_are_ignored():
    redactor = _build_redactor(_scenario())
    assert redact("ab", redactor) == "ab"


def test_regex_metacharacters_are_escaped():
    redactor = _build_redactor(_scenario(noms_interdits=["M. (Dupont)"]))
    assert redact("Voici M. (Dupont).", redactor) == f"Voici {REDACTED}."


def test_redact_without_redactor_is_identity():
    assert redact("texte", None) == "texte"


def test_strip_asterisk_and_parenthesis_stage_directions():
    assert strip_stage_directions("*baisse les yeux* J'ai vu la fumée (il tousse).") == "J'ai vu la fumée ."


def test_strip_keeps_last_line_only():
    assert strip_stage_directions("Narration\nJ'entendais les canons au loin.") == "J'entendais les canons au loin."


def test_strip_narrative_colon_prefix():
    text = "L'archer hésite, puis lâche d'une voix rauque : le vent portait les cris des blessés."
    assert strip_stage_directions(text) == "le vent portait les cris des blessés."


def test_strip_gesture_prefix_before_dash():
    assert strip_stage_directions("Je détourne le regard - la boue nous montait aux genoux.") == (
        "la boue nous montait aux genoux."
    )
