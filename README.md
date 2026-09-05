# Le cabinet des identités perdues

Jeu de déduction historique joué en langage naturel contre un système multi-agents.
Voir `RAPPORT.txt` (ou `RAPPORT.pdf`) pour la présentation complète du projet et de son
architecture.

## Lancer l'application

Prérequis : Python 3.13+, l'outil [`uv`](https://docs.astral.sh/uv/), et une clé API
Anthropic valide.

```bash
export ANTHROPIC_API_KEY="votre-clé-api"
uv run uvicorn hackaton.server:app --reload
```

Puis ouvrir http://localhost:8000/. "uv run" installe les dépendances tout seul au premier
lancement. La clé peut aussi venir d'`ANTHROPIC_AUTH_TOKEN` ou d'un profil déjà configuré sur
la machine.
