from datetime import datetime
from typing import Optional, List
from decimal import Decimal
import enum
from sqlalchemy import String, Integer, Boolean, DateTime, Text, Numeric, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

# Import Base from connection.py in the same database folder
from database.connection import Base


class UserRole(str, enum.Enum):
    CUSTOMER = "customer"
    RETAILER = "retailer"
    ADMIN = "admin"


class OrderStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


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

    # Relationships
    retailers: Mapped[List["Retailer"]] = relationship("Retailer", back_populates="user", cascade="all, delete-orphan")
    addresses: Mapped[List["Address"]] = relationship("Address", back_populates="user", cascade="all, delete-orphan")
    carts: Mapped[List["Cart"]] = relationship("Cart", back_populates="user", cascade="all, delete-orphan")
    orders: Mapped[List["Order"]] = relationship("Order", back_populates="user", cascade="all, delete-orphan")


# ==========================================
# RETAILERS TABLE
# ==========================================
class Retailer(Base):
    __tablename__ = "retailers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    store_name: Mapped[str] = mapped_column(String(200), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    contact: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="retailers")
    products: Mapped[List["Product"]] = relationship("Product", back_populates="retailer")


# ==========================================
# ADDRESSES TABLE
# ==========================================
class Address(Base):
    __tablename__ = "addresses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    street: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    pincode: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="addresses")
    orders: Mapped[List["Order"]] = relationship("Order", back_populates="address")


# ==========================================
# PRODUCTS TABLE
# ==========================================
class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    retailer_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("retailers.id", ondelete="SET NULL"), nullable=True)
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

    retailer: Mapped[Optional["Retailer"]] = relationship("Retailer", back_populates="products")
    inventory: Mapped[Optional["Inventory"]] = relationship("Inventory", back_populates="product", uselist=False, cascade="all, delete-orphan")
    cart_items: Mapped[List["CartItem"]] = relationship("CartItem", back_populates="product")
    order_items: Mapped[List["OrderItem"]] = relationship("OrderItem", back_populates="product")


# ==========================================
# INVENTORY TABLE
# ==========================================
class Inventory(Base):
    __tablename__ = "inventory"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, unique=True)
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reserved_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    product: Mapped["Product"] = relationship("Product", back_populates="inventory")


# ==========================================
# CARTS TABLE
# ==========================================
class Cart(Base):
    __tablename__ = "carts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship("User", back_populates="carts")
    items: Mapped[List["CartItem"]] = relationship("CartItem", back_populates="cart", cascade="all, delete-orphan", order_by="CartItem.id")


# ==========================================
# CART ITEMS TABLE
# ==========================================
class CartItem(Base):
    __tablename__ = "cart_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cart_id: Mapped[int] = mapped_column(Integer, ForeignKey("carts.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    cart: Mapped["Cart"] = relationship("Cart", back_populates="items")
    product: Mapped["Product"] = relationship("Product", back_populates="cart_items")


# ==========================================
# ORDERS TABLE
# ==========================================
class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    address_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("addresses.id", ondelete="SET NULL"), nullable=True)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(30), default=OrderStatus.PENDING.value, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship("User", back_populates="orders")
    address: Mapped[Optional["Address"]] = relationship("Address", back_populates="orders")
    items: Mapped[List["OrderItem"]] = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan", order_by="OrderItem.id")


# ==========================================
# ORDER ITEMS TABLE
# ==========================================
class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    order: Mapped["Order"] = relationship("Order", back_populates="items")
    product: Mapped[Optional["Product"]] = relationship("Product", back_populates="order_items")