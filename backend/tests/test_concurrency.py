
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select

from app.db import SessionLocal
from app.main import app
from app.models import Order, OrderItem, Product


def test_concurrent_orders_prevent_overselling():
    product_id = None

    # Safety: never run this test against the application database.
    with SessionLocal() as db:
        database_name = db.execute(
            select(func.current_database())
        ).scalar_one()
        assert database_name == "orderflow_test"

        product = Product(
            name=f"Concurrency Test {uuid4().hex[:8]}",
            price=25.00,
            stock_quantity=8,
        )
        db.add(product)
        db.commit()
        db.refresh(product)
        product_id = product.id

    try:
        def place_order():
            with TestClient(app) as client:
                return client.post(
                    "/orders",
                    json={
                        "items": [
                            {"product_id": product_id, "quantity": 6}
                        ]
                    },
                )

        # Two customers place orders concurrently.
        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(
                lambda _: place_order(), range(2)
            ))

        status_codes = sorted(r.status_code for r in responses)
        assert status_codes == [201, 409]

        with SessionLocal() as db:
            product = db.get(Product, product_id)
            assert product is not None
            assert product.stock_quantity == 2

            order_items = db.scalars(
                select(OrderItem).where(
                    OrderItem.product_id == product_id
                )
            ).all()

            assert len(order_items) == 1
            assert order_items[0].quantity == 6

    finally:
        # Remove only records created for this test product.
        if product_id is not None:
            with SessionLocal() as db:
                order_ids = db.scalars(
                    select(OrderItem.order_id).where(
                        OrderItem.product_id == product_id
                    )
                ).all()

                db.execute(
                    delete(OrderItem).where(
                        OrderItem.product_id == product_id
                    )
                )

                if order_ids:
                    db.execute(
                        delete(Order).where(
                            Order.id.in_(order_ids)
                        )
                    )

                db.execute(
                    delete(Product).where(Product.id == product_id)
                )
                db.commit()
