# LUMIO - Find It, Love It, Own It

A modern full-stack e-commerce application powered by FastAPI, Aiven PostgreSQL, and responsive frontend interfaces.

## 🚀 Overview of Full-Stack Integration

### 1. Backend (`backend/`)
* **FastAPI Service** (`backend/main.py`):
  * **CORS Enabled**: Cross-origin requests permitted from any frontend port or file protocol.
  * **Dual-Serving**: Serves API endpoints as well as the complete static frontend directly at `http://127.0.0.1:8000/`.
  * **Database**: Direct pooling to **Aiven PostgreSQL** with auto-seeding of sample catalog products across categories.
* **User & Auth Endpoints**:
  * `POST /users/login`: Authenticate existing customer or retailer.
  * `POST /users/`: Register new customer or retailer accounts.
  * `GET /users/`: List users with role filtering (`customer`, `retailer`, `admin`).
  * `GET /users/{id}`, `PUT /users/{id}`, `DELETE /users/{id}`: CRUD operations.
* **Product Catalog Endpoints**:
  * `GET /products/`: Retrieve products with category, brand, and availability filters.
  * `POST /products/`: Create new products (retailer/admin).
  * `GET /products/{id}`: Get product by ID.
  * `PUT /products/{id}`: Update product details.
  * `DELETE /products/{id}`: Delete product.
  * `POST /products/seed`: On-demand catalog seeding.

### 2. Frontend Integration
* **API Client (`assets/js/api.js`)**:
  * Reusable fetch wrapper connecting to `http://127.0.0.1:8000`.
  * Authentication state management via `LumioAuth` (`localStorage`).
  * Shopping cart state management via `LumioCart` (`localStorage`).
* **UI Controller (`assets/js/lumio-ui.js`)**:
  * Live cart badge in navbar.
  * Dynamic user profile status pill & Auth modal (Sign In / Register / Role selector).
  * 1-Click quick test buttons for Customer and Retailer.
  * Retailer dashboard to add and delete inventory directly in Aiven PostgreSQL.
  * Toast notification system.
* **Dynamic Product Catalog (`assets/js/catalog.js`)**:
  * Fetches real products from the database.
  * Real-time sorting (price low-to-high, high-to-low, popularity).
  * Real-time price filtering (under ₹500, ₹500-₹1,000, above ₹1,000).
  * Working "Add to Cart" with quantity increments.
* **Dynamic Cart (`assets/js/cart-page.js`)**:
  * Dynamic rendering of cart items with quantity controls (`+` / `-`).
  * Instant recalculation of Subtotal, 18% GST Tax, and Total.
  * Item removal and Clear Cart actions.
  * Checkout flow verifying customer authentication.

---

## 🏃 Running the Application

### Option A: Run via FastAPI (Recommended - Serves API + Frontend together)
```powershell
.\.venv\Scripts\uvicorn backend.main:app --reload --port 8000
```
Then open your browser at:
* **Storefront**: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
* **API Docs (Swagger UI)**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### Option B: Standalone Frontend
You can also open [index.html](file:///c:/Users/rhosw/Downloads/LUMIO/index.html) or run a local web server (e.g., Live Server on port 5500). The frontend will automatically make cross-origin API calls to `http://127.0.0.1:8000`.
