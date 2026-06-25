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
  EP.loadProducts();
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
    frappe.show_alert({ message: `Scanned: ${found.item_name}`, indicator: "green" });
    // Phase 2 will call EP.addToCart(found) here.
  } else {
    frappe.show_alert({ message: `No product found for "${code}"`, indicator: "red" });
  }
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
      frappe.show_alert({ message: `Selected: ${item.item_name} (cart logic arrives in Phase 2)`, indicator: "blue" });
    });
  });

  EP.updateStockAlert();
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
