"""
Tests unitaires pour les fonctions de calcul Finance.
- YTD (somme des R de janvier à mois courant)
- varBudget = (R - B) / B
- varLastYear = (R - N-1) / N-1
- Gestion des divisions par zéro
"""

import pytest

from app.services.finance_excel_service import (
    FinanceRow,
    compute_var_budget,
    compute_var_last_year,
    compute_kpis,
)


class TestComputeVarBudget:
    """Tests pour compute_var_budget = (R - B) / B"""

    def test_normal_case(self):
        """Cas normal : R=100, B=80 -> (100-80)/80 = 0.25"""
        val, div_zero = compute_var_budget(100.0, 80.0)
        assert val == pytest.approx(0.25)
        assert div_zero is False

    def test_negative_variance(self):
        """R < B -> variance négative"""
        val, div_zero = compute_var_budget(60.0, 80.0)
        assert val == pytest.approx(-0.25)
        assert div_zero is False

    def test_zero_budget(self):
        """B=0 -> division par zéro, retourne None et flag"""
        val, div_zero = compute_var_budget(100.0, 0.0)
        assert val is None
        assert div_zero is True

    def test_zero_actual(self):
        """R=0, B non nul -> variance = -1"""
        val, div_zero = compute_var_budget(0.0, 50.0)
        assert val == pytest.approx(-1.0)
        assert div_zero is False


class TestComputeVarLastYear:
    """Tests pour compute_var_last_year = (R - N-1) / N-1"""

    def test_normal_case(self):
        """Cas normal : R=120, N1=100 -> (120-100)/100 = 0.2"""
        val, div_zero = compute_var_last_year(120.0, 100.0)
        assert val == pytest.approx(0.2)
        assert div_zero is False

    def test_negative_variance(self):
        """R < N-1 -> variance négative"""
        val, div_zero = compute_var_last_year(80.0, 100.0)
        assert val == pytest.approx(-0.2)
        assert div_zero is False

    def test_zero_last_year(self):
        """N-1=0 -> division par zéro"""
        val, div_zero = compute_var_last_year(100.0, 0.0)
        assert val is None
        assert div_zero is True

    def test_same_values(self):
        """R = N-1 -> variance = 0"""
        val, div_zero = compute_var_last_year(100.0, 100.0)
        assert val == pytest.approx(0.0)
        assert div_zero is False


class TestComputeKpis:
    """Tests pour compute_kpis sur une liste de FinanceRow"""

    def test_single_row(self):
        """Une ligne -> un KPI avec var_budget et var_last_year calculés"""
        rows = [
            FinanceRow(
                account="P1110",
                label="Production vendue",
                year=2026,
                month=1,
                actual=100.0,
                budget=80.0,
                last_year=90.0,
            )
        ]
        kpis = compute_kpis(rows)
        assert len(kpis) == 1
        k = kpis[0]
        assert k.account == "P1110"
        assert k.label == "Production vendue"
        assert k.ytd == 100.0
        assert k.budget_ytd == 80.0
        assert k.last_year_ytd == 90.0
        assert k.var_budget == pytest.approx(0.25)  # (100-80)/80
        assert k.var_last_year == pytest.approx(0.1111, rel=1e-2)  # (100-90)/90
        assert k.var_budget_div_zero is False
        assert k.var_last_year_div_zero is False

    def test_division_by_zero_budget(self):
        """Budget=0 -> var_budget=None, flag=True"""
        rows = [
            FinanceRow(
                account="X",
                label="Test",
                year=2026,
                month=1,
                actual=50.0,
                budget=0.0,
                last_year=40.0,
            )
        ]
        kpis = compute_kpis(rows)
        assert kpis[0].var_budget is None
        assert kpis[0].var_budget_div_zero is True
        assert kpis[0].var_last_year == pytest.approx(0.25)
        assert kpis[0].var_last_year_div_zero is False

    def test_division_by_zero_last_year(self):
        """N-1=0 -> var_last_year=None, flag=True"""
        rows = [
            FinanceRow(
                account="X",
                label="Test",
                year=2026,
                month=1,
                actual=50.0,
                budget=40.0,
                last_year=0.0,
            )
        ]
        kpis = compute_kpis(rows)
        assert kpis[0].var_last_year is None
        assert kpis[0].var_last_year_div_zero is True
        assert kpis[0].var_budget == pytest.approx(0.25)
        assert kpis[0].var_budget_div_zero is False
