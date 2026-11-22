import logging
logger = logging.getLogger(__name__)
from kafka_service.producer import send_order_event
import math
import os
import traceback
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional
from decimal import Decimal, ROUND_HALF_UP

from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text, or_, inspect as sa_inspect
from services.search import (
    search_products_opensearch,
    index_product_document,
    bulk_index_products,
    delete_product_document,
)

# Database, Model & Schema imports
from database.connection import test_connection, engine, get_db, SessionLocal, Base
from database.models import (
    User, Retailer, Address, Product, Inventory,
    Cart, CartItem, Order, OrderItem,
    UserRole, OrderStatus,
)
from database.schemas import (
    UserLogin,
    UserCreate,
    UserUpdate,
    UserResponse,
    RetailerCreate,
    RetailerUpdate,
    RetailerResponse,
    AddressCreate,
    AddressUpdate,
    AddressResponse,
    ProductCreate,
    ProductUpdate,
    ProductResponse,
    InventoryCreate,
    InventoryUpdate,
    InventoryResponse,
    CartItemAdd,
    CartItemUpdate,
    CartResponse,
    OrderCreate,
    OrderStatusUpdate,
    OrderResponse,
    NearestRetailersResponse,
)

# Project root directory
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


def _product_to_search_doc(product: Product) -> dict:
    return {
        "id": product.id,
        "retailer_id": product.retailer_id,
        "name": product.name,
        "description": product.description,
        "price": float(product.price) if product.price is not None else None,
        "original_price": float(product.original_price) if product.original_price is not None else None,
        "category": product.category,
        "brand": product.brand,
        "image_url": product.image_url,
        "stock_quantity": product.stock_quantity,
        "is_available": bool(product.is_available),
        "created_at": product.created_at.isoformat() if product.created_at else None,
        "updated_at": product.updated_at.isoformat() if product.updated_at else None,
    }


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

        all_products = db.query(Product).all()
        if all_products:
            indexed_count = bulk_index_products([_product_to_search_doc(p) for p in all_products])
            print(f"Synced {indexed_count}/{len(all_products)} products to OpenSearch.")
    except Exception as e:
        db.rollback()
        print(f"Error during initial product seeding: {e}")
    finally:
        db.close()


def add_missing_columns():
    """
    Tables that existed before the models gained new columns are not altered by create_all().
    Compare every model table with the live database and ADD (never alter/drop) missing columns.
    """
    try:
        insp = sa_inspect(engine)
        existing_tables = set(insp.get_table_names())
        with engine.begin() as conn:
            conn.execute(text("SET LOCAL lock_timeout = '5s'"))
            for table in Base.metadata.sorted_tables:
                if table.name not in existing_tables:
                    continue
                have = {c["name"] for c in insp.get_columns(table.name)}
                for col in table.columns:
                    if col.name in have:
                        continue
                    coltype = col.type.compile(dialect=engine.dialect)
                    default_sql = None
                    if col.server_default is not None:
                        arg = getattr(col.server_default, "arg", None)
                        if hasattr(arg, "compile"):
                            default_sql = str(arg.compile(dialect=engine.dialect))
                        elif arg is not None:
                            default_sql = "'" + str(arg).replace("'", "''") + "'"
                    elif col.default is not None and getattr(col.default, "is_scalar", False):
                        v = col.default.arg
                        if isinstance(v, bool):
                            default_sql = "TRUE" if v else "FALSE"
                        elif isinstance(v, (int, float)):
                            default_sql = str(v)
                        else:
                            default_sql = "'" + str(v).replace("'", "''") + "'"
                    ddl = f'ALTER TABLE "{table.name}" ADD COLUMN IF NOT EXISTS "{col.name}" {coltype}'
                    if default_sql is not None:
                        ddl += f" DEFAULT {default_sql}"
                        if not col.nullable:
                            ddl += " NOT NULL"
                    conn.execute(text(ddl))
                    print(f"Added missing column: {table.name}.{col.name}")
    except Exception as e:
        print(f"WARNING: add_missing_columns skipped ({type(e).__name__}): {e}")


def migrate_inventory_per_retailer():
    """
    `inventory` used to hold ONE row per product (UNIQUE product_id). It now holds one row per
    (retailer, product) = what each physical store has on its shelves. Existing databases still
    carry the old UNIQUE(product_id), which would stop a second store from stocking the same
    product, so drop it and add UNIQUE(retailer_id, product_id) instead.
    """
    try:
        insp = sa_inspect(engine)
        if "inventory" not in insp.get_table_names():
            return
        with engine.begin() as conn:
            conn.execute(text("SET LOCAL lock_timeout = '5s'"))
            for uc in insp.get_unique_constraints("inventory"):
                if list(uc.get("column_names") or []) == ["product_id"] and uc.get("name"):
                    conn.execute(text(f'ALTER TABLE inventory DROP CONSTRAINT IF EXISTS "{uc["name"]}"'))
                    print(f"Dropped old unique constraint inventory.{uc['name']} (product_id)")
            for ix in insp.get_indexes("inventory"):
                if (ix.get("unique") and list(ix.get("column_names") or []) == ["product_id"]
                        and not ix.get("duplicates_constraint") and ix.get("name")):
                    conn.execute(text(f'DROP INDEX IF EXISTS "{ix["name"]}"'))
                    print(f"Dropped old unique index {ix['name']} (product_id)")
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_retailer_product "
                "ON inventory (retailer_id, product_id)"
            ))
    except Exception as e:
        print(f"WARNING: inventory migration skipped ({type(e).__name__}): {e}")


def reindex_products(products) -> None:
    """Keep the OpenSearch copy of stock/availability in step with PostgreSQL (best effort)."""
    for p in products:
        try:
            index_product_document(_product_to_search_doc(p))
        except Exception as e:
            print(f"WARNING: could not re-index product {getattr(p, 'id', '?')}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Starting LUMIO backend... (main.py build v6: cart+orders+health+store-stock) file={__file__}")
    test_connection()

    # 1. Verify / Create all PostgreSQL tables
    Base.metadata.create_all(bind=engine)

    # 2. Add 'retailer_id' column if missing on existing table.
    #    ALTER TABLE needs a lock on `products`; if another session is holding one (e.g. a
    #    stale connection from a crashed run) it would wait forever and the whole server would
    #    hang at startup. SET LOCAL lock_timeout makes it give up after 5s instead.
    print("Checking products.retailer_id column...")
    try:
        with engine.connect() as conn:
            conn.execute(text("SET LOCAL lock_timeout = '5s'"))
            conn.execute(text("""
                ALTER TABLE products
                ADD COLUMN IF NOT EXISTS retailer_id INTEGER
                REFERENCES retailers(id) ON DELETE SET NULL;
            """))
            conn.commit()
    except Exception as e:
        print(f"WARNING: skipped retailer_id column check ({type(e).__name__}): {e}")

    add_missing_columns()            # new model columns on tables that already exist
    migrate_inventory_per_retailer() # inventory: one row per (retailer, product)

    print("Aiven PostgreSQL tables verified/created!")

    seed_products_if_needed()

    yield

    print("Shutting down LUMIO backend...")


app = FastAPI(title="LUMIO Backend", lifespan=lifespan)

# CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "https://lumio-wl42.vercel.app/"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Unhandled errors normally come back WITHOUT CORS headers, so the browser reports them as a
# generic "failed to fetch". Return a JSON 500 with CORS headers so the real cause is visible.
# (Dev convenience: remove the exception text before going to production.)
@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": f"Server error: {type(exc).__name__}: {exc}"},
        headers={"Access-Control-Allow-Origin": "*"},
    )


# ==========================================
# 0. HEALTH CHECKS (for debugging hangs)
# ==========================================
@app.get("/health", tags=["Health"])
def health():
    """Does NOT touch the database: if this answers, the web server itself is fine."""
    return {"status": "ok"}


@app.get("/health/db", tags=["Health"])
def health_db(db: Session = Depends(get_db)):
    """Touches the database: reports reachability and how many connections are open."""
    db.execute(text("SET LOCAL statement_timeout = '5s'"))
    one = db.execute(text("SELECT 1")).scalar()
    conns = db.execute(
        text("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()")
    ).scalar()
    return {"status": "ok", "select_1": one, "open_connections_to_this_db": conns}


# ==========================================
# 1. USER & AUTH ENDPOINTS
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
# 2. RETAILER ENDPOINTS
# ==========================================

@app.post("/retailers/", response_model=RetailerResponse, status_code=status.HTTP_201_CREATED, tags=["Retailers"])
def create_retailer(retailer_in: RetailerCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == retailer_in.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if db.query(Retailer).filter(Retailer.user_id == retailer_in.user_id).first():
        raise HTTPException(status_code=400, detail="Retailer profile already exists for this user")

    new_retailer = Retailer(**retailer_in.model_dump())
    db.add(new_retailer)
    db.commit()
    db.refresh(new_retailer)
    return new_retailer


@app.get("/retailers/", response_model=List[RetailerResponse], tags=["Retailers"])
def get_all_retailers(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Retailer).offset(skip).limit(limit).all()


@app.get("/retailers/by-user/{user_id}", response_model=RetailerResponse, tags=["Retailers"])
def get_retailer_by_user(user_id: int, db: Session = Depends(get_db)):
    retailer = db.query(Retailer).filter(Retailer.user_id == user_id).first()
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer profile not found for this user")
    return retailer


@app.get("/retailers/{retailer_id}", response_model=RetailerResponse, tags=["Retailers"])
def get_retailer(retailer_id: int, db: Session = Depends(get_db)):
    retailer = db.query(Retailer).filter(Retailer.id == retailer_id).first()
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found")
    return retailer


@app.put("/retailers/{retailer_id}", response_model=RetailerResponse, tags=["Retailers"])
def update_retailer(retailer_id: int, update_in: RetailerUpdate, db: Session = Depends(get_db)):
    retailer = db.query(Retailer).filter(Retailer.id == retailer_id).first()
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found")

    for key, value in update_in.model_dump(exclude_unset=True).items():
        setattr(retailer, key, value)

    db.commit()
    db.refresh(retailer)
    return retailer


@app.delete("/retailers/{retailer_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Retailers"])
def delete_retailer(retailer_id: int, db: Session = Depends(get_db)):
    retailer = db.query(Retailer).filter(Retailer.id == retailer_id).first()
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found")
    db.delete(retailer)
    db.commit()
    return None


# ==========================================
# 3. ADDRESS ENDPOINTS
# ==========================================

@app.post("/addresses/", response_model=AddressResponse, status_code=status.HTTP_201_CREATED, tags=["Addresses"])
def create_address(address_in: AddressCreate, db: Session = Depends(get_db)):
    if not db.query(User).filter(User.id == address_in.user_id).first():
        raise HTTPException(status_code=404, detail="User not found")

    new_address = Address(**address_in.model_dump())
    db.add(new_address)
    db.commit()
    db.refresh(new_address)
    return new_address


@app.get("/addresses/", response_model=List[AddressResponse], tags=["Addresses"])
def get_addresses(
    user_id: Optional[int] = Query(None, description="Filter addresses by user ID"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    query = db.query(Address)
    if user_id:
        query = query.filter(Address.user_id == user_id)
    return query.offset(skip).limit(limit).all()


@app.get("/addresses/{address_id}", response_model=AddressResponse, tags=["Addresses"])
def get_address(address_id: int, db: Session = Depends(get_db)):
    address = db.query(Address).filter(Address.id == address_id).first()
    if not address:
        raise HTTPException(status_code=404, detail="Address not found")
    return address


@app.put("/addresses/{address_id}", response_model=AddressResponse, tags=["Addresses"])
def update_address(address_id: int, update_in: AddressUpdate, db: Session = Depends(get_db)):
    address = db.query(Address).filter(Address.id == address_id).first()
    if not address:
        raise HTTPException(status_code=404, detail="Address not found")

    for key, value in update_in.model_dump(exclude_unset=True).items():
        setattr(address, key, value)

    db.commit()
    db.refresh(address)
    return address


@app.delete("/addresses/{address_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Addresses"])
def delete_address(address_id: int, db: Session = Depends(get_db)):
    address = db.query(Address).filter(Address.id == address_id).first()
    if not address:
        raise HTTPException(status_code=404, detail="Address not found")
    db.delete(address)
    db.commit()
    return None


# ==========================================
# 4. PRODUCT ENDPOINTS
# ==========================================

@app.post("/products/seed", tags=["Products"])
def seed_products_endpoint(db: Session = Depends(get_db)):
    """Seed the database with sample products for all LUMIO categories and sync OpenSearch."""
    added = 0
    for item in DEFAULT_SAMPLE_PRODUCTS:
        exists = db.query(Product).filter(Product.name == item["name"]).first()
        if not exists:
            db.add(Product(**item))
            added += 1
    db.commit()

    all_products = db.query(Product).all()
    indexed_count = bulk_index_products([_product_to_search_doc(p) for p in all_products])

    return {
        "message": f"Added {added} products",
        "total_products": len(all_products),
        "indexed_in_opensearch": indexed_count,
    }


@app.post("/products/", response_model=ProductResponse, status_code=status.HTTP_201_CREATED, tags=["Products"])
def create_product(product_in: ProductCreate, db: Session = Depends(get_db)):
    if product_in.retailer_id:
        if not db.query(Retailer).filter(Retailer.id == product_in.retailer_id).first():
            raise HTTPException(status_code=404, detail="Retailer not found")

    new_product = Product(**product_in.model_dump())
    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    index_product_document(_product_to_search_doc(new_product))
    return new_product


@app.get("/products/", response_model=List[ProductResponse], tags=["Products"])
def list_products(
    q: Optional[str] = None,
    category: Optional[str] = None,
    brand: Optional[str] = None,
    retailer_id: Optional[int] = None,
    is_available: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    opensearch_results = search_products_opensearch(
        query=q,
        category=category,
        brand=brand,
        retailer_id=retailer_id,
        is_available=is_available,
    )
    if opensearch_results is not None:
        return opensearch_results

    query = db.query(Product)
    if category:
        query = query.filter(Product.category == category)
    if brand:
        query = query.filter(Product.brand == brand)
    if retailer_id is not None:
        query = query.filter(Product.retailer_id == retailer_id)
    if is_available is not None:
        query = query.filter(Product.is_available == is_available)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Product.name.ilike(pattern),
                Product.description.ilike(pattern),
                Product.brand.ilike(pattern),
                Product.category.ilike(pattern),
            )
        )
    return query.all()


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

    index_product_document(_product_to_search_doc(product))
    return product


@app.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Products"])
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    db.delete(product)
    db.commit()

    delete_product_document(product_id)
    return None


# ==========================================
# 5. INVENTORY ENDPOINTS  (offline shelf stock PER RETAILER)
# ==========================================
# products.stock_quantity = ONLINE stock (what the website sells; checkout reduces it).
# inventory rows          = OFFLINE stock a specific retailer holds in their physical store.
# When a product is out of stock online, /products/{id}/nearest-retailers lists the stores
# whose inventory still has it.

def _validate_inventory_numbers(stock: Optional[int], reserved: Optional[int]) -> None:
    if stock is not None and stock < 0:
        raise HTTPException(status_code=400, detail="stock_quantity cannot be negative")
    if reserved is not None and reserved < 0:
        raise HTTPException(status_code=400, detail="reserved_quantity cannot be negative")
    if stock is not None and reserved is not None and reserved > stock:
        raise HTTPException(status_code=400, detail="reserved_quantity cannot exceed stock_quantity")


@app.post("/inventory/", response_model=InventoryResponse, status_code=status.HTTP_201_CREATED, tags=["Inventory"])
def create_or_init_inventory(inv_in: InventoryCreate, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == inv_in.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Stock is tracked per store: default to the product's own retailer when not given.
    retailer_id = inv_in.retailer_id if inv_in.retailer_id is not None else product.retailer_id
    if retailer_id is None:
        raise HTTPException(status_code=400, detail="retailer_id is required: inventory is tracked per store")
    if not db.query(Retailer).filter(Retailer.id == retailer_id).first():
        raise HTTPException(status_code=404, detail="Retailer not found")

    _validate_inventory_numbers(inv_in.stock_quantity, inv_in.reserved_quantity)

    existing_inv = (
        db.query(Inventory)
        .filter(Inventory.product_id == inv_in.product_id, Inventory.retailer_id == retailer_id)
        .first()
    )
    if existing_inv:
        raise HTTPException(status_code=400, detail="This store already has an inventory record for this product")

    data = inv_in.model_dump()
    data["retailer_id"] = retailer_id
    new_inv = Inventory(**data)
    db.add(new_inv)
    db.commit()
    db.refresh(new_inv)
    return new_inv


@app.get("/inventory/", response_model=List[InventoryResponse], tags=["Inventory"])
def get_all_inventory(
    retailer_id: Optional[int] = None,
    product_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    query = db.query(Inventory)
    if retailer_id is not None:
        query = query.filter(Inventory.retailer_id == retailer_id)
    if product_id is not None:
        query = query.filter(Inventory.product_id == product_id)
    return query.order_by(Inventory.id).offset(skip).limit(limit).all()


@app.get("/inventory/retailer/{retailer_id}", response_model=List[InventoryResponse], tags=["Inventory"])
def get_inventory_by_retailer(retailer_id: int, db: Session = Depends(get_db)):
    return db.query(Inventory).filter(Inventory.retailer_id == retailer_id).order_by(Inventory.id).all()


@app.get("/inventory/product/{product_id}", response_model=InventoryResponse, tags=["Inventory"])
def get_inventory_by_product(product_id: int, retailer_id: Optional[int] = None, db: Session = Depends(get_db)):
    """One inventory record for a product. Several stores can stock it: pass ?retailer_id= to pick one."""
    query = db.query(Inventory).filter(Inventory.product_id == product_id)
    if retailer_id is not None:
        query = query.filter(Inventory.retailer_id == retailer_id)
    inv = query.order_by(Inventory.id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory not found for this product")
    return inv


@app.put("/inventory/{inventory_id}", response_model=InventoryResponse, tags=["Inventory"])
def update_inventory(inventory_id: int, update_in: InventoryUpdate, db: Session = Depends(get_db)):
    inv = db.query(Inventory).filter(Inventory.id == inventory_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory record not found")

    changes = update_in.model_dump(exclude_unset=True)
    _validate_inventory_numbers(
        changes.get("stock_quantity", inv.stock_quantity),
        changes.get("reserved_quantity", inv.reserved_quantity),
    )
    for key, value in changes.items():
        setattr(inv, key, value)

    db.commit()
    db.refresh(inv)
    return inv


@app.delete("/inventory/{inventory_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Inventory"])
def delete_inventory(inventory_id: int, db: Session = Depends(get_db)):
    inv = db.query(Inventory).filter(Inventory.id == inventory_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory record not found")
    db.delete(inv)
    db.commit()
    return None


# ------------------------------------------
# Out of stock online -> stores that still have it on the shelf
# ------------------------------------------
EARTH_RADIUS_KM = 6371.0
DEFAULT_BENGALURU_LAT = 12.9716
DEFAULT_BENGALURU_LON = 77.5946


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1_rad, lon1_rad = math.radians(lat1), math.radians(lon1)
    lat2_rad, lon2_rad = math.radians(lat2), math.radians(lon2)

    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_KM * c


@app.get("/products/{product_id}/nearest-retailers", response_model=NearestRetailersResponse, tags=["Inventory"])
def get_nearest_retailers(
    product_id: int,
    lat: Optional[float] = Query(None, ge=-90, le=90, description="User latitude"),
    lon: Optional[float] = Query(None, ge=-180, le=180, description="User longitude"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """
    Stores that can hand over this product right now, nearest first.
    A store qualifies if it has offline pickup enabled, a saved location, and
    (stock_quantity - reserved_quantity) > 0 for this product in its inventory.
    Without lat/lon distances are measured from central Bengaluru (location_fallback = true).
    """
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    available = Inventory.stock_quantity - Inventory.reserved_quantity
    rows = (
        db.query(Inventory, Retailer)
        .join(Retailer, Inventory.retailer_id == Retailer.id)
        .filter(
            Inventory.product_id == product_id,
            available > 0,
            Retailer.offline_pickup_enabled.is_(True),
            Retailer.latitude.isnot(None),
            Retailer.longitude.isnot(None),
        )
        .all()
    )

    used_fallback = lat is None or lon is None
    origin_lat = lat if not used_fallback else DEFAULT_BENGALURU_LAT
    origin_lon = lon if not used_fallback else DEFAULT_BENGALURU_LON

    results = []
    for inv, retailer in rows:
        results.append(
            {
                "retailer_id": retailer.id,
                "store_name": retailer.store_name,
                "address": retailer.store_address or retailer.address,
                "city": retailer.city,
                "pincode": retailer.pincode,
                "contact": retailer.contact,
                "stock_quantity": inv.stock_quantity - inv.reserved_quantity,
                "distance_km": round(
                    _haversine_km(origin_lat, origin_lon, retailer.latitude, retailer.longitude), 2
                ),
                "latitude": retailer.latitude,
                "longitude": retailer.longitude,
            }
        )

    results.sort(key=lambda item: item["distance_km"])

    return {
        "product_id": product.id,
        "product_name": product.name,
        "online_stock_quantity": product.stock_quantity,
        "location_fallback": used_fallback,
        "retailers": results[:limit],
    }


# DEV ONLY: demo data so the out-of-stock -> nearby stores flow can be tried. Remove for production.
_DEMO_AREAS = [
    ("Indiranagar", "560038", 12.9719, 77.6412),
    ("Koramangala", "560034", 12.9352, 77.6245),
    ("Jayanagar", "560011", 12.9308, 77.5838),
    ("Whitefield", "560066", 12.9698, 77.7500),
    ("HSR Layout", "560102", 12.9116, 77.6389),
    ("Malleshwaram", "560003", 13.0035, 77.5710),
    ("Yelahanka", "560064", 13.1007, 77.5963),
    ("Electronic City", "560100", 12.8452, 77.6602),
]


@app.post("/dev/seed-store-stock", tags=["Inventory"])
def seed_store_stock(db: Session = Depends(get_db)):
    """
    (1) Gives each retailer that has no coordinates a Bengaluru-area location.
    (2) For every product that is out of stock online, puts a few units on the shelves of up to
        3 retailers (only where that store has no inventory row for it yet). Safe to repeat.
    """
    retailers = db.query(Retailer).order_by(Retailer.id).all()
    if not retailers:
        raise HTTPException(status_code=400, detail="No retailers exist yet. Register a retailer account first.")

    located = 0
    for idx, r in enumerate(retailers):
        if r.latitude is None or r.longitude is None:
            _area, pin, lat, lon = _DEMO_AREAS[idx % len(_DEMO_AREAS)]
            r.latitude, r.longitude = lat, lon
            r.city = r.city or "Bengaluru"
            r.pincode = r.pincode or pin
            located += 1
        if r.offline_pickup_enabled is None:
            r.offline_pickup_enabled = True

    oos = db.query(Product).filter((Product.stock_quantity <= 0) | (Product.is_available.is_(False))).all()
    added = 0
    for p in oos:
        for k in range(min(3, len(retailers))):
            r = retailers[(p.id + k) % len(retailers)]
            exists = (
                db.query(Inventory)
                .filter(Inventory.retailer_id == r.id, Inventory.product_id == p.id)
                .first()
            )
            if exists:
                continue
            db.add(Inventory(retailer_id=r.id, product_id=p.id, stock_quantity=3 + (p.id * 7 + k * 5) % 15, reserved_quantity=0))
            added += 1

    db.commit()
    return {
        "retailers": len(retailers),
        "retailers_given_location": located,
        "out_of_stock_products": len(oos),
        "inventory_rows_added": added,
    }


# ==========================================
# 6. CART ENDPOINTS  (DB-backed, one cart per user)
# ==========================================
# Every cart endpoint returns the FULL updated CartResponse (including
# items[].product) so the frontend can re-render from a single response.

def _require_user(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _fetch_cart(db: Session, user_id: int) -> Optional[Cart]:
    db.expire_all()  # make sure items/products are re-read after a commit
    return (
        db.query(Cart)
        .options(selectinload(Cart.items).selectinload(CartItem.product))
        .filter(Cart.user_id == user_id)
        .first()
    )


def _get_cart(db: Session, user_id: int) -> Cart:
    """Return the user's cart, creating an empty one on first use."""
    cart = _fetch_cart(db, user_id)
    if cart is None:
        try:
            db.add(Cart(user_id=user_id))
            db.commit()
        except IntegrityError:  # two requests raced to create the cart
            db.rollback()
        cart = _fetch_cart(db, user_id)
    return cart


def _check_stock(product: Product, wanted_qty: int) -> None:
    if not product.is_available:
        raise HTTPException(status_code=409, detail=f"'{product.name}' is currently unavailable")
    if product.stock_quantity <= 0:
        raise HTTPException(status_code=409, detail=f"'{product.name}' is out of stock")
    if wanted_qty > product.stock_quantity:
        raise HTTPException(
            status_code=409,
            detail=f"Only {product.stock_quantity} unit(s) of '{product.name}' available",
        )


@app.get("/cart/{user_id}", response_model=CartResponse, tags=["Cart"])
def get_cart(user_id: int, db: Session = Depends(get_db)):
    _require_user(db, user_id)
    return _get_cart(db, user_id)


@app.post("/cart/{user_id}/items", response_model=CartResponse, tags=["Cart"])
def add_cart_item(user_id: int, item_in: CartItemAdd, db: Session = Depends(get_db)):
    """Add a product to the cart; if it is already there, increase its quantity."""
    _require_user(db, user_id)
    if item_in.quantity < 1:
        raise HTTPException(status_code=400, detail="Quantity must be at least 1")

    product = db.query(Product).filter(Product.id == item_in.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    cart = _get_cart(db, user_id)
    existing = next((i for i in cart.items if i.product_id == product.id), None)
    new_qty = (existing.quantity if existing else 0) + item_in.quantity
    _check_stock(product, new_qty)

    if existing:
        existing.quantity = new_qty
    else:
        db.add(CartItem(cart_id=cart.id, product_id=product.id, quantity=new_qty))
    db.commit()
    return _get_cart(db, user_id)


@app.put("/cart/{user_id}/items/{item_id}", response_model=CartResponse, tags=["Cart"])
def update_cart_item(user_id: int, item_id: int, update_in: CartItemUpdate, db: Session = Depends(get_db)):
    """Set an item's quantity. A quantity of 0 or less removes the item."""
    _require_user(db, user_id)
    cart = _get_cart(db, user_id)
    item = next((i for i in cart.items if i.id == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")

    if update_in.quantity <= 0:
        db.delete(item)
    else:
        _check_stock(item.product, update_in.quantity)
        item.quantity = update_in.quantity
    db.commit()
    return _get_cart(db, user_id)


@app.delete("/cart/{user_id}/items/{item_id}", response_model=CartResponse, tags=["Cart"])
def remove_cart_item(user_id: int, item_id: int, db: Session = Depends(get_db)):
    _require_user(db, user_id)
    cart = _get_cart(db, user_id)
    item = next((i for i in cart.items if i.id == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")
    db.delete(item)
    db.commit()
    return _get_cart(db, user_id)


@app.delete("/cart/{user_id}/clear", status_code=status.HTTP_204_NO_CONTENT, tags=["Cart"])
def clear_cart(user_id: int, db: Session = Depends(get_db)):
    _require_user(db, user_id)
    cart = _get_cart(db, user_id)
    for item in list(cart.items):
        db.delete(item)
    db.commit()
    return None


# ==========================================
# 7. ORDER ENDPOINTS
# ==========================================
GST_RATE = Decimal("0.18")  # keep in sync with LumioCart / cart-page.js

ORDER_TRANSITIONS = {
    OrderStatus.PENDING.value: {OrderStatus.CONFIRMED.value, OrderStatus.CANCELLED.value},
    OrderStatus.CONFIRMED.value: {OrderStatus.SHIPPED.value, OrderStatus.CANCELLED.value},
    OrderStatus.SHIPPED.value: {OrderStatus.DELIVERED.value},
    OrderStatus.DELIVERED.value: set(),
    OrderStatus.CANCELLED.value: set(),
}


def _fetch_order(db: Session, order_id: int) -> Optional[Order]:
    db.expire_all()
    return (
        db.query(Order)
        .options(selectinload(Order.items).selectinload(OrderItem.product))
        .filter(Order.id == order_id)
        .first()
    )



@app.post(
    "/orders/",
    response_model=OrderResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Orders"]
)
def create_order(order_in: OrderCreate, db: Session = Depends(get_db)):
    """
    Turn the user's cart into an order, reduce stock,
    empty the cart and publish an order event to Kafka.
    """

    _require_user(db, order_in.user_id)

    if order_in.address_id is not None:
        address = db.query(Address).filter(
            Address.id == order_in.address_id
        ).first()

        if not address or address.user_id != order_in.user_id:
            raise HTTPException(
                status_code=404,
                detail="Address not found"
            )

    cart = _get_cart(db, order_in.user_id)

    if not cart.items:
        raise HTTPException(
            status_code=400,
            detail="Your cart is empty"
        )

    # Lock product rows to prevent simultaneous checkouts
    # from taking the same remaining stock.

    product_ids = [i.product_id for i in cart.items]

    products = {
        p.id: p
        for p in db.query(Product)
        .filter(Product.id.in_(product_ids))
        .with_for_update()
        .all()
    }

    subtotal = Decimal("0")
    lines = []

    for item in cart.items:

        product = products.get(item.product_id)

        if product is None:
            raise HTTPException(
                status_code=409,
                detail="A product in your cart no longer exists"
            )

        _check_stock(product, item.quantity)

        subtotal += product.price * item.quantity

        lines.append((product, item.quantity))

    # Calculate GST
    tax = (subtotal * GST_RATE).quantize(
        Decimal("1"),
        rounding=ROUND_HALF_UP
    )

    # Create order
    order = Order(
        user_id=order_in.user_id,
        address_id=order_in.address_id,
        total_amount=subtotal + tax,
        status=OrderStatus.PENDING.value,
    )

    db.add(order)
    db.flush()

    # Create order items and reduce online stock
    for product, qty in lines:

        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                quantity=qty,
                unit_price=product.price
            )
        )

        product.stock_quantity -= qty

    # Empty cart
    for item in list(cart.items):
        db.delete(item)

    # Prepare Kafka event BEFORE committing.
    # Decimal values are converted to strings for JSON serialization.

    order_event = {
        "event": "order_created",
        "order_id": order.id,
        "user_id": order.user_id,
        "total_amount": str(order.total_amount),
        "status": order.status,
        "items": [
            {
                "product_id": product.id,
                "quantity": qty,
                "unit_price": str(product.price)
            }
            for product, qty in lines
        ]
    }

    # Commit PostgreSQL transaction FIRST.
    db.commit()

    logger.info(
        "Order %s successfully saved in PostgreSQL",
        order.id
    )

    # Publish order event to Kafka AFTER successful DB commit.
    # Kafka failure must not undo an already saved order.

    try:
        send_order_event(order_event)

        logger.info(
            "Order event successfully published to Kafka: %s",
            order.id
        )

    except Exception:
        logger.exception(
            "Kafka publishing failed for order: %s",
            order.id
        )

    # Update OpenSearch stock information
    reindex_products([p for p, _ in lines])

    # Return the saved order
    return _fetch_order(db, order.id)


@app.get("/orders/", response_model=List[OrderResponse], tags=["Orders"])
def get_orders(
    user_id: Optional[int] = Query(None, description="Only this user's orders"),
    order_status: Optional[OrderStatus] = Query(None, alias="status"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    query = db.query(Order).options(selectinload(Order.items).selectinload(OrderItem.product))
    if user_id:
        query = query.filter(Order.user_id == user_id)
    if order_status:
        query = query.filter(Order.status == order_status.value)
    return query.order_by(Order.id.desc()).offset(skip).limit(limit).all()


@app.get("/orders/{order_id}", response_model=OrderResponse, tags=["Orders"])
def get_order(order_id: int, db: Session = Depends(get_db)):
    order = _fetch_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@app.put("/orders/{order_id}/status", response_model=OrderResponse, tags=["Orders"])
def update_order_status(order_id: int, update_in: OrderStatusUpdate, db: Session = Depends(get_db)):
    order = _fetch_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    new_status = update_in.status.value
    if new_status != order.status:
        if new_status not in ORDER_TRANSITIONS.get(order.status, set()):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot change order from '{order.status}' to '{new_status}'",
            )
        if new_status == OrderStatus.CANCELLED.value:  # put the stock back
            for item in order.items:
                if item.product is not None:
                    item.product.stock_quantity += item.quantity
        order.status = new_status
        db.commit()
        if new_status == OrderStatus.CANCELLED.value:
            reindex_products([i.product for i in order.items if i.product is not None])
    return _fetch_order(db, order_id)


# ==========================================
# 8. STATIC FILES & FRONTEND SERVING
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