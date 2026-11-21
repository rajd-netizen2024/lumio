(function () {
  const isBackendOrigin =
    window.location.protocol.startsWith("http") &&
    (window.location.port === "8000" || window.location.host.includes("8000"));

  const API_BASE_URL = isBackendOrigin
    ? window.location.origin
    : "http://127.0.0.1:8000";

  let allProducts = [];
  let currentCategory = "All";

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

    // Abort if the server accepts the request but never answers (stuck backend / DB),
    // so pages show an error instead of spinning forever.
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || 15000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    config.signal = controller.signal;
    delete config.timeoutMs;

    try {
      const response = await fetch(url, config);

      if (response.status === 204) {
        return null;
      }

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(formatErrorDetail(data, response.status));
      }

      return data;
    } catch (err) {
      if (err && err.name === "AbortError") {
        const timeoutErr = new Error(
          `The server did not respond within ${Math.round(timeoutMs / 1000)}s. ` +
          "The backend or its database connection looks stuck (check the uvicorn terminal)."
        );
        console.warn(`[LUMIO API Timeout: ${endpoint}]`);
        throw timeoutErr;
      }
      if (err instanceof TypeError) {
        // fetch() rejects with TypeError when the server is unreachable / CORS blocked
        const netErr = new Error(
          "Network error: the backend is not running, or it crashed on this request (check the uvicorn terminal for a traceback)."
        );
        console.warn(`[LUMIO API Error: ${endpoint}]`, err);
        throw netErr;
      }
      console.warn(`[LUMIO API Error: ${endpoint}]`, err);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // FastAPI sends { detail: "text" } for HTTPException and
  // { detail: [{ loc, msg, type }, ...] } for 422 validation errors.
  function formatErrorDetail(data, status) {
    const detail = data && data.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length) {
      return detail
        .map((d) => {
          const field = Array.isArray(d.loc) ? d.loc.filter((p) => p !== "body").join(".") : "";
          return field ? `${field}: ${d.msg}` : d.msg;
        })
        .join("; ");
    }
    return `Request failed with status ${status}`;
  }

  // ==========================================
  // Catalog Search & Loading
  // ==========================================
  function getSearchQuery() {
    const input = document.getElementById("product-search-input");
    return input ? input.value.trim() : "";
  }

  async function loadProducts() {
    const searchQuery = getSearchQuery();
    const params = {};
    if (currentCategory && currentCategory !== "All") {
      params.category = currentCategory;
    }
    if (searchQuery) {
      params.q = searchQuery;
    }

    allProducts = await window.LumioAPI.getProducts(params);

    if (!allProducts.length && currentCategory && !searchQuery) {
      const fallback = await window.LumioAPI.getProducts({});
      if (fallback.length) {
        allProducts = fallback;
      }
    }

    window.dispatchEvent(
      new CustomEvent("lumio:products_loaded", {
        detail: { products: allProducts, category: currentCategory, query: searchQuery },
      })
    );

    return allProducts;
  }

  function bindControls() {
    const searchInput = document.getElementById("product-search-input");
    const clearBtn = document.getElementById("clear-search-btn");
    let searchTimer = null;

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          loadProducts();
        }, 250);
      });

      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          clearTimeout(searchTimer);
          loadProducts();
        }
      });
    }

    if (clearBtn && searchInput) {
      clearBtn.addEventListener("click", () => {
        searchInput.value = "";
        clearTimeout(searchTimer);
        loadProducts();
      });
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
      if (params.q) query.append("q", params.q);
      if (params.category) query.append("category", params.category);
      if (params.brand) query.append("brand", params.brand);
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

    // Retailers
    async getRetailers() {
      return request("/retailers/");
    },

    async getRetailerByUser(userId) {
      return request(`/retailers/by-user/${userId}`);
    },

    async createRetailer(data) {
      return request("/retailers/", { method: "POST", body: JSON.stringify(data) });
    },

    async updateRetailer(id, data) {
      return request(`/retailers/${id}`, { method: "PUT", body: JSON.stringify(data) });
    },

    async deleteRetailer(id) {
      return request(`/retailers/${id}`, { method: "DELETE" });
    },

    // Addresses
    async getAddressesByUser(userId) {
      return request(`/addresses/?user_id=${userId}`);
    },

    async createAddress(data) {
      return request("/addresses/", { method: "POST", body: JSON.stringify(data) });
    },

    async updateAddress(id, data) {
      return request(`/addresses/${id}`, { method: "PUT", body: JSON.stringify(data) });
    },

    async deleteAddress(id) {
      return request(`/addresses/${id}`, { method: "DELETE" });
    },

    // Inventory
    async getInventory() {
      return request("/inventory/");
    },

    async getInventoryByProduct(productId) {
      return request(`/inventory/product/${productId}`);
    },

    async createInventory(data) {
      return request("/inventory/", { method: "POST", body: JSON.stringify(data) });
    },

    async updateInventory(id, data) {
      return request(`/inventory/${id}`, { method: "PUT", body: JSON.stringify(data) });
    },

    async getNearestRetailers(productId, coords = {}) {
      const query = new URLSearchParams();
      if (coords && coords.lat !== undefined && coords.lat !== null) {
        query.append("lat", coords.lat);
      }
      if (coords && coords.lon !== undefined && coords.lon !== null) {
        query.append("lon", coords.lon);
      }
      const qs = query.toString() ? `?${query.toString()}` : "";
      return request(`/products/${productId}/nearest-retailers${qs}`);
    },

    // Cart (DB-backed)
    // Every cart method except clearCart resolves to a full CartResponse:
    //   { id, user_id, created_at, updated_at,
    //     items: [{ id, cart_id, product_id, quantity, created_at, product: ProductResponse }] }
    // clearCart resolves to null (HTTP 204).
    // Errors are thrown as Error(message) using the backend `detail` text, e.g.
    //   409 "Only 3 unit(s) of 'X' available", 404 "Cart item not found".
    async getCart(userId) {
      return request(`/cart/${userId}`);
    },

    async addToCart(userId, productId, quantity = 1) {
      return request(`/cart/${userId}/items`, {
        method: "POST",
        body: JSON.stringify({ product_id: productId, quantity }),
      });
    },

    async updateCartItem(userId, itemId, quantity) {
      return request(`/cart/${userId}/items/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({ quantity }),
      });
    },

    async removeCartItem(userId, itemId) {
      return request(`/cart/${userId}/items/${itemId}`, { method: "DELETE" });
    },

    async clearCart(userId) {
      return request(`/cart/${userId}/clear`, { method: "DELETE" });
    },

    // Orders
    // createOrder / getOrder / updateOrderStatus resolve to an OrderResponse:
    //   { id, user_id, address_id, total_amount, status, created_at, updated_at,
    //     items: [{ id, order_id, product_id|null, quantity, unit_price, product|null }] }
    // createOrder empties the cart server-side (stock is reduced in the same transaction).
    async createOrder(userId, addressId = null) {
      return request("/orders/", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, address_id: addressId }),
      });
    },

    async getOrders(userId = null) {
      const qs = userId ? `?user_id=${userId}` : "";
      return request(`/orders/${qs}`);
    },

    async getOrder(orderId) {
      return request(`/orders/${orderId}`);
    },

    async updateOrderStatus(orderId, orderStatus) {
      return request(`/orders/${orderId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: orderStatus }),
      });
    },
  };

  window.LumioCatalog = {
    loadProducts,
    bindControls,
    getSearchQuery,
    setCategory(category) {
      currentCategory = category || "All";
      return loadProducts();
    },
    getProductsCache() {
      return allProducts;
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

  // ==========================================
  // Cart Sync (DB cart for logged-in users, localStorage for guests)
  // ==========================================
  // LumioCart (above) stays the guest/localStorage cart. LumioCartSync is the
  // single entry point the UI should use so both modes behave the same, and it
  // keeps the header badge count correct.
  let serverCount = null; // null = not loaded yet / guest
  let syncPromise = Promise.resolve();

  function countFromCart(cart) {
    const items = cart && cart.items ? cart.items : [];
    return items.reduce((sum, i) => sum + (i.quantity || 0), 0);
  }

  function notifyCartChanged() {
    const count = window.LumioCart.getCount();
    window.dispatchEvent(
      new CustomEvent("lumio:cart_updated", { detail: { count, source: "sync" } })
    );
    // lumio-ui.js listens for this event and redraws the header badge.
  }

  // Make getCount() mode-aware so existing header code that already calls
  // LumioCart.getCount() shows the DB count for logged-in users.
  const localGetCount = window.LumioCart.getCount.bind(window.LumioCart);
  window.LumioCart.getCount = function () {
    if (window.LumioAuth.isLoggedIn() && serverCount !== null) return serverCount;
    return localGetCount();
  };

  window.LumioCartSync = {
    /** Call with every CartResponse you receive so the badge stays in sync. */
    setServerCart(cart) {
      serverCount = countFromCart(cart);
      notifyCartChanged();
    },

    /** Add a product (logged in -> backend, guest -> localStorage). */
    async add(product, qty = 1) {
      const user = window.LumioAuth.getUser();
      if (!user) {
        window.LumioCart.addItem(product, qty);
        return { mode: "local" };
      }
      const cart = await window.LumioAPI.addToCart(user.id, product.id, qty);
      this.setServerCart(cart);
      return { mode: "server", cart };
    },

    /** Re-read the cart from the backend and update the badge. */
    async refresh() {
      const user = window.LumioAuth.getUser();
      if (!user) {
        serverCount = null;
        notifyCartChanged();
        return null;
      }
      const cart = await window.LumioAPI.getCart(user.id);
      this.setServerCart(cart);
      return cart;
    },

    /** Resolves when any login/logout sync in progress has finished. */
    whenSynced() {
      return syncPromise;
    },

    /** After login: push guest cart items into the DB cart, then clear the guest cart. */
    async mergeGuestCart(user) {
      const guestItems = window.LumioCart.getItems();
      if (!guestItems.length) return { merged: 0, skipped: 0 };
      let merged = 0;
      let skipped = 0;
      for (const item of guestItems) {
        try {
          await window.LumioAPI.addToCart(user.id, item.id, item.qty || 1);
          merged++;
        } catch (err) {
          skipped++; // e.g. out of stock or product deleted
          console.warn("[LUMIO] Could not merge guest cart item", item.id, err.message);
        }
      }
      window.LumioCart.clear();
      return { merged, skipped };
    },
  };

  // Keep everything in sync when the user logs in / out, and on page load.
  window.addEventListener("lumio:auth_changed", (e) => {
    const user = e.detail && e.detail.user;
    serverCount = null;
    if (!user) {
      syncPromise = Promise.resolve();
      notifyCartChanged();
      return;
    }
    syncPromise = (async () => {
      try {
        const result = await window.LumioCartSync.mergeGuestCart(user);
        if (window.LumioUI && window.LumioUI.toast) {
          if (result.merged) {
            window.LumioUI.toast(`${result.merged} item(s) from your guest cart added to your account cart`, "success");
          }
          if (result.skipped) {
            window.LumioUI.toast(
              `${result.skipped} item(s) from your guest cart couldn't be added (stock/availability).`,
              "error"
            );
          }
        }
        await window.LumioCartSync.refresh();
      } catch (err) {
        console.warn("[LUMIO] Cart sync after login failed:", err.message);
      }
    })();
  });

  if (window.LumioAuth.isLoggedIn()) {
    syncPromise = window.LumioCartSync.refresh().catch((err) => {
      console.warn("[LUMIO] Initial cart load failed:", err.message);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindControls);
  } else {
    bindControls();
  }
})();