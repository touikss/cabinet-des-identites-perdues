"""Enregistrement des événements d'une partie (entrées joueur + sorties des agents IA)."""

import json
import pathlib
import time
import uuid


class GameLogger:
    """Écrit chaque événement d'une partie dans un fichier JSONL dédié (un fichier par partie)."""

    def __init__(self, log_dir: str = "logs"):
        directory = pathlib.Path(log_dir)
        directory.mkdir(parents=True, exist_ok=True)
        session_id = f"{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
        self.session_id = session_id
        self.path = directory / f"partie_{session_id}.jsonl"

    def log(self, event: str, **data) -> None:
        entry = {"timestamp": time.time(), "event": event, **data}
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
