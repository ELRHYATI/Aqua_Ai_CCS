from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, not_
import pandas as pd
from typing import Optional, List

from app.models.estran import EstranRecord
from app.schemas.estran_kpi import (
    EstranDashboardKpiResponse,
    KpiIndicator,
    ChartDataPoint,
    StockAgeDataPoint,
    EstranFiltersResponse,
)

def _norm(val: Optional[str]) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip()
    return s or None


def _get_base_query(
    parc: Optional[str] = None,
    parc_an: Optional[str] = None,
    generation_semi: Optional[str] = None,
    annee: Optional[int] = None,
    base: Optional[str] = None,
):
    q = select(EstranRecord)
    if parc and parc != "Tous les parcs":
        q = q.where(EstranRecord.parc_semi == parc)
    wan = _norm(parc_an)
    if wan:
        q = q.where(EstranRecord.parc_an == wan)
    wgen = _norm(generation_semi)
    if wgen:
        # Filtre génération: s'applique aux lignes « layout Primaire » (feuille Primaire ou BD ESTRA sans sheet).
        is_prim_layout = or_(
            EstranRecord.sheet_name == "Primaire",
            EstranRecord.sheet_name.is_(None),
        )
        q = q.where(or_(not_(is_prim_layout), EstranRecord.generation_semi == wgen))
    if annee and annee != "Toutes les années":
        q = q.where(EstranRecord.year == int(annee))
    if base == "Primaire":
        q = q.where(EstranRecord.sheet_name == "Primaire")
    elif base == "HC":
        q = q.where(EstranRecord.sheet_name == "Hors calibre")
    return q


def _calculate_trend(current: float, previous: float) -> tuple[float, str]:
    if previous == 0:
        return 0.0, "stable"
    trend = ((current - previous) / previous) * 100
    direction = "up" if trend > 0 else "down" if trend < 0 else "stable"
    return round(trend, 1), direction


async def get_estran_kpis(
    db: AsyncSession,
    parc: Optional[str],
    annee: Optional[int],
    base: Optional[str],
    parc_an: Optional[str] = None,
    generation_semi: Optional[str] = None,
) -> EstranDashboardKpiResponse:
    # Fetch data for current year and previous year (if annee specified, else all or last 2)
    q = _get_base_query(parc, parc_an, generation_semi, None, None)
    
    result = await db.execute(q)
    rows = result.scalars().all()
    
    # Filter for the selected year and the previous year
    current_year = int(annee) if annee and annee != "Toutes les années" else pd.Timestamp.now().year
    prev_year = current_year - 1
    
    def process_kpis(sheet_name: str, target_year: int):
        target_rows = [r for r in rows if r.sheet_name == sheet_name]
        
        # If no specific annee filter is provided, we use all rows for the main values (but comparing all vs all makes little sense, let's treat "all" as target_year=all, prev_year=None)
        if annee and annee != "Toutes les années":
            year_rows = [r for r in target_rows if r.year == target_year]
            prev_rows = [r for r in target_rows if r.year == prev_year]
        else:
            year_rows = target_rows
            prev_rows = [] # Cannot compare trend on "All time" effectively, or compare to prev year max available
        
        # 1. Rendement
        def get_rend(records):
            vals = [float(r.quantite_brute_recoltee_kg) for r in records if r.quantite_brute_recoltee_kg is not None]
            return sum(vals) / len(vals) if vals else 0.0
            
        # 2. Age Récolte
        def get_age(records):
            ages = []
            for r in records:
                if r.date_semis:
                    end_date = r.date_recolte if r.date_recolte else date.today()
                    months = (end_date - r.date_semis).days / 30.0
                    ages.append(months)
            return sum(ages) / len(ages) if ages else 0.0
            
        # 3. Stock Lignes
        def get_stock(records):
            return len([r for r in records if not r.date_recolte])
            
        cur_rend = get_rend(year_rows)
        cur_age = get_age(year_rows)
        cur_stock = get_stock(year_rows)
        
        prev_rend = get_rend(prev_rows) if prev_rows else cur_rend
        prev_age = get_age(prev_rows) if prev_rows else cur_age
        prev_stock = get_stock(prev_rows) if prev_rows else cur_stock
        
        rt = _calculate_trend(cur_rend, prev_rend) if prev_rows else (0.0, "stable")
        at = _calculate_trend(cur_age, prev_age) if prev_rows else (0.0, "stable")
        st = _calculate_trend(cur_stock, prev_stock) if prev_rows else (0.0, "stable")
        
        return {
            "rendement": KpiIndicator(value=round(cur_rend, 1), unit="Kg" if sheet_name == "Hors calibre" else "Kg/200m", trend=rt[0], trend_direction=rt[1]),
            "age": KpiIndicator(value=round(cur_age, 1), unit="mois", trend=at[0], trend_direction=at[1]),
            "stock": KpiIndicator(value=cur_stock, unit="lignes", trend=st[0], trend_direction=st[1]),
        }

    kpi_prim = process_kpis("Primaire", current_year)
    kpi_hc = process_kpis("Hors calibre", current_year)

    return EstranDashboardKpiResponse(
        rendement_primaire=kpi_prim["rendement"],
        rendement_hc=kpi_hc["rendement"],
        age_recolte_primaire=kpi_prim["age"],
        age_recolte_hc=kpi_hc["age"],
        stock_lignes_primaire=kpi_prim["stock"],
        stock_lignes_hc=kpi_hc["stock"],
    )


async def get_chart_rendement(
    db: AsyncSession,
    parc: Optional[str],
    annee: Optional[int],
    base: Optional[str],
    parc_an: Optional[str] = None,
    generation_semi: Optional[str] = None,
) -> List[ChartDataPoint]:
    q = _get_base_query(parc, parc_an, generation_semi, annee, base)
    result = await db.execute(q)
    rows = result.scalars().all()
    
    # Group by parc, annee -> avg rend
    df = pd.DataFrame([{
        "parc": r.parc_semi or "Inconnu",
        "annee": r.year or 0,
        "val": float(r.quantite_brute_recoltee_kg) if r.quantite_brute_recoltee_kg else None
    } for r in rows])
    
    if df.empty:
        return []
        
    df = df.dropna(subset=["val"])
    if df.empty: return []
    grouped = df.groupby(["parc", "annee"])["val"].mean().reset_index()
    return [ChartDataPoint(parc=r["parc"], annee=r["annee"], valeur=round(r["val"], 1)) for _, r in grouped.iterrows()]


async def get_chart_age_recolte(
    db: AsyncSession,
    parc: Optional[str],
    annee: Optional[int],
    base: Optional[str],
    parc_an: Optional[str] = None,
    generation_semi: Optional[str] = None,
) -> List[ChartDataPoint]:
    q = _get_base_query(parc, parc_an, generation_semi, annee, base)
    result = await db.execute(q)
    rows = result.scalars().all()
    
    data = []
    for r in rows:
        if r.date_semis:
            end_date = r.date_recolte if r.date_recolte else date.today()
            months = (end_date - r.date_semis).days / 30.0
            data.append({
                "parc": r.parc_semi or "Inconnu",
                "annee": r.year or 0,
                "val": months
            })
            
    df = pd.DataFrame(data)
    if df.empty: return []
    
    grouped = df.groupby(["parc", "annee"])["val"].mean().reset_index()
    return [ChartDataPoint(parc=r["parc"], annee=r["annee"], valeur=round(r["val"], 1)) for _, r in grouped.iterrows()]


async def get_chart_stock_lignes(
    db: AsyncSession,
    parc: Optional[str],
    annee: Optional[int],
    base: Optional[str],
    parc_an: Optional[str] = None,
    generation_semi: Optional[str] = None,
) -> List[ChartDataPoint]:
    q = _get_base_query(parc, parc_an, generation_semi, annee, base)
    q = q.where(EstranRecord.date_recolte.is_(None))
    result = await db.execute(q)
    rows = result.scalars().all()
    
    df = pd.DataFrame([{
        "parc": r.parc_semi or "Inconnu",
        "annee": r.year or 0,
        "id": r.id
    } for r in rows])
    
    if df.empty: return []
    grouped = df.groupby(["parc", "annee"])["id"].count().reset_index()
    return [ChartDataPoint(parc=r["parc"], annee=r["annee"], valeur=r["id"]) for _, r in grouped.iterrows()]


async def get_chart_stock_age_sejour(
    db: AsyncSession,
    parc: Optional[str],
    base: Optional[str],
    parc_an: Optional[str] = None,
    generation_semi: Optional[str] = None,
) -> List[StockAgeDataPoint]:
    q = _get_base_query(parc, parc_an, generation_semi, None, base).where(EstranRecord.date_recolte.is_(None))
    result = await db.execute(q)
    rows = result.scalars().all()
    
    tranches = {"0-6 mois": 0, "6-12 mois": 0, "12-18 mois": 0, "18-24 mois": 0, "24+ mois": 0}
    
    for r in rows:
        if r.date_semis:
            months = (date.today() - r.date_semis).days / 30.0
            if months <= 6:
                tranches["0-6 mois"] += 1
            elif months <= 12:
                tranches["6-12 mois"] += 1
            elif months <= 18:
                tranches["12-18 mois"] += 1
            elif months <= 24:
                tranches["18-24 mois"] += 1
            else:
                tranches["24+ mois"] += 1
                
    return [StockAgeDataPoint(tranche=k, lignes=v, parc=parc) for k, v in tranches.items()]


async def get_estran_filters(db: AsyncSession) -> EstranFiltersResponse:
    parcs_q = select(EstranRecord.parc_semi).distinct().where(EstranRecord.parc_semi.isnot(None))
    annees_q = select(EstranRecord.year).distinct().where(EstranRecord.year.isnot(None))
    
    p_res = await db.execute(parcs_q)
    a_res = await db.execute(annees_q)
    
    parcs = sorted([p for p in p_res.scalars().all() if p])
    annees = sorted([int(a) for a in a_res.scalars().all() if a], reverse=True)
    
    return EstranFiltersResponse(
        parcs=parcs,
        annees=annees,
        months=[],
        residences=[],
        origines=[],
        n_parc_an=[],
        generations_semi=[],
    )
