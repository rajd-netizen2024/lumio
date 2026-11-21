/**
 * LUMIO Cart Page Controller
 * Dynamically renders cart items from LumioCart, recalculates totals, and handles checkout
 */

(function () {
  function renderCart() {
    const listContainer = document.getElementById("cart-items-list");
    const countBadge = document.getElementById("cart-count");
    const subtotalEl = document.getElementById("summary-subtotal");
    const taxEl = document.getElementById("summary-tax");
    const totalEl = document.getElementById("summary-total");

    if (!listContainer) return;

    const items = window.LumioCart.getItems();
    const count = window.LumioCart.getCount();
    const totals = window.LumioCart.getTotals();

    if (countBadge) countBadge.textContent = count;
    if (subtotalEl) subtotalEl.textContent = `₹${totals.subtotal.toLocaleString()}`;
    if (taxEl) taxEl.textContent = `₹${totals.tax.toLocaleString()}`;
    if (totalEl) totalEl.textContent = `₹${totals.total.toLocaleString()}`;

    if (!items.length) {
      listContainer.innerHTML = `
        <div style="text-align: center; padding: 48px 20px; background: #ffffff; border-radius: 12px; border: 1.5px dashed #e2e8f0;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5" style="margin: 0 auto 12px auto; display: block;">
            <circle cx="9" cy="21" r="1"></circle>
            <circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
          <h3 style="color: #334155; font-size: 1.15rem; margin-bottom: 6px;">Your cart is empty</h3>
          <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 20px;">Looks like you haven't added anything to your cart yet.</p>
          <a href="./home.html" class="lumio-btn lumio-btn-primary" style="display: inline-flex; width: auto; padding: 10px 24px;">
            Explore Products &rarr;
          </a>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = items
      .map(
        (item) => `
        <div class="cart-item" data-id="${item.id}" data-price="${item.price}">
          <div class="item-left">
            <div class="item-image">
              <img src="${item.image_url}" alt="${item.name}" onerror="this.src='https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300';">
            </div>
            <div class="item-info">
              <h3 class="item-name">${item.name}</h3>
              <p class="item-desc">${item.brand || item.category || "LUMIO Product"}</p>
              <div class="item-price">₹${Number(item.price).toLocaleString()}</div>
              <span class="stock-badge">In Stock</span>
            </div>
          </div>

          <div class="item-right">
            <div class="quantity-control">
              <button type="button" class="qty-btn" onclick="window.updateCartItemQty(${item.id}, -1)">−</button>
              <span class="qty-value">${item.qty}</span>
              <button type="button" class="qty-btn" onclick="window.updateCartItemQty(${item.id}, 1)">+</button>
            </div>
            <div class="item-total">₹${Number(item.price * item.qty).toLocaleString()}</div>
            <button type="button" class="delete-btn" onclick="window.removeCartItem(${item.id})" title="Remove item">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `
      )
      .join("");
  }

  // Global functions matching cart.html onclick attributes
  window.updateCartItemQty = function (productId, delta) {
    window.LumioCart.updateQty(productId, delta);
    renderCart();
  };

  window.removeCartItem = function (productId) {
    window.LumioCart.removeItem(productId);
    window.LumioUI.toast("Item removed from cart", "success");
    renderCart();
  };

  window.clearCart = function () {
    const items = window.LumioCart.getItems();
    if (!items.length) {
      window.LumioUI.toast("Cart is already empty", "error");
      return;
    }
    if (confirm("Are you sure you want to remove all items from your cart?")) {
      window.LumioCart.clear();
      window.LumioUI.toast("Cart cleared", "success");
      renderCart();
    }
  };

  // Checkout handling
  function setupCheckout() {
    const checkoutBtn = document.querySelector(".checkout-btn");
    if (!checkoutBtn) return;

    checkoutBtn.addEventListener("click", () => {
      const items = window.LumioCart.getItems();
      if (!items.length) {
        window.LumioUI.toast("Your cart is empty! Add products first.", "error");
        return;
      }

      const user = window.LumioAuth.getUser();
      if (!user) {
        window.LumioUI.toast("Please sign in or create an account to proceed to checkout.", "error");
        window.LumioUI.openAuthModal();
        return;
      }

      const totals = window.LumioCart.getTotals();
      const confirmed = confirm(
        `Confirm Order for ${user.full_name}?\n\n` +
          `Total Amount: ₹${totals.total.toLocaleString()} (including 18% GST)\n` +
          `Items: ${items.length} product(s)\n\n` +
          `Click OK to place order.`
      );

      if (confirmed) {
        window.LumioCart.clear();
        renderCart();
        window.LumioUI.toast(`Order placed successfully! Thank you, ${user.full_name}! 🎉`, "success");
      }
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    // If cart is empty in localStorage on initial open, initialize with 1 item from DB or empty
    renderCart();
    setupCheckout();
  });

  window.addEventListener("lumio:cart_updated", renderCart);
})();
