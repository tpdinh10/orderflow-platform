"""Initial OrderFlow schema."""
from alembic import op
import sqlalchemy as sa
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("products", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("name", sa.String(200), nullable=False), sa.Column("price", sa.Numeric(10,2), nullable=False), sa.Column("stock_quantity", sa.Integer(), nullable=False), sa.CheckConstraint("price >= 0", name="ck_product_price"), sa.CheckConstraint("stock_quantity >= 0", name="ck_product_stock"))
    op.create_table("orders", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("status", sa.String(20), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.CheckConstraint("status IN ('confirmed', 'cancelled')", name="ck_order_status"))
    op.create_table("order_items", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=False), sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=False), sa.Column("quantity", sa.Integer(), nullable=False), sa.Column("unit_price", sa.Numeric(10,2), nullable=False), sa.CheckConstraint("quantity > 0", name="ck_item_quantity"), sa.CheckConstraint("unit_price >= 0", name="ck_item_price"))

def downgrade():
    op.drop_table("order_items")
    op.drop_table("orders")
    op.drop_table("products")
