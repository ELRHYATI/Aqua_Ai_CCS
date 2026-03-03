"""
Dimension tables - period and entity.
"""

from sqlalchemy import Column, BigInteger, Integer, String, Boolean
from app.models.base import Base


class DimPeriod(Base):
    """Reporting dimension: year, month."""

    __tablename__ = "dim_period"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    year = Column(Integer, nullable=False, index=True)
    month = Column(Integer, nullable=False, index=True)
    label = Column(String(50))


class DimEntity(Base):
    """Entity/site dimension."""

    __tablename__ = "dim_entity"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    code = Column(String(50), unique=True)
    name = Column(String(255))
    active = Column(Boolean, default=True)
