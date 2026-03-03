# Exigences de Sécurité - AZURA AQUA

## Conformité M365
1. **Microsoft Purview DLP**
   - Règles de classification automatique
   - Prévention des fuites de données
   - Chiffrement des données sensibles
   - Alertes sur accès non autorisés

2. **Defender for Cloud Apps**
   - Surveillance des activités
   - Détection d'anomalies
   - Contrôle d'accès adaptatif
   - Protection contre les menaces

3. **Azure AD Security**
   - Multi-Factor Authentication (MFA) obligatoire
   - Conditional Access policies
   - Privileged Identity Management (PIM)
   - Audit logs centralisés

## Classification des Données (CCS)
- **Public**: Données non sensibles
- **Internal**: Données internes entreprise
- **Confidential**: Données financières
- **Secret**: Données stratégiques

## Exigences Techniques
- HTTPS obligatoire (TLS 1.3)
- Tokens JWT avec expiration courte (15 min)
- Refresh tokens sécurisés (httpOnly cookies)
- Rate limiting sur toutes les APIs
- Logs d'audit pour toutes les actions
- Chiffrement at-rest et in-transit
- Pas de données sensibles en localStorage
- Validation et sanitization de toutes les entrées
