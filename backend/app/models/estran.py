"""
Estran records - Source: REFLEXION.xlsx BD ESTRA sheet.
"""

from sqlalchemy import (
    Column,
    BigInteger,
    Integer,
    Numeric,
    String,
    Date,
    Index,
)
from app.models.base import Base
from app.models.base import TimestampMixin


class EstranRecord(Base, TimestampMixin):
    """Estran production record per parc and ligne."""

    __tablename__ = "estran_records"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    parc_semi = Column(String(50), index=True)
    parc_an = Column(String(50))
    generation_semi = Column(String(50))
    ligne_num = Column(Integer)
    ett = Column(String(50))
    phase = Column(String(50))
    origine = Column(String(50))
    type_semi = Column(String(50))
    longueur_ligne = Column(Numeric(12, 2))
    nb_ligne_semee_200m = Column(Numeric(12, 2))
    zone = Column(String(50))
    date_semis = Column(Date)
    date_recolte = Column(Date)
    effectif_seme = Column(Numeric(14, 2))
    quantite_semee_kg = Column(Numeric(14, 2))
    quantite_brute_recoltee_kg = Column(Numeric(14, 2))
    quantite_casse_kg = Column(Numeric(14, 2))
    biomasse_gr = Column(Numeric(14, 2))
    biomasse_vendable_kg = Column(Numeric(14, 2))
    statut = Column(String(50), index=True)
    etat_recolte = Column(String(50))
    pct_recolte = Column(Numeric(8, 4))
    year = Column(Integer, index=True)
    month = Column(Integer, index=True)
    sheet_name = Column(String(50), index=True)
    type_recolte = Column(String(80), index=True)
    taux_recapture = Column(Numeric(10, 4))
    objectif_recolte = Column(String(100))

    # Primaire-specific columns
    orientation = Column(String(100))
    taille_seme = Column(String(100))
    age_td_mois = Column(Numeric(10, 2))
    residence_estran = Column(Numeric(10, 2))
    v_kg = Column(Numeric(14, 2))
    kg_recolte_m2 = Column(Numeric(14, 4))
    poids_mortalite_kg = Column(Numeric(14, 2))

    # HC-specific columns
    orientation_lignes = Column(String(100))
    taille_semi_hc = Column(String(100))
    hc_resseme_kg_m2 = Column(Numeric(14, 4))
    pct_biomasse_recuperee = Column(Numeric(10, 4))
    mortalite_kg = Column(Numeric(14, 2))

    __table_args__ = (
        Index("ix_estran_parc_year_month", "parc_semi", "year", "month"),
    )
