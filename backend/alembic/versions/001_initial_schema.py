"""initial_schema

Revision ID: 001
Revises:
Create Date: 2025-02-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dim_period",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(50), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_dim_period_month"), "dim_period", ["month"], unique=False)
    op.create_index(op.f("ix_dim_period_year"), "dim_period", ["year"], unique=False)

    op.create_table(
        "dim_entity",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(50), nullable=True),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=True, server_default=sa.text("true")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_dim_entity_code"),
    )

    op.create_table(
        "estran_records",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("parc_semi", sa.String(50), nullable=True),
        sa.Column("parc_an", sa.String(50), nullable=True),
        sa.Column("generation_semi", sa.String(50), nullable=True),
        sa.Column("ligne_num", sa.Integer(), nullable=True),
        sa.Column("ett", sa.String(50), nullable=True),
        sa.Column("phase", sa.String(50), nullable=True),
        sa.Column("origine", sa.String(50), nullable=True),
        sa.Column("type_semi", sa.String(50), nullable=True),
        sa.Column("longueur_ligne", sa.Numeric(12, 2), nullable=True),
        sa.Column("nb_ligne_semee_200m", sa.Numeric(12, 2), nullable=True),
        sa.Column("zone", sa.String(50), nullable=True),
        sa.Column("date_semis", sa.Date(), nullable=True),
        sa.Column("date_recolte", sa.Date(), nullable=True),
        sa.Column("effectif_seme", sa.Numeric(14, 2), nullable=True),
        sa.Column("quantite_semee_kg", sa.Numeric(14, 2), nullable=True),
        sa.Column("quantite_brute_recoltee_kg", sa.Numeric(14, 2), nullable=True),
        sa.Column("quantite_casse_kg", sa.Numeric(14, 2), nullable=True),
        sa.Column("biomasse_gr", sa.Numeric(14, 2), nullable=True),
        sa.Column("biomasse_vendable_kg", sa.Numeric(14, 2), nullable=True),
        sa.Column("statut", sa.String(50), nullable=True),
        sa.Column("etat_recolte", sa.String(50), nullable=True),
        sa.Column("pct_recolte", sa.Numeric(8, 4), nullable=True),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("month", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_estran_records_parc_semi"), "estran_records", ["parc_semi"], unique=False)
    op.create_index(op.f("ix_estran_records_statut"), "estran_records", ["statut"], unique=False)
    op.create_index(op.f("ix_estran_records_year"), "estran_records", ["year"], unique=False)
    op.create_index(op.f("ix_estran_records_month"), "estran_records", ["month"], unique=False)
    op.create_index("ix_estran_parc_year_month", "estran_records", ["parc_semi", "year", "month"], unique=False)

    op.create_table(
        "finance_lines",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("ordre", sa.Integer(), nullable=True),
        sa.Column("gr", sa.String(20), nullable=True),
        sa.Column("label", sa.String(255), nullable=True),
        sa.Column("ytd", sa.Numeric(18, 2), nullable=True),
        sa.Column("n1", sa.Numeric(18, 2), nullable=True),
        sa.Column("budget", sa.Numeric(18, 2), nullable=True),
        sa.Column("real", sa.Numeric(18, 2), nullable=True),
        sa.Column("fy", sa.Numeric(18, 2), nullable=True),
        sa.Column("var_b_r", sa.Numeric(18, 2), nullable=True),
        sa.Column("var_pct", sa.Numeric(10, 4), nullable=True),
        sa.Column("var_r_n1", sa.Numeric(18, 2), nullable=True),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("month", sa.Integer(), nullable=True),
        sa.Column("period_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["period_id"], ["dim_period.id"], name="finance_lines_period_id_fkey"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_finance_lines_code"), "finance_lines", ["code"], unique=False)
    op.create_index(op.f("ix_finance_lines_gr"), "finance_lines", ["gr"], unique=False)
    op.create_index(op.f("ix_finance_lines_year"), "finance_lines", ["year"], unique=False)
    op.create_index(op.f("ix_finance_lines_month"), "finance_lines", ["month"], unique=False)
    op.create_index("ix_finance_code_year_month", "finance_lines", ["code", "year", "month"], unique=False)

    op.create_table(
        "purchase_da",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("reference", sa.String(100), nullable=True),
        sa.Column("amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("delay_days", sa.Integer(), nullable=True, server_default=sa.text("0")),
        sa.Column("status", sa.String(50), nullable=True),
        sa.Column("critical_flag", sa.Boolean(), nullable=True, server_default=sa.text("false")),
        sa.Column("entity_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["entity_id"], ["dim_entity.id"], name="purchase_da_entity_id_fkey"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_purchase_da_reference"), "purchase_da", ["reference"], unique=False)
    op.create_index(op.f("ix_purchase_da_status"), "purchase_da", ["status"], unique=False)
    op.create_index(op.f("ix_purchase_da_critical_flag"), "purchase_da", ["critical_flag"], unique=False)

    op.create_table(
        "purchase_bc",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("reference", sa.String(100), nullable=True),
        sa.Column("amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("delay_days", sa.Integer(), nullable=True, server_default=sa.text("0")),
        sa.Column("status", sa.String(50), nullable=True),
        sa.Column("critical_flag", sa.Boolean(), nullable=True, server_default=sa.text("false")),
        sa.Column("expected_delivery_date", sa.Date(), nullable=True),
        sa.Column("entity_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["entity_id"], ["dim_entity.id"], name="purchase_bc_entity_id_fkey"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_purchase_bc_reference"), "purchase_bc", ["reference"], unique=False)
    op.create_index(op.f("ix_purchase_bc_status"), "purchase_bc", ["status"], unique=False)
    op.create_index(op.f("ix_purchase_bc_critical_flag"), "purchase_bc", ["critical_flag"], unique=False)
    op.create_index("ix_purchase_bc_expected_delivery", "purchase_bc", ["expected_delivery_date"], unique=False)


def downgrade() -> None:
    op.drop_table("purchase_bc")
    op.drop_table("purchase_da")
    op.drop_table("finance_lines")
    op.drop_table("estran_records")
    op.drop_table("dim_entity")
    op.drop_table("dim_period")
