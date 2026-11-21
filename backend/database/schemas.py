from pydantic import BaseModel, EmailStr, ConfigDict
from decimal import Decimal
from typing import Optional
from datetime import datetime

# Import UserRole from models in the same database folder
from database.models import UserRole


# ----------------- User Schemas -----------------
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


# ----------------- Product Schemas -----------------
class ProductCreate(BaseModel):
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