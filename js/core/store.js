(function () {
  const SETTINGS_KEY = "bona-settings";
  const PRODUCTS_KEY = "bona-products";
  const ORDERS_KEY = "bona-orders";
  const NOTES_KEY = "bona-notes";
  const SESSION_KEY = "bona-counter-session";

  const defaults = {
    name: "Bona",
    announcement: "Free delivery over Rs 25,000 · 7-day replacement",
    whatsapp: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    hours: "",
    map: "",
    instagram: "",
    facebook: "",
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function settings() {
    const merged = Object.assign({}, defaults, read(SETTINGS_KEY, {}));
    delete merged.adminPin;
    return merged;
  }

  function counterUser() {
    try {
      const raw = sessionStorage.getItem("bona-admin-session");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !(parsed.exp > Date.now()) || !parsed.id) return null;
      const list = read("bona-admin-users", []);
      if (!Array.isArray(list)) return null;
      return list.find((user) => user.id === parsed.id) || null;
    } catch {
      return null;
    }
  }

  function requireCounter() {
    return !!counterUser();
  }

  function saveSettings(next) {
    if (!requireCounter()) return settings();
    const merged = Object.assign({}, defaults, settings(), next);
    delete merged.adminPin;
    write(SETTINGS_KEY, merged);
    if (typeof syncLabels === "function") syncLabels();
    return merged;
  }

  function products() {
    const saved = read(PRODUCTS_KEY, null);
    if (Array.isArray(saved)) return saved;
    return window.BONA_SEED.slice();
  }

  function saveAll(list) {
    write(PRODUCTS_KEY, list);
  }

  function product(id) {
    return products().find((item) => item.id === id) || null;
  }

  function isListed(item) {
    return !!(item && item.published !== false && !item.archived);
  }

  function catalog() {
    return products().filter(isListed);
  }

  function saveProduct(item) {
    if (!requireCounter()) return null;
    const list = products();
    if (!item.slug && window.BonaPaths) {
      const draft = list.filter((entry) => entry.id !== item.id).concat([item]);
      item.slug = window.BonaPaths.slugFor(item, draft);
    }
    const index = list.findIndex((entry) => entry.id === item.id);
    if (index >= 0) list[index] = item;
    else list.unshift(item);
    saveAll(list);
    return item;
  }

  function removeProduct(id) {
    if (!requireCounter()) return;
    saveAll(products().filter((item) => item.id !== id));
  }

  function takeStock(lines) {
    const list = products();
    const ok = lines.every((line) => {
      const item = list.find((entry) => entry.id === line.id);
      if (!item) return false;
      if (item.tracking === "untracked") return true;
      return Number(item.stock) >= Number(line.qty);
    });
    if (!ok) return false;
    lines.forEach((line) => {
      const item = list.find((entry) => entry.id === line.id);
      if (item.tracking === "untracked") return;
      const before = Number(item.stock);
      item.stock = before - Number(line.qty);
      logInventory({ sku: item.sku || item.id, name: item.name, change: "Stock " + before + " to " + item.stock, reason: "Order" });
    });
    saveAll(list);
    return true;
  }

  function resetProducts() {
    if (!requireCounter()) return;
    localStorage.removeItem(PRODUCTS_KEY);
  }

  function uniqueOrderId() {
    const existing = new Set(orders().map((order) => order.id));
    let id = "";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const bytes = new Uint32Array(1);
      crypto.getRandomValues(bytes);
      id = "BN" + String(100000 + (bytes[0] % 900000));
      if (!existing.has(id)) return id;
    }
    return id;
  }

  function placeOrder(input) {
    const source = input && typeof input === "object" ? input : {};
    const requested = Array.isArray(source.items) ? source.items : [];
    if (!requested.length || !window.BonaCart || typeof window.BonaCart.bill !== "function") return null;
    const verified = [];
    for (let index = 0; index < requested.length; index += 1) {
      const line = requested[index];
      const item = product(line && line.id);
      if (!item || !isListed(item)) return null;
      const qty = Number(line.qty);
      const untracked = item.tracking === "untracked";
      if (!Number.isInteger(qty) || qty < 1 || qty > 99) return null;
      if (!untracked && qty > Number(item.stock)) return null;
      const price = Number(item.price) || 0;
      if (Number(line.price) !== price) return null;
      verified.push({
        id: item.id,
        name: item.name,
        brand: item.brand || "",
        image: item.image || "",
        price: price,
        qty: qty,
        meta: window.BonaUtil.metaLine(item),
        stock: untracked ? qty : Number(item.stock),
      });
    }
    const promo = typeof source.promo === "string" ? source.promo : "";
    const totals = window.BonaCart.bill(verified, promo);
    if (!totals) return null;
    if (!takeStock(verified)) return null;
    const customer = source.customer && typeof source.customer === "object" ? source.customer : {};
    const session = window.BonaAuth && window.BonaAuth.current ? window.BonaAuth.current() : null;
    const userId = session && String(source.userId || "") === session.id ? session.id : "";
    const order = {
      id: uniqueOrderId(),
      items: verified,
      totals: totals,
      customer: {
        name: String(customer.name || "").trim().slice(0, 80),
        phone: String(customer.phone || "").trim().slice(0, 20),
        email: String(customer.email || "").trim().slice(0, 120),
        city: String(customer.city || "").trim().slice(0, 60),
        address: String(customer.address || "").trim().slice(0, 180),
        note: String(customer.note || "").trim().slice(0, 400),
        payment: customer.payment === "transfer" ? "transfer" : "cod",
      },
      userId: userId,
      placedAt: new Date().toISOString(),
      status: "pending",
      paymentStatus: "unpaid",
    };
    const list = orders();
    list.unshift(order);
    write(ORDERS_KEY, list);
    return order;
  }

  function orders() {
    const list = read(ORDERS_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function addOrder(order) {
    return placeOrder(order);
  }

  function updateOrder(id, patch) {
    if (!requireCounter()) return null;
    const list = orders();
    const index = list.findIndex((order) => order.id === id);
    if (index < 0 || !patch) return null;
    const allowed = {};
    if (["pending", "confirmed", "delivered", "cancelled"].includes(patch.status)) {
      allowed.status = patch.status;
      if (patch.status === "delivered") allowed.deliveredAt = new Date().toISOString();
    }
    if (patch.paymentStatus === "paid" || patch.paymentStatus === "unpaid") {
      allowed.paymentStatus = patch.paymentStatus;
      allowed.paidAt = patch.paymentStatus === "paid" ? new Date().toISOString() : "";
    }
    if (!Object.keys(allowed).length) return list[index];
    list[index] = Object.assign({}, list[index], allowed);
    write(ORDERS_KEY, list);
    return list[index];
  }

  function logInventory(entry) {
    const list = read("bona-inventory-log", []);
    const next = Array.isArray(list) ? list : [];
    next.unshift({
      at: new Date().toISOString(),
      sku: entry.sku || "",
      name: entry.name || "",
      change: entry.change || "",
      reason: entry.reason || "",
    });
    write("bona-inventory-log", next.slice(0, 80));
  }

  function inventoryLog() {
    const list = read("bona-inventory-log", []);
    return Array.isArray(list) ? list : [];
  }

  function customerReturns() {
    const users = read("bona-users", []);
    if (!Array.isArray(users)) return [];
    const rows = [];
    users.forEach((user) => {
      (user.returns || []).forEach((item) => {
        rows.push(Object.assign({}, item, { userId: user.id, userName: user.name || "" }));
      });
    });
    return rows;
  }

  function updateReturnStatus(userId, returnId, status) {
    if (!requireCounter()) return false;
    if (!["Requested", "Accepted", "Declined"].includes(status)) return false;
    const users = read("bona-users", []);
    if (!Array.isArray(users)) return false;
    const user = users.find((item) => item.id === userId);
    if (!user || !Array.isArray(user.returns)) return false;
    const row = user.returns.find((item) => item.id === returnId);
    if (!row) return false;
    row.status = status;
    write("bona-users", users);
    return true;
  }

  function notes() {
    const list = read(NOTES_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function addNote(note) {
    const list = notes();
    list.unshift(note);
    write(NOTES_KEY, list);
  }

  function adminOn() {
    return requireCounter();
  }

  function signIn() {
    return false;
  }

  function signOut() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  const BASE_CATEGORIES = Object.assign({}, window.BonaUtil.categories);

  function syncLabels() {
    const labels = window.BonaUtil.categories;
    Object.keys(labels).forEach((key) => { if (!BASE_CATEGORIES[key]) delete labels[key]; });
    Object.keys(BASE_CATEGORIES).forEach((key) => { labels[key] = BASE_CATEGORIES[key]; });
    const current = settings();
    Object.entries(current.categoryLabels || {}).forEach(([key, name]) => {
      if (labels[key] && name) labels[key] = String(name);
    });
    (current.extraCategories || []).forEach((item) => {
      if (item && item.id && item.name) labels[item.id] = String(item.name);
    });
  }

  function baseCategories() {
    return Object.assign({}, BASE_CATEGORIES);
  }

  const DEFAULT_COUPONS = [{ code: "BONA10", percent: 10, until: "2026-12-31", active: true }];

  function coupons() {
    const saved = read("bona-coupons", null);
    return Array.isArray(saved) ? saved : DEFAULT_COUPONS.map((item) => Object.assign({}, item));
  }

  function saveCoupons(list) {
    if (!requireCounter()) return coupons();
    write("bona-coupons", list);
    return coupons();
  }

  function suppliers() {
    const list = read("bona-suppliers", []);
    return Array.isArray(list) ? list : [];
  }

  function saveSupplier(item) {
    if (!requireCounter()) return null;
    const list = suppliers();
    const index = list.findIndex((entry) => entry.id === item.id);
    if (index >= 0) list[index] = item;
    else list.unshift(item);
    write("bona-suppliers", list);
    return item;
  }

  function removeSupplier(id) {
    if (!requireCounter()) return;
    write("bona-suppliers", suppliers().filter((item) => item.id !== id));
  }

  function purchaseOrders() {
    const list = read("bona-purchase-orders", []);
    return Array.isArray(list) ? list : [];
  }

  function savePurchaseOrder(item) {
    if (!requireCounter()) return null;
    const list = purchaseOrders();
    const index = list.findIndex((entry) => entry.id === item.id);
    if (index >= 0) list[index] = item;
    else list.unshift(item);
    write("bona-purchase-orders", list);
    return item;
  }

  function logAudit(entry) {
    if (!requireCounter()) return;
    const list = read("bona-audit", []);
    const next = Array.isArray(list) ? list : [];
    next.unshift({
      at: new Date().toISOString(),
      actor: entry.actor || "",
      action: entry.action || "",
      detail: entry.detail || "",
    });
    write("bona-audit", next.slice(0, 120));
  }

  function auditLog() {
    const list = read("bona-audit", []);
    return Array.isArray(list) ? list : [];
  }

  function customers() {
    const rows = [];
    function slot(name, email, phone, kind) {
      const key = String(email || phone || name || "guest").toLowerCase();
      let row = rows.find((item) => item.key === key);
      if (!row) {
        row = { key, name: name || "Guest", email: email || "", phone: phone || "", kind, orders: 0 };
        rows.push(row);
      }
      if (kind === "Account") row.kind = "Account";
      return row;
    }
    const accounts = read("bona-users", []);
    (Array.isArray(accounts) ? accounts : []).forEach((user) => {
      slot(user.name, user.email, user.phone, "Account");
    });
    orders().forEach((order) => {
      const person = order.customer || {};
      slot(person.name, person.email, person.phone, "Guest checkout").orders += 1;
    });
    return rows;
  }

  function customerReviews() {
    const accounts = read("bona-users", []);
    const rows = [];
    (Array.isArray(accounts) ? accounts : []).forEach((user) => {
      (user.reviews || []).forEach((item) => {
        rows.push({
          id: item.id,
          productId: item.productId,
          productName: item.productName || "",
          rating: item.rating,
          text: item.text || "",
          at: item.at || "",
          status: item.status || "Held",
          userId: user.id,
          userName: user.name || "",
        });
      });
    });
    return rows;
  }

  function updateReviewStatus(userId, reviewId, status) {
    if (!requireCounter()) return false;
    if (!["Shown", "Hidden", "Held"].includes(status)) return false;
    const accounts = read("bona-users", []);
    if (!Array.isArray(accounts)) return false;
    const user = accounts.find((item) => item.id === userId);
    if (!user || !Array.isArray(user.reviews)) return false;
    const row = user.reviews.find((item) => item.id === reviewId);
    if (!row) return false;
    row.status = status;
    write("bona-users", accounts);
    return true;
  }

  function hiddenNotices() {
    const list = read("bona-notice-hide", []);
    return Array.isArray(list) ? list : [];
  }

  function hideNotice(id) {
    if (!requireCounter()) return;
    const list = hiddenNotices();
    if (!list.includes(id)) list.push(id);
    write("bona-notice-hide", list.slice(-80));
  }

  syncLabels();

  window.BonaStore = {
    settings, saveSettings, products, product, saveProduct, removeProduct, resetProducts,
    orders, addOrder, placeOrder, updateOrder, notes, addNote, adminOn, signIn, signOut,
    isListed, catalog, logInventory, inventoryLog, customerReturns, updateReturnStatus,
    baseCategories, coupons, saveCoupons, suppliers, saveSupplier, removeSupplier,
    purchaseOrders, savePurchaseOrder, logAudit, auditLog, customers, customerReviews, updateReviewStatus,
    hiddenNotices, hideNotice,
  };
})();
