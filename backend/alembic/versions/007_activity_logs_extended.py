"""activity_logs_extended - extend audit_logs with action, module, details, etc.

Revision ID: 007
Revises: 006
Create Date: 2026-03-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("audit_logs", sa.Column("action", sa.String(100), nullable=True))
    op.add_column("audit_logs", sa.Column("module", sa.String(50), nullable=True))
    op.add_column("audit_logs", sa.Column("details", JSONB(), nullable=True))
    op.add_column("audit_logs", sa.Column("user_agent", sa.String(500), nullable=True))
    op.add_column("audit_logs", sa.Column("duration_ms", sa.Integer(), nullable=True))
    op.add_column("audit_logs", sa.Column("file_name", sa.String(255), nullable=True))
    op.add_column("audit_logs", sa.Column("file_size_kb", sa.Integer(), nullable=True))
    op.add_column("audit_logs", sa.Column("chat_message", sa.Text(), nullable=True))
    op.add_column("audit_logs", sa.Column("chat_response_length", sa.Integer(), nullable=True))
    op.add_column("audit_logs", sa.Column("status", sa.String(20), nullable=True))
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"], unique=False)
    op.create_index("ix_audit_logs_module", "audit_logs", ["module"], unique=False)
    op.create_index("ix_audit_logs_status", "audit_logs", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_audit_logs_status", table_name="audit_logs")
    op.drop_index("ix_audit_logs_module", table_name="audit_logs")
    op.drop_index("ix_audit_logs_action", table_name="audit_logs")
    op.drop_column("audit_logs", "status")
    op.drop_column("audit_logs", "chat_response_length")
    op.drop_column("audit_logs", "chat_message")
    op.drop_column("audit_logs", "file_size_kb")
    op.drop_column("audit_logs", "file_name")
    op.drop_column("audit_logs", "duration_ms")
    op.drop_column("audit_logs", "user_agent")
    op.drop_column("audit_logs", "details")
    op.drop_column("audit_logs", "module")
    op.drop_column("audit_logs", "action")
