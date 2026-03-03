"""
Purchase tables - Source: REFLEXION.xlsx TB ACHAT sheet.
DA EN COURS, BC NON LIVRES.
"""

from sqlalchemy import (
    Column,
    BigInteger,
    Integer,
    Numeric,
    String,
    Boolean,
    Date,
    ForeignKey,
    Index,
)
from app.models.base import Base
from app.models.base import TimestampMixin


class PurchaseDA(Base, TimestampMixin):
    """Demande d'Achat en cours (DA in progress)."""

    __tablename__ = "purchase_da"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    reference = Column(String(100), index=True)
    amount = Column(Numeric(18, 2))
    delay_days = Column(Integer, default=0)
    status = Column(String(50), index=True)
    critical_flag = Column(Boolean, default=False, index=True)
    entity_id = Column(BigInteger, ForeignKey("dim_entity.id"), nullable=True)


class PurchaseBC(Base, TimestampMixin):
    """Bon de Commande non livré (BC not delivered)."""

    __tablename__ = "purchase_bc"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    reference = Column(String(100), index=True)
    amount = Column(Numeric(18, 2))
    delay_days = Column(Integer, default=0)
    status = Column(String(50), index=True)
    critical_flag = Column(Boolean, default=False, index=True)
    expected_delivery_date = Column(Date)
    entity_id = Column(BigInteger, ForeignKey("dim_entity.id"), nullable=True)

    __table_args__ = (
        Index("ix_purchase_bc_expected_delivery", "expected_delivery_date"),
    )
