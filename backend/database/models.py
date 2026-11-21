from datetime import datetime
from typing import Optional
from decimal import Decimal
import enum
from sqlalchemy import String, Integer, Boolean, DateTime, Text, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column

# Import Base from connection.py in the same database folder
from database.connection import Base


class UserRole(str, enum.Enum):
    CUSTOMER = "customer"
    RETAILER = "retailer"
    ADMIN = "admin"


# ==========================================
# USERS TABLE
# ==========================================
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(25), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default=UserRole.CUSTOMER.value, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


# ==========================================
# PRODUCTS TABLE
# ==========================================
class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), index=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    original_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    category: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    brand: Mapped[Optional[str]] = mapped_column(String(100), index=True, nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())