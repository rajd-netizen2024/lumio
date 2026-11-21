from pydantic import BaseModel, EmailStr, ConfigDict
from decimal import Decimal
from typing import Optional, List
from datetime import datetime

from database.models import UserRole, OrderStatus


# ==========================================================
# USER SCHEMAS
# ==========================================================
class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    phone: Optional[str] = None
    password: str
    role: UserRole = UserRole.CUSTOMER


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    phone: Optional[str]
    role: str
    created_at: datetime
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# RETAILER SCHEMAS
# ==========================================================
class RetailerCreate(BaseModel):
    user_id: int
    store_name: str
    address: str
    contact: str


class RetailerUpdate(BaseModel):
    store_name: Optional[str] = None
    address: Optional[str] = None
    contact: Optional[str] = None


class RetailerResponse(BaseModel):
    id: int
    user_id: int
    store_name: str
    address: str
    contact: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# ADDRESS SCHEMAS
# ==========================================================
class AddressCreate(BaseModel):
    user_id: int
    street: str
    city: str
    pincode: str


class AddressUpdate(BaseModel):
    street: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None


class AddressResponse(BaseModel):
    id: int
    user_id: int
    street: str
    city: str
    pincode: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# PRODUCT SCHEMAS
# ==========================================================
class ProductCreate(BaseModel):
    retailer_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    price: Decimal
    original_price: Optional[Decimal] = None
    category: str
    brand: Optional[str] = None
    image_url: Optional[str] = None
    stock_quantity: int = 0
    is_available: bool = True


class ProductUpdate(BaseModel):
    retailer_id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[Decimal] = None
    original_price: Optional[Decimal] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    image_url: Optional[str] = None
    stock_quantity: Optional[int] = None
    is_available: Optional[bool] = None


class ProductResponse(BaseModel):
    id: int
    retailer_id: Optional[int]
    name: str
    description: Optional[str]
    price: Decimal
    original_price: Optional[Decimal]
    category: str
    brand: Optional[str]
    image_url: Optional[str]
    stock_quantity: int
    is_available: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# INVENTORY SCHEMAS
# ==========================================================
class InventoryCreate(BaseModel):
    product_id: int
    stock_quantity: int = 0
    reserved_quantity: int = 0


class InventoryUpdate(BaseModel):
    stock_quantity: Optional[int] = None
    reserved_quantity: Optional[int] = None


class InventoryResponse(BaseModel):
    id: int
    product_id: int
    stock_quantity: int
    reserved_quantity: int
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# CART SCHEMAS
# ==========================================================
class CartItemAdd(BaseModel):
    product_id: int
    quantity: int = 1


class CartItemUpdate(BaseModel):
    quantity: int


class CartItemResponse(BaseModel):
    id: int
    cart_id: int
    product_id: int
    quantity: int
    created_at: datetime
    product: Optional[ProductResponse] = None

    model_config = ConfigDict(from_attributes=True)


class CartResponse(BaseModel):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    items: List[CartItemResponse] = []

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# ORDER SCHEMAS
# ==========================================================
class OrderCreate(BaseModel):
    user_id: int
    address_id: Optional[int] = None


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class OrderItemResponse(BaseModel):
    id: int
    order_id: int
    product_id: Optional[int]
    quantity: int
    unit_price: Decimal
    product: Optional[ProductResponse] = None

    model_config = ConfigDict(from_attributes=True)


class OrderResponse(BaseModel):
    id: int
    user_id: int
    address_id: Optional[int]
    total_amount: Decimal
    status: str
    created_at: datetime
    updated_at: datetime
    items: List[OrderItemResponse] = []

    model_config = ConfigDict(from_attributes=True)