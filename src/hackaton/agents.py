"""Client Anthropic et agents du jeu "Qui suis-je ? Temporel"."""

import json
import random
import re

import anthropic

from hackaton.game_logger import GameLogger
from hackaton.prompts import (
    GREFFIER_SYSTEM_PROMPT,
    GREFFIER_USER_TEMPLATE,
    JUDGE_SYSTEM_PROMPT,
    JUDGE_USER_TEMPLATE,
    ORCHESTRATOR_SYSTEM_PROMPT,
    ORCHESTRATOR_USER_TEMPLATE,
    WITNESS_COUNT,
)

ORCHESTRATOR_MODEL = "claude-sonnet-5"
JUDGE_MODEL = "claude-sonnet-5"
WITNESS_MODEL = "claude-haiku-4-5"
GREFFIER_MODEL = "claude-haiku-4-5"

REDACTED = "[???]"


def _get_client() -> anthropic.Anthropic:
    # Resolves credentials from ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / an
    # `ant auth login` profile - never hardcode a key here.
    return anthropic.Anthropic()


def _extract_text(message: anthropic.types.Message) -> str:
    return "".join(block.text for block in message.content if block.type == "text")


def _parse_json_response(raw_text: str) -> dict:
    text = raw_text.strip()
    text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(text)


def _call_json(client: anthropic.Anthropic, model: str, system: str, user_message: str, max_tokens: int = 8000) -> dict:
    """Appelle le modèle et parse sa réponse en JSON, avec une retentative en cas d'échec ou de troncature."""
    last_error: Exception | str | None = None
    for _ in range(2):
        response = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_message}],
        )
        raw_text = _extract_text(response)
        if response.stop_reason == "max_tokens":
            last_error = "réponse tronquée (max_tokens atteint)"
            continue
        try:
            return _parse_json_response(raw_text)
        except json.JSONDecodeError as exc:
            last_error = exc
    raise ValueError(f"Réponse du modèle non parsable en JSON : {last_error}")


def generate_scenario(
    theme: str, client: anthropic.Anthropic | None = None, logger: GameLogger | None = None
) -> dict:
    """Génère un scénario complet (événement, époque, témoins secrets) pour le thème donné."""
    client = client or _get_client()
    if logger:
        logger.log("joueur_theme", theme=theme)

    # Le slot du personnage important est tiré en Python, pas laissé au LLM : un modèle a
    # naturellement tendance à retomber sur la même position (biais de rang), ce n'est pas
    # un générateur aléatoire fiable.
    slot_impose = f"temoin_{random.randint(1, WITNESS_COUNT)}"
    user_message = ORCHESTRATOR_USER_TEMPLATE.format(theme=theme, slot_impose=slot_impose)
    scenario = _call_json(client, ORCHESTRATOR_MODEL, ORCHESTRATOR_SYSTEM_PROMPT, user_message)
    scenario["personnage_important"] = slot_impose  # sécurité, au cas où le modèle dévierait

    if logger:
        logger.log("orchestrateur", scenario=scenario, slot_impose=slot_impose)
    return scenario


def _build_redactor(scenario: dict) -> re.Pattern | None:
    """Compile un filtre de sécurité redoutant tous les noms propres secrets du scénario,
    en plus de ceux listés par l'Orchestrateur - au cas où un témoin en laisserait échapper un."""
    noms = set(scenario.get("noms_interdits", []))
    noms.add(scenario["evenement_secret"])
    noms.add(scenario["epoque_secrete"])
    for i in range(1, WITNESS_COUNT + 1):
        noms.add(scenario[f"temoin_{i}"]["identite_secrete"])
    noms = {n.strip() for n in noms if n and len(n.strip()) > 2}
    if not noms:
        return None
    pattern = "|".join(re.escape(n) for n in sorted(noms, key=len, reverse=True))
    return re.compile(pattern, re.IGNORECASE)


def redact(text: str, redactor: re.Pattern | None) -> str:
    if redactor is None:
        return text
    return redactor.sub(REDACTED, text)


_STAGE_DIRECTIONS = re.compile(r"\*[^*]+\*|\([^)]*\)")
_GESTURE_VERBS = (
    "détourne|hoche|croise|hausse|secoue|baisse|lève|ferme|ouvre|serre|frotte|passe|essuie|"
    "tourne|incline|redresse|pose|tends|retire|agite|pince|gratte|caresse|frissonne|regarde"
)
_GESTURE_PREFIX = re.compile(rf"^Je\s+(?:{_GESTURE_VERBS})\b[^-]{{0,80}}-\s*", re.IGNORECASE)
_NARRATION_COLON_PREFIX = re.compile(r"^[^:\n]{1,150}:\s+(?=\S)")


def strip_stage_directions(text: str) -> str:
    """Filet de sécurité : retire toute didascalie que le témoin aurait laissée malgré la
    consigne, indépendamment de la fiabilité du modèle - qu'elle soit marquée par des
    astérisques/parenthèses, isolée sur sa propre ligne, ou en préambule avant un tiret."""
    cleaned = _STAGE_DIRECTIONS.sub("", text)
    lines = [line.strip() for line in cleaned.split("\n") if line.strip()]
    cleaned = lines[-1] if lines else ""
    cleaned = _GESTURE_PREFIX.sub("", cleaned)
    sans_prefixe = _NARRATION_COLON_PREFIX.sub("", cleaned)
    if len(sans_prefixe) >= 15:
        cleaned = sans_prefixe
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned).strip()
    return cleaned


def update_carnet(
    carnet_actuel: dict[str, list[str]],
    temoin_index: int,
    reponse: str,
    client: anthropic.Anthropic | None = None,
    logger: GameLogger | None = None,
) -> dict[str, list[str]]:
    """Le Greffier : réécrit le carnet de déduction complet (4 sections : généraux + un par
    témoin), fusionné et synthétisé, en y intégrant la nouvelle réplique (appel synchrone)."""
    client = client or _get_client()

    def _fmt(section: str) -> str:
        items = carnet_actuel.get(section, [])
        return "\n".join(f"- {i}" for i in items) if items else "(vide)"

    user_message = GREFFIER_USER_TEMPLATE.format(
        carnet_generaux=_fmt("generaux"),
        carnet_temoin_1=_fmt("temoin_1"),
        carnet_temoin_2=_fmt("temoin_2"),
        carnet_temoin_3=_fmt("temoin_3"),
        temoin_num=temoin_index + 1,
        reponse=reponse,
    )
    try:
        result = _call_json(client, GREFFIER_MODEL, GREFFIER_SYSTEM_PROMPT, user_message, max_tokens=800)
    except ValueError:
        result = {}
    nouveau_carnet = {
        section: result.get(section, carnet_actuel.get(section, []))
        for section in ("generaux", "temoin_1", "temoin_2", "temoin_3")
    }
    if logger:
        logger.log(
            "greffier",
            carnet_avant=carnet_actuel,
            temoin_index=temoin_index,
            reponse_analysee=reponse,
            carnet_apres=nouveau_carnet,
        )
    return nouveau_carnet


class SharedInterrogation:
    """Gère les 3 témoins avec une mémoire partagée passive : chacun voit tout ce qui s'est
    dit dans l'entretien collectif (ses propres réponses en "assistant", celles des autres
    rapportées en "user"), et peut donc réagir à ce que ses pairs ont déclaré."""

    def __init__(
        self,
        scenario: dict,
        client: anthropic.Anthropic | None = None,
        logger: GameLogger | None = None,
    ):
        self.scenario = scenario
        self.client = client or _get_client()
        self.logger = logger
        self.redactor = _build_redactor(scenario)
        self.temoins = [scenario[f"temoin_{i}"] for i in range(1, WITNESS_COUNT + 1)]
        # Journal partagé (sert aussi de fil de discussion unique pour l'UI) :
        # liste de {"locuteur": "Joueur" | "Narration" | index_temoin (int), "texte": str}
        self.log: list[dict] = []
        self.carnet: dict[str, list[str]] = {
            "generaux": [],
            "temoin_1": [],
            "temoin_2": [],
            "temoin_3": [],
        }
    def _build_messages_for(self, perspective_index: int, trailing: str) -> list[dict]:
        messages = []
        for entry in self.log:
            if entry["locuteur"] == "Joueur":
                messages.append({"role": "user", "content": f"Le joueur demande : {entry['texte']}"})
            elif entry["locuteur"] == "Narration":
                messages.append({"role": "user", "content": entry["texte"]})
            elif entry["locuteur"] == perspective_index:
                messages.append({"role": "assistant", "content": entry["texte"]})
            else:
                autre = self.temoins[entry["locuteur"]]["surnom_public"]
                messages.append({"role": "user", "content": f"{autre} a déclaré : {entry['texte']}"})
        messages.append({"role": "user", "content": trailing})
        return messages

    def _call_witness(self, witness_index: int, messages: list[dict]) -> tuple[str, str]:
        """Appelle le modèle pour ce témoin, renvoie (réponse brute, réponse nettoyée+rédigée)."""
        temoin = self.temoins[witness_index]
        system = temoin["prompt_systeme"]
        response = self.client.messages.create(
            model=WITNESS_MODEL,
            max_tokens=100,
            system=system,
            messages=messages,
        )
        raw_reply = _extract_text(response)
        sans_didascalies = strip_stage_directions(raw_reply)
        reply = redact(sans_didascalies, self.redactor)
        if self.logger:
            self.logger.log(
                "temoin_appel",
                temoin_index=witness_index,
                temoin_surnom=temoin["surnom_public"],
                reponse_brute=raw_reply,
                reponse_affichee=reply,
                didascalies_supprimees=raw_reply != sans_didascalies,
                fuite_redigee=sans_didascalies != reply,
            )
        return raw_reply, reply

    def _is_silence(self, reply: str) -> bool:
        return len(reply) < 6 or reply.strip().strip(".!").upper() == "RIEN"

    def _maybe_react(self, reactor_index: int) -> str | None:
        """Donne l'occasion à `reactor_index` de réagir spontanément au dernier échange.
        Renvoie None si le témoin n'a rien à ajouter (mot-clé RIEN, filtré)."""
        trailing = (
            "Réagis en une seule phrase très courte UNIQUEMENT si ce qui vient d'être dit "
            "touche vraiment ce que TOI as vu ou vécu personnellement. Si tu n'as rien à "
            "ajouter, réponds strictement par le seul mot : RIEN."
        )
        messages = self._build_messages_for(reactor_index, trailing)
        _, reply = self._call_witness(reactor_index, messages)
        if self._is_silence(reply):
            if self.logger:
                self.logger.log("reaction_spontanee", temoin_index=reactor_index, affichee=False)
            return None
        if self.logger:
            self.logger.log(
                "reaction_spontanee", temoin_index=reactor_index, affichee=True, reponse=reply
            )
        return reply

    def ouverture(self):
        """Scène d'ouverture : les 3 témoins échangent brièvement avant que le joueur
        n'interroge qui que ce soit. Générateur : cède (locuteur, texte) dès que chaque
        réplique est produite, pour un affichage progressif sans attendre la suite."""
        amorce = self.scenario.get(
            "amorce_collective", "Vous voilà réunis, dans l'attente d'être interrogés."
        )
        self.log.append({"locuteur": "Narration", "texte": amorce})
        yield "Narration", amorce
        for i in range(WITNESS_COUNT):
            trailing = (
                "Réagis en une phrase courte à la situation, ou à ce qu'un camarade vient de "
                "dire, comme si tu prenais spontanément la parole."
            )
            messages = self._build_messages_for(i, trailing)
            _, reply = self._call_witness(i, messages)
            self.log.append({"locuteur": i, "texte": reply})
            yield i, reply
            self.carnet = update_carnet(self.carnet, i, reply, client=self.client, logger=self.logger)

    def ask(self, witness_index: int, question: str):
        """Pose une question au témoin `witness_index`, laisse les 2 autres réagir
        spontanément s'ils le souhaitent. Générateur : cède (temoin_index, texte) dès que
        chaque réplique est produite (réponse principale d'abord, puis réactions), pour un
        affichage progressif sans attendre que tous les agents aient répondu."""
        if self.logger:
            self.logger.log(
                "joueur_question",
                temoin_index=witness_index,
                temoin_surnom=self.temoins[witness_index]["surnom_public"],
                question=question,
            )
        messages = self._build_messages_for(witness_index, f"Le joueur demande : {question}")
        _, reply = self._call_witness(witness_index, messages)

        self.log.append({"locuteur": "Joueur", "texte": question})
        self.log.append({"locuteur": witness_index, "texte": reply})
        yield witness_index, reply

        self.carnet = update_carnet(
            self.carnet, witness_index, reply, client=self.client, logger=self.logger
        )

        for other_index in range(WITNESS_COUNT):
            if other_index == witness_index:
                continue
            reaction = self._maybe_react(other_index)
            if reaction:
                self.log.append({"locuteur": other_index, "texte": reaction})
                yield other_index, reaction
                self.carnet = update_carnet(
                    self.carnet, other_index, reaction, client=self.client, logger=self.logger
                )


def _points_evenement(evenement_correct: bool) -> int:
    return 40 if evenement_correct else 0


def _points_date(annees_ecart: int) -> int:
    ecart = abs(annees_ecart)
    if ecart == 0:
        return 20
    if ecart <= 10:
        return 15
    if ecart <= 50:
        return 10
    if ecart <= 100:
        return 5
    if ecart <= 200:
        return 3
    return 0


def _points_personnage(personnage_correct: bool, temoin_associe_correct: bool) -> int:
    return (10 if personnage_correct else 0) + (5 if temoin_associe_correct else 0)


def _points_questions(nb_questions: int) -> int:
    if nb_questions <= 6:
        return 25
    return max(0, 25 - 2 * (nb_questions - 6))


def judge_final(
    scenario: dict,
    guesses: dict,
    nb_questions: int,
    client: anthropic.Anthropic | None = None,
    logger: GameLogger | None = None,
) -> dict:
    """Compare les déductions du joueur (événement, époque, personnage important, témoin
    associé) à la vérité du scénario, et calcule le score selon un barème fixe (100 pts) :
    événement 40, époque 20 (dégressif selon l'écart en années), personnage 10 + témoin 5,
    nombre de questions 25 (dégressif au-delà de 6). Le témoin associé est vérifié directement
    en Python (comparaison fiable) ; le Juge (LLM) évalue événement/époque/personnage."""
    client = client or _get_client()
    if logger:
        logger.log("joueur_formulaire", guesses=guesses, nb_questions=nb_questions)

    personnage_reel = scenario[scenario["personnage_important"]]["identite_secrete"]
    temoin_reel_index = int(scenario["personnage_important"].split("_")[1])
    temoin_associe_correct = guesses.get("temoin_associe") == temoin_reel_index

    user_message = JUDGE_USER_TEMPLATE.format(
        evenement_secret=scenario["evenement_secret"],
        epoque_secrete=scenario["epoque_secrete"],
        personnage_reel=personnage_reel,
        evenement_joueur=guesses["evenement"],
        epoque_joueur=guesses["epoque"],
        personnage_joueur=guesses["personnage"],
    )
    verdict = _call_json(client, JUDGE_MODEL, JUDGE_SYSTEM_PROMPT, user_message)

    points_evenement = _points_evenement(verdict.get("evenement_correct", False))
    points_date = _points_date(verdict.get("annees_ecart", 9999))
    points_personnage = _points_personnage(verdict.get("personnage_correct", False), temoin_associe_correct)
    points_questions = _points_questions(nb_questions)

    verdict["temoin_associe_correct"] = temoin_associe_correct
    verdict["temoin_reel_index"] = temoin_reel_index
    verdict["points"] = {
        "evenement": points_evenement,
        "date": points_date,
        "personnage": points_personnage,
        "questions": points_questions,
    }
    verdict["score"] = points_evenement + points_date + points_personnage + points_questions
    verdict["verdict_correct"] = (
        verdict.get("evenement_correct", False)
        and points_date == 20
        and verdict.get("personnage_correct", False)
        and temoin_associe_correct
    )

    if logger:
        logger.log("juge", verdict=verdict)
    return verdict
