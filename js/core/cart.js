(function () {
  const CART_KEY = "bona-cart";
  const WISH_KEY = "bona-wish";
  const ACCOUNT_KEY = "bona-account";
  const FREE_SHIP = 25000;
  const SHIP_FEE = 490;
  const PROMO = "BONA10";
  const PROMO_UNTIL = "2026-12-31";
  const BUNDLE = { name: "iPhone 15 care pair", ids: ["case-iphone-15", "cable-usbc"], price: 4490, until: "2026-12-31" };

  function offerOpen(until) {
    return Date.now() <= new Date(until + "T23:59:59").getTime();
  }

  function bundleSave(items) {
    if (!offerOpen(BUNDLE.until)) return 0;
    const priced = BUNDLE.ids.map((id) => items.find((item) => item.id === id && item.qty > 0));
    if (priced.some((item) => !item)) return 0;
    const sum = priced.reduce((total, item) => total + Number(item.price), 0);
    return Math.max(0, sum - BUNDLE.price);
  }

  function readCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(CART_KEY) || "null");
      const items = Array.isArray(saved) ? saved : saved?.items;
      return {
        items: (Array.isArray(items) ? items : []).filter((item) => item && item.id && item.qty > 0),
        promo: typeof saved?.promo === "string" ? saved.promo : "",
      };
    } catch {
      return { items: [], promo: "" };
    }
  }

  let state = readCart();

  function persist() {
    localStorage.setItem(CART_KEY, JSON.stringify(state));
  }

  function items() {
    return state.items.map((entry) => {
      const product = window.BonaStore && window.BonaStore.product ? window.BonaStore.product(entry.id) : null;
      const listed = product && (window.BonaStore.isListed ? window.BonaStore.isListed(product) : true);
      if (!product || !listed) return Object.assign({}, entry, { unavailable: true });
      const untracked = product.tracking === "untracked";
      const qty = Number(entry.qty) || 0;
      return {
        id: product.id,
        name: product.name,
        brand: product.brand || entry.brand || "",
        image: product.image || entry.image || "",
        price: Number(product.price) || 0,
        qty: qty,
        meta: window.BonaUtil.metaLine(product),
        stock: untracked ? Math.max(qty, 1) : Number(product.stock),
        unavailable: false,
      };
    });
  }

  function add(product, qty) {
    const cap = Math.min(Number(product.stock), 99);
    if (!(cap > 0)) return false;
    const addQty = Math.max(1, Math.floor(Number(qty) || 1));
    const found = state.items.find((item) => item.id === product.id);
    if (found) found.qty = Math.min(cap, found.qty + addQty);
    else {
      state.items.push({
        id: product.id,
        name: product.name,
        brand: product.brand,
        image: product.image,
        price: Number(product.price) || 0,
        qty: Math.min(cap, addQty),
        meta: window.BonaUtil.metaLine(product),
        stock: cap,
      });
    }
    persist();
  }

  function setQty(id, qty) {
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return;
    const next = Math.floor(Number(qty) || 0);
    if (next <= 0) state.items = state.items.filter((entry) => entry.id !== id);
    else item.qty = Math.min(item.stock || 5, 99, next);
    persist();
  }

  function remove(id) {
    state.items = state.items.filter((entry) => entry.id !== id);
    persist();
  }

  function clear() {
    state.items = [];
    state.promo = "";
    persist();
  }

  function couponList() {
    if (window.BonaStore && typeof window.BonaStore.coupons === "function") return window.BonaStore.coupons();
    return [{ code: PROMO, percent: 10, until: PROMO_UNTIL, active: true }];
  }

  function matchCoupon(code) {
    const wanted = String(code || "").trim().toUpperCase();
    if (!wanted) return null;
    return couponList().find((item) => item && item.active !== false && String(item.code || "").toUpperCase() === wanted && offerOpen(item.until || "") && Number(item.percent) > 0 && Number(item.percent) <= 90) || null;
  }

  function applyPromo(code) {
    const match = matchCoupon(code);
    state.promo = match ? match.code : "";
    persist();
    return !!match;
  }

  function clearPromo() {
    state.promo = "";
    persist();
  }

  function bill(list, promoCode) {
    const rows = Array.isArray(list) ? list.filter((item) => item && !item.unavailable && item.qty > 0) : [];
    const sub = rows.reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0);
    const bundle = bundleSave(rows);
    const coupon = matchCoupon(promoCode);
    const discount = coupon ? Math.round((sub - bundle) * (Number(coupon.percent) / 100)) : 0;
    const after = Math.max(0, sub - discount - bundle);
    const shipping = after === 0 ? 0 : after >= FREE_SHIP ? 0 : SHIP_FEE;
    const count = rows.reduce((sum, item) => sum + Number(item.qty), 0);
    return { sub, discount, bundle, shipping, total: after + shipping, count, promo: coupon ? coupon.code : "" };
  }

  function totals() {
    return bill(items(), state.promo);
  }

  function quote() {
    const lines = items();
    if (!lines.length) return { ok: false, error: "The cart is empty." };
    if (lines.some((item) => item.unavailable)) return { ok: false, error: "A saved unit is no longer available. Review the cart." };
    if (lines.some((item) => !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99 || item.qty > Number(item.stock))) {
      return { ok: false, error: "A saved unit does not have that quantity. Review the cart." };
    }
    const clean = lines.map((item) => ({
      id: item.id,
      name: item.name,
      brand: item.brand,
      image: item.image,
      price: item.price,
      qty: item.qty,
      meta: item.meta,
      stock: item.stock,
    }));
    return { ok: true, lines: clean, totals: bill(clean, state.promo) };
  }

  function wishIds() {
    const list = JSON.parse(localStorage.getItem(WISH_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  }

  function wished(id) {
    return wishIds().includes(id);
  }

  function toggleWish(id) {
    const list = wishIds().filter((item) => item !== id);
    if (!wished(id)) list.push(id);
    localStorage.setItem(WISH_KEY, JSON.stringify(list));
    return list.includes(id);
  }

  function account() {
    try {
      return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "null");
    } catch {
      return null;
    }
  }

  function saveAccount(profile) {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(profile));
  }

  function clearAccount() {
    localStorage.removeItem(ACCOUNT_KEY);
  }

  window.BonaCart = {
    items, add, setQty, remove, clear, applyPromo, clearPromo, totals, bill, quote, promoCode: PROMO,
    wishIds, wished, toggleWish, account, saveAccount, clearAccount, FREE_SHIP, SHIP_FEE,
    offers() {
      const promos = couponList().filter((item) => item && item.active !== false && offerOpen(item.until || "") && Number(item.percent) > 0).map((item) => ({
        code: item.code,
        percent: Number(item.percent),
        until: item.until,
        active: true,
      }));
      return {
        promo: promos[0] || { code: PROMO, percent: 10, until: PROMO_UNTIL, active: false },
        promos,
        bundle: { name: BUNDLE.name, ids: BUNDLE.ids.slice(), price: BUNDLE.price, until: BUNDLE.until, active: offerOpen(BUNDLE.until) },
      };
    },
  };
})();
