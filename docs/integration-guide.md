# AZURA AQUA – Configuration & Intégrations

## 1. Azure OpenAI (GPT-4 / GPT-4.1)

### Modèles supportés

- **gpt-4** – GPT-4 standard
- **gpt-4.1** / **o1** – Modèle récent (selon déploiement Azure)
- **gpt-4o** – GPT-4 Optimized
- **gpt-4-turbo** – Version précédente

### Configuration

1. Créer une ressource **Azure OpenAI** dans le portail Azure.
2. Créer un **déploiement** avec le modèle choisi (ex. gpt-4, gpt-4.1).
3. Renseigner `.env` :

```env
AZURE_OPENAI_ENDPOINT=https://VOTRE-RESOURCE.openai.azure.com/
AZURE_OPENAI_API_KEY=clé-api-depuis-portal
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
AZURE_OPENAI_API_VERSION=2024-08-01-preview
```

---

## 2. OneDrive – Excel comme source de données

### Où placer les fichiers Excel

**Option A – OneDrive for Business (recommandé)**  
- Dossier partagé : ex. `/Azura Aqua/`  
- Fichier principal : `REFLEXION.xlsx` (ou nom configuré)  
- Chemin complet : `/Azura Aqua/REFLEXION.xlsx`

**Option B – SharePoint / bibliothèque de documents**  
- Utiliser l’ID du site ou de l’élément de fichier dans la config.

### Configuration Azure AD (Microsoft Graph)

1. **Inscription d’application** Azure AD :
   - Portail Azure → Azure Active Directory → Inscriptions d’applications → Nouvelle inscription
   - Type : Compte unique (tenant uniquement)

2. **Permissions API** :
   - Microsoft Graph → autorisations d’application :
     - `Files.Read.All` ou `Files.ReadWrite.All`
     - Pour OneDrive d’un utilisateur spécifique : `User.Read.All` (optionnel)

3. **Secret client** :
   - Certificats et secrets → Nouveau secret client

4. **Variables `.env`** :

```env
AZURE_AD_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_AD_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_AD_CLIENT_SECRET=votre-secret

# Chemin du fichier dans OneDrive (ex. Azura Aqua/REFLEXION.xlsx)
ONEDRIVE_EXCEL_PATH=REFLEXION.xlsx

# Pour auth app-only : ID utilisateur propriétaire du OneDrive
ONEDRIVE_USER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Synchronisation

- **API** : `POST /api/v1/sync/onedrive`  
  Télécharge l’Excel OneDrive et synchronise la base PostgreSQL.

- **Programmation** : Azure Functions ou tâche planifiée pour exécuter cette sync régulièrement.

### Mode fallback (sans OneDrive)

Pour développer ou tester sans Azure AD, déposez `REFLEXION.xlsx` à la racine du projet. Le sync utilisera ce fichier local. Optionnel : `EXCEL_LOCAL_PATH=./chemin/vers/REFLEXION.xlsx` dans `.env`.

---

## 3. Copilot

### Option A – Copilot intégré (chatbot AZURA AQUA)

Le chatbot existant joue le rôle de Copilot. Il utilise Azure OpenAI et peut être enrichi via RAG (OneDrive, PostgreSQL).

### Option B – Microsoft 365 Copilot

- Nécessite licence **M365 E3/E5 + Copilot**.
- Intégration via **Copilot Studio** ou API Microsoft 365.

### Option C – Power Platform Copilot

- **Copilot Studio** : créer un copilot et l’incorporer dans l’app.
- Variable optionnelle `.env` :

```env
COPILOT_STUDIO_WEB_APP_URL=https://copilotstudio.microsoft.com/...
```

### Option D – IFrame / Widget Copilot

Pour intégrer un copilot externe dans l’app :

```tsx
// components/CopilotEmbed.tsx
<iframe
  src={import.meta.env.VITE_COPILOT_URL}
  title="Copilot"
  style={{ width: '100%', height: '400px' }}
/>
```

---

## 4. Chatbot Copilot (On Your Data)

Pour activer le chatbot avec citations basées sur vos données :

1. **Azure AI Search** : créer un index (ex. `azura-finance-estrans`) indexé sur Excel ou Power BI.
2. **Variables `.env`** :
   ```env
   AZURE_SEARCH_ENDPOINT=https://xxx.search.windows.net
   AZURE_SEARCH_KEY=xxx
   AZURE_SEARCH_INDEX_NAME=azura-finance-estrans
   ```
3. Le chatbot utilise Azure OpenAI + `extra_body.data_sources` pour "On Your Data".
4. **Stub** : si non configuré, réponses simulées avec citations indicatives (REFLEXION.xlsx, etc.).

---

## 5. Flux de données (résumé)

```
OneDrive (REFLEXION.xlsx)
    │
    ├─► POST /api/v1/sync/onedrive  ──► PostgreSQL
    │
    └─► (optionnel) Power BI Refresh ──► Modèle sémantique
                                              │
                                              ▼
PostgreSQL ◄──────────────────────────── FastAPI
    │
    ├─► Commentaires IA (GPT-4)
    ├─► Chatbot (GPT-4)
    └─► Anomalies (IsolationForest)
```

---

## 6. Checklist

- [ ] Ressource Azure OpenAI créée
- [ ] Déploiement GPT-4 / GPT-4.1 créé
- [ ] Variables `AZURE_OPENAI_*` renseignées
- [ ] App Azure AD enregistrée
- [ ] Permissions Graph `Files.Read.All` accordées
- [ ] `REFLEXION.xlsx` déposé dans OneDrive
- [ ] Variables `AZURE_AD_*` et `ONEDRIVE_*` renseignées
- [ ] Test : `POST /api/v1/sync/onedrive`
