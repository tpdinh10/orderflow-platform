from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field

class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    price: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    stock_quantity: int = Field(ge=0)

class ProductPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    price: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)

class ProductOut(ProductCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)

class InventoryChange(BaseModel):
    quantity_change: int

class OrderItemCreate(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0)

class OrderCreate(BaseModel):
    items: list[OrderItemCreate] = Field(min_length=1)

class OrderItemOut(BaseModel):
    id: int
    product_id: int
    quantity: int
    unit_price: Decimal
    model_config = ConfigDict(from_attributes=True)

class OrderOut(BaseModel):
    id: int
    status: str
    created_at: datetime
    items: list[OrderItemOut]
    model_config = ConfigDict(from_attributes=True)
