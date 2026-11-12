from typing import Annotated
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from .config import settings
from .db import get_db
from .models import Order, OrderItem, Product
from .schemas import InventoryChange, OrderCreate, OrderOut, ProductCreate, ProductOut, ProductPatch

app = FastAPI(title="OrderFlow API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins.split(","), allow_credentials=False, allow_methods=["*"], allow_headers=["*"])
DB = Annotated[Session, Depends(get_db)]

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/products", response_model=list[ProductOut])
def list_products(db: DB):
    return db.scalars(select(Product).order_by(Product.id)).all()

@app.post("/products", response_model=ProductOut, status_code=201)
def create_product(payload: ProductCreate, db: DB):
    product = Product(**payload.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product

@app.get("/products/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: DB):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(404, "Product not found")
    return product

@app.patch("/products/{product_id}", response_model=ProductOut)
def patch_product(product_id: int, payload: ProductPatch, db: DB):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(404, "Product not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is None:
            raise HTTPException(422, f"{key} cannot be null")
        setattr(product, key, value)
    db.commit()
    db.refresh(product)
    return product

@app.delete("/products/{product_id}", status_code=204)
def delete_product(product_id: int, db: DB):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(404, "Product not found")
    if db.scalar(select(OrderItem.id).where(OrderItem.product_id == product_id).limit(1)) is not None:
        raise HTTPException(409, "Product is referenced by an order")
    db.delete(product)
    db.commit()

@app.patch("/products/{product_id}/inventory", response_model=ProductOut)
def adjust_inventory(product_id: int, payload: InventoryChange, db: DB):
    try:
        product = db.scalars(update(Product).where(Product.id == product_id, Product.stock_quantity + payload.quantity_change >= 0).values(stock_quantity=Product.stock_quantity + payload.quantity_change).returning(Product)).one_or_none()
        if product is None:
            if db.get(Product, product_id) is None:
                raise HTTPException(404, "Product not found")
            raise HTTPException(409, "Insufficient inventory")
        db.commit()
        db.refresh(product)
        return product
    except Exception:
        db.rollback()
        raise

@app.get("/orders", response_model=list[OrderOut])
def list_orders(db: DB):
    return db.scalars(select(Order).order_by(Order.id.desc())).all()

@app.get("/orders/{order_id}", response_model=OrderOut)
def get_order(order_id: int, db: DB):
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(404, "Order not found")
    return order

@app.post("/orders", response_model=OrderOut, status_code=201)
def create_order(payload: OrderCreate, db: DB):
    # Consolidate duplicate product IDs; deterministic order reduces deadlock risk.
    quantities = {}
    for item in payload.items:
        quantities[item.product_id] = quantities.get(item.product_id, 0) + item.quantity
    try:
        order = Order(status="confirmed")
        db.add(order)
        db.flush()
        for product_id, quantity in sorted(quantities.items()):
            product = db.scalars(update(Product).where(Product.id == product_id, Product.stock_quantity >= quantity).values(stock_quantity=Product.stock_quantity - quantity).returning(Product)).one_or_none()
            if product is None:
                if db.get(Product, product_id) is None:
                    raise HTTPException(404, f"Product {product_id} not found")
                raise HTTPException(409, f"Insufficient inventory for product {product_id}")
            db.add(OrderItem(order_id=order.id, product_id=product_id, quantity=quantity, unit_price=product.price))
        db.commit()
        return db.get(Order, order.id)
    except Exception:
        db.rollback()
        raise

@app.post("/orders/{order_id}/cancel", response_model=OrderOut)
def cancel_order(order_id: int, db: DB):
    try:
        # Lock order first so simultaneous cancellations cannot restore twice.
        order = db.scalar(select(Order).where(Order.id == order_id).with_for_update())
        if order is None:
            raise HTTPException(404, "Order not found")
        if order.status == "cancelled":
            raise HTTPException(409, "Order already cancelled")
        for item in sorted(order.items, key=lambda i: i.product_id):
            db.execute(update(Product).where(Product.id == item.product_id).values(stock_quantity=Product.stock_quantity + item.quantity))
        order.status = "cancelled"
        db.commit()
        return db.get(Order, order_id)
    except Exception:
        db.rollback()
        raise
