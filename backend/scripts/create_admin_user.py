"""
Create or update an admin user (password hash). Run from backend/:

  .venv\\Scripts\\python scripts/create_admin_user.py
  .venv\\Scripts\\python scripts/create_admin_user.py --email you@corp.com --password "YourSecurePass"

Uses DATABASE_URL from .env.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

# Allow `python scripts/create_admin_user.py` from backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.user import User


async def main() -> None:
    parser = argparse.ArgumentParser(description="Create or reset Azura Aqua admin user")
    parser.add_argument("--email", default="admin@azura-aqua.local", help="Admin email")
    parser.add_argument("--password", default="AzuraAdmin2026!", help="Admin password")
    parser.add_argument("--name", default="Administrateur", help="Display name")
    args = parser.parse_args()

    email = args.email.strip().lower()
    pw_hash = hash_password(args.password)

    async with AsyncSessionLocal() as session:
        r = await session.execute(select(User).where(User.email == email))
        u = r.scalar_one_or_none()
        if u:
            u.full_name = args.name
            u.role = "admin"
            u.is_active = True
            u.password_hash = pw_hash
            u.can_export_pdf = True
            u.can_upload_files = True
            u.can_use_chatbot = True
            u.can_view_finance = True
            u.can_view_estran = True
            u.can_view_achat = True
            u.can_run_ml = True
            u.can_manage_users = True
            action = "updated"
        else:
            u = User(
                full_name=args.name,
                email=email,
                role="admin",
                is_active=True,
                password_hash=pw_hash,
                can_export_pdf=True,
                can_upload_files=True,
                can_use_chatbot=True,
                can_view_finance=True,
                can_view_estran=True,
                can_view_achat=True,
                can_run_ml=True,
                can_manage_users=True,
            )
            session.add(u)
            action = "created"
        await session.commit()

    print(f"OK: admin {action}")
    print(f"  Email:    {email}")
    print(f"  Password: {args.password}")
    print("Change the password after first login in production.")


if __name__ == "__main__":
    asyncio.run(main())
