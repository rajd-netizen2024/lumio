/**
 * LUMIO Full-Stack UI Controller
 * Handles Navigation Badges, Auth Modals, Toast Alerts, and Retailer Product Controls
 */

(function () {
  // Escape user/DB-supplied text before putting it into innerHTML
  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (ch) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
    ));
  }

  // Toast Notification System
  function showToast(message, type = "success") {
    let container = document.querySelector(".lumio-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "lumio-toast-container";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `lumio-toast ${type}`;

    const iconSvg =
      type === "success"
        ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
        : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

    toast.innerHTML = iconSvg;
    const msgEl = document.createElement("span");
    msgEl.textContent = message; // text only: messages can contain product names
    toast.appendChild(msgEl);

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = "opacity 0.3s, transform 0.3s";
      toast.style.opacity = "0";
      toast.style.transform = "translateX(100%)";
      setTimeout(() => toast.remove(), 350);
    }, 3200);
  }

  // Inject Modal Markup into DOM
  function injectAuthModal() {
    if (document.getElementById("lumio-auth-modal-backdrop")) return;

    const modalBackdrop = document.createElement("div");
    modalBackdrop.id = "lumio-auth-modal-backdrop";
    modalBackdrop.className = "lumio-modal-backdrop";

    modalBackdrop.innerHTML = `
      <div class="lumio-modal" id="lumio-auth-modal">
        <div class="modal-header">
          <h3 id="modal-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3C1A8D" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            <span>Account</span>
          </h3>
          <button class="modal-close-btn" id="modal-close-btn">&times;</button>
        </div>

        <div id="modal-dynamic-content">
          <!-- Dynamic Content based on auth state -->
        </div>
      </div>
    `;

    document.body.appendChild(modalBackdrop);

    // Event listeners for close
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) {
        closeAuthModal();
      }
    });

    document.getElementById("modal-close-btn").addEventListener("click", () => {
      closeAuthModal();
    });
  }

  function openAuthModal() {
    injectAuthModal();
    renderAuthModalContent();
    const backdrop = document.getElementById("lumio-auth-modal-backdrop");
    backdrop.classList.add("active");
  }

  function closeAuthModal() {
    const backdrop = document.getElementById("lumio-auth-modal-backdrop");
    if (backdrop) backdrop.classList.remove("active");
  }

  // Render modal content depending on user session
  function renderAuthModalContent(activeTab = "login") {
    const container = document.getElementById("modal-dynamic-content");
    const user = window.LumioAuth.getUser();

    if (user) {
      // User is logged in: show profile & retailer tools
      const isRetailer = window.LumioAuth.isRetailerOrAdmin();
      const initials = (user.full_name || user.email || "U")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

      container.innerHTML = `
        <div class="user-profile-card">
          <div class="user-profile-avatar">${initials}</div>
          <h4 class="user-profile-name">${esc(user.full_name)}</h4>
          <p class="user-profile-email">${esc(user.email)}</p>
          <div class="user-profile-meta">
            <span class="profile-tag role-${user.role.toLowerCase()}">
              ★ ${user.role.toUpperCase()}
            </span>
            ${user.phone ? `<span class="profile-tag">📞 ${esc(user.phone)}</span>` : ""}
            <span class="profile-tag">ID: #${user.id}</span>
          </div>

          ${
            isRetailer
              ? `
              <div style="margin: 16px 0 8px; padding: 14px; background: #fdf4ff; border: 1px solid #f0abfc; border-radius: 12px; text-align: left;">
                <h5 style="color: #86198f; font-size: 0.95rem; margin-bottom: 8px; font-weight: 700;">🏪 Retailer Controls</h5>
                <p style="font-size: 0.82rem; color: #701a75; margin-bottom: 12px;">Add inventory or manage existing products in the database.</p>
                <div style="display: flex; gap: 8px;">
                  <button class="lumio-btn lumio-btn-primary lumio-btn-sm" id="btn-show-add-product" style="flex: 1;">
                    ➕ Add Product
                  </button>
                  <button class="lumio-btn lumio-btn-secondary lumio-btn-sm" id="btn-show-manage-products" style="flex: 1;">
                    📋 Manage Catalog
                  </button>
                </div>
              </div>
              <div id="retailer-action-area"></div>
            `
              : ""
          }

          <div style="margin: 10px 0 8px; padding: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; text-align: left;">
            <h5 style="color: #166534; font-size: 0.88rem; margin-bottom: 8px; font-weight: 700;">📍 My Addresses</h5>
            <div id="address-manager-area"><p style="font-size:0.82rem;color:#64748b;">Loading addresses...</p></div>
          </div>

          <div style="margin-top: 16px; display: flex; gap: 10px;">
            <button class="lumio-btn lumio-btn-danger" id="btn-logout">
              Sign Out
            </button>
          </div>
        </div>
      `;

      document.getElementById("btn-logout").addEventListener("click", () => {
        window.LumioAuth.logout();
        showToast("Signed out successfully", "success");
        closeAuthModal();
      });

      if (isRetailer) {
        document
          .getElementById("btn-show-add-product")
          .addEventListener("click", renderAddProductForm);
        document
          .getElementById("btn-show-manage-products")
          .addEventListener("click", renderManageProductsTable);
      }

      // Load addresses into the address manager panel
      renderAddressManager(user.id);
    } else {
      // User is logged out: show sign in / sign up forms
      container.innerHTML = `
        <div class="auth-tabs">
          <button class="auth-tab-btn ${activeTab === "login" ? "active" : ""}" id="tab-login-btn">Sign In</button>
          <button class="auth-tab-btn ${activeTab === "register" ? "active" : ""}" id="tab-register-btn">Create Account</button>
        </div>

        ${
          activeTab === "login"
            ? `
            <form id="login-form">
              <div class="lumio-form-group">
                <label>Email Address</label>
                <input type="email" id="login-email" class="lumio-form-control" required placeholder="name@example.com">
              </div>
              <div class="lumio-form-group">
                <label>Password</label>
                <input type="password" id="login-password" class="lumio-form-control" required placeholder="••••••••">
              </div>
              <button type="submit" class="lumio-btn lumio-btn-primary" style="margin-top: 10px;">
                Sign In
              </button>
            </form>

            <div class="demo-quick-logins">
              <p>⚡ Quick Test Credentials (from Database):</p>
              <div class="demo-login-tags">
                <button type="button" class="demo-login-btn" id="btn-quick-customer">
                  <span><strong>Alice Johnson</strong> (Customer)</span>
                  <span style="color:#7c3aed;">Sign In &rarr;</span>
                </button>
                <button type="button" class="demo-login-btn" id="btn-quick-retailer">
                  <span><strong>Apex Store</strong> (Retailer)</span>
                  <span style="color:#7c3aed;">Sign In &rarr;</span>
                </button>
              </div>
            </div>
          `
            : `
            <form id="register-form">
              <div class="lumio-form-group">
                <label>Full Name</label>
                <input type="text" id="reg-name" class="lumio-form-control" required placeholder="John Doe">
              </div>
              <div class="lumio-form-group">
                <label>Email Address</label>
                <input type="email" id="reg-email" class="lumio-form-control" required placeholder="john@example.com">
              </div>
              <div class="lumio-form-row">
                <div class="lumio-form-group">
                  <label>Phone Number</label>
                  <input type="tel" id="reg-phone" class="lumio-form-control" placeholder="+91 98765 43210">
                </div>
                <div class="lumio-form-group">
                  <label>Account Role</label>
                  <select id="reg-role" class="lumio-form-control">
                    <option value="customer">Customer</option>
                    <option value="retailer">Retailer (Seller)</option>
                  </select>
                </div>
              </div>
              <div class="lumio-form-group">
                <label>Password</label>
                <input type="password" id="reg-password" class="lumio-form-control" required placeholder="Create a secure password">
              </div>
              <button type="submit" class="lumio-btn lumio-btn-primary" style="margin-top: 10px;">
                Create Account
              </button>
            </form>
          `
        }
      `;

      // Tabs click listeners
      document
        .getElementById("tab-login-btn")
        ?.addEventListener("click", () => renderAuthModalContent("login"));
      document
        .getElementById("tab-register-btn")
        ?.addEventListener("click", () => renderAuthModalContent("register"));

      // Login form submit
      const loginForm = document.getElementById("login-form");
      if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const email = document.getElementById("login-email").value.trim();
          const password = document.getElementById("login-password").value;
          const submitBtn = loginForm.querySelector("button[type='submit']");
          submitBtn.disabled = true;
          submitBtn.textContent = "Signing In...";

          try {
            const user = await window.LumioAPI.login(email, password);
            window.LumioAuth.setUser(user);
            showToast(`Welcome back, ${user.full_name}!`, "success");
            closeAuthModal();
          } catch (err) {
            showToast(err.message || "Failed to sign in", "error");
          } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Sign In";
          }
        });

        // Quick login helpers
        document
          .getElementById("btn-quick-customer")
          ?.addEventListener("click", async () => {
            document.getElementById("login-email").value = "alice@example.com";
            document.getElementById("login-password").value = "customerpassword123";
            loginForm.requestSubmit();
          });

        document
          .getElementById("btn-quick-retailer")
          ?.addEventListener("click", async () => {
            document.getElementById("login-email").value =
              "sales@apexelectronics.com";
            document.getElementById("login-password").value = "retailerpassword123";
            loginForm.requestSubmit();
          });
      }

      // Register form submit
      const regForm = document.getElementById("register-form");
      if (regForm) {
        regForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const payload = {
            full_name: document.getElementById("reg-name").value.trim(),
            email: document.getElementById("reg-email").value.trim(),
            phone: document.getElementById("reg-phone").value.trim() || null,
            role: document.getElementById("reg-role").value,
            password: document.getElementById("reg-password").value,
          };

          const submitBtn = regForm.querySelector("button[type='submit']");
          submitBtn.disabled = true;
          submitBtn.textContent = "Creating Account...";

          try {
            const newUser = await window.LumioAPI.register(payload);
            window.LumioAuth.setUser(newUser);
            showToast(
              `Account registered! Welcome, ${newUser.full_name}!`,
              "success"
            );
            closeAuthModal();
          } catch (err) {
            showToast(err.message || "Registration failed", "error");
          } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Create Account";
          }
        });
      }
    }
  }

  // Retailer View: Add Product Form
  function renderAddProductForm() {
    const area = document.getElementById("retailer-action-area");
    if (!area) return;

    area.innerHTML = `
      <form id="add-product-form" style="margin-top: 15px; padding: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; text-align: left;">
        <h5 style="font-size: 0.95rem; color: #1e293b; margin-bottom: 12px; font-weight: 700;">➕ New Product Details</h5>
        
        <div class="lumio-form-group">
          <label>Product Name</label>
          <input type="text" id="prod-name" class="lumio-form-control" required placeholder="e.g. Modern Glass Coffee Table">
        </div>

        <div class="lumio-form-row">
          <div class="lumio-form-group">
            <label>Category</label>
            <select id="prod-category" class="lumio-form-control">
              <option value="Home Essentials">Home Essentials</option>
              <option value="Groceries">Groceries</option>
              <option value="Stationery Items">Stationery Items</option>
              <option value="Pet Supplies">Pet Supplies</option>
              <option value="Toys">Toys</option>
              <option value="Food and Drinks">Food and Drinks</option>
              <option value="Audio">Audio / Electronics</option>
            </select>
          </div>
          <div class="lumio-form-group">
            <label>Brand</label>
            <input type="text" id="prod-brand" class="lumio-form-control" placeholder="e.g. Lumio Living">
          </div>
        </div>

        <div class="lumio-form-row">
          <div class="lumio-form-group">
            <label>Selling Price (₹)</label>
            <input type="number" step="0.01" id="prod-price" class="lumio-form-control" required placeholder="999.00">
          </div>
          <div class="lumio-form-group">
            <label>Original Price (₹)</label>
            <input type="number" step="0.01" id="prod-orig-price" class="lumio-form-control" placeholder="1499.00">
          </div>
          <div class="lumio-form-group">
            <label>Stock Qty</label>
            <input type="number" id="prod-stock" class="lumio-form-control" value="25">
          </div>
        </div>

        <div class="lumio-form-group">
          <label>Image URL</label>
          <input type="url" id="prod-image" class="lumio-form-control" placeholder="https://images.unsplash.com/...">
        </div>

        <div class="lumio-form-group">
          <label>Description</label>
          <textarea id="prod-desc" rows="2" class="lumio-form-control" placeholder="Product features and specifications..."></textarea>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 10px;">
          <button type="submit" class="lumio-btn lumio-btn-primary lumio-btn-sm" style="flex: 1;">Save to Database</button>
          <button type="button" class="lumio-btn lumio-btn-secondary lumio-btn-sm" onclick="document.getElementById('retailer-action-area').innerHTML=''">Cancel</button>
        </div>
      </form>
    `;

    document
      .getElementById("add-product-form")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
          name: document.getElementById("prod-name").value.trim(),
          category: document.getElementById("prod-category").value,
          brand: document.getElementById("prod-brand").value.trim() || null,
          price: parseFloat(document.getElementById("prod-price").value),
          original_price: document.getElementById("prod-orig-price").value
            ? parseFloat(document.getElementById("prod-orig-price").value)
            : null,
          stock_quantity:
            parseInt(document.getElementById("prod-stock").value, 10) || 0,
          image_url:
            document.getElementById("prod-image").value.trim() ||
            "https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?w=500",
          description: document.getElementById("prod-desc").value.trim() || null,
          is_available: true,
        };

        try {
          const created = await window.LumioAPI.createProduct(payload);
          showToast(`Product "${created.name}" created successfully!`, "success");
          area.innerHTML = "";
          // Notify any listening product grids to reload
          window.dispatchEvent(
            new CustomEvent("lumio:product_created", { detail: created })
          );
        } catch (err) {
          showToast(err.message || "Failed to create product", "error");
        }
      });
  }

  // Retailer View: Manage Products Table
  async function renderManageProductsTable() {
    const area = document.getElementById("retailer-action-area");
    if (!area) return;

    area.innerHTML = `
      <div style="margin-top: 15px; text-align: left; max-height: 250px; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h5 style="font-size: 0.95rem; color: #1e293b; font-weight: 700;">Catalog Items</h5>
          <button type="button" class="lumio-btn lumio-btn-secondary lumio-btn-sm" onclick="document.getElementById('retailer-action-area').innerHTML=''">Close</button>
        </div>
        <div id="retailer-table-container">Loading products...</div>
      </div>
    `;

    try {
      const products = await window.LumioAPI.getProducts({ limit: 100 });
      const tableDiv = document.getElementById("retailer-table-container");
      if (!tableDiv) return;

      if (!products.length) {
        tableDiv.innerHTML = `<p style="font-size: 0.85rem; color: #64748b;">No products found in database.</p>`;
        return;
      }

      tableDiv.innerHTML = `
        <table class="retailer-product-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Category</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${products
              .map(
                (p) => `
              <tr id="row-prod-${p.id}">
                <td>#${p.id}</td>
                <td><strong>${esc(p.name)}</strong></td>
                <td>${esc(p.category)}</td>
                <td>₹${Number(p.price).toLocaleString()}</td>
                <td>${p.stock_quantity}</td>
                <td>
                  <button class="lumio-btn lumio-btn-danger lumio-btn-sm btn-del-prod" data-id="${p.id}" style="padding: 2px 8px; font-size: 0.75rem;">
                    Delete
                  </button>
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      `;

      // Attach delete handlers
      tableDiv.querySelectorAll(".btn-del-prod").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-id");
          if (confirm(`Are you sure you want to delete product #${id}?`)) {
            try {
              await window.LumioAPI.deleteProduct(id);
              document.getElementById(`row-prod-${id}`)?.remove();
              showToast(`Product #${id} deleted`, "success");
              window.dispatchEvent(
                new CustomEvent("lumio:product_deleted", { detail: { id } })
              );
            } catch (err) {
              showToast(err.message || "Failed to delete product", "error");
            }
          }
        });
      });
    } catch (err) {
      document.getElementById("retailer-table-container").innerHTML = `
        <p style="color: #ef4444; font-size: 0.85rem;">Error loading products: ${esc(err.message)}</p>
      `;
    }
  }

  // Address Manager (inside auth modal profile view)
  async function renderAddressManager(userId) {
    const area = document.getElementById("address-manager-area");
    if (!area) return;

    area.innerHTML = `<p style="font-size:0.82rem;color:#64748b;">Loading...</p>`;

    try {
      const addresses = await window.LumioAPI.getAddressesByUser(userId);

      if (!addresses || !addresses.length) {
        area.innerHTML = `
          <p style="font-size:0.82rem;color:#64748b;margin-bottom:6px;">No saved addresses.</p>
          <button type="button" class="lumio-btn lumio-btn-secondary lumio-btn-sm" id="btn-add-addr">+ Add Address</button>
          <div id="add-addr-form-area"></div>`;
      } else {
        area.innerHTML = `
          <div id="addr-list" style="margin-bottom:6px;">
            ${addresses.map(a => `
              <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #e2e8f0;border-radius:7px;padding:6px 10px;margin-bottom:4px;font-size:0.82rem;">
                <span>📍 ${esc(a.street)}, ${esc(a.city)} – ${esc(a.pincode)}</span>
                <button type="button" data-addr-id="${a.id}" class="lumio-btn lumio-btn-danger lumio-btn-sm btn-del-addr" style="padding:1px 7px;font-size:0.74rem;">✕</button>
              </div>`).join("")}
          </div>
          <button type="button" class="lumio-btn lumio-btn-secondary lumio-btn-sm" id="btn-add-addr">+ Add Address</button>
          <div id="add-addr-form-area"></div>`;

        area.querySelectorAll(".btn-del-addr").forEach(btn => {
          btn.addEventListener("click", async () => {
            const addrId = btn.getAttribute("data-addr-id");
            if (!confirm("Remove this address?")) return;
            try {
              await window.LumioAPI.deleteAddress(addrId);
              showToast("Address removed", "success");
              renderAddressManager(userId);
            } catch (err) {
              showToast(err.message || "Failed to remove address", "error");
            }
          });
        });
      }

      // Add address form toggle
      document.getElementById("btn-add-addr")?.addEventListener("click", () => {
        const formArea = document.getElementById("add-addr-form-area");
        if (!formArea) return;
        if (formArea.innerHTML) { formArea.innerHTML = ""; return; }
        formArea.innerHTML = `
          <form id="modal-addr-form" style="margin-top:8px;">
            <input type="text" id="modal-addr-street" placeholder="Street / Flat / Area" required
              style="width:100%;padding:6px 8px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:0.82rem;margin-bottom:5px;box-sizing:border-box;">
            <div style="display:flex;gap:5px;margin-bottom:5px;">
              <input type="text" id="modal-addr-city" placeholder="City" required
                style="flex:1;padding:6px 8px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:0.82rem;">
              <input type="text" id="modal-addr-pincode" placeholder="Pincode" required
                style="width:80px;padding:6px 8px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:0.82rem;">
            </div>
            <div style="display:flex;gap:6px;">
              <button type="submit" class="lumio-btn lumio-btn-primary lumio-btn-sm" style="flex:1;">Save</button>
              <button type="button" id="cancel-modal-addr" class="lumio-btn lumio-btn-secondary lumio-btn-sm">Cancel</button>
            </div>
          </form>`;
        document.getElementById("cancel-modal-addr")?.addEventListener("click", () => { formArea.innerHTML = ""; });
        document.getElementById("modal-addr-form")?.addEventListener("submit", async (e) => {
          e.preventDefault();
          try {
            await window.LumioAPI.createAddress({
              user_id: userId,
              street: document.getElementById("modal-addr-street").value.trim(),
              city: document.getElementById("modal-addr-city").value.trim(),
              pincode: document.getElementById("modal-addr-pincode").value.trim(),
            });
            showToast("Address saved!", "success");
            renderAddressManager(userId);
          } catch (err) {
            showToast(err.message || "Failed to save address", "error");
          }
        });
      });
    } catch (err) {
      area.innerHTML = `<p style="font-size:0.82rem;color:#ef4444;">Could not load addresses.</p>`;
    }
  }

  // Update Header Badges & User Status — prefer DB cart count for logged-in users, else localStorage
  function updateHeaderUI() {
    // 1. Cart Badge — prefer DB cart count for logged-in users, else localStorage
    const cartLinks = document.querySelectorAll(
      ".header .icons a[href*='cart.html'], .links a[href*='cart.html']"
    );
    const count = window.LumioCart.getCount();

    cartLinks.forEach((link) => {
      let badge = link.querySelector(".cart-badge");
      if (!badge) {
        link.classList.add("cart-icon-wrapper");
        badge = document.createElement("span");
        badge.className = "cart-badge";
        link.appendChild(badge);
      }
      badge.textContent = count;
      badge.style.display = count > 0 ? "inline-flex" : "none";
      badge.classList.add("bump");
      setTimeout(() => badge.classList.remove("bump"), 200);
    });

    // 2. User Icon / Pill in header
    const userIcons = document.querySelectorAll(".header .icons li:last-child");
    const currentUser = window.LumioAuth.getUser();

    userIcons.forEach((li) => {
      // Avoid replacing if it's the cart link
      if (li.querySelector("a[href*='cart.html']")) return;

      let pill = li.querySelector(".user-status-pill");
      const rawSvg = li.querySelector("svg");

      if (currentUser) {
        if (!pill) {
          pill = document.createElement("div");
          pill.className = "user-status-pill";
          li.appendChild(pill);
        }
        if (rawSvg) rawSvg.style.display = "none";
        pill.innerHTML = `
          <span>👤 ${esc(currentUser.full_name.split(" ")[0])}</span>
          <span class="user-role-badge">${currentUser.role}</span>
        `;
        pill.title = `Logged in as ${currentUser.full_name} (${currentUser.role})`;
      } else {
        if (pill) pill.remove();
        if (rawSvg) rawSvg.style.display = "block";
      }

      li.onclick = (e) => {
        e.preventDefault();
        openAuthModal();
      };
    });
  }

  // Standard Product Card HTML Generator
  function renderProductCard(product) {
    const isAvail = product.is_available && product.stock_quantity > 0;
    const badgeHtml = isAvail
      ? `<span class="badge in-stock">In Stock (${product.stock_quantity})</span>`
      : `<span class="badge low-stock">Out of Stock</span>`;

    const imgUrl =
      product.image_url ||
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500";

    return `
      <div class="card" data-id="${product.id}" data-price="${product.price}">
        <div class="card-media">
          <img src="${esc(imgUrl)}" alt="${esc(product.name)}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500';">
        </div>
        <div class="card-info">
          <h3>${esc(product.name)}</h3>
          ${product.brand ? `<p style="font-size: 0.78rem; color: #6b7280; margin-bottom: 4px;">Brand: ${esc(product.brand)}</p>` : ""}
          <div class="price">
            ₹${Number(product.price).toLocaleString()}
            ${
              product.original_price
                ? `<span style="font-size: 0.85rem; color: #9ca3af; text-decoration: line-through; margin-left: 6px; font-weight: 400;">₹${Number(product.original_price).toLocaleString()}</span>`
                : ""
            }
          </div>
          ${badgeHtml}
          <div class="rating">
            <span class="star">&#9733;</span>
            <span class="score">4.8</span>
            <span class="count">(${product.stock_quantity + 15} reviews)</span>
          </div>
          <button class="cart-btn" type="button"
            data-product-id="${product.id}"
            ${!isAvail ? "disabled style='opacity:0.6; cursor:not-allowed;'" : ""}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.29 2.29A1 1 0 0 0 5.4 17H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-8 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
            </svg>
            Add to Cart
          </button>
        </div>
      </div>
    `;
  }

  // Fallback "Add to Cart" handler for cards on pages that don't run catalog.js.
  // catalog.js binds its own handler (it has the full product) and calls preventDefault(),
  // so we skip those clicks here to avoid adding the item twice.
  document.addEventListener("click", async (e) => {
    if (e.defaultPrevented) return;
    const btn = e.target.closest(".cart-btn[data-product-id]");
    if (!btn || btn.disabled) return;

    const productId = parseInt(btn.getAttribute("data-product-id"), 10);
    const card = btn.closest(".card");
    const productData = {
      id: productId,
      name: card?.querySelector("h3")?.textContent || "Product",
      price: parseFloat(card?.getAttribute("data-price") || "0"),
      image_url: card?.querySelector("img")?.src || "",
      category: "",
      brand: "",
    };

    btn.disabled = true;
    btn.style.opacity = "0.7";
    try {
      // Logged in -> POST /cart/{user}/items; guest -> localStorage. Badge updates via event.
      const result = await window.LumioCartSync.add(productData, 1);
      showToast(
        result.mode === "local" ? "Added to cart! Sign in to save your cart." : "Added to cart!",
        "success"
      );
    } catch (err) {
      showToast(err.message || "Failed to add to cart", "error");
    } finally {
      btn.disabled = false;
      btn.style.opacity = "";
    }
  });

  // Setup Event Listeners
  window.addEventListener("DOMContentLoaded", () => {
    updateHeaderUI();
  });

  window.addEventListener("lumio:cart_updated", updateHeaderUI);
  window.addEventListener("lumio:auth_changed", updateHeaderUI);

  // Expose API to window
  window.LumioUI = {
    toast: showToast,
    openAuthModal,
    closeAuthModal,
    renderProductCard,
    updateHeaderUI,
  };
})();