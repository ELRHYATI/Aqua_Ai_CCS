"""
Finance lines - Source: REFLEXION.xlsx RESULTAT MODELE sheet.
"""

from sqlalchemy import (
    Column,
    BigInteger,
    Integer,
    Numeric,
    String,
    ForeignKey,
    Index,
)
from app.models.base import Base
from app.models.base import TimestampMixin


class FinanceLine(Base, TimestampMixin):
    """Financial result line with YTD, Budget, N-1, variances."""

    __tablename__ = "finance_lines"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    code = Column(String(50), index=True, nullable=False)
    ordre = Column(Integer)
    gr = Column(String(20), index=True)
    label = Column(String(255))
    ytd = Column(Numeric(18, 2))
    n1 = Column(Numeric(18, 2))
    budget = Column(Numeric(18, 2))
    real = Column(Numeric(18, 2))
    fy = Column(Numeric(18, 2))
    var_b_r = Column(Numeric(18, 2))
    var_pct = Column(Numeric(10, 4))
    var_r_n1 = Column(Numeric(18, 2))
    year = Column(Integer, index=True)
    month = Column(Integer, index=True)
    period_id = Column(BigInteger, ForeignKey("dim_period.id"), nullable=True)

    __table_args__ = (
        Index("ix_finance_code_year_month", "code", "year", "month"),
    )
