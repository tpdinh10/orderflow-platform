
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select

from app.db import SessionLocal
from app.main import app
from app.models import Order, OrderItem, Product


def test_concurrent_cancellation_restores_stock_once():
    with SessionLocal() as db:
        database_name = db.scalar(select(func.current_database()))
        assert database_name == "orderflow_test"

        product = Product(
            name=f"Cancel Test {uuid4().hex[:8]}",
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

        def cancel():
            with TestClient(app) as client:
                return client.post(f"/orders/{order_id}/cancel")

        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(lambda _: cancel(), range(2)))

        assert sorted(r.status_code for r in responses) == [200, 409]

        with SessionLocal() as db:
            product = db.get(Product, product_id)
            order = db.get(Order, order_id)

            assert product is not None
            assert product.stock_quantity == 10
            assert order is not None
            assert order.status == "cancelled"

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
