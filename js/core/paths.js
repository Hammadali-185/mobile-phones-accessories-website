(function () {
  const CATEGORY_SLUGS = {
    phones: "mobile-phones",
    chargers: "chargers",
    cables: "cables",
    cases: "cases",
    protectors: "screen-protectors",
    camera: "camera-protectors",
    audio: "audio",
    power: "power-banks",
    wearables: "wearables",
    holders: "holders",
    speakers: "speakers",
    stands: "stands",
    other: "other",
  };
  const POLICIES = {
    shipping: "shipping-policy",
    returns: "return-policy",
    warranty: "warranty-policy",
    privacy: "privacy-policy",
    terms: "terms-and-conditions",
  };
  const ADMIN = "/Wassmad";
  const ADMIN_VIEWS = {
    dashboard: "dash",
    products: "products",
    categories: "categories",
    brands: "brands",
    inventory: "stock",
    "used-phones": "used",
    inspection: "inspect",
    orders: "orders",
    payments: "payments",
    shipping: "shipping",
    returns: "returns",
    customers: "customers",
    messages: "notes",
    suppliers: "suppliers",
    "purchase-orders": "purchases",
    coupons: "coupons",
    reports: "reports",
    reviews: "reviews",
    homepage: "home",
    notifications: "notifications",
    "audit-logs": "audit",
    "admin-users": "users",
    settings: "settings",
  };

  function slugify(value) {
    return String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72);
  }

  function slugMap(list) {
    const rows = (list || []).map((item) => ({
      id: item.id,
      base: item.slug ? slugify(item.slug) : (slugify(item.name) || slugify(item.id) || "product"),
      locked: !!item.slug,
    }));
    const used = new Set();
    const map = {};
    function take(row) {
      let slug = row.base || "product";
      if (used.has(slug)) {
        const idSlug = slugify(row.id);
        slug = idSlug && !used.has(idSlug) ? idSlug : (slug + "-" + (idSlug || "2"));
      }
      let unique = slug;
      let n = 2;
      while (used.has(unique)) {
        unique = slug + "-" + n;
        n += 1;
      }
      used.add(unique);
      map[row.id] = unique;
    }
    rows.filter((row) => row.locked).sort((a, b) => (a.id < b.id ? -1 : 1)).forEach(take);
    rows.filter((row) => !row.locked).sort((a, b) => (a.id < b.id ? -1 : 1)).forEach(take);
    return map;
  }

  function catalog() {
    return window.BonaStore ? window.BonaStore.products() : [];
  }

  function slugFor(product, list) {
    if (!product) return "";
    return slugMap(list || catalog())[product.id] || slugify(product.id) || "product";
  }

  function productBySlug(slug) {
    const list = catalog();
    const wanted = slugify(decodeURIComponent(slug || ""));
    const map = slugMap(list);
    return list.find((item) => map[item.id] === wanted) || null;
  }

  function categorySlug(id) {
    if (CATEGORY_SLUGS[id]) return CATEGORY_SLUGS[id];
    return slugify(id);
  }

  function categoryId(slug) {
    const wanted = slugify(slug);
    const found = Object.keys(CATEGORY_SLUGS).find((id) => CATEGORY_SLUGS[id] === wanted);
    if (found) return found;
    const labels = window.BonaUtil ? window.BonaUtil.categories : {};
    return Object.keys(labels).find((id) => categorySlug(id) === wanted) || "";
  }

  function brandName(slug) {
    const wanted = slugify(decodeURIComponent(slug || ""));
    const extras = window.BonaStore && window.BonaStore.settings ? (window.BonaStore.settings().extraBrands || []) : [];
    const names = catalog().map((item) => item.brand).concat(extras).filter(Boolean);
    return names.find((name) => slugify(name) === wanted) || "";
  }

  function withQuery(path, params) {
    const text = params && params.toString ? params.toString() : "";
    return path + (text ? "?" + text : "");
  }

  function toPublic(internal) {
    const raw = String(internal || "/");
    const bits = raw.split("?");
    const params = new URLSearchParams(bits[1] || "");
    const parts = (bits[0] || "/").split("/").filter(Boolean);
    let path = "/";
    if (!parts.length) path = "/";
    else if (parts[0] === "product") {
      const key = decodeURIComponent(parts[1] || "");
      const product = (window.BonaStore && window.BonaStore.product(key)) || productBySlug(key);
      path = "/products/" + (product ? slugFor(product) : slugify(key));
    } else if (parts[0] === "products") path = "/products";
    else if (parts[0] === "phones" && parts[1] === "new") path = "/categories/mobile-phones/new";
    else if (parts[0] === "phones" && parts[1] === "used") path = "/categories/mobile-phones/used";
    else if (parts[0] === "phones") path = "/categories/mobile-phones";
    else if (parts[0] === "accessories" && parts[1] === "charging") path = "/categories/accessories/charging";
    else if (parts[0] === "accessories" && parts[1]) path = "/categories/" + categorySlug(parts[1]);
    else if (parts[0] === "accessories") path = "/categories/accessories";
    else if (parts[0] === "category" && parts[1]) path = "/categories/" + categorySlug(decodeURIComponent(parts[1]));
    else if (parts[0] === "brand" && parts[1]) path = "/brands/" + slugify(decodeURIComponent(parts[1]));
    else if (parts[0] === "deals") path = "/offers";
    else if (parts[0] === "thanks") path = "/order-confirmation" + (parts[1] ? "/" + encodeURIComponent(parts[1]) : "");
    else if (parts[0] === "track") path = "/track-order";
    else if (parts[0] === "forgot") path = "/forgot-password";
    else if (parts[0] === "reset") path = "/reset-password";
    else if (parts[0] === "policy") path = "/" + (POLICIES[parts[1]] || "shipping-policy");
    else if (parts[0] === "account" && parts[1] === "orders" && parts[2]) path = "/account/orders/" + encodeURIComponent(parts[2]);
    else if (parts[0] === "account" && parts[1]) path = "/account/" + slugify(parts[1]);
    else if (parts[0] === "account") path = "/account";
    else path = "/" + parts.map((part) => encodeURIComponent(part)).join("/");
    return withQuery(path, params);
  }

  function fromLocation(pathname, search) {
    let path = decodeURIComponent(pathname || "/");
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    const query = Object.fromEntries(new URLSearchParams(search || ""));
    const parts = path.split("/").filter(Boolean);
    const result = { path: "/", parts: [], query: query, id: "", section: "", orderId: "", missing: false, redirect: "" };
    const legacy = (internal) => {
      result.redirect = toPublic(internal + (search || ""));
    };

    if (!parts.length) return result;
    if (parts[0] === "products" && parts[1]) {
      const key = decodeURIComponent(parts[1]);
      const product = productBySlug(key) || (window.BonaStore && window.BonaStore.product(key));
      result.path = "/product";
      result.parts = ["product", parts[1]];
      result.id = product ? product.id : "";
      result.missing = !product;
      if (product && slugFor(product) !== slugify(key)) result.redirect = toPublic("/product/" + product.id + (search || ""));
      return result;
    }
    if (parts[0] === "products") {
      result.path = "/products";
      result.parts = ["products"];
      return result;
    }
    if (parts[0] === "categories" && parts[1] === "mobile-phones" && parts[2] === "new") {
      result.path = "/phones/new";
      result.parts = ["phones", "new"];
      return result;
    }
    if (parts[0] === "categories" && parts[1] === "mobile-phones" && parts[2] === "used") {
      result.path = "/phones/used";
      result.parts = ["phones", "used"];
      return result;
    }
    if (parts[0] === "categories" && parts[1] === "mobile-phones") {
      result.path = "/phones";
      result.parts = ["phones"];
      return result;
    }
    if (parts[0] === "categories" && parts[1] === "accessories" && parts[2] === "charging") {
      result.path = "/accessories/charging";
      result.parts = ["accessories", "charging"];
      return result;
    }
    if (parts[0] === "categories" && parts[1] === "accessories") {
      result.path = "/accessories";
      result.parts = ["accessories"];
      return result;
    }
    if (parts[0] === "categories" && parts[1]) {
      const labels = window.BonaUtil ? window.BonaUtil.categories : {};
      const id = categoryId(parts[1]) || (labels[parts[1]] ? parts[1] : "");
      if (!id) { result.missing = true; result.path = "/404"; return result; }
      if (id === "phones") {
        result.redirect = toPublic("/phones");
        result.path = "/phones";
        result.parts = ["phones"];
        return result;
      }
      if (categorySlug(id) !== parts[1]) result.redirect = toPublic("/category/" + id);
      result.path = "/accessories/" + id;
      result.parts = ["accessories", id];
      return result;
    }
    if (parts[0] === "brands" && parts[1]) {
      const name = brandName(parts[1]);
      if (!name) { result.missing = true; result.path = "/404"; return result; }
      result.path = "/brand/" + name;
      result.parts = ["brand", name];
      return result;
    }
    if (parts[0] === "search") { result.path = "/search"; result.parts = ["search"]; return result; }
    if (parts[0] === "offers") { result.path = "/deals"; result.parts = ["deals"]; return result; }
    if (parts[0] === "order-confirmation") {
      result.path = "/thanks";
      result.parts = ["thanks"];
      result.orderId = decodeURIComponent(parts[1] || "");
      return result;
    }
    if (parts[0] === "track-order") { result.path = "/track"; result.parts = ["track"]; return result; }
    if (parts[0] === "forgot-password") { result.path = "/forgot"; result.parts = ["forgot"]; return result; }
    if (parts[0] === "reset-password") { result.path = "/reset"; result.parts = ["reset"]; return result; }
    const policyKey = Object.keys(POLICIES).find((key) => POLICIES[key] === parts[0]);
    if (policyKey) {
      result.path = "/policy/" + policyKey;
      result.parts = ["policy", policyKey];
      return result;
    }
    if (parts[0] === "account") {
      result.path = "/account";
      result.parts = ["account"].concat(parts.slice(1));
      result.section = parts[1] || "";
      result.orderId = parts[1] === "orders" ? decodeURIComponent(parts[2] || "") : "";
      return result;
    }
    const simple = ["cart", "checkout", "wishlist", "login", "register", "contact", "about", "faq"];
    if (simple.includes(parts[0]) && parts.length === 1) {
      result.path = "/" + parts[0];
      result.parts = [parts[0]];
      return result;
    }
    if (parts[0] === "deals") { legacy("/deals"); result.path = "/deals"; result.parts = ["deals"]; return result; }
    if (parts[0] === "track") { legacy("/track"); result.path = "/track"; result.parts = ["track"]; return result; }
    if (parts[0] === "forgot") { legacy("/forgot"); result.path = "/forgot"; result.parts = ["forgot"]; return result; }
    if (parts[0] === "reset") { legacy("/reset"); result.path = "/reset"; result.parts = ["reset"]; return result; }
    if (parts[0] === "phones" || parts[0] === "accessories") {
      legacy("/" + parts.join("/"));
      result.path = "/" + parts.join("/");
      result.parts = parts;
      return result;
    }
    if (parts[0] === "product") {
      const key = decodeURIComponent(parts[1] || "");
      const product = (window.BonaStore && window.BonaStore.product(key)) || productBySlug(key);
      legacy("/product/" + (product ? product.id : key));
      result.path = "/product";
      result.id = product ? product.id : "";
      result.missing = !product;
      result.parts = ["product", parts[1] || ""];
      return result;
    }
    if (parts[0] === "category" && parts[1]) {
      const id = categoryId(parts[1]) || parts[1];
      if (id === "phones") {
        legacy("/phones");
        result.path = "/phones";
        result.parts = ["phones"];
        return result;
      }
      legacy("/category/" + id);
      result.path = "/accessories/" + id;
      result.parts = ["accessories", id];
      return result;
    }
    if (parts[0] === "brand" && parts[1]) {
      const name = brandName(parts[1]) || decodeURIComponent(parts[1]);
      legacy("/brand/" + name);
      result.path = "/brand/" + name;
      result.parts = ["brand", name];
      return result;
    }
    if (parts[0] === "policy" && parts[1]) {
      legacy("/policy/" + parts[1]);
      result.path = "/policy/" + parts[1];
      result.parts = ["policy", parts[1]];
      return result;
    }
    result.missing = true;
    result.path = "/404";
    return result;
  }

  function adminHref(view, id) {
    if (view === "edit" && id) return ADMIN + "/products/" + encodeURIComponent(id) + "/edit";
    if (view === "edit") return ADMIN + "/products/new";
    if (view === "view" && id) return ADMIN + "/products/" + encodeURIComponent(id);
    if (view === "order" && id) return ADMIN + "/orders/" + encodeURIComponent(id);
    const segment = Object.keys(ADMIN_VIEWS).find((key) => ADMIN_VIEWS[key] === view) || view || "dashboard";
    return ADMIN + "/" + segment;
  }

  function adminFrom(pathname) {
    const path = pathname || "/";
    const lower = path.toLowerCase();
    if (lower === "/admin.html" || lower === "/admin") return { redirect: ADMIN + "/dashboard" };
    if (!(path === ADMIN || path.startsWith(ADMIN + "/"))) {
      if (lower === ADMIN.toLowerCase() || lower.startsWith(ADMIN.toLowerCase() + "/")) {
        return { redirect: ADMIN + path.slice(ADMIN.length).toLowerCase() };
      }
      return null;
    }
    const parts = path.slice(ADMIN.length).split("/").filter(Boolean);
    if (!parts.length) return { view: "dash", id: "" };
    const head = parts[0].toLowerCase();
    const second = (parts[1] || "").toLowerCase();
    const third = (parts[2] || "").toLowerCase();
    const headDirty = parts[0] !== head;
    const newDirty = second === "new" && parts[1] !== "new";
    const editDirty = third === "edit" && parts[2] !== "edit";
    if (headDirty || newDirty || editDirty) {
      const next = parts.slice();
      next[0] = head;
      if (second === "new") next[1] = "new";
      if (third === "edit") next[2] = "edit";
      return { redirect: ADMIN + "/" + next.map((part) => encodeURIComponent(part)).join("/") };
    }
    if (head === "products" && second === "new") return { view: "edit", id: "" };
    if (head === "products" && third === "edit") return { view: "edit", id: decodeURIComponent(parts[1]) };
    if (head === "products" && parts[1]) return { view: "view", id: decodeURIComponent(parts[1]) };
    if (head === "orders" && parts[1]) return { view: "order", id: decodeURIComponent(parts[1]) };
    const view = ADMIN_VIEWS[head];
    if (!view) return { redirect: ADMIN + "/dashboard" };
    return { view: view, id: "" };
  }

  function go(target, mode) {
    const next = /^\/(Wassmad|categories|brands|products|account|order-confirmation|track-order|offers|search|cart|checkout|login|register|contact|about|faq|wishlist|forgot-password|reset-password|shipping-policy|return-policy|warranty-policy|privacy-policy|terms-and-conditions)(\/|$|\?)/.test(target) || target === "/"
      ? target
      : toPublic(target);
    if (next === location.pathname + location.search) return;
    if (mode === "replace") history.replaceState({ bona: 1 }, "", next);
    else history.pushState({ bona: 1 }, "", next);
  }

  window.BonaPaths = {
    slugify: slugify,
    slugFor: slugFor,
    productBySlug: productBySlug,
    toPublic: toPublic,
    fromLocation: fromLocation,
    adminHref: adminHref,
    adminFrom: adminFrom,
    go: go,
    ADMIN: ADMIN,
  };
})();
