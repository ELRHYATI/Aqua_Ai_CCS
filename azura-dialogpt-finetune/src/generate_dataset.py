"""
Generate 1000 AZURA AQUA training conversations for DialoGPT fine-tuning.
Covers: Estran, Finance, Achats modules + configuration + anomalies + KPIs.
Output: data/azura_conversations.csv + data/azura_conversations.jsonl
"""

import csv
import json
import random
import os
from pathlib import Path

random.seed(42)

# ─── Building blocks ───

MODULES = ["Estran", "Finance", "Achats"]

ESTRAN_PARCS = ["P2", "P3", "P4", "P5", "P6", "P7", "P8", "P2-2", "P2-3", "P2-4", "P7-ext"]
ESTRAN_ZONES = ["Sud", "Est", "Ouest", "Sud 1", "Nord"]
ESTRAN_PHASES = ["grossissement", "Prégro", "Échantillonnage"]
ESTRAN_RECOLTES = ["Échantillonnage", "Transfert", "Récolte commerciale", "Retour commercial"]
ESTRAN_FILETS = ["avec filet", "9mm", "4mm", "Filet réutilisé"]

FINANCE_CODES = ["CA", "MP", "MOD", "FG", "EBITDA", "AMORT", "RN", "CF", "CAPEX"]
FINANCE_LABELS = [
    "Chiffre d'affaires", "Matières premières", "Main d'oeuvre directe",
    "Frais généraux", "EBITDA", "Amortissements", "Résultat net",
    "Cash flow", "Investissements"
]

ACHAT_STATUTS_DA = [
    "Commande d'achat créée", "Aucun document lié",
    "DA en attente d'approbation", "Consultation en cours", "DA traité"
]
ACHAT_STATUTS_CDE = [
    "Document lié créé", "Envoyé", "Confirmation reçue",
    "En cours d'approbation", "En révision", "En cours de préparation"
]
ACHAT_CATEGORIES = [
    "PLOMBERIE", "STRUCTURE MÉTALLIQUE", "ELECTRICITÉ", "PRESTATION",
    "CARBURANTS", "ÉQUIPEMENT LABORATOIRE", "MATÉRIEL D'USURE",
    "CO2 INTRANT", "ENGRAIS SOLIDE", "INFORMATIQUE"
]
ACHAT_FOURNISSEURS = [
    "CACED SARL", "AGATRAVE", "AIR LIQUIDE MAROC", "AGRIROUES MAROC",
    "ENTERPRISE BOUKRATE", "ACRAPLAST", "AGUACONCEPT", "AGA IKHWAN"
]
ACHAT_DEMANDEURS = [
    "SAID BOUKHLIK", "MAROUANE AITTOUGHA", "RIDA AYYI",
    "MAMOUN OUDGHIRI", "SOUFIANE ELKAFRAOUI", "MOHAMED TAOUFIQ"
]

ANOMALY_TYPES = ["Isolation Forest", "LOF", "One-Class SVM", "Z-Score"]
SEVERITY = ["Critique", "Majeure", "Mineure"]

SENSITIVE_FIELDS = [
    "prix", "marge", "CA_client", "salaires", "fournisseur", "aucun",
    "coût unitaire", "remise", "conditions paiement"
]
ACCESS_ROLES = [
    "tous", "admin", "responsable achat", "manager", "contrôleur de gestion",
    "directeur", "chef de production", "responsable qualité"
]


def r_pct():
    return f"{random.uniform(-30, 30):.1f}%"

def r_val():
    return f"{random.randint(100, 500000):,}".replace(",", " ")

def r_date():
    m = random.randint(1, 12)
    y = random.choice([2024, 2025, 2026])
    return f"{m:02d}/{y}"

def r_biomasse():
    return f"{random.randint(200, 2000)} kg"

def r_taux():
    return f"{random.uniform(20, 90):.1f}%"


# ─── Conversation templates ───

def gen_estran_conversations():
    convs = []

    for _ in range(120):
        parc = random.choice(ESTRAN_PARCS)
        zone = random.choice(ESTRAN_ZONES)
        convs.append((
            f"Quelles sont les données du parc {parc} ?",
            f"Le parc {parc} est situé en zone {zone}. Phase : {random.choice(ESTRAN_PHASES)}. "
            f"Biomasse récoltée : {r_biomasse()}. Taux de recapture : {r_taux()}."
        ))

    for _ in range(80):
        parc = random.choice(ESTRAN_PARCS)
        convs.append((
            f"Quel est le taux de recapture du parc {parc} ?",
            f"Le taux de recapture moyen du parc {parc} est de {r_taux()} "
            f"pour les opérations d'{random.choice(['Échantillonnage', 'Transfert'])}."
        ))

    for _ in range(60):
        obj = random.choice(ESTRAN_RECOLTES)
        convs.append((
            f"Montre les données de type {obj}",
            f"Pour le type « {obj} », il y a {random.randint(5, 50)} lignes. "
            f"Taux de recapture moyen : {r_taux()}. Biomasse totale : {r_biomasse()}."
        ))

    for _ in range(40):
        convs.append((
            "Compare Primaire et Hors calibre",
            f"Primaire : {random.randint(10, 40)} lignes, taux recapture {r_taux()}. "
            f"Hors calibre : {random.randint(10, 30)} lignes, taux recapture {r_taux()}."
        ))

    for _ in range(30):
        parc = random.choice(ESTRAN_PARCS)
        sev = random.choice(SEVERITY)
        convs.append((
            f"Y a-t-il des anomalies sur le parc {parc} ?",
            f"Oui, {random.randint(1, 5)} anomalies détectées ({sev}) via {random.choice(ANOMALY_TYPES)}. "
            f"Biomasse écart : {r_biomasse()}. Vérifiez les lignes en zone {random.choice(ESTRAN_ZONES)}."
        ))

    return convs


def gen_finance_conversations():
    convs = []

    for _ in range(70):
        code = random.choice(FINANCE_CODES)
        label = FINANCE_LABELS[FINANCE_CODES.index(code)]
        convs.append((
            f"Quel est le statut du poste {label} ?",
            f"Poste {code} ({label}) : Budget {r_val()} DH, Réalisé {r_val()} DH. "
            f"Variance : {r_pct()}. Tendance vs N-1 : {r_pct()}."
        ))

    for _ in range(50):
        convs.append((
            "Résumé YTD Finance",
            f"YTD : Budget total {r_val()} DH, Réalisé {r_val()} DH. "
            f"Variance globale : {r_pct()}. Principaux drivers : {random.choice(FINANCE_LABELS)}, {random.choice(FINANCE_LABELS)}."
        ))

    for _ in range(30):
        convs.append((
            "Quelles sont les anomalies financières ?",
            f"{random.randint(1, 8)} anomalies détectées via {random.choice(ANOMALY_TYPES)}. "
            f"Poste principal : {random.choice(FINANCE_LABELS)} avec variance de {r_pct()}."
        ))

    for _ in range(30):
        convs.append((
            "Génère un commentaire IA sur les finances",
            f"Le résultat YTD montre une variance de {r_pct()} vs budget. "
            f"Le principal driver est « {random.choice(FINANCE_LABELS)} ». "
            f"Recommandation : surveiller les postes à forte déviation."
        ))

    for _ in range(20):
        convs.append((
            f"Budget vs Réalisé pour {random.choice(FINANCE_LABELS)}",
            f"Budget : {r_val()} DH. Réalisé : {r_val()} DH. "
            f"Écart : {r_pct()}. {random.choice(['Favorable', 'Défavorable'])}."
        ))

    return convs


def gen_achat_conversations():
    convs = []

    for _ in range(60):
        convs.append((
            "Combien de DA sont en cours ?",
            f"Il y a {random.randint(10, 80)} DA en cours dont {random.randint(5, 30)} sans commande associée. "
            f"Valeur totale : {r_val()} DH."
        ))

    for _ in range(60):
        convs.append((
            "Statut des bons de commande ?",
            f"BC en cours : {random.randint(20, 100)}. BC livrées : {random.randint(50, 200)}. "
            f"Statut principal : {random.choice(ACHAT_STATUTS_CDE)}."
        ))

    for _ in range(40):
        dem = random.choice(ACHAT_DEMANDEURS)
        convs.append((
            f"KPI de {dem} ?",
            f"{dem} a créé {random.randint(5, 50)} DA. "
            f"BC associées : {random.randint(3, 40)}. "
            f"Taux de transformation DA→BC : {random.randint(60, 95)}%."
        ))

    for _ in range(40):
        cat = random.choice(ACHAT_CATEGORIES)
        convs.append((
            f"Achats pour la catégorie {cat} ?",
            f"Catégorie {cat} : {random.randint(5, 80)} lignes, valeur {r_val()} DH. "
            f"Fournisseur principal : {random.choice(ACHAT_FOURNISSEURS)}."
        ))

    for _ in range(30):
        frn = random.choice(ACHAT_FOURNISSEURS)
        convs.append((
            f"Fournisseur {frn} ?",
            f"{frn} : {random.randint(3, 30)} commandes, valeur totale {r_val()} DH. "
            f"Catégories : {random.choice(ACHAT_CATEGORIES)}, {random.choice(ACHAT_CATEGORIES)}."
        ))

    for _ in range(30):
        convs.append((
            "Capex vs Opex ?",
            f"Opex : {random.randint(200, 500)} lignes, {r_val()} DH. "
            f"Capex : {random.randint(50, 150)} lignes, {r_val()} DH."
        ))

    for _ in range(20):
        convs.append((
            "Évolution mensuelle des achats ?",
            f"Dernier mois : {random.randint(20, 80)} DA créées, {random.randint(15, 60)} BC créées. "
            f"Valeur : {r_val()} DH. Tendance : {random.choice(['hausse', 'stable', 'baisse'])}."
        ))

    return convs


def gen_config_conversations():
    convs = []

    for _ in range(40):
        mod = random.choice(MODULES)
        convs.append((
            f"Configure le module {mod}",
            f"Module {mod} sélectionné. Quels fichiers Excel souhaitez-vous utiliser ? "
            f"Focus : anomalies, KPI, ou les deux ?"
        ))

    for _ in range(30):
        convs.append((
            f"Fichiers : {random.choice(['ventes.xlsx', 'Suivi Global CCS.xlsm', 'Exemple BDD estran.xlsx'])}",
            f"Fichier enregistré. Champs sensibles à masquer ? "
            f"Exemple : {random.choice(SENSITIVE_FIELDS)}, {random.choice(SENSITIVE_FIELDS)}"
        ))

    for _ in range(30):
        roles = random.sample(ACCESS_ROLES, 2)
        convs.append((
            f"Accès pour {roles[0]} et {roles[1]}",
            f"Accès configuré pour {roles[0]} et {roles[1]}. "
            f"Délais ou priorités spécifiques ?"
        ))

    for _ in range(20):
        convs.append((
            "Valider la configuration",
            f"Configuration validée pour le module {random.choice(MODULES)}. "
            f"Les paramètres sont enregistrés."
        ))

    return convs


def gen_general_conversations():
    convs = []

    greetings = [
        ("Bonjour", "Bonjour ! Je suis l'assistant AZURA AQUA. Comment puis-je vous aider ?"),
        ("Salut", "Salut ! Que souhaitez-vous consulter ? Estran, Finance, ou Achats ?"),
        ("Hello", "Bonjour ! Assistant AZURA AQUA à votre service. Quel module vous intéresse ?"),
        ("Aide", "Je peux vous aider avec : Estran (production), Finance (budget/variances), Achats (DA/BC)."),
        ("Que fais-tu ?", "Je suis l'assistant IA d'AZURA AQUA. J'analyse les données Estran, Finance et Achats."),
    ]
    convs.extend(greetings * 8)

    for _ in range(30):
        convs.append((
            "Quels modules sont disponibles ?",
            "Trois modules : Estran (biomasse, parcs), Finance (budget, variances), Achats (DA, BC, fournisseurs)."
        ))

    for _ in range(30):
        algo = random.choice(ANOMALY_TYPES)
        convs.append((
            f"Comment fonctionne {algo} ?",
            f"{algo} est un algorithme de détection d'anomalies. "
            f"Il identifie les valeurs atypiques dans les données pour signaler des écarts importants."
        ))

    for _ in range(20):
        convs.append((
            "Comment importer des données ?",
            "Glissez votre fichier .xlsx dans la barre d'import en haut de chaque page. "
            "Formats supportés : .xlsx et .xls (max 20 Mo)."
        ))

    for _ in range(20):
        convs.append((
            "Merci",
            "De rien ! N'hésitez pas si vous avez d'autres questions sur AZURA AQUA."
        ))

    for _ in range(20):
        convs.append((
            random.choice(["Au revoir", "Bye", "À bientôt"]),
            random.choice([
                "Au revoir ! Bonne utilisation d'AZURA AQUA.",
                "À bientôt ! L'assistant reste disponible.",
                "Bonne journée !"
            ])
        ))

    return convs


def generate_all():
    all_convs = []
    all_convs.extend(gen_estran_conversations())
    all_convs.extend(gen_finance_conversations())
    all_convs.extend(gen_achat_conversations())
    all_convs.extend(gen_config_conversations())
    all_convs.extend(gen_general_conversations())

    random.shuffle(all_convs)

    # Trim to exactly 1000
    all_convs = all_convs[:1000]

    return all_convs


def main():
    data_dir = Path(__file__).resolve().parent.parent / "data"
    data_dir.mkdir(exist_ok=True)

    conversations = generate_all()
    print(f"Generated {len(conversations)} conversations")

    # CSV
    csv_path = data_dir / "azura_conversations.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["prompt", "response"])
        for prompt, response in conversations:
            writer.writerow([prompt, response])
    print(f"CSV saved: {csv_path}")

    # JSONL
    jsonl_path = data_dir / "azura_conversations.jsonl"
    with open(jsonl_path, "w", encoding="utf-8") as f:
        for prompt, response in conversations:
            f.write(json.dumps({"prompt": prompt, "response": response}, ensure_ascii=False) + "\n")
    print(f"JSONL saved: {jsonl_path}")


if __name__ == "__main__":
    main()
