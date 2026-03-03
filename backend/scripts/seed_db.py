"""
Seed database from REFLEXION.xlsx.
Run: cd backend && python -m scripts.seed_db
Or: python backend/scripts/seed_db.py (from project root)
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import AsyncSessionLocal, engine
from app.models.base import Base
from app.services.excel_sync_service import seed_from_excel


async def main():
    project_root = Path(__file__).resolve().parent.parent.parent
    excel_path = project_root / "REFLEXION.xlsx"
    if not excel_path.exists():
        print(f"REFLEXION.xlsx not found at {excel_path}")
        return

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        counts = await seed_from_excel(session, excel_path)

    print(f"Seeded {counts['estran']} estran, {counts['finance']} finance, {counts['purchases']} purchases")
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
