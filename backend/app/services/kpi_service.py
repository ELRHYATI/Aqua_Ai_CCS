"""
KPI scoring for DA/BC (Demandes d'Achat, Bons de Commande).
Risk_score = f(delay_days, amount, critical_flag).
"""

from decimal import Decimal
from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.purchase import PurchaseDA, PurchaseBC
from app.schemas.achat import PurchasePriority


def _compute_risk_score(
    delay_days: int,
    amount: Decimal | float | None,
    critical_flag: bool,
) -> float:
    """
    Simple risk score formula.
    risk = delay_weight * delay_days + amount_weight * log(amount+1) + critical_bonus

    Tuning: business rules and thresholds to be confirmed.
    """
    delay_weight = 0.1
    amount_weight = 0.02
    critical_bonus = 20.0 if critical_flag else 0.0

    amt = float(amount or 0)
    amount_component = amount_weight * (1 + (amt / 10000) ** 0.5)  # scale
    delay_component = delay_weight * max(0, delay_days)
    return min(100.0, delay_component + amount_component + critical_bonus)


async def get_priorities(session: AsyncSession) -> List[PurchasePriority]:
    """
    Return DA and BC with risk_score, sorted by risk (highest first).
    """
    priorities: List[PurchasePriority] = []

    # DA
    result_da = await session.execute(
        select(PurchaseDA).order_by(PurchaseDA.delay_days.desc().nullslast())
    )
    for row in result_da.scalars().all():
        risk = _compute_risk_score(
            row.delay_days or 0,
            row.amount,
            row.critical_flag or False,
        )
        priorities.append(
            PurchasePriority(
                id=row.id,
                type="da",
                reference=row.reference,
                amount=row.amount,
                delay_days=row.delay_days or 0,
                status=row.status,
                critical_flag=row.critical_flag or False,
                risk_score=round(risk, 2),
                expected_delivery_date=None,
            )
        )

    # BC
    result_bc = await session.execute(
        select(PurchaseBC).order_by(PurchaseBC.delay_days.desc().nullslast())
    )
    for row in result_bc.scalars().all():
        risk = _compute_risk_score(
            row.delay_days or 0,
            row.amount,
            row.critical_flag or False,
        )
        priorities.append(
            PurchasePriority(
                id=row.id,
                type="bc",
                reference=row.reference,
                amount=row.amount,
                delay_days=row.delay_days or 0,
                status=row.status,
                critical_flag=row.critical_flag or False,
                risk_score=round(risk, 2),
                expected_delivery_date=row.expected_delivery_date,
            )
        )

    priorities.sort(key=lambda p: p.risk_score, reverse=True)
    return priorities
