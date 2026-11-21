/**
 * LUMIO Cart Page Controller
 * - Logged in: DB-backed cart via LumioAPI (every response is a full CartResponse)
 * - Guest:     localStorage cart via LumioCart
 * - Checkout:  POST /orders/ (logged-in only). The backend builds the order from the
 *              server cart, reduces stock and empties the cart in one transaction.
 */

(function () {
  // ---- State ----
  let currentCart = null;      // CartResponse for logged-in users
  let selectedAddressId = null;
  let lastOrder = null;        // OrderResponse shown after a successful checkout
  let loadError = null;        // message if the DB cart could not be loaded
  let busy = false;            // blocks double-clicks while a cart request is in flight

  const FALLBACK_IMG = "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300";

  // ---- Helpers ----
  function getUser() {
    return window.LumioAuth ? window.LumioAuth.getUser() : null;
  }

  function isLoggedIn() {
    return !!getUser();
  }

  function toast(msg, type) {
    if (window.LumioUI && window.LumioUI.toast) window.LumioUI.toast(msg, type);
  }

  // Product names / brands / addresses are user-entered (retailers, customers): never inject raw.
  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (ch) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
    ));
  }

  function money(n) {
    return `₹${Number(n || 0).toLocaleString()}`;
  }

  // Display-only totals. Must match the backend (GST 18%, tax rounded half-up to a whole rupee);
  // the real charged amount is always order.total_amount from the backend.
  function computeTotals(items) {
    const subtotal = items.reduce((sum, item) => sum + Number(item.price || 0) * (item.qty || 1), 0);
    const tax = Math.round(subtotal * 0.18);
    return { subtotal: Math.round(subtotal), tax, total: Math.round(subtotal + tax) };
  }

  function dbItemsForTotals(cart) {
    return ((cart && cart.items) || []).map((i) => ({
      price: i.product ? Number(i.product.price) : 0,
      qty: i.quantity,
    }));
  }

  // Single place that accepts a CartResponse: stores it, redraws, syncs the header badge.
  function applyCart(cart) {
    currentCart = cart;
    renderDBCart(cart);
    if (window.LumioCartSync) window.LumioCartSync.setServerCart(cart);
  }

  // ---- Render Summary ----
  function updateSummary(items) {
    const totals = computeTotals(items);
    const subtotalEl = document.getElementById("summary-subtotal");
    const taxEl = document.getElementById("summary-tax");
    const totalEl = document.getElementById("summary-total");
    if (subtotalEl) subtotalEl.textContent = money(totals.subtotal);
    if (taxEl) taxEl.textContent = money(totals.tax);
    if (totalEl) totalEl.textContent = money(totals.total);
  }

  // ---- Empty / Error / Confirmation Views ----
  function emptyCartHTML() {
    return `
      <div style="text-align:center;padding:48px 20px;background:#fff;border-radius:12px;border:1.5px dashed #e2e8f0;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5" style="margin:0 auto 12px;display:block;">
          <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
        </svg>
        <h3 style="color:#334155;font-size:1.15rem;margin-bottom:6px;">Your cart is empty</h3>
        <p style="color:#64748b;font-size:0.9rem;margin-bottom:20px;">Looks like you haven't added anything yet.</p>
        <a href="./home.html" class="lumio-btn lumio-btn-primary" style="display:inline-flex;width:auto;padding:10px 24px;">
          Explore Products &rarr;
        </a>
      </div>`;
  }

  function orderConfirmationHTML(order) {
    const rows = (order.items || []).map((it) => {
      const name = it.product ? it.product.name : "Item no longer available";
      return `
        <div style="display:flex;justify-content:space-between;gap:12px;font-size:0.88rem;color:#334155;padding:4px 0;">
          <span>${esc(name)} × ${it.quantity}</span>
          <span>${money(Number(it.unit_price) * it.quantity)}</span>
        </div>`;
    }).join("");

    return `
      <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;padding:20px;margin-bottom:16px;">
        <h3 style="color:#166534;font-size:1.15rem;margin-bottom:4px;">🎉 Order #${order.id} placed</h3>
        <p style="color:#166534;font-size:0.88rem;margin-bottom:12px;">
          Status: <strong>${esc(order.status)}</strong> &middot; Total paid (incl. 18% GST): <strong>${money(order.total_amount)}</strong>
        </p>
        ${rows}
        <a href="./home.html" class="lumio-btn lumio-btn-primary" style="display:inline-flex;width:auto;padding:9px 22px;margin-top:14px;">
          Continue Shopping &rarr;
        </a>
      </div>`;
  }

  function renderEmptyCart(container) {
    container.innerHTML = (lastOrder ? orderConfirmationHTML(lastOrder) : "") + (lastOrder ? "" : emptyCartHTML());
    updateSummary([]);
  }

  function renderLoadError(container) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px 20px;background:#fff;border-radius:12px;border:1.5px solid #fecaca;">
        <h3 style="color:#b91c1c;margin-bottom:6px;">Couldn't load your cart</h3>
        <p style="color:#64748b;font-size:0.9rem;margin-bottom:16px;">${esc(loadError)}</p>
        <button type="button" class="lumio-btn lumio-btn-primary" style="width:auto;padding:9px 22px;" onclick="window.retryLoadCart()">Retry</button>
      </div>`;
    updateSummary([]);
  }

  function stockBadge(product) {
    const stock = Number(product.stock_quantity);
    if (product.is_available === false || stock <= 0) return `<span class="stock-badge" style="color:#b91c1c;">Out of stock</span>`;
    if (stock <= 5) return `<span class="stock-badge" style="color:#b45309;">Only ${stock} left</span>`;
    return `<span class="stock-badge">In Stock</span>`;
  }

  // ---- Render DB Cart (logged in) ----
  function renderDBCart(cart) {
    const listContainer = document.getElementById("cart-items-list");
    const countBadge = document.getElementById("cart-count");
    if (!listContainer) return;

    const items = (cart && cart.items) ? cart.items : [];
    if (countBadge) countBadge.textContent = items.reduce((s, i) => s + (i.quantity || 1), 0);

    if (!items.length) { renderEmptyCart(listContainer); return; }

    updateSummary(dbItemsForTotals(cart));

    listContainer.innerHTML = items.map((item) => {
      const p = item.product || {};
      const price = Number(p.price || 0);
      const atMax = Number.isFinite(Number(p.stock_quantity)) && item.quantity >= Number(p.stock_quantity);
      return `
        <div class="cart-item" data-item-id="${item.id}" data-price="${price}">
          <div class="item-left">
            <div class="item-image">
              <img src="${esc(p.image_url || FALLBACK_IMG)}" alt="${esc(p.name || "Product")}" onerror="this.src='${FALLBACK_IMG}';">
            </div>
            <div class="item-info">
              <h3 class="item-name">${esc(p.name || "Unknown Product")}</h3>
              <p class="item-desc">${esc(p.brand || p.category || "LUMIO Product")}</p>
              <div class="item-price">${money(price)}</div>
              ${stockBadge(p)}
            </div>
          </div>
          <div class="item-right">
            <div class="quantity-control">
              <button type="button" class="qty-btn" onclick="window.updateCartItemQty(${item.id}, -1)">−</button>
              <span class="qty-value">${item.quantity}</span>
              <button type="button" class="qty-btn" ${atMax ? 'disabled title="Maximum available stock"' : ""} onclick="window.updateCartItemQty(${item.id}, 1)">+</button>
            </div>
            <div class="item-total">${money(price * item.quantity)}</div>
            <button type="button" class="delete-btn" onclick="window.removeCartItem(${item.id})" title="Remove item">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>`;
    }).join("");
  }

  // ---- Render Local Cart (guest) ----
  function renderLocalCart() {
    const listContainer = document.getElementById("cart-items-list");
    const countBadge = document.getElementById("cart-count");
    if (!listContainer) return;

    const items = window.LumioCart ? window.LumioCart.getItems() : [];
    if (countBadge) countBadge.textContent = items.reduce((s, i) => s + (i.qty || 1), 0);

    if (!items.length) { listContainer.innerHTML = emptyCartHTML(); updateSummary([]); return; }

    updateSummary(items.map((i) => ({ price: i.price, qty: i.qty })));

    listContainer.innerHTML = items.map((item) => `
      <div class="cart-item" data-id="${item.id}" data-price="${item.price}">
        <div class="item-left">
          <div class="item-image">
            <img src="${esc(item.image_url)}" alt="${esc(item.name)}" onerror="this.src='${FALLBACK_IMG}';">
          </div>
          <div class="item-info">
            <h3 class="item-name">${esc(item.name)}</h3>
            <p class="item-desc">${esc(item.brand || item.category || "LUMIO Product")}</p>
            <div class="item-price">${money(item.price)}</div>
            <span class="stock-badge">In Stock</span>
          </div>
        </div>
        <div class="item-right">
          <div class="quantity-control">
            <button type="button" class="qty-btn" onclick="window.updateCartItemQty(${item.id}, -1)">−</button>
            <span class="qty-value">${item.qty}</span>
            <button type="button" class="qty-btn" onclick="window.updateCartItemQty(${item.id}, 1)">+</button>
          </div>
          <div class="item-total">${money(item.price * item.qty)}</div>
          <button type="button" class="delete-btn" onclick="window.removeCartItem(${item.id})" title="Remove item">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>`).join("");
  }

  // ---- Main Render ----
  async function renderCart() {
    const user = getUser();
    if (!user) {
      currentCart = null;
      loadError = null;
      renderLocalCart();
      return;
    }

    // Wait for any login-time merge of the guest cart before reading the DB cart.
    if (window.LumioCartSync) await window.LumioCartSync.whenSynced();

    try {
      loadError = null;
      applyCart(await window.LumioAPI.getCart(user.id));
      await renderAddressSelector(user.id);
    } catch (err) {
      // Logged-in users must never silently fall back to the guest cart:
      // checkout would then act on a different cart than the one on screen.
      console.warn("Failed to load DB cart:", err);
      currentCart = null;
      loadError = err.message || "Unknown error";
      const listContainer = document.getElementById("cart-items-list");
      if (listContainer) renderLoadError(listContainer);
    }
  }

  window.retryLoadCart = function () { renderCart(); };

  // ---- Address Selector for Checkout ----
  async function renderAddressSelector(userId, preferAddressId) {
    let selectorEl = document.getElementById("lumio-address-selector");
    if (!selectorEl) {
      // cart.html has no dedicated checkout wrapper, so anchor to the checkout button itself.
      const checkoutBtnEl = document.querySelector(".checkout-btn");
      if (!checkoutBtnEl || !checkoutBtnEl.parentNode) return;
      selectorEl = document.createElement("div");
      selectorEl.id = "lumio-address-selector";
      selectorEl.style.cssText = "margin-bottom:12px;";
      checkoutBtnEl.parentNode.insertBefore(selectorEl, checkoutBtnEl);
    }

    try {
      const addresses = await window.LumioAPI.getAddressesByUser(userId);
      if (!addresses || !addresses.length) {
        selectorEl.innerHTML = `
          <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:10px 12px;font-size:0.85rem;color:#713f12;margin-bottom:8px;">
            📍 No saved address. <button type="button" id="btn-add-addr-inline" style="background:none;border:none;color:#7c3aed;font-weight:700;cursor:pointer;text-decoration:underline;">Add one now</button>
          </div>`;
        document.getElementById("btn-add-addr-inline")?.addEventListener("click", () => openAddAddressForm(userId));
        selectedAddressId = null;
      } else {
        const preferred = addresses.find((a) => a.id === preferAddressId) || addresses.find((a) => a.id === selectedAddressId) || addresses[0];
        selectedAddressId = preferred.id;
        selectorEl.innerHTML = `
          <div style="margin-bottom:10px;">
            <label style="font-size:0.85rem;font-weight:600;color:#374151;display:block;margin-bottom:4px;">📍 Deliver to:</label>
            <select id="addr-select" style="width:100%;padding:8px 10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:0.85rem;color:#1e293b;background:#fff;cursor:pointer;">
              ${addresses.map((a) => `<option value="${a.id}" ${a.id === selectedAddressId ? "selected" : ""}>${esc(a.street)}, ${esc(a.city)} - ${esc(a.pincode)}</option>`).join("")}
            </select>
            <button type="button" id="btn-add-addr-inline" style="margin-top:5px;background:none;border:none;color:#7c3aed;font-size:0.78rem;font-weight:600;cursor:pointer;text-decoration:underline;">+ Add new address</button>
          </div>`;
        document.getElementById("addr-select")?.addEventListener("change", (e) => {
          selectedAddressId = parseInt(e.target.value, 10);
        });
        document.getElementById("btn-add-addr-inline")?.addEventListener("click", () => openAddAddressForm(userId));
      }
    } catch (err) {
      selectorEl.innerHTML = "";
    }
  }

  // ---- Add Address Inline Form ----
  function openAddAddressForm(userId) {
    let formEl = document.getElementById("lumio-inline-addr-form");
    if (formEl) { formEl.remove(); return; }

    const selectorEl = document.getElementById("lumio-address-selector");
    if (!selectorEl) return;

    formEl = document.createElement("form");
    formEl.id = "lumio-inline-addr-form";
    formEl.style.cssText = "background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:10px;text-align:left;";
    formEl.innerHTML = `
      <p style="font-size:0.88rem;font-weight:700;color:#1e293b;margin-bottom:8px;">➕ New Delivery Address</p>
      <input type="text" id="addr-street" placeholder="Street / Flat / Area" required style="width:100%;padding:7px 9px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:0.83rem;margin-bottom:6px;box-sizing:border-box;">
      <div style="display:flex;gap:6px;">
        <input type="text" id="addr-city" placeholder="City" required style="flex:1;padding:7px 9px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:0.83rem;">
        <input type="text" id="addr-pincode" placeholder="Pincode" required style="width:90px;padding:7px 9px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:0.83rem;">
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button type="submit" class="lumio-btn lumio-btn-primary lumio-btn-sm" style="flex:1;">Save Address</button>
        <button type="button" class="lumio-btn lumio-btn-secondary lumio-btn-sm" id="cancel-addr-btn">Cancel</button>
      </div>`;

    selectorEl.after(formEl);
    document.getElementById("cancel-addr-btn").addEventListener("click", () => formEl.remove());

    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const created = await window.LumioAPI.createAddress({
          user_id: userId,
          street: document.getElementById("addr-street").value.trim(),
          city: document.getElementById("addr-city").value.trim(),
          pincode: document.getElementById("addr-pincode").value.trim(),
        });
        formEl.remove();
        toast("Address saved!", "success");
        await renderAddressSelector(userId, created && created.id); // select the new address
      } catch (err) {
        toast(err.message || "Failed to save address", "error");
      }
    });
  }

  // ---- Global Cart Actions ----
  // Logged in: itemId = CartItem.id.  Guest: itemId = product.id.

  // Runs a cart request with a lock so rapid clicks can't send overlapping updates.
  async function withLock(fn) {
    if (busy) return;
    busy = true;
    try { await fn(); } finally { busy = false; }
  }

  // After a failed mutation (e.g. 409 stock change, 404 item gone) re-read the real cart.
  async function resyncAfterError(user) {
    try { applyCart(await window.LumioAPI.getCart(user.id)); } catch (_) { /* keep current view */ }
  }

  window.updateCartItemQty = function (itemId, delta) {
    return withLock(async () => {
      const user = getUser();
      if (user && currentCart) {
        const cartItem = currentCart.items.find((i) => String(i.id) === String(itemId));
        if (!cartItem) return;
        try {
          // newQty <= 0 makes the backend remove the item and return the updated cart
          applyCart(await window.LumioAPI.updateCartItem(user.id, cartItem.id, cartItem.quantity + delta));
        } catch (err) {
          toast(err.message || "Failed to update cart", "error");
          await resyncAfterError(user);
        }
      } else {
        window.LumioCart.updateQty(itemId, delta);
        renderLocalCart();
      }
    });
  };

  window.removeCartItem = function (itemId) {
    return withLock(async () => {
      const user = getUser();
      if (user && currentCart) {
        try {
          applyCart(await window.LumioAPI.removeCartItem(user.id, itemId));
          toast("Item removed", "success");
        } catch (err) {
          toast(err.message || "Failed to remove item", "error");
          await resyncAfterError(user);
        }
      } else {
        window.LumioCart.removeItem(itemId);
        toast("Item removed from cart", "success");
        renderLocalCart();
      }
    });
  };

  window.clearCart = function () {
    return withLock(async () => {
      const user = getUser();
      if (user && currentCart) {
        if (!(currentCart.items || []).length) { toast("Cart is already empty", "error"); return; }
        if (!confirm("Remove all items from your cart?")) return;
        try {
          await window.LumioAPI.clearCart(user.id);          // 204, no body
          applyCart(await window.LumioAPI.getCart(user.id));
          toast("Cart cleared", "success");
        } catch (err) {
          toast(err.message || "Failed to clear cart", "error");
        }
      } else {
        if (!window.LumioCart.getItems().length) { toast("Cart is already empty", "error"); return; }
        if (!confirm("Remove all items from your cart?")) return;
        window.LumioCart.clear();
        toast("Cart cleared", "success");
        renderLocalCart();
      }
    });
  };

  // ---- Checkout ----
  function setupCheckout() {
    const checkoutBtn = document.querySelector(".checkout-btn");
    if (!checkoutBtn) return;

    checkoutBtn.addEventListener("click", async () => {
      if (busy) return;
      const user = getUser();

      if (!user) {
        toast("Please sign in to place an order.", "error");
        if (window.LumioUI && window.LumioUI.openAuthModal) window.LumioUI.openAuthModal();
        return;
      }

      if (!currentCart || !currentCart.items || !currentCart.items.length) {
        toast("Your cart is empty! Add products first.", "error");
        return;
      }

      const totals = computeTotals(dbItemsForTotals(currentCart));
      const confirmed = confirm(
        `Confirm Order for ${user.full_name}?\n\n` +
        `Items: ${currentCart.items.length} product(s)\n` +
        `Subtotal: ${money(totals.subtotal)}\n` +
        `GST (18%): ${money(totals.tax)}\n` +
        `Total: ${money(totals.total)}\n\n` +
        (selectedAddressId ? "Delivery to saved address." : "⚠️ No address selected — order will be placed without delivery address.") +
        "\n\nClick OK to place order."
      );
      if (!confirmed) return;

      busy = true;
      checkoutBtn.disabled = true;
      // The button contains an icon + label + arrow: only swap the label text.
      const labelEl = checkoutBtn.querySelector("span:not(.arrow)") || checkoutBtn;
      const originalLabel = labelEl.textContent;
      labelEl.textContent = "Placing Order...";

      try {
        // POST /orders/ -> OrderResponse. Backend has already emptied the cart and reduced stock.
        const order = await window.LumioAPI.createOrder(user.id, selectedAddressId);
        lastOrder = order;
        applyCart(await window.LumioAPI.getCart(user.id)); // empty cart + confirmation panel + badge = 0
        toast(`🎉 Order #${order.id} placed! Total ${money(order.total_amount)}.`, "success");
      } catch (err) {
        // 400 empty cart, 404 address, 409 stock changed since the cart was loaded...
        toast(err.message || "Failed to place order", "error");
        await resyncAfterError(user);
      } finally {
        busy = false;
        checkoutBtn.disabled = false;
        labelEl.textContent = originalLabel;
      }
    });
  }

  // ---- Init ----
  window.addEventListener("DOMContentLoaded", async () => {
    await renderCart();
    setupCheckout();
  });

  // Re-render when auth changes (e.g., user logs in on the cart page)
  window.addEventListener("lumio:auth_changed", async () => {
    currentCart = null;
    lastOrder = null;
    selectedAddressId = null;
    await renderCart();
  });

  // Guest cart changes (LumioCart.saveItems) -> redraw. Ignore sync-originated events.
  window.addEventListener("lumio:cart_updated", (e) => {
    const fromSync = e.detail && e.detail.source === "sync";
    if (!isLoggedIn() && !fromSync) renderLocalCart();
  });
})();