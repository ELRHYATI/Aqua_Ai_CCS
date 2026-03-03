# AZURA AQUA - Prochaines étapes (production)

Ce document liste ce qui reste à faire pour une version production.

---

## 1. Règles métier à valider

- **Sévérité des anomalies** : seuils actuellement codés en dur (score IsolationForest > 0.6 = high, > 0.4 = medium). À ajuster avec la direction / exploitation.
- **KPI DA/BC** : formule de risk_score à valider (poids du retard, du montant, du flag critique). Seuils d’alerte (rouge / orange / vert) à définir.
- **Liste finale des KPI** : quels indicateurs exactement pour le dashboard Achats ?

---

## 2. Source de données

- ** choix à faire** : alimenter l’app à partir de :
  - **Power BI** (modèle sémantique, OneDrive Excel comme source) ;
  - **PostgreSQL / Azure SQL** en direct (ETL depuis Excel ou Power BI vers la base).
- Implémentation de l’intégration Power BI (API REST / Embedded) si choix Power BI.
- ETL pérenne : rafraîchissement planifié, provenance des données (OneDrive, Data Lake, etc.).

---

## 3. Azure OpenAI

- **Abonnement et ressource** : créer une ressource Azure OpenAI et un déploiement GPT-4-Turbo (ou dernier GPT-4 disponible).
- **Variables d’environnement** : renseigner en production :
  - `AZURE_OPENAI_ENDPOINT`
  - `AZURE_OPENAI_API_KEY`
  - `AZURE_OPENAI_DEPLOYMENT_NAME`
- **Sécurité** : stocker les clés dans Azure Key Vault ; ne jamais les exposer côté client.
- **Content Safety** : activer et configurer selon la politique de l’entreprise.
- **RAG** : décider entre :
  - **Azure OpenAI « On Your Data »** (données Power BI ou autre source) ;
  - **RAG custom** (PostgreSQL, embeddings, retrieval) + appel Chat Completions.

---

## 4. Sécurité et conformité

Cf. `requirements/security-requirements.md` :

- **Azure AD** : MSAL.js pour l’authentification SSO.
- **MFA** : Multi-Factor Authentication obligatoire.
- **Conditional Access** : politiques d’accès selon appareil / réseau.
- **Purview DLP** : règles de classification et prévention des fuites.
- **Defender for Cloud Apps** : surveillance et détection d’anomalies.
- **Audit** : logs de toutes les actions sensibles.
- **Tokens** : JWT avec expiration courte (ex. 15 min), refresh tokens sécurisés (httpOnly).

---

## 5. Infrastructure

- **Hébergement backend** : Azure App Service (FastAPI) ou Azure Functions.
- **Base de données** : Azure SQL Database ou PostgreSQL managé.
- **API Management** : rate limiting, throttling, authentification API.
- **CI/CD** : Azure DevOps ou GitHub Actions pour build et déploiement.

---

## 6. Frontend

- **Fluent UI** : remplacer le thème actuel par Microsoft Fluent UI pour cohérence M365 (optionnel selon décision).
- **Power BI Embedded** : intégrer les rapports Power BI dans les pages.
- **Gestion des erreurs** : messages utilisateur homogènes, retry, feedback visuel.
