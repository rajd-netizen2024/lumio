/**
 * LUMIO Full-Stack API & State Management
 * Connects Frontend directly with FastAPI Backend (Aiven PostgreSQL)
 */

(function () {
  const isBackendOrigin =
    window.location.protocol.startsWith("http") &&
    (window.location.port === "8000" || window.location.host.includes("8000"));

  const API_BASE_URL = isBackendOrigin
    ? window.location.origin
    : "http://127.0.0.1:8000";

  // Generic fetch wrapper with clean error handling
  async function request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const defaultHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {}),
      },
    };

    try {
      const response = await fetch(url, config);

      if (response.status === 204) {
        return null;
      }

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorDetail =
          data && data.detail
            ? typeof data.detail === "string"
              ? data.detail
              : JSON.stringify(data.detail)
            : `Request failed with status ${response.status}`;
        throw new Error(errorDetail);
      }

      return data;
    } catch (err) {
      console.warn(`[LUMIO API Error: ${endpoint}]`, err);
      throw err;
    }
  }

  // ==========================================
  // API Endpoints
  // ==========================================
  window.LumioAPI = {
    baseUrl: API_BASE_URL,

    // Products
    async getProducts(params = {}) {
      const query = new URLSearchParams();
      if (params.category) query.append("category", params.category);
      if (params.brand) query.append("brand", params.brand);
      if (params.search) query.append("search", params.search);
      if (params.is_available !== undefined)
        query.append("is_available", params.is_available);
      if (params.skip) query.append("skip", params.skip);
      if (params.limit) query.append("limit", params.limit);

      const qs = query.toString() ? `?${query.toString()}` : "";
      return request(`/products/${qs}`);
    },

    async getProduct(id) {
      return request(`/products/${id}`);
    },

    async createProduct(productData) {
      return request("/products/", {
        method: "POST",
        body: JSON.stringify(productData),
      });
    },

    async updateProduct(id, productData) {
      return request(`/products/${id}`, {
        method: "PUT",
        body: JSON.stringify(productData),
      });
    },

    async deleteProduct(id) {
      return request(`/products/${id}`, {
        method: "DELETE",
      });
    },

    async seedProducts() {
      return request("/products/seed", {
        method: "POST",
      });
    },

    // Users & Auth
    async login(email, password) {
      return request("/users/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
    },

    async register(userData) {
      return request("/users/", {
        method: "POST",
        body: JSON.stringify(userData),
      });
    },

    async getUsers(role = null) {
      const query = role ? `?role=${role}` : "";
      return request(`/users/${query}`);
    },

    async getUser(id) {
      return request(`/users/${id}`);
    },
  };

  // ==========================================
  // Auth State Management
  // ==========================================
  window.LumioAuth = {
    getUser() {
      try {
        const item = localStorage.getItem("lumio_current_user");
        return item ? JSON.parse(item) : null;
      } catch (e) {
        return null;
      }
    },

    setUser(user) {
      if (user) {
        localStorage.setItem("lumio_current_user", JSON.stringify(user));
      } else {
        localStorage.removeItem("lumio_current_user");
      }
      window.dispatchEvent(
        new CustomEvent("lumio:auth_changed", { detail: { user } })
      );
    },

    logout() {
      this.setUser(null);
    },

    isLoggedIn() {
      return !!this.getUser();
    },

    isRetailerOrAdmin() {
      const user = this.getUser();
      return (
        user &&
        (user.role === "retailer" ||
          user.role === "admin" ||
          user.role === "Retailer" ||
          user.role === "Admin")
      );
    },
  };

  // ==========================================
  // Shopping Cart State Management
  // ==========================================
  window.LumioCart = {
    getItems() {
      try {
        const items = localStorage.getItem("lumio_cart_items");
        return items ? JSON.parse(items) : [];
      } catch (e) {
        return [];
      }
    },

    saveItems(items) {
      localStorage.setItem("lumio_cart_items", JSON.stringify(items));
      window.dispatchEvent(
        new CustomEvent("lumio:cart_updated", { detail: { items } })
      );
    },

    addItem(product, qty = 1) {
      const items = this.getItems();
      const existing = items.find((i) => i.id === product.id);

      if (existing) {
        existing.qty += qty;
      } else {
        items.push({
          id: product.id,
          name: product.name,
          price: Number(product.price),
          image_url:
            product.image_url ||
            "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300",
          category: product.category,
          brand: product.brand || "LUMIO",
          qty: qty,
        });
      }

      this.saveItems(items);
      return items;
    },

    updateQty(productId, delta) {
      let items = this.getItems();
      const target = items.find((i) => i.id === Number(productId));
      if (!target) return items;

      target.qty += delta;
      if (target.qty <= 0) {
        items = items.filter((i) => i.id !== Number(productId));
      }
      this.saveItems(items);
      return items;
    },

    removeItem(productId) {
      const items = this.getItems().filter((i) => i.id !== Number(productId));
      this.saveItems(items);
      return items;
    },

    clear() {
      this.saveItems([]);
    },

    getCount() {
      const items = this.getItems();
      return items.reduce((sum, item) => sum + (item.qty || 1), 0);
    },

    getTotals() {
      const items = this.getItems();
      const subtotal = items.reduce(
        (sum, item) => sum + item.price * (item.qty || 1),
        0
      );
      const taxRate = 0.18; // 18% GST/Tax
      const tax = Math.round(subtotal * taxRate);
      const total = subtotal + tax;
      return {
        subtotal: Math.round(subtotal),
        tax,
        total: Math.round(total),
      };
    },
  };
})();
