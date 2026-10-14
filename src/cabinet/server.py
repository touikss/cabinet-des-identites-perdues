"""Backend FastAPI du jeu "Qui suis-je ? Temporel" - sert l'API JSON et le frontend statique."""

import json
import random
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from cabinet.agents import SharedInterrogation, generate_scenario, judge_final
from cabinet.game_logger import GameLogger

app = FastAPI(title="Qui suis-je ? Temporel")

# Sessions en mémoire : session_id -> {"scenario": dict, "interrogation": SharedInterrogation, "logger": GameLogger}
SESSIONS: dict[str, dict] = {}


def _nb_questions(interrogation: SharedInterrogation) -> int:
    return sum(1 for entry in interrogation.log if entry["locuteur"] == "Joueur")


def _get_session(session_id: str) -> dict:
    session = SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Partie introuvable (le serveur a peut-être redémarré).")
    return session


def _tags_temoins(interrogation: SharedInterrogation) -> list[str]:
    return [t.get("tag_public", "") for t in interrogation.temoins]


def _serialize_log(log: list[dict]) -> list[dict]:
    return [{"locuteur": entry["locuteur"], "texte": entry["texte"]} for entry in log]


def _state_payload(session: dict) -> dict:
    interrogation: SharedInterrogation = session["interrogation"]
    return {
        "log": _serialize_log(interrogation.log),
        "carnet": interrogation.carnet,
        "tags_temoins": _tags_temoins(interrogation),
        "nb_questions": _nb_questions(interrogation),
        "contexte_ambiance": session["scenario"]["contexte_ambiance"],
        "numero_dossier": session["numero_dossier"],
        "numero_dossier_suffixe": session["numero_dossier_suffixe"],
    }


class NouvellePartie(BaseModel):
    theme: str = ""


class Question(BaseModel):
    witness_index: int
    question: str


class Guesses(BaseModel):
    evenement: str
    epoque: str
    personnage: str
    temoin_associe: int


def _ndjson(lines) -> StreamingResponse:
    def generer():
        for obj in lines:
            yield json.dumps(obj, ensure_ascii=False) + "\n"

    return StreamingResponse(generer(), media_type="application/x-ndjson")


def _fin_payload(interrogation: SharedInterrogation) -> dict:
    return {"type": "fin", "carnet": interrogation.carnet, "nb_questions": _nb_questions(interrogation)}


@app.post("/api/parties")
def creer_partie(payload: NouvellePartie) -> dict:
    logger = GameLogger()
    theme = payload.theme.strip() or "un événement historique marquant, au choix"
    scenario = generate_scenario(theme, logger=logger)
    interrogation = SharedInterrogation(scenario, logger=logger)

    session_id = uuid.uuid4().hex
    SESSIONS[session_id] = {
        "scenario": scenario,
        "interrogation": interrogation,
        "logger": logger,
        "numero_dossier": random.randint(1000, 1999),
        "numero_dossier_suffixe": random.randint(1, 99),
        "ouverture_faite": False,
    }

    session = SESSIONS[session_id]
    return {"session_id": session_id, **_state_payload(session)}


@app.get("/api/parties/{session_id}")
def etat_partie(session_id: str) -> dict:
    session = _get_session(session_id)
    return _state_payload(session)


@app.get("/api/parties/{session_id}/ouverture")
def flux_ouverture(session_id: str) -> StreamingResponse:
    session = _get_session(session_id)
    interrogation: SharedInterrogation = session["interrogation"]

    if session["ouverture_faite"]:
        # Rejeu instantané (ex: appel en double) à partir du log déjà généré.
        def rejouer():
            for entry in interrogation.log:
                yield {"type": "reply", "locuteur": entry["locuteur"], "texte": entry["texte"]}
            yield _fin_payload(interrogation)

        return _ndjson(rejouer())

    session["ouverture_faite"] = True

    def generer():
        for locuteur, texte in interrogation.ouverture():
            yield {"type": "reply", "locuteur": locuteur, "texte": texte}
        yield _fin_payload(interrogation)

    return _ndjson(generer())


@app.post("/api/parties/{session_id}/questions")
def poser_question(session_id: str, payload: Question) -> StreamingResponse:
    session = _get_session(session_id)
    interrogation: SharedInterrogation = session["interrogation"]
    if not (0 <= payload.witness_index < len(interrogation.temoins)):
        raise HTTPException(status_code=400, detail="Témoin invalide.")

    def generer():
        for locuteur, texte in interrogation.ask(payload.witness_index, payload.question):
            yield {"type": "reply", "locuteur": locuteur, "texte": texte}
        yield _fin_payload(interrogation)

    return _ndjson(generer())


@app.post("/api/parties/{session_id}/verdict")
def rendre_verdict(session_id: str, payload: Guesses) -> dict:
    session = _get_session(session_id)
    interrogation: SharedInterrogation = session["interrogation"]
    scenario = session["scenario"]

    verdict = judge_final(
        scenario,
        {
            "evenement": payload.evenement,
            "epoque": payload.epoque,
            "personnage": payload.personnage,
            "temoin_associe": payload.temoin_associe,
        },
        nb_questions=_nb_questions(interrogation),
        logger=session["logger"],
    )
    index_important = int(scenario["personnage_important"].split("_")[1]) - 1
    verdict["identites"] = [
        {
            "surnom_public": scenario[f"temoin_{i}"]["surnom_public"],
            "tag_public": scenario[f"temoin_{i}"]["tag_public"],
            "identite_secrete": scenario[f"temoin_{i}"]["identite_secrete"],
            "est_personnage_important": (i - 1) == index_important,
        }
        for i in (1, 2, 3)
    ]
    verdict["evenement_reel"] = scenario["evenement_secret"]
    verdict["epoque_reelle"] = scenario["epoque_secrete"]
    return verdict


class NoCacheStaticFiles(StaticFiles):
    """Désactive le cache navigateur sur les fichiers statiques - évite qu'un ancien app.js/
    style.css mis en cache reste servi après une modification pendant le développement."""

    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return response


STATIC_DIR = Path(__file__).parent / "static"
app.mount("/", NoCacheStaticFiles(directory=STATIC_DIR, html=True), name="static")
