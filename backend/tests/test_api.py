from fastapi.testclient import TestClient
from app.main import app

def test_health():
    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "ok"}

def test_order_validation():
    with TestClient(app) as client:
        response = client.post("/orders", json={"items": []})
        assert response.status_code == 422
