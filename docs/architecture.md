# AZURA AQUA - Architecture

## Stack technique

| Couche | Technologies |
|--------|--------------|
| **Frontend** | React 18, TypeScript, Vite, React Router, React Query |
| **Backend** | FastAPI (Python 3.11), async SQLAlchemy 2.x, Pydantic |
| **Base de données** | PostgreSQL (asyncpg) |
| **Migrations** | Alembic |
| **IA / ML** | scikit-learn (IsolationForest), Azure OpenAI GPT-4-Turbo |
| **Sécurité** | (à venir) MSAL.js, Azure AD SSO, Purview DLP, Defender for Cloud Apps |

## Tables DB et correspondance REFLEXION.xlsx

| Table | Feuille Excel | Description |
|-------|---------------|-------------|
| `estran_records` | BD ESTRA | Parc, ligne, dates, effectifs, biomasse, statut |
| `finance_lines` | RESULTAT MODELE | CODE, GR, label, YTD, N-1, Budget, Réalisé, variances |
| `purchase_da` | TB ACHAT (DA EN COURS) | Demandes d'Achat en cours |
| `purchase_bc` | TB ACHAT (BC NON LIVRES) | Bons de Commande non livrés |
| `dim_period` | — | Dimension année / mois |
| `dim_entity` | — | Dimension entité / site |

Voir `docs/database.md` pour le détail des colonnes.

## Services backend

| Service | Rôle |
|---------|------|
| `anomaly_service` | Détection d'anomalies sur estran_records (IsolationForest + fallback z-score) |
| `commentary_service` | Génération de commentaires IA sur écarts financiers (Azure OpenAI) |
| `copilot_service` | **Copilot-like chatbot** : Azure OpenAI On Your Data + Azure AI Search indexé sur Excel/Power BI. Réponses avec citations complètes et RAG. |
| `kpi_service` | Calcul du risk_score pour DA/BC (retard, montant, flag critique) |

## Flux de données

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│  React SPA  │────▶│   FastAPI   │────▶│  PostgreSQL  │
│  (Vite)     │◀────│   Backend   │◀────│              │
└─────────────┘     └──────┬──────┘     └──────────────┘
                          │
                          ├──▶ Azure OpenAI (commentaire, chat)
                          └──▶ scikit-learn (anomalies)
```

## Modèles utilisés

- **Estran anomalies** : IsolationForest sur colonnes numériques (biomasse, effectifs, quantités). Fallback z-score.
- **DA/BC KPI** : Score de risque = f(retard_jours, montant, flag_critique).
- **Commentaire & Chat** : GPT-4-Turbo (Azure OpenAI). Pour l’instant : stubs ; brancher les clés API pour l’appel réel.

## Sécurité et production

Cf. `requirements/architecture-web-platform.md`, `requirements/security-requirements.md` et `docs/next_steps.md` pour les exigences (Purview, Defender, Azure AD, MFA, etc.).
