"""populate_year_month_from_dates — backfill year/month from date columns.

Revision ID: 010
Revises: 009
Create Date: 2026-03-29

"""
from typing import Sequence, Union

from alembic import op

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE estran_records
        SET
            year = EXTRACT(YEAR FROM date_recolte)::int,
            month = EXTRACT(MONTH FROM date_recolte)::int
        WHERE date_recolte IS NOT NULL
          AND (year IS NULL OR month IS NULL);
        """
    )
    op.execute(
        """
        UPDATE estran_records
        SET
            year = EXTRACT(YEAR FROM date_semis)::int,
            month = EXTRACT(MONTH FROM date_semis)::int
        WHERE date_recolte IS NULL
          AND date_semis IS NOT NULL
          AND (year IS NULL OR month IS NULL);
        """
    )


def downgrade() -> None:
    pass
