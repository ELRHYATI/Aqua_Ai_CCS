"""Add missing estran columns for Primaire and HC viewers.

Revision ID: 009
Revises: 008
Create Date: 2026-03-29

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Primaire-specific
    op.add_column("estran_records", sa.Column("orientation", sa.String(100), nullable=True))
    op.add_column("estran_records", sa.Column("taille_seme", sa.String(100), nullable=True))
    op.add_column("estran_records", sa.Column("age_td_mois", sa.Numeric(10, 2), nullable=True))
    op.add_column("estran_records", sa.Column("residence_estran", sa.Numeric(10, 2), nullable=True))
    op.add_column("estran_records", sa.Column("v_kg", sa.Numeric(14, 2), nullable=True))
    op.add_column("estran_records", sa.Column("kg_recolte_m2", sa.Numeric(14, 4), nullable=True))
    op.add_column("estran_records", sa.Column("poids_mortalite_kg", sa.Numeric(14, 2), nullable=True))
    # HC-specific
    op.add_column("estran_records", sa.Column("orientation_lignes", sa.String(100), nullable=True))
    op.add_column("estran_records", sa.Column("taille_semi_hc", sa.String(100), nullable=True))
    op.add_column("estran_records", sa.Column("hc_resseme_kg_m2", sa.Numeric(14, 4), nullable=True))
    op.add_column("estran_records", sa.Column("pct_biomasse_recuperee", sa.Numeric(10, 4), nullable=True))
    op.add_column("estran_records", sa.Column("mortalite_kg", sa.Numeric(14, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("estran_records", "mortalite_kg")
    op.drop_column("estran_records", "pct_biomasse_recuperee")
    op.drop_column("estran_records", "hc_resseme_kg_m2")
    op.drop_column("estran_records", "taille_semi_hc")
    op.drop_column("estran_records", "orientation_lignes")
    op.drop_column("estran_records", "poids_mortalite_kg")
    op.drop_column("estran_records", "kg_recolte_m2")
    op.drop_column("estran_records", "v_kg")
    op.drop_column("estran_records", "residence_estran")
    op.drop_column("estran_records", "age_td_mois")
    op.drop_column("estran_records", "taille_seme")
    op.drop_column("estran_records", "orientation")
