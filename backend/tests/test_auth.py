import pytest
from uuid import uuid4
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from app.main import app
from app.db import SessionLocal
from app.models import User
from app.auth import hash_password

pytestmark = pytest.mark.real_auth

@pytest.fixture
def accounts():
    suffix = uuid4().hex
    with SessionLocal() as db:
        admin = User(email=f"admin-{suffix}@example.com", hashed_password=hash_password("test-password-123"), role="admin", is_active=True)
        staff = User(email=f"staff-{suffix}@example.com", hashed_password=hash_password("test-password-123"), role="staff", is_active=True)
        demo = User(
            email="demo@orderflow.local",
            hashed_password=hash_password("test-password-123"),
            role="staff",
            is_active=True,
        )

        db.add_all([admin, staff, demo])
        db.commit()

        ids = [admin.id, staff.id, demo.id]
    yield {
        "admin": admin.email,
        "staff": staff.email,
        "demo": demo.email,
    }
    with SessionLocal() as db:
        db.execute(delete(User).where(User.id.in_(ids)))
        db.commit()

def login(client, email, password="test-password-123"):
    return client.post("/auth/login", data={"username": email, "password": password})

def test_authentication_and_rbac(accounts):
    with TestClient(app) as client:
        assert client.get("/products").status_code == 401
        assert client.get("/products", headers={"Authorization": "Bearer not-a-jwt"}).status_code == 401
        assert login(client, accounts["staff"], "wrong-password").status_code == 401
        staff_login = login(client, accounts["staff"])
        assert staff_login.status_code == 200
        staff_headers = {"Authorization": "Bearer " + staff_login.json()["access_token"]}
        assert client.get("/auth/me", headers=staff_headers).json()["role"] == "staff"
        assert client.get("/products", headers=staff_headers).status_code == 200
        assert client.post("/products", json={"name": "Forbidden", "price": 1, "stock_quantity": 1}, headers=staff_headers).status_code == 403
        admin_login = login(client, accounts["admin"])
        assert admin_login.status_code == 200
        admin_headers = {"Authorization": "Bearer " + admin_login.json()["access_token"]}
        assert client.get("/auth/me", headers=admin_headers).json()["role"] == "admin"
        assert client.get("/products", headers=admin_headers).status_code == 200

def test_demo_account_is_read_only(accounts):
    with TestClient(app) as client:
        response = login(client, accounts["demo"])
        assert response.status_code == 200

        token = response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Demo can read data
        assert client.get("/products", headers=headers).status_code == 200
        assert client.get("/orders", headers=headers).status_code == 200

        # Demo cannot create orders
        response = client.post(
            "/orders",
            json={"items": [{"product_id": 1, "quantity": 1}]},
            headers=headers,
        )
        assert response.status_code == 403
        assert response.json()["detail"] == "Demo account is read-only"

        # Demo cannot create products
        response = client.post(
            "/products",
            json={
                "name": "Test Product",
                "price": 10,
                "stock_quantity": 5,
            },
            headers=headers,
        )
        assert response.status_code == 403