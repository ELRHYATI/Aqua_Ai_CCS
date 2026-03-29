"""audit_logs table and chatbot read-only views

Revision ID: 004
Revises: 003
Create Date: 2026-03-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Audit logs for /chat requests
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(255), nullable=True),
        sa.Column("endpoint", sa.String(255), nullable=False),
        sa.Column("query_text", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("response_length", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_endpoint", "audit_logs", ["endpoint"], unique=False)
    op.create_index("ix_audit_logs_timestamp", "audit_logs", ["timestamp"], unique=False)

    # Chatbot read-only views (for future RAG - chatbot_ro role will SELECT from these only)
    op.execute("""
        CREATE OR REPLACE VIEW estran_summary AS
        SELECT parc_semi, parc_an, year, month, COUNT(*) as cnt,
               COALESCE(SUM(biomasse_gr), 0) as biomasse_totale
        FROM estran_records
        GROUP BY parc_semi, parc_an, year, month
    """)
    op.execute("""
        CREATE OR REPLACE VIEW finance_kpi_public AS
        SELECT code, label, gr, ytd, budget, n1, real, var_pct, year, month
        FROM finance_lines
    """)
    op.execute("""
        CREATE OR REPLACE VIEW achat_status AS
        SELECT 'da' as type, reference, status, amount, delay_days, critical_flag
        FROM purchase_da
        UNION ALL
        SELECT 'bc' as type, reference, status, amount, delay_days, critical_flag
        FROM purchase_bc
    """)

    # chatbot_ro role: create manually for RAG isolation when needed:
    #   CREATE ROLE chatbot_ro WITH LOGIN PASSWORD 'your_password';
    #   GRANT CONNECT ON DATABASE azura_aqua TO chatbot_ro;
    #   GRANT USAGE ON SCHEMA public TO chatbot_ro;
    #   GRANT SELECT ON estran_summary, finance_kpi_public, achat_status TO chatbot_ro;


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS achat_status CASCADE")
    op.execute("DROP VIEW IF EXISTS finance_kpi_public CASCADE")
    op.execute("DROP VIEW IF EXISTS estran_summary CASCADE")
    op.drop_table("audit_logs")
