"""Configuration centralisée : noms des modèles utilisés par chaque agent.

Chaque valeur peut être surchargée par une variable d'environnement (utile pour comparer
des modèles sans modifier le code). Les valeurs par défaut sont celles du jeu d'origine.
"""

import os

ORCHESTRATOR_MODEL = os.environ.get("CABINET_ORCHESTRATOR_MODEL", "claude-sonnet-5")
JUDGE_MODEL = os.environ.get("CABINET_JUDGE_MODEL", "claude-sonnet-5")
WITNESS_MODEL = os.environ.get("CABINET_WITNESS_MODEL", "claude-haiku-4-5")
GREFFIER_MODEL = os.environ.get("CABINET_GREFFIER_MODEL", "claude-haiku-4-5")
