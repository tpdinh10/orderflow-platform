from decimal import Decimal
from fastapi.testclient import TestClient
from app.main import app
from uuid import uuid4
from sqlalchemy import delete, func, select
from app.db import SessionLocal
from app.models import Product, Order, OrderItem

def test_health():
    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "ok"}

def test_order_validation():
    with TestClient(app) as client:
        response = client.post("/orders", json={"items": []})
        assert response.status_code == 422

def test_create_product():
    with SessionLocal() as db:
        assert db.scalar(select(func.current_database())) == "orderflow_test"

    product_id = None

    try:
        with TestClient(app) as client:
            response = client.post(
                "/products",
                json={
                    "name": f"Test Mouse {uuid4().hex[:8]}",
                    "price": 29.99,
                    "stock_quantity": 10,
                },
            )

        assert response.status_code == 201

        data = response.json()
        product_id = data["id"]

        assert data["price"] == "29.99"
        assert data["stock_quantity"] == 10

    finally:
        if product_id is not None:
            with SessionLocal() as db:
                db.execute(
                    delete(Product).where(Product.id == product_id)
                )
                db.commit()


def test_get_product():
    with SessionLocal() as db:
        assert db.scalar(select(func.current_database())) == "orderflow_test"

        product = Product(
            name=f"GET Test {uuid4().hex[:8]}",
            price=19.99,
            stock_quantity=5,
        )
        db.add(product)
        db.commit()
        db.refresh(product)
        product_id = product.id

    try:
        with TestClient(app) as client:
            response = client.get(f"/products/{product_id}")

        assert response.status_code == 200

        data = response.json()
        assert data["id"] == product_id
        assert data["price"] == "19.99"
        assert data["stock_quantity"] == 5

    finally:
        with SessionLocal() as db:
            db.execute(
                delete(Product).where(Product.id == product_id)
            )
            db.commit()


def test_update_product():
    with SessionLocal() as db:
        assert db.scalar(select(func.current_database())) == "orderflow_test"

        product = Product(
            name=f"PATCH Test {uuid4().hex[:8]}",
            price=19.99,
            stock_quantity=10,
        )
        db.add(product)
        db.commit()
        db.refresh(product)
        product_id = product.id

    try:
        with TestClient(app) as client:
            response = client.patch(
                f"/products/{product_id}",
                json={"price": 24.99},
            )

        assert response.status_code == 200
        assert response.json()["price"] == "24.99"

        with SessionLocal() as db:
            updated_product = db.get(Product, product_id)
            assert updated_product.price == Decimal("24.99")
            assert updated_product.stock_quantity == 10

    finally:
        with SessionLocal() as db:
            db.execute(
                delete(Product).where(Product.id == product_id)
            )
            db.commit()

def test_delete_product():
    with SessionLocal() as db:
        assert db.scalar(select(func.current_database())) == "orderflow_test"

        product = Product(
            name=f"DELETE Test {uuid4().hex[:8]}",
            price=15.00,
            stock_quantity=5,
        )
        db.add(product)
        db.commit()
        db.refresh(product)
        product_id = product.id

    try:
        with TestClient(app) as client:
            response = client.delete(f"/products/{product_id}")
            assert response.status_code == 204

            response = client.get(f"/products/{product_id}")
            assert response.status_code == 404

            response = client.delete(f"/products/{product_id}")
            assert response.status_code == 404

        with SessionLocal() as db:
            assert db.get(Product, product_id) is None

    finally:
        with SessionLocal() as db:
            db.execute(
                delete(Product).where(Product.id == product_id)
            )
            db.commit()

def test_inventory_update():
    with SessionLocal() as db:
        assert db.scalar(select(func.current_database())) == "orderflow_test"

        product = Product(
            name=f"Inventory Test {uuid4().hex[:8]}",
            price=20.00,
            stock_quantity=10,
        )
        db.add(product)
        db.commit()
        db.refresh(product)
        product_id = product.id

    try:
        with TestClient(app) as client:
            response = client.patch(
                f"/products/{product_id}/inventory",
                json={"quantity_change": -4},
            )

            assert response.status_code == 200
            assert response.json()["stock_quantity"] == 6

            response = client.patch(
                f"/products/{product_id}/inventory",
                json={"quantity_change": -10},
            )

            assert response.status_code == 409

        with SessionLocal() as db:
            product = db.get(Product, product_id)
            assert product.stock_quantity == 6

    finally:
        with SessionLocal() as db:
            db.execute(
                delete(Product).where(Product.id == product_id)
            )
            db.commit()

def test_order_lifecycle():
    with SessionLocal() as db:
        assert db.scalar(select(func.current_database())) == "orderflow_test"

        product = Product(
            name=f"Order Test {uuid4().hex[:8]}",
            price=25.00,
            stock_quantity=10,
        )
        db.add(product)
        db.commit()
        db.refresh(product)
        product_id = product.id

    order_id = None

    try:
        with TestClient(app) as client:
            # Create order
            response = client.post(
                "/orders",
                json={
                    "items": [
                        {"product_id": product_id, "quantity": 3}
                    ]
                },
            )
            assert response.status_code == 201

            order_id = response.json()["id"]
            assert response.json()["status"] == "confirmed"

            # Check inventory after order
            response = client.get(f"/products/{product_id}")
            assert response.json()["stock_quantity"] == 7

            # Get order
            response = client.get(f"/orders/{order_id}")
            assert response.status_code == 200
            assert response.json()["status"] == "confirmed"

            # Cancel order
            response = client.post(f"/orders/{order_id}/cancel")
            assert response.status_code == 200
            assert response.json()["status"] == "cancelled"

            # Verify inventory restored
            response = client.get(f"/products/{product_id}")
            assert response.json()["stock_quantity"] == 10

    finally:
        with SessionLocal() as db:
            if order_id is not None:
                db.execute(
                    delete(OrderItem).where(OrderItem.order_id == order_id)
                )
                db.execute(
                    delete(Order).where(Order.id == order_id)
                )

            db.execute(
                delete(Product).where(Product.id == product_id)
            )
            db.commit()
