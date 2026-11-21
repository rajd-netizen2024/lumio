/**
 * LUMIO Dynamic Catalog Controller
 * Loads products from FastAPI backend, searches via OpenSearch, filters by category/price,
 * and handles cart actions.
 */

(function () {
  let allProducts = [];
  let currentCategory = null;
  let searchDebounceTimer = null;

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (ch) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
    ));
  }

  let activeFallbackProduct = null;

  function getUserCoords(timeoutMs = 4000) {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
      );
    });
  }

  function closeNearestRetailersModal() {
    const modal = document.getElementById("lumio-nearest-retailers-modal");
    if (modal) modal.style.display = "none";
    activeFallbackProduct = null;
  }

  async function openNearestRetailersModal(product, forceLocation = false) {
    const modal = document.getElementById("lumio-nearest-retailers-modal");
    const titleEl = document.getElementById("lumio-nr-title");
    const statusEl = document.getElementById("lumio-nr-status");
    const listEl = document.getElementById("lumio-nr-list");
    if (!modal || !titleEl || !statusEl || !listEl) return;

    activeFallbackProduct = product;
    modal.style.display = "flex";
    titleEl.textContent = `Out of Stock Online — ${product.name}`;
    statusEl.textContent = "Checking nearby partner stores...";
    listEl.innerHTML = "";

    const coords = await getUserCoords(forceLocation ? 7000 : 3000);

    try {
      const data = await window.LumioAPI.getNearestRetailers(product.id, coords || {});
      const stores = Array.isArray(data.retailers) ? data.retailers : [];

      if (!stores.length) {
        statusEl.textContent = "No nearby offline stores currently have stock for this item.";
        return;
      }

      statusEl.textContent = data.location_fallback
        ? "Location permission not enabled — showing distances from central Bengaluru:"
        : "Available at nearby offline stores (sorted by distance):";

      listEl.innerHTML = stores
        .map(
          (s) => `
          <div style="border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
            <div style="display:flex; justify-content:space-between; gap:8px;">
              <strong>${escapeHtml(s.store_name)}</strong>
              <span style="font-weight:600; color:#3C1A8D;">${escapeHtml(s.distance_km)} km</span>
            </div>
            <div style="font-size:0.86rem; color:#475569; margin-top:4px;">
              ${escapeHtml(s.address)}${s.city ? `, ${escapeHtml(s.city)}` : ""}${s.pincode ? ` - ${escapeHtml(s.pincode)}` : ""}
            </div>
            <div style="font-size:0.84rem; margin-top:6px;">
              In stock: <strong>${escapeHtml(s.stock_quantity)}</strong> · Contact: ${escapeHtml(s.contact || "N/A")}
            </div>
          </div>
        `
        )
        .join("");
    } catch (err) {
      statusEl.textContent = `Could not fetch nearby stores: ${err.message}`;
    }
  }

  function getSearchQuery() {
    const input = document.getElementById("product-search-input");
    return input ? input.value.trim() : "";
  }

  // Determine active category from data-attribute, URL parameter, or page title
  function getActiveCategory() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("category")) {
      return urlParams.get("category");
    }

    const grid = document.getElementById("catalog-grid");
    if (grid && grid.getAttribute("data-category")) {
      return grid.getAttribute("data-category");
    }

    const path = window.location.pathname.toLowerCase();
    if (path.includes("home")) return "Home Essentials";
    if (path.includes("groceries")) return "Groceries";
    if (path.includes("stationery")) return "Stationery Items";
    if (path.includes("pet")) return "Pet Supplies";
    if (path.includes("toys")) return "Toys";
    if (path.includes("food_drinks")) return "Food and Drinks";

    return null;
  }

  async function loadProducts() {
    const grid = document.getElementById("catalog-grid");
    if (!grid) return;

    currentCategory = getActiveCategory();
    const searchQuery = getSearchQuery();

    // Show loading state
    grid.innerHTML = `
      <div class="lumio-loading-spinner">
        <div class="lumio-spinner-circle"></div>
        <span>${searchQuery ? `Searching for "${escapeHtml(searchQuery)}"...` : "Loading products from database..."}</span>
      </div>
    `;

    try {
      const params = {};
      if (currentCategory && currentCategory !== "All") {
        params.category = currentCategory;
      }
      if (searchQuery) {
        params.q = searchQuery;
      }

      allProducts = await window.LumioAPI.getProducts(params);

      // Only fall back to all products when browsing a category with no search query
      if (!allProducts.length && currentCategory && !searchQuery) {
        const fallback = await window.LumioAPI.getProducts({});
        if (fallback.length) {
          allProducts = fallback;
        }
      }

      applyFiltersAndRender();
    } catch (err) {
      grid.innerHTML = `
        <div class="lumio-empty-state">
          <h3>Unable to connect to backend</h3>
          <p>${escapeHtml(err.message)}</p>
          <button class="lumio-btn lumio-btn-primary lumio-btn-sm" style="margin-top:14px;" onclick="window.location.reload()">
            Retry Connection
          </button>
        </div>
      `;
    }
  }

  function applyFiltersAndRender() {
    const grid = document.getElementById("catalog-grid");
    if (!grid) return;

    const sortSelect = document.getElementById("sort-select");
    const priceSelect = document.getElementById("price-select");
    const searchQuery = getSearchQuery();

    let filtered = [...allProducts];

    // Filter by Price
    if (priceSelect) {
      const val = priceSelect.value;
      if (val === "Under ₹500" || val === "under-500") {
        filtered = filtered.filter((p) => Number(p.price) < 500);
      } else if (val === "₹500 - ₹1,000" || val === "500-1000") {
        filtered = filtered.filter(
          (p) => Number(p.price) >= 500 && Number(p.price) <= 1000
        );
      } else if (val === "Above ₹1,000" || val === "above-1000") {
        filtered = filtered.filter((p) => Number(p.price) > 1000);
      }
    }

    // Sort
    if (sortSelect) {
      const sortVal = sortSelect.value;
      if (sortVal === "Price: Low to High" || sortVal === "low-high") {
        filtered.sort((a, b) => Number(a.price) - Number(b.price));
      } else if (sortVal === "Price: High to Low" || sortVal === "high-low") {
        filtered.sort((a, b) => Number(b.price) - Number(a.price));
      } else if (sortVal === "Rating") {
        filtered.sort((a, b) => (b.stock_quantity || 0) - (a.stock_quantity || 0));
      }
    }

    // Render cards
    if (!filtered.length) {
      grid.innerHTML = `
        <div class="lumio-empty-state">
          <h3>${searchQuery ? `No products found for "${escapeHtml(searchQuery)}"` : "No products match this filter"}</h3>
          <p>${searchQuery ? "Try another keyword or click Clear to reset." : "Try selecting a different price range or clearing your filter."}</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map((p) => window.LumioUI.renderProductCard(p)).join("");

    // Attach Add to Cart event listeners
    grid.querySelectorAll(".card").forEach((card) => {
      const prodId = Number(card.getAttribute("data-id"));
      const product = allProducts.find((p) => p.id === prodId);
      const btn = card.querySelector(".cart-btn");

      if (btn && product) {
        btn.onclick = async (e) => {
          e.preventDefault();
          if (btn.disabled) return;

          if (product.is_available === false || Number(product.stock_quantity) <= 0) {
            window.LumioUI.toast(`"${product.name}" is out of stock online. Checking nearby stores...`, "error");
            openNearestRetailersModal(product, false);
            return;
          }

          btn.disabled = true;
          try {
            await window.LumioCartSync.add(product, 1);
            window.LumioUI.toast(`Added "${product.name}" to cart!`, "success");
          } catch (err) {
            window.LumioUI.toast(err.message || "Could not add to cart", "error");
          } finally {
            btn.disabled = false;
          }
        };
      }
    });

    // Update section title if element exists
    const categoryTitle = document.getElementById("category-display-title");
    if (categoryTitle && currentCategory) {
      categoryTitle.textContent = currentCategory;
    }
  }

  // Bind search, clear, filter & sort events
  function bindControls() {
    const searchInput = document.getElementById("product-search-input");
    const clearBtn = document.getElementById("clear-search-btn");
    const sortSelect = document.getElementById("sort-select");
    const priceSelect = document.getElementById("price-select");

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          loadProducts();
        }, 250);
      });

      // Handle native search clear ("x") button in <input type="search">
      searchInput.addEventListener("search", () => {
        clearTimeout(searchDebounceTimer);
        loadProducts();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (searchInput) {
          searchInput.value = "";
        }
        clearTimeout(searchDebounceTimer);
        loadProducts();
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener("change", applyFiltersAndRender);
    }
    if (priceSelect) {
      priceSelect.addEventListener("change", applyFiltersAndRender);
    }

    // Nearest-retailers modal controls
    const nrClose = document.getElementById("lumio-nr-close");
    const nrRetry = document.getElementById("lumio-nr-retry-loc");
    const nrModal = document.getElementById("lumio-nearest-retailers-modal");

    if (nrClose) nrClose.addEventListener("click", closeNearestRetailersModal);
    if (nrRetry) {
      nrRetry.addEventListener("click", () => {
        if (activeFallbackProduct) openNearestRetailersModal(activeFallbackProduct, true);
      });
    }
    if (nrModal) {
      nrModal.addEventListener("click", (e) => {
        if (e.target === nrModal) closeNearestRetailersModal();
      });
    }

    // Listen for live database modifications from Retailer modal
    window.addEventListener("lumio:product_created", () => {
      loadProducts();
    });
    window.addEventListener("lumio:product_deleted", () => {
      loadProducts();
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    bindControls();
    loadProducts();
  });
})();