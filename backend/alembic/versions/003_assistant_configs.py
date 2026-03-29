"""assistant_configs table

Revision ID: 003
Revises: 002
Create Date: 2026-02-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assistant_configs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("module", sa.String(50), nullable=False),
        sa.Column("data_files", sa.Text(), nullable=True),
        sa.Column("focus", sa.String(50), nullable=True),
        sa.Column("sensitive_fields", sa.Text(), nullable=True),
        sa.Column("access", sa.Text(), nullable=True),
        sa.Column("deadlines", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assistant_configs_module", "assistant_configs", ["module"], unique=False)


def downgrade() -> None:
    op.drop_table("assistant_configs")
