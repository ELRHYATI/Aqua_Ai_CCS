# AZURA AQUA - Database Schema

This document describes the PostgreSQL schema for AZURA AQUA, derived from REFLEXION.xlsx.

## Source Mapping

| Table | REFLEXION.xlsx Sheet | Description |
|-------|---------------------|-------------|
| `estran_records` | BD ESTRA | Estran production records (parc, ligne, dates, quantités, biomasse, statut) |
| `finance_lines` | RESULTAT MODELE | Financial result model (CODE, GR, label, YTD, N-1, Budget, FY, variance) |
| `purchase_da` | TB ACHAT (DA EN COURS) | Demandes d'Achat en cours |
| `purchase_bc` | TB ACHAT (BC NON LIVRES) | Bons de Commande non livrés |
| `dim_period` | — | Dimension: year, month for reporting |
| `dim_entity` | — | Dimension: entity/site (optional) |

---

## Tables

### estran_records

**Source:** BD ESTRA sheet  
**Purpose:** Estran (mussel/oyster) production tracking per parc and ligne.

| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL | Primary key |
| parc_semi | VARCHAR(50) | N° Parc de semi |
| parc_an | VARCHAR(50) | N PARC AN |
| generation_semi | VARCHAR(50) | Génération de semi |
| ligne_num | INTEGER | N° Ligne |
| ett | VARCHAR(50) | ETT |
| phase | VARCHAR(50) | Phase |
| origine | VARCHAR(50) | Origine |
| type_semi | VARCHAR(50) | Type du semi (Manuel, etc.) |
| longueur_ligne | NUMERIC | Longueur ligne (m) |
| nb_ligne_semee_200m | NUMERIC | Nombre de lignes semées (200m) |
| zone | VARCHAR(50) | Zone |
| date_semis | DATE | Date semis |
| date_recolte | DATE | Date récolte |
| effectif_seme | NUMERIC | Effectif semé |
| quantite_semee_kg | NUMERIC | Quantité semée (Kg) |
| quantite_brute_recoltee_kg | NUMERIC | Quantité brute récoltée (Kg) |
| quantite_casse_kg | NUMERIC | Quantité de casse (Kg) |
| biomasse_gr | NUMERIC | Biomasse GR |
| biomasse_vendable_kg | NUMERIC | Biomasse vendable (Kg) |
| statut | VARCHAR(50) | Statut (Non prêt, Prêt, etc.) |
| etat_recolte | VARCHAR(50) | État de la récolte |
| pct_recolte | NUMERIC | % de récolte |
| year | INTEGER | Year |
| month | INTEGER | Month |
| created_at | TIMESTAMPTZ | Audit |
| updated_at | TIMESTAMPTZ | Audit |

---

### finance_lines

**Source:** RESULTAT MODELE sheet  
**Purpose:** Financial result lines with YTD, Budget, N-1, variances.

| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL | Primary key |
| code | VARCHAR(50) | CODE (e.g. P1110) |
| ordre | INTEGER | O (order) |
| gr | VARCHAR(20) | GR (group, e.g. AC) |
| label | VARCHAR(255) | Period YTD label (e.g. Production vendue) |
| ytd | NUMERIC | YTD value |
| n1 | NUMERIC | N-1 value |
| budget | NUMERIC | Budget (B) |
| real | NUMERIC | Réalisé (R) |
| fy | NUMERIC | F FY |
| var_b_r | NUMERIC | VAR B/R (variance Budget vs Realisé) |
| var_pct | NUMERIC | % variance |
| var_r_n1 | NUMERIC | VAR R/N-1 |
| year | INTEGER | Year |
| month | INTEGER | Month |
| period_id | BIGINT | FK to dim_period (optional) |
| created_at | TIMESTAMPTZ | Audit |
| updated_at | TIMESTAMPTZ | Audit |

---

### purchase_da

**Source:** TB ACHAT (DA EN COURS)  
**Purpose:** Demandes d'Achat en cours (DA in progress).

| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL | Primary key |
| reference | VARCHAR(100) | DA reference |
| amount | NUMERIC | Montant |
| delay_days | INTEGER | Nombre de jours de retard |
| status | VARCHAR(50) | Statut |
| critical_flag | BOOLEAN | Flag critique |
| entity_id | BIGINT | FK to dim_entity (optional) |
| created_at | TIMESTAMPTZ | Audit |
| updated_at | TIMESTAMPTZ | Audit |

---

### purchase_bc

**Source:** TB ACHAT (BC NON LIVRES)  
**Purpose:** Bons de Commande non livrés (BC not delivered).

| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL | Primary key |
| reference | VARCHAR(100) | BC reference |
| amount | NUMERIC | Montant |
| delay_days | INTEGER | Nombre de jours de retard |
| status | VARCHAR(50) | Statut |
| critical_flag | BOOLEAN | Flag critique |
| expected_delivery_date | DATE | Date livraison prévue |
| entity_id | BIGINT | FK to dim_entity (optional) |
| created_at | TIMESTAMPTZ | Audit |
| updated_at | TIMESTAMPTZ | Audit |

---

### dim_period

**Purpose:** Reporting dimension for year/month.

| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL | Primary key |
| year | INTEGER | Année |
| month | INTEGER | Mois (1–12) |
| label | VARCHAR(50) | e.g. "2025-12" |

---

### dim_entity

**Purpose:** Entity/site dimension (optional).

| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL | Primary key |
| code | VARCHAR(50) | Code entité |
| name | VARCHAR(255) | Nom |
| active | BOOLEAN | Actif |

---

## Relationships

- `finance_lines.period_id` → `dim_period.id`
- `purchase_da.entity_id` → `dim_entity.id`
- `purchase_bc.entity_id` → `dim_entity.id`

## Indexes

- `estran_records`: idx on (parc_semi, year, month), idx on statut
- `finance_lines`: idx on (code, year, month), idx on gr
- `purchase_da`: idx on status, idx on critical_flag
- `purchase_bc`: idx on status, idx on critical_flag, idx on expected_delivery_date
