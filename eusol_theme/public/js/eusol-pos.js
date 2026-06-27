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
  EP.bindSplitModal();
  EP.bindReceiptModal();
  EP.bindShiftControls();
  EP.bindHoldOrder();
  EP.loadProducts();
  EP.renderCart();
});

// ---------- NAV ----------
EP.bindNav = function () {
  document.querySelectorAll(".ep-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".ep-nav-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      if (view === "pos") {
        EP.hideHeldOrdersPanel();
      } else if (view !== "orders") {
        frappe.show_alert({ message: `"${btn.textContent}" view is coming in a later phase`, indicator: "blue" });
      }
    });
  });
};

// ---------- SHIFT CLOCK ----------
EP.startShiftClock = function () {
  setInterval(() => {
    const el = document.getElementById("ep-shift-clock");
    if (!el) return;
    if (!EP.clockedInSince) {
      el.textContent = "--:--:--";
      return;
    }
    const diff = Math.floor((new Date() - EP.clockedInSince) / 1000);
    const h = String(Math.floor(diff / 3600)).padStart(2, "0");
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
    const s = String(diff % 60).padStart(2, "0");
    el.textContent = `${h}:${m}:${s}`;
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

    const grandTotal = EP.getGrandTotal();

    if (EP.selectedPaymentMethod === "split") {
      EP.openSplitModal(grandTotal);
      return;
    }

    if (EP.selectedPaymentMethod === "card") {
      EP.chargeViaPaystack(grandTotal);
      return;
    }

    if (EP.selectedPaymentMethod === "credit") {
      EP.chargeWithCreditCheck(grandTotal);
      return;
    }

    // cash / momo / gift — straightforward single-payment checkout
    EP.submitInvoice([{ mode_of_payment: EP.selectedPaymentMethod, amount: grandTotal }]);
  });
};

EP.getGrandTotal = function () {
  const subtotal = EP.cart.items.reduce((sum, l) => sum + l.rate * l.qty, 0);
  const discount = EP.cart.discount || 0;
  const taxable = Math.max(subtotal - discount, 0);
  const vat = taxable * EP.VAT_RATE;
  return taxable + vat;
};

// ---------- CREDIT ----------
EP.chargeWithCreditCheck = function (grandTotal) {
  if (!EP.cart.customer) {
    frappe.show_alert({ message: "Credit sales require a registered customer", indicator: "orange" });
    return;
  }
  frappe.call({
    method: "eusol_theme.api.check_credit_limit",
    args: { customer: EP.cart.customer, amount: grandTotal },
    callback: function (r) {
      const result = r.message;
      if (result.credit_limit && !result.allowed) {
        frappe.show_alert({
          message: `Credit limit exceeded (Outstanding: GHS ${result.outstanding.toFixed(2)} / Limit: GHS ${result.credit_limit.toFixed(2)})`,
          indicator: "red",
        });
        return;
      }
      EP.submitInvoice([{ mode_of_payment: "credit", amount: grandTotal }]);
    },
  });
};

// ---------- PAYSTACK ----------
EP.chargeViaPaystack = function (grandTotal) {
  const reference = "EUSOL-" + Date.now();
  const email = EP.cart.customer
    ? frappe.session.user
    : "walkin@eusolgh.com"; // Paystack requires an email; falls back for walk-ins

  frappe.call({
    method: "eusol_theme.api.paystack_initialize",
    args: { email: email, amount: grandTotal, reference: reference },
    callback: function (r) {
      const data = r.message;
      if (!data || !data.authorization_url) {
        frappe.show_alert({ message: "Could not start Paystack checkout", indicator: "red" });
        return;
      }
      // Open Paystack's hosted checkout in a new tab; poll for verification.
      window.open(data.authorization_url, "_blank");
      EP.pollPaystackVerification(reference, grandTotal);
    },
    error: function (err) {
      frappe.show_alert({
        message: (err && err.message) || "Paystack is not configured for this site yet",
        indicator: "red",
      });
    },
  });
};

EP.pollPaystackVerification = function (reference, grandTotal, attempt = 0) {
  if (attempt > 30) {
    frappe.show_alert({ message: "Paystack verification timed out", indicator: "red" });
    return;
  }
  setTimeout(() => {
    frappe.call({
      method: "eusol_theme.api.paystack_verify",
      args: { reference: reference },
      callback: function (r) {
        const status = r.message && r.message.status;
        if (status === "success") {
          EP.submitInvoice([{ mode_of_payment: "card", amount: grandTotal }]);
        } else if (status === "failed" || status === "abandoned") {
          frappe.show_alert({ message: "Paystack payment was not completed", indicator: "red" });
        } else {
          EP.pollPaystackVerification(reference, grandTotal, attempt + 1);
        }
      },
      error: function () {
        EP.pollPaystackVerification(reference, grandTotal, attempt + 1);
      },
    });
  }, 4000);
};

// ---------- SPLIT PAYMENT ----------
EP.openSplitModal = function (grandTotal) {
  EP.splitRows = [
    { mode: "cash", amount: grandTotal },
  ];
  EP.renderSplitRows(grandTotal);
  document.getElementById("ep-split-modal").style.display = "flex";
};

EP.renderSplitRows = function (grandTotal) {
  const wrap = document.getElementById("ep-split-rows");
  wrap.innerHTML = EP.splitRows
    .map(
      (row, idx) => `
    <div class="ep-split-row" data-idx="${idx}">
      <select class="ep-split-mode">
        <option value="cash" ${row.mode === "cash" ? "selected" : ""}>Cash</option>
        <option value="momo" ${row.mode === "momo" ? "selected" : ""}>MoMo</option>
        <option value="card" ${row.mode === "card" ? "selected" : ""}>Card</option>
        <option value="gift" ${row.mode === "gift" ? "selected" : ""}>Gift</option>
      </select>
      <input type="number" class="ep-split-amount" value="${row.amount.toFixed(2)}" step="0.01">
      <button class="ep-split-remove">✕</button>
    </div>`
    )
    .join("");

  wrap.querySelectorAll(".ep-split-row").forEach((rowEl) => {
    const idx = parseInt(rowEl.dataset.idx);
    rowEl.querySelector(".ep-split-mode").addEventListener("change", (e) => {
      EP.splitRows[idx].mode = e.target.value;
    });
    rowEl.querySelector(".ep-split-amount").addEventListener("input", (e) => {
      EP.splitRows[idx].amount = parseFloat(e.target.value) || 0;
      EP.updateSplitRemaining(grandTotal);
    });
    rowEl.querySelector(".ep-split-remove").addEventListener("click", () => {
      EP.splitRows.splice(idx, 1);
      EP.renderSplitRows(grandTotal);
    });
  });

  EP.updateSplitRemaining(grandTotal);
};

EP.updateSplitRemaining = function (grandTotal) {
  const paid = EP.splitRows.reduce((sum, r) => sum + (r.amount || 0), 0);
  const remaining = grandTotal - paid;
  document.getElementById("ep-split-remaining-amt").textContent = `GHS ${remaining.toFixed(2)}`;
};

EP.bindSplitModal = function () {
  document.getElementById("ep-split-modal-close").addEventListener("click", () => {
    document.getElementById("ep-split-modal").style.display = "none";
  });
  document.getElementById("ep-split-add-row").addEventListener("click", () => {
    EP.splitRows.push({ mode: "cash", amount: 0 });
    EP.renderSplitRows(EP.getGrandTotal());
  });
  document.getElementById("ep-split-confirm").addEventListener("click", () => {
    const grandTotal = EP.getGrandTotal();
    const paid = EP.splitRows.reduce((sum, r) => sum + (r.amount || 0), 0);
    if (Math.abs(paid - grandTotal) > 0.01) {
      frappe.show_alert({ message: "Split amounts must add up to the grand total", indicator: "orange" });
      return;
    }
    document.getElementById("ep-split-modal").style.display = "none";
    EP.submitInvoice(EP.splitRows.map((r) => ({ mode_of_payment: r.mode, amount: r.amount })));
  });
};

// ---------- SUBMIT INVOICE ----------
EP.submitInvoice = function (payments) {
  frappe.show_alert({ message: "Processing sale…", indicator: "blue" });

  frappe.call({
    method: "eusol_theme.api.create_pos_invoice",
    args: {
      cart: JSON.stringify(EP.cart.items.map((l) => ({ item_code: l.item_code, qty: l.qty, rate: l.rate }))),
      payments: JSON.stringify(payments),
      customer: EP.cart.customer,
      discount_amount: EP.cart.discount || 0,
    },
    callback: function (r) {
      if (r.message) {
        EP.showReceipt(r.message, payments);
        EP.resetCart();
      }
    },
    error: function (err) {
      frappe.show_alert({ message: (err && err.message) || "Checkout failed", indicator: "red" });
    },
  });
};

EP.resetCart = function () {
  EP.cart = { items: [], customer: null, discount: 0, notes: "" };
  EP.selectedPaymentMethod = null;
  document.querySelectorAll(".ep-pay-btn").forEach((b) => b.classList.remove("selected"));
  document.getElementById("ep-customer-name").textContent = "Walk-in Customer";
  document.getElementById("ep-customer-points").textContent = "— loyalty points";
  EP.renderCart();
};

// ---------- RECEIPT ----------
EP.showReceipt = function (result, payments) {
  const now = new Date();
  const itemsHtml = EP.cart.items
    .map(
      (l) => `
    <div class="ep-r-line"><span>${frappe.utils.escape_html(l.item_name)} ×${l.qty}</span><span>GHS ${(l.rate * l.qty).toFixed(2)}</span></div>`
    )
    .join("");

  const paymentsHtml = payments
    .map((p) => `<div class="ep-r-line"><span>${p.mode_of_payment.toUpperCase()}</span><span>GHS ${p.amount.toFixed(2)}</span></div>`)
    .join("");

  document.getElementById("ep-receipt-content").innerHTML = `
    <div class="ep-r-center ep-r-bold">EUSOL ORGANICS</div>
    <div class="ep-r-center">${now.toLocaleString()}</div>
    <div class="ep-r-center">Invoice: ${result.invoice}</div>
    <div class="ep-r-divider"></div>
    ${itemsHtml}
    <div class="ep-r-divider"></div>
    ${paymentsHtml}
    <div class="ep-r-divider"></div>
    <div class="ep-r-line ep-r-bold"><span>TOTAL</span><span>GHS ${result.grand_total.toFixed(2)}</span></div>
    <div class="ep-r-divider"></div>
    <div class="ep-r-center">Thank you for shopping with us!</div>
  `;

  document.getElementById("ep-receipt-modal").style.display = "flex";
};

EP.bindReceiptModal = function () {
  document.getElementById("ep-receipt-print").addEventListener("click", () => window.print());
  document.getElementById("ep-receipt-done").addEventListener("click", () => {
    document.getElementById("ep-receipt-modal").style.display = "none";
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

// ============================================================
// PHASE 4: SHIFT CLOCK IN/OUT + BREAK + HOLD ORDERS
// ============================================================

EP.clockedInSince = null;
EP.onBreak = false;
EP.breakStartedAt = null;

EP.bindShiftControls = function () {
  EP.refreshShiftStatus();

  document.getElementById("ep-clockinout-btn").addEventListener("click", () => {
    if (EP.clockedInSince) {
      EP.doClockOut();
    } else {
      EP.doClockIn();
    }
  });

  document.getElementById("ep-break-btn").addEventListener("click", () => {
    EP.onBreak = !EP.onBreak;
    const btn = document.getElementById("ep-break-btn");
    const label = document.getElementById("ep-break-timer");

    if (EP.onBreak) {
      EP.breakStartedAt = new Date();
      btn.textContent = "End Break";
      btn.classList.add("on-break");
      EP.breakInterval = setInterval(() => {
        const diff = Math.floor((new Date() - EP.breakStartedAt) / 1000);
        const m = String(Math.floor(diff / 60)).padStart(2, "0");
        const s = String(diff % 60).padStart(2, "0");
        label.textContent = `On break — ${m}:${s}`;
      }, 1000);
    } else {
      clearInterval(EP.breakInterval);
      btn.textContent = "Start Break";
      btn.classList.remove("on-break");
      label.textContent = "Not on break";
    }
  });
};

EP.refreshShiftStatus = function () {
  frappe.call({
    method: "eusol_theme.api.get_shift_status",
    callback: function (r) {
      const status = r.message;
      const btn = document.getElementById("ep-clockinout-btn");

      if (!status || !status.linked) {
        btn.textContent = "No Employee Linked";
        btn.disabled = true;
        btn.title = "Ask an admin to link your user to an Employee record";
        return;
      }

      if (status.clocked_in) {
        EP.clockedInSince = new Date(status.since);
        btn.textContent = "Clock Out";
        btn.classList.add("active");
      } else {
        EP.clockedInSince = null;
        btn.textContent = "Clock In";
        btn.classList.remove("active");
      }
    },
  });
};

EP.doClockIn = function () {
  frappe.call({
    method: "eusol_theme.api.clock_in",
    callback: function (r) {
      if (r.message && r.message.ok) {
        EP.clockedInSince = new Date(r.message.time);
        const btn = document.getElementById("ep-clockinout-btn");
        btn.textContent = "Clock Out";
        btn.classList.add("active");
        EP.flash("Clocked in");
      }
    },
    error: function (err) {
      frappe.show_alert({ message: (err && err.message) || "Could not clock in", indicator: "red" });
    },
  });
};

EP.doClockOut = function () {
  frappe.call({
    method: "eusol_theme.api.clock_out",
    callback: function (r) {
      if (r.message && r.message.ok) {
        EP.clockedInSince = null;
        const btn = document.getElementById("ep-clockinout-btn");
        btn.textContent = "Clock In";
        btn.classList.remove("active");
        EP.flash("Clocked out");
      }
    },
    error: function (err) {
      frappe.show_alert({ message: (err && err.message) || "Could not clock out", indicator: "red" });
    },
  });
};

// ---------- HOLD ORDERS (stored in localStorage — no backend doctype needed) ----------
EP.HOLD_KEY = "eusol_pos_held_orders";

EP.bindHoldOrder = function () {
  document.getElementById("ep-hold-btn").addEventListener("click", () => {
    if (EP.cart.items.length === 0) {
      frappe.show_alert({ message: "Cart is empty — nothing to hold", indicator: "orange" });
      return;
    }
    const held = EP.getHeldOrders();
    held.push({
      id: "HOLD-" + Date.now(),
      time: new Date().toISOString(),
      customer_name: document.getElementById("ep-customer-name").textContent,
      cart: JSON.parse(JSON.stringify(EP.cart)),
    });
    localStorage.setItem(EP.HOLD_KEY, JSON.stringify(held));
    EP.resetCart();
    EP.flash("Order held");
  });

  // "Orders" nav button shows the held orders panel
  document.querySelector('.ep-nav-btn[data-view="orders"]').addEventListener("click", () => {
    EP.showHeldOrdersPanel();
  });
};

EP.getHeldOrders = function () {
  try {
    return JSON.parse(localStorage.getItem(EP.HOLD_KEY)) || [];
  } catch (e) {
    return [];
  }
};

EP.showHeldOrdersPanel = function () {
  const grid = document.getElementById("ep-product-grid");
  const panel = document.getElementById("ep-held-orders");
  const held = EP.getHeldOrders();

  grid.style.display = "none";
  panel.classList.add("visible");

  if (held.length === 0) {
    panel.innerHTML = '<div class="ep-loading">No held orders.</div>';
    return;
  }

  panel.innerHTML = held
    .map((order, idx) => {
      const total = order.cart.items.reduce((sum, l) => sum + l.rate * l.qty, 0);
      return `
      <div class="ep-held-order-card" data-idx="${idx}">
        <div class="ep-held-order-info">
          <div>${frappe.utils.escape_html(order.customer_name)} — GHS ${total.toFixed(2)}</div>
          <div class="ep-held-order-meta">${order.cart.items.length} item(s) · ${new Date(order.time).toLocaleString()}</div>
        </div>
        <div class="ep-held-order-actions">
          <button class="resume">Resume</button>
          <button class="delete">Delete</button>
        </div>
      </div>`;
    })
    .join("");

  panel.querySelectorAll(".ep-held-order-card").forEach((card) => {
    const idx = parseInt(card.dataset.idx);
    card.querySelector(".resume").addEventListener("click", () => EP.resumeHeldOrder(idx));
    card.querySelector(".delete").addEventListener("click", () => EP.deleteHeldOrder(idx));
  });
};

EP.resumeHeldOrder = function (idx) {
  const held = EP.getHeldOrders();
  const order = held[idx];
  if (!order) return;

  EP.cart = order.cart;
  held.splice(idx, 1);
  localStorage.setItem(EP.HOLD_KEY, JSON.stringify(held));

  document.getElementById("ep-customer-name").textContent = order.customer_name;
  EP.renderCart();
  EP.hideHeldOrdersPanel();
  EP.flash("Order resumed");
};

EP.deleteHeldOrder = function (idx) {
  const held = EP.getHeldOrders();
  held.splice(idx, 1);
  localStorage.setItem(EP.HOLD_KEY, JSON.stringify(held));
  EP.showHeldOrdersPanel();
};

EP.hideHeldOrdersPanel = function () {
  document.getElementById("ep-product-grid").style.display = "grid";
  document.getElementById("ep-held-orders").classList.remove("visible");
};
