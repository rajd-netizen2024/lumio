/**
 * LUMIO Dynamic Catalog Controller
 * Loads products from FastAPI backend, filters by category/price, and handles cart actions
 */

(function () {
  let allProducts = [];
  let currentCategory = null;

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

    // Show loading state
    grid.innerHTML = `
      <div class="lumio-loading-spinner">
        <div class="lumio-spinner-circle"></div>
        <span>Loading products from database...</span>
      </div>
    `;

    try {
      const params = {};
      if (currentCategory && currentCategory !== "All") {
        params.category = currentCategory;
      }

      allProducts = await window.LumioAPI.getProducts(params);

      // If category has no items yet, fallback to fetching all products
      if (!allProducts.length && currentCategory) {
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
          <p>${err.message}</p>
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
          <h3>No products match this filter</h3>
          <p>Try selecting a different price range or clearing your filter.</p>
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
        btn.onclick = (e) => {
          e.preventDefault();
          window.LumioCart.addItem(product, 1);
          window.LumioUI.toast(`Added "${product.name}" to cart!`, "success");
        };
      }
    });

    // Update section title if element exists
    const categoryTitle = document.getElementById("category-display-title");
    if (categoryTitle && currentCategory) {
      categoryTitle.textContent = currentCategory;
    }
  }

  // Bind filter & sort change events
  function bindControls() {
    const sortSelect = document.getElementById("sort-select");
    const priceSelect = document.getElementById("price-select");

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
