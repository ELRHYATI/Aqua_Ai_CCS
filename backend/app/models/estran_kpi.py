"""
Compatibility module for Estran KPI response models.

The API uses Pydantic schemas in app.schemas.estran_kpi.
This file is provided to keep the project structure explicit for Estran KPI models.
"""

from app.schemas.estran_kpi import (  # noqa: F401
    EstranFieldMapping,
    EstranKpiBreakdown,
    EstranKpiItem,
    EstranKpiResponse,
    EstranKpiSeriesPoint,
)
