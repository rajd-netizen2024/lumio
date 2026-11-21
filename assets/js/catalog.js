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
            window.LumioUI.toast(`"${product.name}" is out of stock.`, "error");
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