// eusol-pos.js — Phase 1: Live product grid + categories + search/barcode
// Phase 2+ will extend `EP` with cart, customer, checkout, shift logic.

const EP = {
  items: [],
  bins: {},            // item_code -> actual_qty
  categories: [],
  activeCategory: "all",
  searchTerm: "",
  warehouse: null,      // set from Settings later; null = sum all warehouses
  cart: { items: [], customer: null, discount: 0, notes: "" },
};

// ---------- INIT ----------
frappe.ready(function () {
  EP.bindNav();
  EP.bindSearchAndBarcode();
  EP.startShiftClock();
  EP.bindNetworkStatus();
  EP.bindCustomerModal();
  EP.bindPaymentMethods();
  EP.bindChargeButton();
  EP.bindDiscountButton();
  EP.loadProducts();
  EP.renderCart();
});

// ---------- NAV ----------
EP.bindNav = function () {
  document.querySelectorAll(".ep-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".ep-nav-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      // Phase 1: only POS view is wired. Other views are placeholders for now.
      const view = btn.dataset.view;
      if (view !== "pos") {
        frappe.show_alert({ message: `"${btn.textContent}" view is coming in a later phase`, indicator: "blue" });
      }
    });
  });
};

// ---------- SHIFT CLOCK (visual only in Phase 1; real shift doctype lands in Phase 4) ----------
EP.startShiftClock = function () {
  EP.shiftStart = EP.shiftStart || new Date();
  setInterval(() => {
    const diff = Math.floor((new Date() - EP.shiftStart) / 1000);
    const h = String(Math.floor(diff / 3600)).padStart(2, "0");
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
    const s = String(diff % 60).padStart(2, "0");
    const el = document.getElementById("ep-shift-clock");
    if (el) el.textContent = `${h}:${m}:${s}`;
  }, 1000);
};

// ---------- ONLINE / OFFLINE INDICATOR ----------
EP.bindNetworkStatus = function () {
  const dot = document.getElementById("ep-online-dot");
  const update = () => {
    if (!dot) return;
    dot.classList.toggle("offline", !navigator.onLine);
    dot.title = navigator.onLine ? "Online" : "Offline — sales will queue locally";
  };
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
};

// ---------- SEARCH + BARCODE ----------
EP.bindSearchAndBarcode = function () {
  const searchInput = document.getElementById("ep-search-input");
  searchInput.addEventListener("input", (e) => {
    EP.searchTerm = e.target.value.trim().toLowerCase();
    EP.renderProductGrid();
  });

  // Barcode scanners type fast and end with Enter. We buffer keystrokes
  // on the dedicated barcode field; this also doubles as a quick search.
  const barcodeInput = document.getElementById("ep-barcode-input");
  barcodeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const code = barcodeInput.value.trim();
      if (code) EP.handleBarcode(code);
      barcodeInput.value = "";
    }
  });
};

EP.handleBarcode = function (code) {
  // Try exact barcode match first, then fall back to item_code/name match.
  const found = EP.items.find(
    (it) =>
      (it.barcode && it.barcode === code) ||
      it.item_code === code ||
      it.item_name.toLowerCase() === code.toLowerCase()
  );
  if (found) {
    EP.addToCart(found);
  } else {
    frappe.show_alert({ message: `No product found for "${code}"`, indicator: "red" });
  }
};

// ============================================================
// PHASE 2: PAYMENT METHOD SELECTION + CHARGE + DISCOUNT
// ============================================================

EP.selectedPaymentMethod = null;

EP.bindPaymentMethods = function () {
  document.querySelectorAll(".ep-pay-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".ep-pay-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      EP.selectedPaymentMethod = btn.dataset.method;
    });
  });
};

EP.bindDiscountButton = function () {
  document.getElementById("ep-discount-btn").addEventListener("click", () => {
    const subtotal = EP.cart.items.reduce((sum, l) => sum + l.rate * l.qty, 0);
    if (subtotal === 0) {
      frappe.show_alert({ message: "Add items to the cart first", indicator: "orange" });
      return;
    }
    const input = prompt("Enter discount amount (GHS):", "0");
    const amount = parseFloat(input);
    if (!isNaN(amount) && amount >= 0) {
      EP.cart.discount = amount;
      EP.renderTotals();
      EP.flash(`Discount applied: GHS ${amount.toFixed(2)}`);
    }
  });
};

EP.bindChargeButton = function () {
  document.getElementById("ep-charge-btn").addEventListener("click", () => {
    if (EP.cart.items.length === 0) return;
    if (!EP.selectedPaymentMethod) {
      frappe.show_alert({ message: "Select a payment method first", indicator: "orange" });
      return;
    }
    // Full checkout (Sales Invoice creation, Paystack, gift/credit logic) lands in Phase 3.
    frappe.show_alert({
      message: `Ready to charge via ${EP.selectedPaymentMethod.toUpperCase()} — checkout logic arrives in Phase 3`,
      indicator: "blue",
    });
  });
};

// ---------- LOAD PRODUCTS ----------
EP.loadProducts = function () {
  frappe.call({
    method: "frappe.client.get_list",
    args: {
      doctype: "Item",
      fields: [
        "item_code",
        "item_name",
        "image",
        "standard_rate",
        "item_group",
        "creation",
      ],
      filters: { disabled: 0, is_sales_item: 1 },
      limit_page_length: 0,
      order_by: "item_name asc",
    },
    callback: function (r) {
      EP.items = r.message || [];
      EP.buildCategories();
      EP.loadStockLevels();
    },
    error: function () {
      document.getElementById("ep-product-grid").innerHTML =
        '<div class="ep-loading">Could not load products. Check your connection.</div>';
    },
  });
};

// ---------- STOCK LEVELS ----------
EP.loadStockLevels = function () {
  frappe.call({
    method: "frappe.client.get_list",
    args: {
      doctype: "Bin",
      fields: ["item_code", "actual_qty", "warehouse"],
      filters: EP.warehouse ? { warehouse: EP.warehouse } : {},
      limit_page_length: 0,
    },
    callback: function (r) {
      EP.bins = {};
      (r.message || []).forEach((b) => {
        EP.bins[b.item_code] = (EP.bins[b.item_code] || 0) + (b.actual_qty || 0);
      });
      EP.renderProductGrid();
    },
    error: function () {
      // If Bin lookup fails (e.g. permissions), still render products without stock info.
      EP.renderProductGrid();
    },
  });
};

// ---------- CATEGORIES ----------
EP.buildCategories = function () {
  const groups = [...new Set(EP.items.map((i) => i.item_group).filter(Boolean))].sort();
  EP.categories = groups;

  const rail = document.getElementById("ep-category-rail");
  // Keep the "All" button, append the rest
  const icons = ["◆", "●", "▲", "■", "✦", "◈", "▣", "✚"];
  groups.forEach((g, idx) => {
    const btn = document.createElement("button");
    btn.className = "ep-cat-btn";
    btn.dataset.category = g;
    btn.innerHTML = `<span class="ep-cat-icon">${icons[idx % icons.length]}</span><span class="ep-cat-label">${EP.truncate(g, 10)}</span>`;
    btn.addEventListener("click", () => {
      EP.activeCategory = g;
      document.querySelectorAll(".ep-cat-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      EP.renderProductGrid();
    });
    rail.appendChild(btn);
  });

  // Wire "All" button (already in HTML)
  rail.querySelector('[data-category="all"]').addEventListener("click", (e) => {
    EP.activeCategory = "all";
    document.querySelectorAll(".ep-cat-btn").forEach((b) => b.classList.remove("active"));
    e.currentTarget.classList.add("active");
    EP.renderProductGrid();
  });
};

EP.truncate = function (s, n) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

// ---------- RENDER GRID ----------
EP.renderProductGrid = function () {
  const grid = document.getElementById("ep-product-grid");
  const countEl = document.getElementById("ep-product-count");

  let list = EP.items;

  if (EP.activeCategory !== "all") {
    list = list.filter((i) => i.item_group === EP.activeCategory);
  }
  if (EP.searchTerm) {
    list = list.filter(
      (i) =>
        i.item_name.toLowerCase().includes(EP.searchTerm) ||
        i.item_code.toLowerCase().includes(EP.searchTerm)
    );
  }

  countEl.textContent = `${list.length} product${list.length === 1 ? "" : "s"}`;

  if (list.length === 0) {
    grid.innerHTML = '<div class="ep-loading">No products match.</div>';
    EP.updateStockAlert();
    return;
  }

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  grid.innerHTML = list
    .map((item) => {
      const qty = EP.bins[item.item_code] ?? null;
      const outOfStock = qty !== null && qty <= 0;
      const lowStock = qty !== null && qty > 0 && qty <= 5;
      const isNew = item.creation && new Date(item.creation).getTime() > sevenDaysAgo;

      let badge = "";
      if (outOfStock) badge = "";
      else if (isNew) badge = '<span class="ep-badge new">New</span>';
      else if (lowStock) badge = '<span class="ep-badge low">Low</span>';

      const imgHtml = item.image
        ? `<img src="${frappe.utils.escape_html(item.image)}" alt="">`
        : EP.emojiForGroup(item.item_group);

      return `
        <div class="ep-product-card ${outOfStock ? "out-of-stock" : ""}" data-item-code="${frappe.utils.escape_html(item.item_code)}">
          ${badge}
          <div class="ep-product-img">${imgHtml}</div>
          <div class="ep-product-name">${frappe.utils.escape_html(item.item_name)}</div>
          <div class="ep-product-price">GHS ${(item.standard_rate || 0).toFixed(2)}</div>
        </div>`;
    })
    .join("");

  grid.querySelectorAll(".ep-product-card:not(.out-of-stock)").forEach((card) => {
    card.addEventListener("click", () => {
      const code = card.dataset.itemCode;
      const item = EP.items.find((i) => i.item_code === code);
      EP.addToCart(item);
    });
  });

  EP.updateStockAlert();
};

// ============================================================
// PHASE 2: CART LOGIC
// ============================================================

EP.VAT_RATE = 0.15;

EP.addToCart = function (item) {
  const existing = EP.cart.items.find((l) => l.item_code === item.item_code);
  if (existing) {
    existing.qty += 1;
  } else {
    EP.cart.items.push({
      item_code: item.item_code,
      item_name: item.item_name,
      image: item.image,
      item_group: item.item_group,
      rate: item.standard_rate || 0,
      qty: 1,
    });
  }
  EP.flash(`Added: ${item.item_name}`);
  EP.renderCart();
};

EP.changeQty = function (item_code, delta) {
  const line = EP.cart.items.find((l) => l.item_code === item_code);
  if (!line) return;
  line.qty += delta;
  if (line.qty <= 0) {
    EP.cart.items = EP.cart.items.filter((l) => l.item_code !== item_code);
  }
  EP.renderCart();
};

EP.removeLine = function (item_code) {
  EP.cart.items = EP.cart.items.filter((l) => l.item_code !== item_code);
  EP.renderCart();
};

EP.renderCart = function () {
  const wrap = document.getElementById("ep-cart-items");

  if (EP.cart.items.length === 0) {
    wrap.innerHTML = '<div class="ep-cart-empty">Cart is empty<br><span>Tap a product to add it</span></div>';
  } else {
    wrap.innerHTML = EP.cart.items
      .map((line) => {
        const imgHtml = line.image
          ? `<img src="${frappe.utils.escape_html(line.image)}" alt="">`
          : EP.emojiForGroup(line.item_group);
        return `
        <div class="ep-cart-line" data-item-code="${frappe.utils.escape_html(line.item_code)}">
          <div class="ep-cart-line-img">${imgHtml}</div>
          <div class="ep-cart-line-info">
            <div class="ep-cart-line-name">${frappe.utils.escape_html(line.item_name)}</div>
            <div class="ep-cart-line-price">GHS ${line.rate.toFixed(2)} × ${line.qty}</div>
          </div>
          <div class="ep-qty-controls">
            <button class="ep-qty-btn ep-qty-minus">−</button>
            <span class="ep-qty-val">${line.qty}</span>
            <button class="ep-qty-btn ep-qty-plus">+</button>
          </div>
          <button class="ep-line-remove">✕</button>
        </div>`;
      })
      .join("");

    wrap.querySelectorAll(".ep-cart-line").forEach((row) => {
      const code = row.dataset.itemCode;
      row.querySelector(".ep-qty-plus").addEventListener("click", () => EP.changeQty(code, 1));
      row.querySelector(".ep-qty-minus").addEventListener("click", () => EP.changeQty(code, -1));
      row.querySelector(".ep-line-remove").addEventListener("click", () => EP.removeLine(code));
    });
  }

  EP.renderTotals();
};

EP.renderTotals = function () {
  const subtotal = EP.cart.items.reduce((sum, l) => sum + l.rate * l.qty, 0);
  const discount = EP.cart.discount || 0;
  const taxable = Math.max(subtotal - discount, 0);
  const vat = taxable * EP.VAT_RATE;
  const grandTotal = taxable + vat;

  document.getElementById("ep-subtotal").textContent = `GHS ${subtotal.toFixed(2)}`;
  document.getElementById("ep-discount-amt").textContent = `GHS ${discount.toFixed(2)}`;
  document.getElementById("ep-vat-amt").textContent = `GHS ${vat.toFixed(2)}`;
  document.getElementById("ep-grand-total").textContent = `GHS ${grandTotal.toFixed(2)}`;
  document.getElementById("ep-charge-amount").textContent = `GHS ${grandTotal.toFixed(2)}`;

  const chargeBtn = document.getElementById("ep-charge-btn");
  chargeBtn.disabled = EP.cart.items.length === 0;
};

// ---------- TOAST ----------
EP.flash = function (message) {
  const el = document.createElement("div");
  el.className = "ep-flash";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
};

// ============================================================
// PHASE 2: CUSTOMER SEARCH + LOYALTY
// ============================================================

EP.bindCustomerModal = function () {
  const modal = document.getElementById("ep-customer-modal");
  const openBtn = document.getElementById("ep-customer-change");
  const closeBtn = document.getElementById("ep-customer-modal-close");
  const searchInput = document.getElementById("ep-customer-search-input");

  openBtn.addEventListener("click", () => {
    modal.style.display = "flex";
    searchInput.value = "";
    searchInput.focus();
    EP.searchCustomers("");
  });

  closeBtn.addEventListener("click", () => (modal.style.display = "none"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  let debounceTimer;
  searchInput.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    const term = e.target.value.trim();
    debounceTimer = setTimeout(() => EP.searchCustomers(term), 250);
  });
};

EP.searchCustomers = function (term) {
  const filters = term
    ? [["customer_name", "like", `%${term}%`]]
    : [];

  frappe.call({
    method: "frappe.client.get_list",
    args: {
      doctype: "Customer",
      fields: ["name", "customer_name", "mobile_no", "loyalty_program"],
      filters: filters,
      limit_page_length: 20,
      order_by: "customer_name asc",
    },
    callback: function (r) {
      EP.renderCustomerResults(r.message || []);
    },
    error: function () {
      EP.renderCustomerResults([]);
    },
  });
};

EP.renderCustomerResults = function (customers) {
  const wrap = document.getElementById("ep-customer-results");

  let html = `
    <div class="ep-customer-result-row" data-customer="">
      <div class="ep-customer-result-avatar">👤</div>
      <div class="ep-customer-result-info">
        <div class="ep-customer-result-name">Walk-in Customer</div>
        <div class="ep-customer-result-meta">No account needed</div>
      </div>
    </div>`;

  html += customers
    .map(
      (c) => `
    <div class="ep-customer-result-row" data-customer="${frappe.utils.escape_html(c.name)}" data-name="${frappe.utils.escape_html(c.customer_name)}">
      <div class="ep-customer-result-avatar">👤</div>
      <div class="ep-customer-result-info">
        <div class="ep-customer-result-name">${frappe.utils.escape_html(c.customer_name)}</div>
        <div class="ep-customer-result-meta">${c.mobile_no ? frappe.utils.escape_html(c.mobile_no) : "No phone on file"}</div>
      </div>
    </div>`
    )
    .join("");

  wrap.innerHTML = html;

  wrap.querySelectorAll(".ep-customer-result-row").forEach((row) => {
    row.addEventListener("click", () => {
      const customerId = row.dataset.customer;
      const customerName = row.dataset.name || "Walk-in Customer";
      EP.selectCustomer(customerId, customerName);
      document.getElementById("ep-customer-modal").style.display = "none";
    });
  });
};

EP.selectCustomer = function (customerId, customerName) {
  EP.cart.customer = customerId || null;
  document.getElementById("ep-customer-name").textContent = customerName;

  if (!customerId) {
    document.getElementById("ep-customer-points").textContent = "— loyalty points";
    return;
  }

  document.getElementById("ep-customer-points").textContent = "Loading points…";
  frappe.call({
    method: "frappe.client.get_list",
    args: {
      doctype: "Loyalty Point Entry",
      fields: ["sum(loyalty_points) as total"],
      filters: { customer: customerId },
    },
    callback: function (r) {
      const total = (r.message && r.message[0] && r.message[0].total) || 0;
      document.getElementById("ep-customer-points").textContent = `${total} loyalty points`;
    },
    error: function () {
      document.getElementById("ep-customer-points").textContent = "— loyalty points";
    },
  });
};



EP.emojiForGroup = function (group) {
  const map = {
    Beverages: "🥤",
    Snacks: "🍪",
    Skincare: "🧴",
    Cosmetics: "💄",
    Haircare: "🧖",
    Food: "🍱",
    Grocery: "🛒",
  };
  return map[group] || "📦";
};

EP.updateStockAlert = function () {
  const lowCount = EP.items.filter((i) => {
    const qty = EP.bins[i.item_code];
    return qty !== undefined && qty > 0 && qty <= 5;
  }).length;
  const alertEl = document.getElementById("ep-stock-alert");
  const countEl = document.getElementById("ep-stock-count");
  if (lowCount > 0) {
    alertEl.style.display = "flex";
    countEl.textContent = `${lowCount} item${lowCount === 1 ? "" : "s"}`;
  } else {
    alertEl.style.display = "none";
  }
};
