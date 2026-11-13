"""Create a user locally: python create_user.py --email admin@example.com --role admin"""
import argparse
import getpass
from sqlalchemy import select
from app.auth import hash_password
from app.db import SessionLocal
from app.models import User

parser = argparse.ArgumentParser()
parser.add_argument("--email", required=True)
parser.add_argument("--role", choices=["admin", "staff"], required=True)
args = parser.parse_args()
email = args.email.strip().lower()
password = getpass.getpass("Password (at least 12 characters): ")
if len(password) < 12:
    parser.error("Password must be at least 12 characters")
with SessionLocal() as db:
    if db.scalar(select(User).where(User.email == email)):
        parser.error("Email already exists")
    db.add(User(email=email, hashed_password=hash_password(password), role=args.role, is_active=True))
    db.commit()
print(f"Created {args.role} user: {email}")
