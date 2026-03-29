"""user_privileges - users table with privilege columns

Revision ID: 006
Revises: 005
Create Date: 2026-03-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default=sa.text("'viewer'")),
        sa.Column("department", sa.String(50), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        # Privilege columns
        sa.Column("can_export_pdf", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("can_upload_files", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("can_use_chatbot", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("can_view_finance", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("can_view_estran", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("can_view_achat", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("can_run_ml", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("can_manage_users", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_role", "users", ["role"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_users_role", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
