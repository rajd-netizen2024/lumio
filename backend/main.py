import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional
from decimal import Decimal

from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

# Correct imports based on your database/ folder structure
from database.connection import test_connection, engine, get_db, SessionLocal, Base
from database.models import User, Product, UserRole
from database.schemas import (
    UserLogin,
    UserCreate,
    UserUpdate,
    UserResponse,
    ProductCreate,
    ProductUpdate,
    ProductResponse,
)

# Project root directory (contains index.html, styles.css, public/, assets/)
ROOT_DIR = Path(__file__).resolve().parent.parent

DEFAULT_SAMPLE_PRODUCTS = [
    {
        "name": "Cookware Set (5-Piece Non-Stick)",
        "description": "Premium granite non-stick cookware set including frying pan, kadai, and saucepan.",
        "price": Decimal("1499.00"),
        "original_price": Decimal("2499.00"),
        "category": "Home Essentials",
        "brand": "Prestige",
        "image_url": "https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?w=500&auto=format&fit=crop&q=80",
        "stock_quantity": 25,
        "is_available": True,
    },
    {
        "name": "LED Desk Lamp with Wireless Charger",
        "description": "Adjustable gooseneck lamp with 3 color modes and fast wireless phone charging pad.",
        "price": Decimal("799.00"),
        "original_price": Decimal("1299.00"),
        "category": "Home Essentials",
        "brand": "Lumio Home",
        "image_url": "https://images.unsplash.com/photo-1534349762230-e0cadf78f5da?w=500&auto=format&fit=crop&q=80",
        "stock_quantity": 40,
        "is_available": True,
    },
    {
        "name": "Handcrafted Ceramic Vase",
        "description": "Minimalist ceramic vase ideal for dried florals and modern interior decor.",
        "price": Decimal("499.00"),
        "original_price": Decimal("899.00"),
        "category": "Home Essentials",
        "brand": "ArtisanCraft",
        "image_url": "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=500&auto=format&fit=crop&q=80",
        "stock_quantity": 15,
        "is_available": True,
    },
    {
        "name": "Plush Cotton Bath Towels (Set of 2)",
        "description": "100% Turkish combed cotton towels with ultra-soft absorbency.",
        "price": Decimal("699.00"),
        "original_price": Decimal("999.00"),
        "category": "Home Essentials",
        "brand": "CozyLiving",
        "image_url": "https://images.unsplash.com/photo-1616627547584-bf28cee262db?w=500&auto=format&fit=crop&q=80",
        "stock_quantity": 30,
        "is_available": True,
    },
    {
        "name": "Foldable Linen Storage Box",
        "description": "Durable fabric wardrobe organizer with lid and reinforced carry handles.",
        "price": Decimal("399.00"),
        "original_price": Decimal("599.00"),
        "category": "Home Essentials",
        "brand": "OrganizeIt",
        "image_url": "https://images.unsplash.com/photo-1584992236310-6edddc08acff?w=500&auto=format&fit=crop&q=80",
        "stock_quantity": 50,
        "is_available": True,
    },
    {
        "name": "Aromatherapy Essential Oil Diffuser",
        "description": "Ultrasonic cool mist humidifier diffuser with 7 ambient LED light colors.",
        "price": Decimal("899.00"),
        "original_price": Decimal("1499.00"),
        "category": "Home Essentials",
        "brand": "AromaPure",
        "image_url": "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=500&auto=format&fit=crop&q=80",
        "stock_quantity": 20,
        "is_available": True,
    },
    {
        "name": "Organic Cold-Pressed Olive Oil (1L)",
        "description": "Pure extra virgin olive oil extracted from fresh Mediterranean olives.",
        "price": Decimal("850.00"),
        "original_price": Decimal("1100.00"),
        "category": "Groceries",
        "brand": "GreenNature",
        "image_url": "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500&auto=format&fit=crop&q=80",
        "stock_quantity": 35,
        "is_available": True,
    },
    {
        "name": "Artisan Dark Roast Coffee Beans (500g)",
        "description": "100% Arabica single-origin whole bean coffee with rich chocolate notes.",
        "price": Decimal("540.00"),
        "original_price": Decimal("650.00"),
        "category": "Groceries",
        "brand": "RoastMaster",
        "image_url": "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=500&auto=format&fit=crop&q=80",
        "stock_quantity": 45,
        "is_available": True,
    },
    {
        "name": "Hardcover Executive Notebook (Dotted)",
        "description": "160 pages of 120gsm bleed-proof paper with elastic band and pen holder.",
        "price": Decimal("349.00"),
        "original_price": Decimal("499.00"),
        "category": "Stationery Items",
        "brand": "Papercraft",
        "image_url": "https://images.unsplash.com/photo-1544816155-12df9643f363?w=500&auto=format&fit=crop&q=80",
        "stock_quantity": 60,
        "is_available": True,
    },
    {
        "name": "Orthopedic Memory Foam Pet Bed",
        "description": "Waterproof and washable orthopedic bed designed for dogs and cats.",
        "price": Decimal("1299.00"),
        "original_price": Decimal("1899.00"),
        "category": "Pet Supplies",
        "brand": "PawComfort",
        "image_url": "https://images.unsplash.com/photo-1541599540903-216a46ca1dc0?w=500&auto=format&fit=crop&q=80",
        "stock_quantity": 18,
        "is_available": True,
    },
    {
        "name": "STEM Robotic Building Kit",
        "description": "Educational solar and battery powered robotic building kit for kids aged 8+.",
        "price": Decimal("1199.00"),
        "original_price": Decimal("1699.00"),
        "category": "Toys",
        "brand": "TechPlay",
        "image_url": "https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=500&auto=format&fit=crop&q=80",
        "stock_quantity": 22,
        "is_available": True,
    },
    {
        "name": "Matcha Green Tea Ceremonial Grade (100g)",
        "description": "First-harvest ceremonial grade Japanese green tea powder rich in antioxidants.",
        "price": Decimal("750.00"),
        "original_price": Decimal("950.00"),
        "category": "Food and Drinks",
        "brand": "ZenLeaf",
        "image_url": "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500&auto=format&fit=crop&q=80",
        "stock_quantity": 28,
        "is_available": True,
    },
]


def seed_products_if_needed():
    db = SessionLocal()
    try:
        current_count = db.query(Product).count()
        if current_count < 6:
            print(f"Seeding demo products (current count: {current_count})...")
            for item in DEFAULT_SAMPLE_PRODUCTS:
                exists = db.query(Product).filter(Product.name == item["name"]).first()
                if not exists:
                    p = Product(**item)
                    db.add(p)
            db.commit()
            print("Successfully seeded demo products!")
    except Exception as e:
        db.rollback()
        print(f"Error during initial product seeding: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting LUMIO backend...")
    test_connection()
    # Creates 'users' and 'products' tables in Aiven PostgreSQL
    Base.metadata.create_all(bind=engine)
    print("Aiven PostgreSQL tables verified/created!")

    seed_products_if_needed()

    yield

    print("Shutting down LUMIO backend...")


app = FastAPI(title="LUMIO Backend", lifespan=lifespan)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# USER CRUD & AUTH ENDPOINTS
# ==========================================

@app.post("/users/login", response_model=UserResponse, tags=["Users"])
def login_user(login_in: UserLogin, db: Session = Depends(get_db)):
    """Authenticate a user using email and password."""
    user = db.query(User).filter(User.email == login_in.email).first()
    if not user or user.password_hash != login_in.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive. Please contact support.",
        )
    return user


@app.post("/users/", response_model=UserResponse, status_code=status.HTTP_201_CREATED, tags=["Users"])
def create_user(user_in: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user_in.email).first():
        raise HTTPException(status_code=400, detail="Email is already registered")

    new_user = User(
        full_name=user_in.full_name,
        email=user_in.email,
        phone=user_in.phone,
        password_hash=user_in.password,
        role=user_in.role.value if hasattr(user_in.role, "value") else str(user_in.role),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@app.get("/users/", response_model=List[UserResponse], tags=["Users"])
def get_all_users(
    role: Optional[UserRole] = Query(None, description="Filter by customer, retailer, or admin"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if role:
        role_val = role.value if hasattr(role, "value") else str(role)
        query = query.filter(User.role == role_val)
    return query.offset(skip).limit(limit).all()


@app.get("/users/{user_id}", response_model=UserResponse, tags=["Users"])
def get_user_by_id(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.put("/users/{user_id}", response_model=UserResponse, tags=["Users"])
def update_user(user_id: int, user_update: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = user_update.model_dump(exclude_unset=True)
    if "role" in update_data and update_data["role"]:
        val = update_data["role"]
        update_data["role"] = val.value if hasattr(val, "value") else str(val)

    for key, value in update_data.items():
        setattr(user, key, value)

    db.commit()
    db.refresh(user)
    return user


@app.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Users"])
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()
    return None


# ==========================================
# PRODUCT CRUD & SEED ENDPOINTS
# ==========================================

@app.post("/products/seed", tags=["Products"])
def seed_products_endpoint(db: Session = Depends(get_db)):
    """Seed the database with sample products for all LUMIO categories."""
    added = 0
    for item in DEFAULT_SAMPLE_PRODUCTS:
        exists = db.query(Product).filter(Product.name == item["name"]).first()
        if not exists:
            db.add(Product(**item))
            added += 1
    db.commit()
    total = db.query(Product).count()
    return {"message": f"Added {added} products", "total_products": total}


@app.post("/products/", response_model=ProductResponse, status_code=status.HTTP_201_CREATED, tags=["Products"])
def create_product(product_in: ProductCreate, db: Session = Depends(get_db)):
    new_product = Product(**product_in.model_dump())
    db.add(new_product)
    db.commit()
    db.refresh(new_product)
    return new_product


@app.get("/products/", response_model=List[ProductResponse], tags=["Products"])
def get_all_products(
    category: Optional[str] = Query(None, description="Filter by category"),
    brand: Optional[str] = Query(None, description="Filter by brand"),
    is_available: Optional[bool] = Query(None, description="Filter by availability"),
    search: Optional[str] = Query(None, description="Search by name or description"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    query = db.query(Product)
    if category:
        # Case-insensitive category match
        query = query.filter(Product.category.ilike(f"%{category}%"))
    if brand:
        query = query.filter(Product.brand.ilike(f"%{brand}%"))
    if is_available is not None:
        query = query.filter(Product.is_available == is_available)
    if search:
        query = query.filter(
            (Product.name.ilike(f"%{search}%")) | (Product.description.ilike(f"%{search}%"))
        )
    return query.offset(skip).limit(limit).all()


@app.get("/products/{product_id}", response_model=ProductResponse, tags=["Products"])
def get_product_by_id(product_id: int, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@app.put("/products/{product_id}", response_model=ProductResponse, tags=["Products"])
def update_product(product_id: int, product_update: ProductUpdate, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    update_data = product_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(product, key, value)

    db.commit()
    db.refresh(product)
    return product


@app.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Products"])
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    db.delete(product)
    db.commit()
    return None


# ==========================================
# STATIC FILES SERVING (OPTIONAL DUAL-SERVE)
# ==========================================
assets_dir = ROOT_DIR / "assets"
public_dir = ROOT_DIR / "public"

if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

if public_dir.exists():
    app.mount("/public", StaticFiles(directory=str(public_dir)), name="public")


@app.get("/styles.css")
def get_root_css():
    css_path = ROOT_DIR / "styles.css"
    if css_path.exists():
        return FileResponse(css_path, media_type="text/css")
    raise HTTPException(status_code=404, detail="styles.css not found")


@app.get("/")
def serve_index_or_api_status():
    index_file = ROOT_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "LUMIO backend is running on Aiven PostgreSQL!"}
