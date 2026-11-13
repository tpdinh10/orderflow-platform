"""Add users for JWT authentication and role-based authorization."""
from alembic import op
import sqlalchemy as sa
revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.CheckConstraint("role IN ('admin', 'staff')", name="ck_user_role"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

def downgrade():
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
