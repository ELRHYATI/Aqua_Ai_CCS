# Architecture Technique - Option B (Web Platform)

## Stack Technologique Final

### Frontend
- **React 18 + TypeScript + Vite**
- **Microsoft Fluent UI** (pour cohérence M365)
- **MSAL.js** (Microsoft Authentication Library)
- **Power BI Embedded** (pour rapports interactifs)
- **Azure AD SSO** (Single Sign-On)

### Backend
- **Azure App Service** (Python FastAPI ou Node.js)
- **Azure Functions** (pour traitements async)
- **Azure API Management** (gateway + rate limiting)
- **Azure Key Vault** (secrets management)

### Data Layer
- **Power BI Service** (modèle sémantique centralisé)
- **Azure SQL Database** (métadonnées + résultats AI)
- **Azure Data Lake Gen2** (historique + archives)
- **OneDrive for Business** (source Excel avec DLP)

### AI Services
- **Azure OpenAI** (GPT-4 avec Content Safety)
- **Azure Cognitive Services** (Anomaly Detector API)
- **Azure Machine Learning** (modèles custom + MLOps)

### Security & Compliance
- **Microsoft Purview** (DLP + Data Governance)
- **Microsoft Defender for Cloud Apps**
- **Azure AD Conditional Access**
- **Azure Monitor** (logs + alertes)
- **Azure Sentinel** (SIEM - optionnel)

### DevOps
- **Azure DevOps** ou **GitHub Actions**
- **Azure Pipelines** (CI/CD)
- **Infrastructure as Code** (Bicep ou Terraform)
- **Environments**: Dev, UAT, Production

## Flux de Données Sécurisé

1. **Source**: OneDrive Excel (DLP activé)
   ↓
2. **ETL**: Power BI Service (scheduled refresh)
   ↓
3. **Modèle**: Power BI semantic model (RLS activé)
   ↓
4. **API**: Azure App Service (authentifié Azure AD)
   ↓
5. **AI**: Azure OpenAI + ML (avec Content Safety)
   ↓
6. **Stockage**: Azure SQL + Data Lake (chiffré)
   ↓
7. **Frontend**: React Web App (MSAL auth)
   ↓
8. **Utilisateur**: Browser (MFA + Conditional Access)

## Gouvernance des Accès

### Rôles Applicatifs
- **Admin**: Configuration complète
- **Finance Manager**: Tous les modules + exports
- **Analyst**: Lecture + commentaires
- **Viewer**: Lecture seule

### Contrôles de Sécurité
- Row-Level Security (RLS) dans Power BI par entité
- Object-Level Security (OLS) pour données sensibles
- Audit logging de toutes les actions
- Session timeout après 30 min inactivité
