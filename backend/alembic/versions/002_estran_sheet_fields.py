"""estran_sheet_fields

Revision ID: 002
Revises: 001
Create Date: 2025-02-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("estran_records", sa.Column("sheet_name", sa.String(50), nullable=True))
    op.add_column("estran_records", sa.Column("type_recolte", sa.String(80), nullable=True))
    op.add_column("estran_records", sa.Column("taux_recapture", sa.Numeric(10, 4), nullable=True))
    op.add_column("estran_records", sa.Column("objectif_recolte", sa.String(100), nullable=True))
    op.create_index("ix_estran_records_sheet_name", "estran_records", ["sheet_name"], unique=False)
    op.create_index("ix_estran_records_type_recolte", "estran_records", ["type_recolte"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_estran_records_type_recolte", table_name="estran_records")
    op.drop_index("ix_estran_records_sheet_name", table_name="estran_records")
    op.drop_column("estran_records", "objectif_recolte")
    op.drop_column("estran_records", "taux_recapture")
    op.drop_column("estran_records", "type_recolte")
    op.drop_column("estran_records", "sheet_name")
