# AZURA AQUA

IA Finance / Estran / Achats – Plateforme web.

## Stack

- **Frontend** : React 18 + TypeScript + Vite, React Router, React Query
- **Backend** : FastAPI (Python 3.11), async SQLAlchemy, PostgreSQL, Alembic
- **IA** : scikit-learn (IsolationForest), Azure OpenAI GPT-4-Turbo

## Prérequis

- **Docker** et **Docker Compose**
- **Python 3.11+**
- **Node.js 18+** et npm

---

## Démarrage avec Docker (PostgreSQL)

### 1. Lancer PostgreSQL

```bash
docker compose up -d db
```

La base `azura_aqua` est créée automatiquement. Attendre 5–10 secondes que PostgreSQL démarre. Vérifier : `docker compose ps`

### 2. Config et variables d’environnement

```bash
copy backend\.env.example backend\.env
```

Sur Linux/Mac : `cp backend/.env.example backend/.env`

L’URL par défaut pointe déjà vers le conteneur :  
`postgresql+asyncpg://postgres:postgres@localhost:5432/azura_aqua`

### 3. Installer les dépendances backend

```bash
cd backend
pip install -r requirements.txt
```

Recommandé : utiliser un venv :

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Migrations et seed

```bash
cd backend
alembic upgrade head
python -m scripts.seed_db
```

### 5. Lancer le backend

```bash
cd backend
uvicorn app.main:app --reload
```

→ API : http://localhost:8000  
→ Docs : http://localhost:8000/docs

### 6. Installer les dépendances frontend

Dans un **autre terminal** :

```bash
cd frontend
npm install
npm run dev
```

→ App : http://localhost:5173 (proxy /api vers le backend)

---

## Récapitulatif des commandes

| Étape | Commande |
|-------|----------|
| Démarrer PostgreSQL | `docker compose up -d db` |
| Arrêter PostgreSQL | `docker compose down` |
| Installer dépendances backend | `cd backend && pip install -r requirements.txt` |
| Migrations | `cd backend && alembic upgrade head` |
| Seed données | `cd backend && python -m scripts.seed_db` |
| Backend | `cd backend && uvicorn app.main:app --reload` |
| Installer dépendances frontend | `cd frontend && npm install` |
| Frontend | `cd frontend && npm run dev` |

## Structure

- `backend/` – FastAPI, modèles, services, API
- `frontend/` – React, pages, Chatbot
- `docs/` – database.md, architecture.md, next_steps.md
- `requirements/` – exigences fonctionnelles et sécurité
- `REFLEXION.xlsx` – données exemples (Estran, Finance, TB Achat)
