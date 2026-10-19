(function () {
  const U = window.BonaUtil;
  const Store = window.BonaStore;
  const Cart = window.BonaCart;
  const Paths = window.BonaPaths;
  const $ = (id) => document.getElementById(id);
  function url(internal) { return U.esc(Paths.toPublic(internal)); }

  const state = {
    path: "/",
    id: "",
    locks: {},
    filters: emptyFilters(),
    mode: "all",
    shown: 12,
    view: "grid",
    draft: {},
    errors: {},
    contactSent: false,
    addressId: "",
    panel: "",
  };

  function emptyFilters() {
    return {
      q: "", brand: "all", category: "all", condition: "all", pta: "all",
      storage: "all", color: "all", warranty: "all", stock: "all",
      min: "", max: "", batteryMin: "", ram: "all", grade: "all",
      compatible: "all", sort: "latest",
    };
  }

  function parseRoute() {
    if (location.hash.startsWith("#/")) {
      history.replaceState({ bona: 1 }, "", Paths.toPublic(location.hash.slice(1)));
    }
    return Paths.fromLocation(location.pathname, location.search);
  }

  function locksFor(route) {
    const locks = { kind: "", condition: "", category: "", deals: false };
    if (route.path === "/phones" || route.path.startsWith("/phones/")) locks.kind = "phone";
    if (route.path === "/phones/new") locks.condition = "sealed-new";
    if (route.path === "/phones/used") locks.condition = "preowned";
    if (route.path === "/accessories" || route.path.startsWith("/accessories/")) locks.kind = "accessory";
    if (route.path === "/accessories/charging") locks.category = "charging";
    if (route.path === "/deals") locks.deals = true;
    if (route.parts[0] === "category" && route.parts[1]) locks.category = decodeURIComponent(route.parts[1]);
    return locks;
  }

  function modeFor(path) {
    if (path === "/phones/new") return "new";
    if (path === "/phones/used") return "used";
    if (path === "/phones") return "phones";
    if (path.startsWith("/accessories")) return "accessories";
    if (path === "/deals") return "deals";
    return "all";
  }

  function passesLocks(product) {
    const locks = state.locks;
    if (locks.kind && product.kind !== locks.kind) return false;
    if (locks.condition === "sealed-new" && !(product.condition === "new" && product.seal !== "opened")) return false;
    if (locks.condition === "preowned" && !["used", "refurbished"].includes(product.condition)) return false;
    if (locks.category === "charging" && !["chargers", "cables"].includes(product.category)) return false;
    if (locks.category && locks.category !== "charging" && product.category !== locks.category) return false;
    if (locks.deals && !(Number(product.compareAt) > Number(product.price))) return false;
    return true;
  }

  function passesFilters(product) {
    const filters = state.filters;
    const query = filters.q.trim().toLowerCase();
    if (query) {
      const hay = [product.name, product.brand, product.model, product.color, product.storage, product.category, U.conditionLabel(product)].join(" ").toLowerCase();
      if (!hay.includes(query)) return false;
    }
    if (filters.brand === "android") {
      if (product.kind !== "phone" || product.brand === "Apple") return false;
    } else if (filters.brand !== "all" && product.brand !== filters.brand) return false;
    if (filters.category !== "all" && product.category !== filters.category) return false;
    if (filters.condition !== "all" && product.condition !== filters.condition) return false;
    if (filters.pta !== "all" && product.pta !== filters.pta) return false;
    if (filters.storage !== "all" && product.storage !== filters.storage) return false;
    if (filters.color !== "all" && product.color !== filters.color) return false;
    if (filters.ram !== "all" && product.ram !== filters.ram) return false;
    if (filters.grade !== "all" && product.grade !== filters.grade) return false;
    if (filters.warranty === "available" && product.warranty === "none") return false;
    if (filters.warranty === "none" && product.warranty !== "none") return false;
    if (filters.stock === "in" && !(Number(product.stock) > 0)) return false;
    if (filters.min !== "" && product.price < Number(filters.min)) return false;
    if (filters.max !== "" && product.price > Number(filters.max)) return false;
    if (filters.batteryMin !== "" && (product.battery == null || Number(product.battery) < Number(filters.batteryMin))) return false;
    if (filters.compatible !== "all") {
      const models = product.compatible || [];
      if (!models.includes(filters.compatible) && product.model !== filters.compatible) return false;
    }
    return true;
  }

  function universe() {
    return Store.catalog().filter(passesLocks);
  }

  function sortedList() {
    const list = universe().filter(passesFilters);
    const sorters = {
      featured: (a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || (b.rating || 0) - (a.rating || 0),
      latest: (a, b) => String(b.addedAt).localeCompare(String(a.addedAt)),
      "price-asc": (a, b) => a.price - b.price,
      "price-desc": (a, b) => b.price - a.price,
      popular: (a, b) => ((b.rating || 0) * (b.reviews || 0)) - ((a.rating || 0) * (a.reviews || 0)),
    };
    return list.slice().sort(sorters[state.filters.sort] || sorters.latest);
  }

  function unique(list, pick) {
    return [...new Set(list.map(pick).filter(Boolean))].sort();
  }

  function select(name, label, values, current) {
    return `<label class="field"><span>${label}</span><select data-filter="${name}">${values.map((item) => {
      const value = item.value ?? item;
      const text = item.label ?? item;
      return `<option value="${U.esc(value)}"${value === current ? " selected" : ""}>${U.esc(text)}</option>`;
    }).join("")}</select></label>`;
  }

  function isUsedPhone(product) {
    return product && product.kind === "phone" && (product.condition === "used" || product.condition === "refurbished");
  }

  function availability(product) {
    if (!product) return { ok: false, label: "Unavailable", note: "This unit is no longer listed." };
    const left = Number(product.stock) || 0;
    if (left <= 0 && isUsedPhone(product)) return { ok: false, label: "Unavailable", note: "This unit has been sold." };
    if (left <= 0) return { ok: false, label: "Unavailable", note: "Out of stock." };
    if (isUsedPhone(product) && left === 1) return { ok: true, label: "In stock", note: "Only this unit." };
    return { ok: true, label: "In stock", note: left <= 3 ? left + " left" : "" };
  }

  function unitDetails(product) {
    return [
      U.metaLine(product),
      product.ram,
      U.ptaLabel(product),
      product.battery != null ? "Battery health " + product.battery + "%" : "",
      product.grade ? product.grade + " condition" : "",
      U.sealLabel(product),
    ].filter(Boolean).join(" · ");
  }

  function card(product, compact) {
    const save = Number(product.compareAt) > Number(product.price);
    const wished = Cart.wished(product.id);
    const pta = U.ptaLabel(product);
    const seal = U.sealLabel(product);
    const stock = availability(product);
    return `<article class="card${state.view === "list" && !compact ? " list" : ""}">
      <div class="frame">
        <a href="${url("/product/" + product.id)}">${U.imgTag(product.image, product.name)}</a>
        <span class="badge">${U.esc(U.conditionLabel(product))}</span>
        <button class="wish${wished ? " on" : ""}" type="button" data-wish="${U.esc(product.id)}" aria-label="${wished ? "Remove from wishlist" : "Save to wishlist"}" aria-pressed="${wished}">${U.icon("heart")}</button>
      </div>
      <div class="card-body">
        <p class="brand">${U.esc(product.brand)}</p>
        <h3><a href="${url("/product/" + product.id)}">${U.esc(product.name)}</a></h3>
        <p class="meta">${U.esc(U.metaLine(product))}</p>
        ${pta ? `<p>${U.esc(pta)}</p>` : ""}
        ${product.battery != null ? `<p>Battery health: ${U.esc(product.battery)}%</p>` : ""}
        ${product.grade ? `<p class="meta">${U.esc(product.grade)} condition</p>` : ""}
        ${seal ? `<p class="meta">${U.esc(seal)}</p>` : ""}
        <div class="price"><strong>${U.money(product.price)}</strong>${save ? `<s>${U.money(product.compareAt)}</s>` : ""}</div>
        ${!compact && product.reviews ? `<p class="meta">${U.stars(product.rating)} ${product.reviews} reviews</p>` : ""}
        <p class="${stock.ok ? "hint" : "low"}">${U.esc(stock.ok ? [stock.label, stock.note].filter(Boolean).join(" · ") : stock.label + ". " + stock.note)}</p>
        <div class="card-actions">
          <a class="link" href="${url("/product/" + product.id)}">View details</a>
          <button class="btn btn-small" type="button" data-add="${U.esc(product.id)}" ${stock.ok ? "" : "disabled"}>${stock.ok ? "Add to cart" : "Unavailable"}</button>
        </div>
      </div>
    </article>`;
  }

  function cardsHtml(list) {
    if (!list.length) {
      return `<div class="empty"><h2>Nothing matches</h2><p class="lede">Clear a filter or search a brand, colour, or model.</p><button class="btn" type="button" data-reset>Clear filters</button></div>`;
    }
    return `<div class="cards ${state.view}">${list.map((item) => card(item, false)).join("")}</div>`;
  }

  function filtersHtml() {
    const base = universe();
    const mode = state.mode;
    const filters = state.filters;
    const brands = [{ value: "all", label: "All brands" }].concat(unique(base, (item) => item.brand).map((brand) => ({ value: brand, label: brand })));
    if (mode === "phones" || mode === "all") brands.splice(1, 0, { value: "android", label: "Android phones" });
    const blocks = [];
    blocks.push(`<label class="field"><span>Search within results</span><input data-filter="q" type="search" value="${U.esc(filters.q)}" placeholder="Model, brand, colour"></label>`);
    blocks.push(select("brand", "Brand", brands, filters.brand));
    if ((mode === "all" || mode === "accessories") && !state.locks.category) {
      const cats = [{ value: "all", label: "All types" }].concat(Object.entries(U.categories).filter(([key]) => mode === "all" || key !== "phones").map(([key, label]) => ({ value: key, label })));
      blocks.push(select("category", "Category", cats, filters.category));
    }
    blocks.push(`<div class="form-grid two"><label class="field"><span>Min price</span><input data-filter="min" type="number" min="0" value="${U.esc(filters.min)}" inputmode="numeric"></label><label class="field"><span>Max price</span><input data-filter="max" type="number" min="0" value="${U.esc(filters.max)}" inputmode="numeric"></label></div>`);
    if (mode !== "accessories" && mode !== "new") {
      const conditions = mode === "used"
        ? [{ value: "all", label: "Used and refurbished" }, { value: "used", label: "Used" }, { value: "refurbished", label: "Refurbished" }]
        : [{ value: "all", label: "Any condition" }, { value: "new", label: "New" }, { value: "used", label: "Used" }, { value: "refurbished", label: "Refurbished" }, { value: "open-box", label: "Open box" }];
      blocks.push(select("condition", "Condition", conditions, filters.condition));
    }
    if (mode !== "accessories") {
      blocks.push(select("pta", "PTA status", [{ value: "all", label: "Any PTA status" }, { value: "approved", label: "Approved" }, { value: "non-pta", label: "Non-PTA" }], filters.pta));
      blocks.push(select("storage", "Storage", [{ value: "all", label: "Any storage" }].concat(unique(base, (item) => item.storage).map((item) => ({ value: item, label: item }))), filters.storage));
      blocks.push(select("ram", "RAM", [{ value: "all", label: "Any RAM" }].concat(unique(base, (item) => item.ram).map((item) => ({ value: item, label: item }))), filters.ram));
    }
    blocks.push(select("color", "Colour", [{ value: "all", label: "Any colour" }].concat(unique(base, (item) => item.color).map((item) => ({ value: item, label: item }))), filters.color));
    if (mode === "used" || mode === "phones" || mode === "all") {
      blocks.push(`<label class="field"><span>Minimum battery health</span><input data-filter="batteryMin" type="number" min="0" max="100" value="${U.esc(filters.batteryMin)}" placeholder="For used phones"></label>`);
      blocks.push(select("grade", "Physical grade", [{ value: "all", label: "Any grade" }].concat(unique(base, (item) => item.grade).map((item) => ({ value: item, label: item }))), filters.grade));
    }
    blocks.push(select("warranty", "Warranty", [{ value: "all", label: "Any warranty" }, { value: "available", label: "Warranty available" }, { value: "none", label: "No warranty" }], filters.warranty));
    if (mode === "accessories" || mode === "all") {
      const models = unique(Store.catalog(), (item) => item.kind === "phone" ? item.model : null);
      blocks.push(select("compatible", "Fits phone", [{ value: "all", label: "Any phone" }].concat(models.map((item) => ({ value: item, label: item }))), filters.compatible));
    }
    blocks.push(`<label class="check"><input data-filter="stock" type="checkbox"${filters.stock === "in" ? " checked" : ""}> In stock only</label>`);
    return `<aside class="filters" id="filters"><div class="split"><h2>Filters</h2><button class="btn btn-ghost btn-small filter-toggle" type="button" data-close-filters>Close</button></div>${blocks.join("")}</aside>`;
  }

  function resultsBlock() {
    const list = sortedList();
    const shown = list.slice(0, state.shown);
    return {
      count: list.length,
      html: cardsHtml(shown),
      more: list.length > shown.length,
    };
  }

  function crumb(parts) {
    const bits = [{ href: url("/"), label: "Home" }].concat(parts);
    return `<nav class="crumb" aria-label="Breadcrumb">${bits.map((part, index) => index === bits.length - 1 ? `<span>${U.esc(part.label)}</span>` : `<a href="${part.href}">${U.esc(part.label)}</a><span>/</span>`).join("")}</nav>`;
  }

  function listingCopy() {
    const copies = {
      "/products": ["All products", "Every phone and accessory currently in the inventory."],
      "/phones": ["Mobile phones", "New, used, refurbished, and open-box handsets. The card shows condition, PTA status, and price before you open it."],
      "/phones/new": ["New phones", "Only phones listed as new and still factory sealed. An opened box is not sold on this page as sealed."],
      "/phones/used": ["Used phones", "Each listing is one handset. Condition, battery health, PTA status, storage, and price are for that unit."],
      "/accessories": ["Accessories", "Filter by type and by the phone model it fits."],
      "/deals": ["Deals", "Only pieces with a previous price higher than today's inventory price."],
    };
    if (copies[state.path]) return copies[state.path];
    if (state.path === "/search") return [state.filters.q ? "Search results" : "Search", state.filters.q ? "Matches for “" + state.filters.q + "” in the current inventory." : "Search by phone, brand, colour, or accessory."];
    if (state.path.startsWith("/brand/")) return [state.filters.brand || "Brand", "Pieces from this brand that are listed now."];
    if (state.path.startsWith("/category/") && U.categories[state.filters.category]) return [U.categories[state.filters.category], "The current inventory in this category."];
    if (state.locks.category === "charging") return ["Chargers and cables", "Bricks, pads, and leads for the phones we stock."];
    if (state.path.startsWith("/accessories/") && U.categories[state.filters.category]) return [U.categories[state.filters.category], "From the current accessory inventory."];
    return ["Shop", "Current inventory."];
  }

  function extraLinks() {
    if (state.mode === "phones" || state.mode === "new" || state.mode === "used") {
      const brands = unique(universe(), (item) => item.brand);
      return `<div class="cluster" style="margin-bottom:12px">
        <a class="btn btn-small${state.path === "/phones/new" ? "" : " btn-ghost"}" href="${url("/phones/new")}">New phones</a>
        <a class="btn btn-small${state.path === "/phones/used" ? "" : " btn-ghost"}" href="${url("/phones/used")}">Used phones</a>
        ${brands.map((brand) => `<a class="btn btn-ghost btn-small" href="${url(state.path + "?brand=" + encodeURIComponent(brand))}">${U.esc(brand)}</a>`).join("")}
      </div>`;
    }
    if (state.path === "/accessories") {
      const links = [["charging", "Chargers and cables"]].concat(Object.entries(U.categories).filter(([key]) => !["phones", "chargers", "cables"].includes(key)));
      return `<div class="cluster" style="margin-bottom:12px">${links.map(([id, label]) => `<a class="btn btn-ghost btn-small" href="${url("/accessories/" + id)}">${U.esc(label)}</a>`).join("")}</div>`;
    }
    return "";
  }

  function highlightStrip() {
    let title = "";
    let list = [];
    if (state.path === "/phones") {
      title = "Featured phones";
      list = universe().filter((item) => item.featured).slice(0, 6);
    } else if (state.path === "/phones/new") {
      title = "New arrivals and best sellers";
      list = universe().filter((item) => item.latest || item.bestSeller).slice(0, 6);
    } else if (state.path === "/phones/used") {
      title = "Recently added used phones";
      list = universe().slice().sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt))).slice(0, 6);
    } else if (state.path === "/accessories") {
      title = "Featured and best-selling accessories";
      list = universe().filter((item) => item.featured || item.bestSeller).slice(0, 6);
    }
    if (!list.length) return "";
    return `<div class="section-head"><div><h2>${title}</h2></div></div><div class="rail">${list.map((item) => card(item, true)).join("")}</div>`;
  }

  function listingPage() {
    const [title, lede] = listingCopy();
    const result = resultsBlock();
    const parent = state.path.startsWith("/phones") ? [{ href: url("/phones"), label: "Mobile phones" }] : state.path.startsWith("/accessories") ? [{ href: url("/accessories"), label: "Accessories" }] : [];
    const trail = state.path === "/products" ? [{ label: "All products" }] : parent.concat([{ label: title }]);
    return `<div class="wrap">
      ${crumb(trail)}
      <header class="page-head"><p class="eyebrow">Shop</p><h1>${U.esc(title)}</h1><p class="lede">${U.esc(lede)}</p></header>
      ${extraLinks()}
      ${highlightStrip()}
      <div class="listing">
        ${filtersHtml()}
        <div>
          <div class="result-bar">
            <button class="btn btn-ghost filter-toggle" type="button" data-open-filters>${U.icon("filter")} Filters</button>
            <p id="result-count" class="muted">${result.count} ${result.count === 1 ? "product" : "products"}</p>
            <select data-filter="sort" aria-label="Sort">
              ${[["latest", "Latest"], ["popular", "Popularity"], ["price-asc", "Price, low"], ["price-desc", "Price, high"], ["featured", "Featured"]].map(([value, label]) => `<option value="${value}"${state.filters.sort === value ? " selected" : ""}>${label}</option>`).join("")}
            </select>
            <button class="btn btn-ghost btn-small" type="button" data-view="grid" aria-pressed="${state.view === "grid"}">Grid</button>
            <button class="btn btn-ghost btn-small" type="button" data-view="list" aria-pressed="${state.view === "list"}">List</button>
          </div>
          <div id="results">${result.html}</div>
          <button class="btn load-more" id="load-more" type="button" ${result.more ? "" : "hidden"}>Load more</button>
        </div>
      </div>
    </div>`;
  }

  function homeSection(eyebrow, title, href, list) {
    if (!list.length) return "";
    return `<section class="section wrap"><div class="section-head"><div><p class="eyebrow">${eyebrow}</p><h2>${title}</h2></div><a class="link" href="${href}">View all</a></div><div class="rail">${list.map((item) => card(item, true)).join("")}</div></section>`;
  }

  function homePage() {
    const all = Store.catalog();
    const phones = all.filter((item) => item.kind === "phone");
    const byDate = (list) => list.slice().sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
    const hero = all.find((item) => item.id === "iphone-15-128-black") || phones[0];
    const tiles = [
      ["iPhones", url("/phones?brand=Apple"), phones.find((item) => item.brand === "Apple")],
      ["Samsung", url("/phones?brand=Samsung"), phones.find((item) => item.brand === "Samsung")],
      ["Android phones", url("/phones?brand=android"), phones.find((item) => item.brand !== "Apple")],
      ["Used phones", url("/phones/used"), phones.find((item) => item.condition === "used")],
      ["Chargers and cables", url("/accessories/charging"), all.find((item) => item.category === "chargers")],
      ["Cases and covers", url("/accessories/cases"), all.find((item) => item.category === "cases")],
      ["Earbuds and headphones", url("/accessories/audio"), all.find((item) => item.category === "audio")],
      ["Power banks", url("/accessories/power"), all.find((item) => item.category === "power")],
    ];
    return `<section class="hero wrap">
        <div class="hero-copy">
          <p class="eyebrow">Phones and accessories</p>
          <h1>Find your next <em>smartphone.</em></h1>
          <p class="lede">New, used, and refurbished handsets, with PTA status and battery health on the card. Accessories are filtered by the phone they fit.</p>
          <div class="cluster">
            <a class="btn" href="${url("/phones")}">Shop phones ${U.icon("arrow")}</a>
            <a class="btn btn-ghost" href="${url("/accessories")}">Shop accessories</a>
          </div>
          <ul class="trust-inline"><li>Warranty stated on the product</li><li>Used units listed one by one</li><li>Free delivery over Rs 25,000</li></ul>
        </div>
        <a class="frame" href="${url("/product/" + hero.id)}">${U.imgTag(hero.image, hero.name, true)}<span class="badge">${U.esc(U.conditionLabel(hero))}</span></a>
      </section>
      <section class="section wrap">
        <div class="section-head"><div><p class="eyebrow">Shop by category</p><h2>Start with what you need.</h2></div></div>
        <div class="cats">${tiles.map(([label, href, product]) => `<a class="cat" href="${href}">${product ? `<img src="${U.esc(product.image)}" alt="">` : ""}<strong>${label}</strong></a>`).join("")}</div>
      </section>
      ${homeSection("Featured phones", "On the counter.", url("/phones"), phones.filter((item) => item.featured).slice(0, 8))}
      ${homeSection("Latest arrivals", "Just added.", url("/products"), byDate(all.filter((item) => item.latest)).slice(0, 8))}
      ${homeSection("Best sellers", "What people take home.", url("/products"), all.filter((item) => item.bestSeller).slice(0, 8))}
      ${homeSection("Best deals", "A real previous price.", url("/deals"), all.filter((item) => Number(item.compareAt) > Number(item.price)).slice(0, 8))}
      ${homeSection("Popular accessories", "Finish the phone.", url("/accessories"), all.filter((item) => item.kind === "accessory" && (item.featured || item.bestSeller)).slice(0, 8))}
      ${homeSection("Used phones", "Recently added units.", url("/phones/used"), byDate(phones.filter((item) => item.condition === "used" || item.condition === "refurbished")).slice(0, 8))}
      <section class="section wrap">
        <div class="section-head"><div><p class="eyebrow">Before you pay</p><h2>What the counter stands by.</h2></div></div>
        <div class="trust-grid">
          <a class="trust-card" href="${url("/policy/warranty")}"><strong>Warranty</strong><p>Manufacturer or seller cover is written on the product. No warranty is written too.</p></a>
          <a class="trust-card" href="${url("/phones/used")}"><strong>Condition</strong><p>Used phones are single units, with grade, battery health, and repair notes when we know them.</p></a>
          <a class="trust-card" href="${url("/policy/shipping")}"><strong>Delivery</strong><p>Free over Rs 25,000. We call before a rider is booked.</p></a>
          <a class="trust-card" href="${url("/policy/terms")}"><strong>Payment</strong><p>Cash on delivery or bank transfer. Card numbers are not taken here.</p></a>
          <a class="trust-card" href="${url("/policy/returns")}"><strong>Returns</strong><p>Sealed pieces can be replaced within 7 days. Used units follow the grade you bought.</p></a>
        </div>
      </section>
      <section class="section wrap">
        <div class="section-head"><div><p class="eyebrow">From the counter</p><h2>What people mention.</h2></div></div>
        <div class="reviews">
          <figure class="quote"><p>“The used iPhone card showed battery health before I asked.”</p><footer class="muted">Hina · Lahore</footer></figure>
          <figure class="quote"><p>“They called to confirm the Non-PTA unit, so there was no surprise.”</p><footer class="muted">Omar · Karachi</footer></figure>
          <figure class="quote"><p>“Case and cable were filtered to the phone I had just bought.”</p><footer class="muted">Sara · Islamabad</footer></figure>
        </div>
      </section>`;
  }

  function productPage() {
    const product = Store.product(state.id);
    if (!product || !Store.isListed(product)) return `<div class="empty"><h1>This piece is no longer listed.</h1><a class="btn" href="${url("/products")}">All products</a></div>`;
    const stock = availability(product);
    const others = Store.catalog().filter((item) => item.model === product.model && item.id !== product.id);
    const parent = product.kind === "phone"
      ? [{ href: url("/phones"), label: "Mobile phones" }, { href: product.condition === "used" || product.condition === "refurbished" ? url("/phones/used") : url("/phones/new"), label: product.condition === "used" || product.condition === "refurbished" ? "Used phones" : "New phones" }]
      : [{ href: url("/accessories"), label: "Accessories" }];
    const facts = [
      ["Condition", U.conditionLabel(product)],
      ["Box", U.sealLabel(product)],
      ["PTA", U.ptaLabel(product)],
      ["Storage", product.storage],
      ["RAM", product.ram],
      ["Colour", product.color],
      ["Battery health", product.battery != null && product.battery !== "" ? product.battery + "%" : ""],
      ["Grade", product.grade],
      ["Warranty", U.warrantyLabel(product)],
      ["Repairs", product.repair],
      ["Tests", product.tests],
      ["Fits", (product.compatible || []).join(", ")],
      ["Connector", product.connector],
      ["Output", product.power],
      ["Material", product.material],
      ["Type", product.authenticity || product.accessoryType],
    ].filter((row) => row[1]);
    const shots = (Array.isArray(product.images) && product.images.length ? product.images : [{ src: product.image, alt: product.imageAlt || product.name }]).filter((shot) => shot && shot.src);
    return `<div class="wrap">
      ${crumb(parent.concat([{ label: product.name }]))}
      <div class="pdp">
        <div class="gallery">${shots.map((shot, index) => `<div class="frame">${U.imgTag(shot.src, shot.alt || product.name, index === 0)}</div>`).join("")}</div>
        <div class="pdp-copy">
          <p class="eyebrow">${U.esc(product.brand)}</p>
          <h1>${U.esc(product.name)}</h1>
          <p>${U.esc(U.metaLine(product))}</p>
          ${product.reviews ? `<p class="meta">${U.stars(product.rating)} ${product.rating} · ${product.reviews} reviews</p>` : ""}
          <div class="price"><strong style="font-size:1.5rem">${U.money(product.price)}</strong>${Number(product.compareAt) > product.price ? `<s>${U.money(product.compareAt)}</s>` : ""}</div>
          <p class="${stock.ok ? "hint" : "low"}">${U.esc(stock.ok ? [stock.label, stock.note].filter(Boolean).join(" · ") : stock.label + ". " + stock.note)}</p>
          <p class="lede">${U.esc(product.story || product.blurb)}</p>
          <div class="cluster">
            <button class="btn" type="button" data-add="${U.esc(product.id)}" ${stock.ok ? "" : "disabled"}>${stock.ok ? "Add to cart" : "Unavailable"}</button>
            <button class="btn btn-ghost" type="button" data-wish="${U.esc(product.id)}">${Cart.wished(product.id) ? "Saved" : "Wishlist"}</button>
          </div>
          <dl class="facts-list">${facts.map(([label, value]) => `<div><dt class="muted">${U.esc(label)}</dt><dd>${U.esc(value)}</dd></div>`).join("")}</dl>
          ${reviewBlock(product)}
        </div>
      </div>
      ${others.length ? `<section class="section wrap"><div class="section-head"><div><p class="eyebrow">Same model</p><h2>Other units.</h2></div></div><div class="rail">${others.map((item) => card(item, true)).join("")}</div></section>` : ""}
      <div class="buybar"><div><strong>${U.money(product.price)}</strong><span class="muted">${U.esc(stock.ok ? product.name : stock.label)}</span></div><button class="btn" type="button" data-add="${U.esc(product.id)}" ${stock.ok ? "" : "disabled"}>${stock.ok ? "Add" : "Unavailable"}</button></div>
    </div>`;
  }

  function cartLines(items) {
    if (!items.length) return `<div class="empty"><h2>Your cart is empty</h2><a class="btn" href="${url("/products")}">Browse products</a></div>`;
    return items.map((item) => `<article class="line"><a href="${url("/product/" + item.id)}"><img src="${U.esc(item.image)}" alt=""></a><div><div class="line-top"><h3><a href="${url("/product/" + item.id)}">${U.esc(item.name)}</a></h3><strong>${U.money(item.price * item.qty)}</strong></div><p class="muted">${U.esc(item.meta || "")}</p><div class="cluster"><div class="qty"><button type="button" data-qty="${U.esc(item.id)}" data-delta="-1" aria-label="Decrease">−</button><span>${item.qty}</span><button type="button" data-qty="${U.esc(item.id)}" data-delta="1" aria-label="Increase">+</button></div><button class="link" type="button" data-remove="${U.esc(item.id)}" style="background:none;border:0">Remove</button></div></div></article>`).join("");
  }

  function totalsTable(bill) {
    const remain = Cart.FREE_SHIP - (bill.sub - bill.discount);
    return `<dl class="totals"><div><dt>Subtotal</dt><dd>${U.money(bill.sub)}</dd></div>${bill.bundle ? `<div><dt>Care pair</dt><dd>− ${U.money(bill.bundle)}</dd></div>` : ""}${bill.discount ? `<div><dt>${U.esc(bill.promo || "Offer")}</dt><dd>− ${U.money(bill.discount)}</dd></div>` : ""}<div><dt>Delivery</dt><dd>${bill.shipping ? U.money(bill.shipping) : "Free"}</dd></div><div class="grand"><dt>Total</dt><dd>${U.money(bill.total)}</dd></div></dl>${remain > 0 && bill.sub ? `<p class="hint">Add ${U.money(remain)} more for free delivery.</p>` : ""}`;
  }

  function cartPage() {
    const bill = Cart.totals();
    return `<div class="wrap layout"><div>${crumb([{ label: "Cart" }])}<header class="page-head"><h1>Your cart</h1></header>${cartLines(Cart.items())}</div>${Cart.items().length ? `<aside class="panel sticky"><h2>Summary</h2><div class="promo"><input id="promo" value="${U.esc(bill.promo)}" placeholder="Offer code" aria-label="Offer code"><button class="btn btn-ghost" type="button" data-promo>Apply</button></div><p class="muted">${U.esc(offerNote())} The iPhone 15 care pair applies on its own when both pieces are in the cart.</p>${totalsTable(bill)}<a class="btn btn-wide" href="${url("/checkout")}">Checkout as guest or with an account</a></aside>` : ""}</div>`;
  }

  function checkoutPage() {
    if (!Cart.items().length) return `<div class="empty"><h1>The cart is empty.</h1><a class="btn" href="${url("/products")}">Browse products</a></div>`;
    const user = window.BonaAuth.current();
    const chosen = user && (user.addresses.find((item) => item.id === state.addressId) || user.addresses[0]);
    const fromAccount = user ? { name: user.name, email: user.email, phone: chosen && chosen.phone || user.phone, city: chosen && chosen.city || "", address: chosen && chosen.line || "" } : {};
    const draft = Object.assign({}, fromAccount, state.draft);
    const errors = state.errors;
    const field = (name, label, type, extra) => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${U.esc(draft[name] || "")}" ${extra || ""}>${errors[name] ? `<small class="err">${U.esc(errors[name])}</small>` : ""}</label>`;
    const bill = Cart.totals();
    const guest = user ? `<p class="hint">Signed in as ${U.esc(user.name)}. You can still edit these details for this order.</p>` : `<p class="lede">Checking out as a guest. An account is optional.</p><div class="cluster"><a class="btn btn-ghost" href="${url("/login")}">Sign in</a><a class="btn btn-ghost" href="${url("/register")}">Create an account</a></div>`;
    const addresses = user && user.addresses.length ? `<label class="field"><span>Saved address</span><select name="addressId">${user.addresses.map((item) => `<option value="${U.esc(item.id)}"${chosen && chosen.id === item.id ? " selected" : ""}>${U.esc(item.label)} · ${U.esc(item.city)}</option>`).join("")}</select></label>` : "";
    return `<div class="wrap layout"><form id="checkout-form" class="stack" novalidate>${crumb([{ label: "Checkout" }])}<header class="page-head"><h1>Where should it go?</h1></header>${guest}${addresses}<div class="form-grid two">${field("name", "Full name", "text", 'autocomplete="name"')}${field("phone", "Phone", "tel", 'autocomplete="tel" inputmode="tel"')}</div>${field("email", "Email", "email", 'autocomplete="email"')}<div class="form-grid two">${field("city", "City", "text")}${field("address", "Address", "text")}</div><label class="field"><span>Note</span><textarea name="note">${U.esc(draft.note || "")}</textarea></label><fieldset class="field"><legend>Payment</legend><div class="stack"><label class="pay"><input type="radio" name="payment" value="cod" ${(draft.payment || "cod") === "cod" ? "checked" : ""}><span><strong>Cash on delivery</strong><br><small class="muted">Pay when the parcel arrives.</small></span></label><label class="pay"><input type="radio" name="payment" value="transfer" ${draft.payment === "transfer" ? "checked" : ""}><span><strong>Bank transfer</strong><br><small class="muted">We send details when we confirm by phone.</small></span></label></div></fieldset><button class="btn" type="submit">Place order</button></form><aside class="panel sticky"><h2>Your order</h2>${Cart.items().map((item) => `<div class="split"><span>${U.esc(item.name)} × ${item.qty}</span><strong>${U.money(item.price * item.qty)}</strong></div>`).join("")}${totalsTable(bill)}</aside></div>`;
  }

  function ownsOrder(order) {
    if (!order) return false;
    let last = null;
    try { last = JSON.parse(sessionStorage.getItem("bona-last-order") || "null"); } catch (error) { last = null; }
    if (last && last.id === order.id) return true;
    const user = window.BonaAuth.current();
    return !!(user && order.userId && order.userId === user.id);
  }

  function thanksPage() {
    const order = state.orderId ? Store.orders().find((item) => item.id === state.orderId) : null;
    if (!order || !ownsOrder(order)) return notFoundPage();
    const when = new Date(order.placedAt).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
    return `<div class="wrap policy"><p class="eyebrow">Order received</p><h1>We have it.</h1><p class="serif" style="font-size:2.4rem">${U.esc(order.id)}</p><p class="lede">Placed ${U.esc(when)}. We will call ${U.esc(order.customer.phone)} before dispatch.</p><div class="panel">${order.items.map((item) => `<div class="split"><span>${U.esc(item.name)} × ${item.qty}</span><strong>${U.money(item.price * item.qty)}</strong></div>`).join("")}${totalsTable(order.totals)}<p style="margin-top:10px"><strong>${U.esc(order.customer.name)}</strong><br>${U.esc(order.customer.address)}, ${U.esc(order.customer.city)}</p></div><div class="cluster no-print"><button class="btn btn-ghost" type="button" data-print>Print receipt</button><a class="btn btn-ghost" href="${url("/track")}">Track this order</a><a class="btn" href="${url("/products")}">Keep browsing</a></div></div>`;
  }

  function simplePage(title, eyebrow, body) {
    return `<div class="wrap policy">${crumb([{ label: title }])}<p class="eyebrow">${eyebrow}</p><h1>${title}</h1>${body}</div>`;
  }

  function offersPage() {
    const info = Cart.offers();
    const dated = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" });
    const sale = Store.catalog().filter((item) => Number(item.compareAt) > Number(item.price));
    const phones = sale.filter((item) => item.kind === "phone");
    const gear = sale.filter((item) => item.kind === "accessory");
    const parts = info.bundle.ids.map((id) => Store.product(id)).filter((item) => item && Store.isListed(item) && Number(item.stock) > 0);
    const bundleOn = info.bundle.active && parts.length === info.bundle.ids.length;
    const was = parts.reduce((sum, item) => sum + Number(item.price), 0);
    const grid = (list) => list.length ? `<div class="cards grid">${list.map((item) => card(item, false)).join("")}</div>` : `<p class="lede">Nothing in this group has a previous price above today's price.</p>`;
    const promos = info.promos && info.promos.length ? info.promos : (info.promo.active ? [info.promo] : []);
    const promo = promos.length
      ? promos.map((item) => `<article class="panel stack"><p class="eyebrow">Coupon</p><h2>${U.esc(item.code)}</h2><p>${U.esc(item.percent)}% off the merchandise total. The cart shows the final price.</p><p>Valid through ${U.esc(dated(item.until))}. One code per order. It is calculated after a care-pair discount, and it is not added to a crossed-out price that the listing does not have.</p></article>`).join("")
      : `<p class="lede">No coupon is active.</p>`;
    const bundle = bundleOn
      ? `<article class="panel stack"><p class="eyebrow">Bundle</p><h2>${U.esc(info.bundle.name)}</h2><p>Add one ${parts.map((item) => U.esc(item.name)).join(" and one ")}. Bought separately that is ${U.money(was)}. The pair price is <strong>${U.money(info.bundle.price)}</strong>.</p><p>Valid through ${U.esc(dated(info.bundle.until))} while both are in stock. One pair per cart. Further quantities stay at their own prices.</p><div class="cluster">${parts.map((item) => `<a class="btn btn-ghost btn-small" href="${url("/product/" + item.id)}">${U.esc(item.name)}</a>`).join("")}</div></article>`
      : `<p class="lede">No bundle is active.</p>`;
    return `<div class="wrap policy">${crumb([{ label: "Deals" }])}<p class="eyebrow">Offers</p><h1>Deals</h1><p class="lede">Active discounts, sale prices, and the care pair. A previous price is shown only when the listing has one. There is no countdown.</p><h2>Active discounts</h2>${promo}<h2>Sale phones</h2>${grid(phones)}<h2>Discounted accessories</h2>${grid(gear)}<h2>Bundle offers</h2>${bundle}<h2>Eligibility and exclusions</h2><p>Offers apply to pieces still in stock. Guest checkout uses the same prices. BONA10 does not apply twice, and it ends on ${U.esc(dated(info.promo.until))}. The care pair needs both listed pieces in the cart.</p></div>`;
  }

  function wishRow(id) {
    const product = Store.product(id);
    if (!product || !Store.isListed(product)) {
      return `<article class="wish-row is-unavailable">
        <div class="frame is-fallback" aria-hidden="true"></div>
        <div class="wish-copy">
          <h2>Saved item</h2>
          <p class="low">Unavailable. This unit is no longer listed.</p>
          <div class="wish-actions"><button class="btn btn-ghost" type="button" data-wish="${U.esc(id)}">Remove from wishlist</button></div>
        </div>
      </article>`;
    }
    const stock = availability(product);
    const save = Number(product.compareAt) > Number(product.price);
    return `<article class="wish-row${stock.ok ? "" : " is-unavailable"}">
      <a class="frame" href="${url("/product/" + product.id)}">${U.imgTag(product.image, product.name)}</a>
      <div class="wish-copy">
        <p class="brand">${U.esc(product.brand)}</p>
        <h2><a href="${url("/product/" + product.id)}">${U.esc(product.name)}</a></h2>
        <p class="meta">${U.esc(unitDetails(product))}</p>
        <div class="price"><strong>${U.money(product.price)}</strong>${save ? `<s>${U.money(product.compareAt)}</s>` : ""}</div>
        <p class="${stock.ok ? "hint" : "low"}">${U.esc(stock.label)}${stock.note ? ". " + U.esc(stock.note) : ""}</p>
        <div class="wish-actions">
          <a class="btn btn-ghost" href="${url("/product/" + product.id)}">View details</a>
          ${stock.ok ? `<button class="btn" type="button" data-move="${U.esc(product.id)}">Move to cart</button>` : ""}
          <button class="btn btn-ghost" type="button" data-wish="${U.esc(product.id)}">Remove from wishlist</button>
        </div>
      </div>
    </article>`;
  }

  function wishlistPage() {
    const ids = Cart.wishIds();
    const body = ids.length
      ? `<div class="wish-list">${ids.map((id) => wishRow(id)).join("")}</div>`
      : `<div class="empty"><h2>Your wishlist is empty</h2><p class="lede">Save a heart on a phone or accessory and it will wait here, with the price and the exact unit.</p><a class="btn" href="${url("/products")}">Browse products</a></div>`;
    return `<div class="wrap wish-page">${crumb([{ label: "Wishlist" }])}<header class="page-head"><p class="eyebrow">Saved</p><h1>Wishlist</h1>${ids.length ? `<p class="lede">${ids.length} ${ids.length === 1 ? "piece" : "pieces"} saved on this device.</p>` : ""}</header>${body}</div>`;
  }

  function offerNote() {
    const promos = Cart.offers().promos || [];
    if (!promos.length) return "No coupon is active.";
    return promos.map((item) => item.code + " takes " + item.percent + "% off through " + item.until).join(". ") + ".";
  }

  function reviewBlock(product) {
    const rows = Store.customerReviews().filter((item) => item.productId === product.id && item.status === "Shown");
    const list = rows.length ? rows.map((item) => `<blockquote class="quote"><p>${U.esc(item.text)}</p><footer class="muted">${U.esc(item.userName || "Customer")} · ${U.esc(item.rating)} / 5</footer></blockquote>`).join("") : `<p class="muted">No published review for this piece yet. A review stays off the page until the counter shows it.</p>`;
    return `<section class="stack"><h2>Reviews</h2>${list}</section>`;
  }

  function notFoundPage() {
    return `<div class="wrap policy"><p class="eyebrow">404</p><h1>That page is not on the floor.</h1><p class="lede">The link may be old, or the piece may have left the inventory.</p><form id="missing-search" class="stack" role="search"><label class="field"><span>Search the shop</span><input name="q" type="search" placeholder="Phone, brand, accessory"></label><button class="btn" type="submit">Search</button></form><div class="cluster"><a class="btn btn-ghost" href="${url("/")}">Home</a><a class="btn btn-ghost" href="${url("/products")}">All products</a><a class="btn btn-ghost" href="${url("/phones")}">Phones</a><a class="btn btn-ghost" href="${url("/accessories")}">Accessories</a><a class="btn btn-ghost" href="${url("/contact")}">Contact</a></div></div>`;
  }

  function trackPage() {
    const order = state.tracked;
    const labels = { pending: "Waiting for a confirmation call", confirmed: "Confirmed, not delivered", delivered: "Delivered", cancelled: "Cancelled" };
    const status = order ? (labels[order.status || "pending"] || "Waiting for a confirmation call") : "";
    const paid = order && order.paymentStatus === "paid";
    const detail = order ? `<article class="panel stack"><p class="eyebrow">${U.esc(order.id)}</p><h2>${U.esc(status)}</h2><p>${paid ? "Payment is marked paid." : "Payment is not marked paid. A pending order is not a completed sale."}</p><p>${U.esc(order.customer && order.customer.name || "")} · ${U.esc(order.customer && order.customer.city || "")}</p><p class="muted">Placed ${U.esc(new Date(order.placedAt).toLocaleString("en-PK"))}</p>${(order.items || []).map((item) => `<div class="split"><span>${U.esc(item.name)} × ${item.qty}</span><strong>${U.money(item.price * item.qty)}</strong></div>`).join("")}<p><strong>${U.money(order.totals && order.totals.total)}</strong></p></article>` : "";
    return `<div class="wrap policy">${crumb([{ label: "Track order" }])}<p class="eyebrow">Orders</p><h1>Track an order</h1><p class="lede">Enter the order number and the phone used at checkout. Both have to match. A guest order can be tracked the same way.</p>${state.trackError ? `<p class="err">${U.esc(state.trackError)}</p>` : ""}<form id="track-form" class="stack" novalidate><label class="field"><span>Order number</span><input name="orderId" autocomplete="off" value="${U.esc(state.draft.orderId || "")}"></label><label class="field"><span>Phone</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" value="${U.esc(state.draft.phone || "")}"></label><button class="btn" type="submit">Look up</button></form>${detail}</div>`;
  }

  function renderView(scroll) {
    const path = state.path;
    let html = "";
    const customer = ["/login", "/register", "/forgot", "/reset", "/account", "/about", "/contact", "/faq"].includes(path) || path.startsWith("/policy/");
    const listing = ["/products", "/phones", "/phones/new", "/phones/used", "/search"].includes(path) || path.startsWith("/accessories") || path.startsWith("/category/") || path.startsWith("/brand/");
    if (path === "/") html = homePage();
    else if (path === "/deals") html = offersPage();
    else if (customer) html = window.BonaCustomer.html(path, { contactSent: state.contactSent, draft: state.draft, errors: state.errors, section: state.section, orderId: state.orderId });
    else if (path.startsWith("/category/") && !U.categories[state.filters.category]) html = notFoundPage();
    else if (listing) html = listingPage();
    else if (path === "/product") html = productPage();
    else if (path === "/cart") html = cartPage();
    else if (path === "/checkout") html = checkoutPage();
    else if (path === "/thanks") html = thanksPage();
    else if (path === "/wishlist") html = wishlistPage();
    else if (path === "/track") html = trackPage();
    else html = notFoundPage();
    $("view").innerHTML = html;
    const listedProduct = path === "/product" ? Store.product(state.id) : null;
    const heading = path === "/" ? "Bona" : (document.querySelector("#view h1")?.textContent || "Bona");
    document.title = (listedProduct && listedProduct.seoTitle) || (heading + " — Phones & Accessories");
    let meta = document.querySelector('meta[name="description"]');
    if (listedProduct && listedProduct.seoDescription) {
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "description");
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", listedProduct.seoDescription);
      meta.dataset.product = "yes";
    } else if (meta && meta.dataset.product) {
      meta.remove();
    }
    document.body.classList.toggle("has-buybar", path === "/product" && Store.isListed(Store.product(state.id)));
    const robots = document.querySelector('meta[name="robots"]');
    const canonical = document.querySelector('link[rel="canonical"]');
    const hidden = ["/account", "/cart", "/checkout", "/thanks", "/track", "/login", "/register", "/forgot", "/reset", "/wishlist", "/404"].includes(path);
    if (robots) robots.setAttribute("content", hidden ? "noindex, nofollow" : "index, follow");
    if (canonical) {
      let canon = location.origin + location.pathname;
      if (path === "/search" && state.filters.q) canon += "?q=" + encodeURIComponent(state.filters.q);
      canonical.setAttribute("href", canon);
    }
    if (path === "/account" && state.section && !state.orderId) {
      document.querySelectorAll("#view section[id^='account-']").forEach((section) => {
        section.hidden = section.id !== "account-" + state.section;
      });
    }
    if (scroll) window.scrollTo(0, 0);
    updateChrome();
  }

  function paintResults() {
    const host = $("results");
    if (!host) { renderView(false); return; }
    const result = resultsBlock();
    host.innerHTML = result.html;
    const count = $("result-count");
    if (count) count.textContent = result.count + (result.count === 1 ? " product" : " products");
    const more = $("load-more");
    if (more) more.hidden = !result.more;
  }

  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("is-on");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("is-on"), 2400);
  }

  function paintDrawer() {
    const bill = Cart.totals();
    $("drawer-body").innerHTML = cartLines(Cart.items());
    $("drawer-foot").innerHTML = Cart.items().length ? `<div class="split"><span>Subtotal</span><strong>${U.money(bill.sub - bill.discount - (bill.bundle || 0))}</strong></div><a class="btn btn-wide" href="${url("/checkout")}">Checkout</a><a class="btn btn-ghost btn-wide" href="${url("/cart")}">Review cart</a>` : "";
  }

  function paintAccount() {
    const profile = Cart.account();
    $("account-body").innerHTML = profile ? `<div class="account-box"><p class="lede">Signed in on this device as <strong>${U.esc(profile.name)}</strong>.</p><p>${U.esc(profile.phone || "")}</p><p>${U.esc(profile.email || "")}</p><button class="btn btn-ghost" type="button" id="sign-out">Sign out</button></div>` : `<form id="account-form" class="account-box"><p class="lede">Save your name and phone on this device for a faster checkout.</p><label class="field"><span>Name</span><input name="name" required></label><label class="field"><span>Phone</span><input name="phone" type="tel" required></label><label class="field"><span>Email</span><input name="email" type="email"></label><button class="btn" type="submit">Sign in</button></form>`;
  }

  function closePanels() {
    $("drawer").classList.remove("is-open");
    $("drawer").setAttribute("aria-hidden", "true");
    $("account").classList.remove("is-open");
    $("account").setAttribute("aria-hidden", "true");
    document.body.classList.remove("filters-open", "lock");
    $("overlay").classList.remove("is-open");
    $("overlay").hidden = true;
    state.panel = "";
  }

  function openPanel(name) {
    closePanels();
    state.panel = name;
    $("overlay").hidden = false;
    $("overlay").classList.add("is-open");
    document.body.classList.add("lock");
    if (name === "cart") {
      $("drawer").classList.add("is-open");
      $("drawer").setAttribute("aria-hidden", "false");
      paintDrawer();
      $("drawer-close").focus();
    } else if (name === "account") {
      $("account").classList.add("is-open");
      $("account").setAttribute("aria-hidden", "false");
      paintAccount();
    } else if (name === "filters") {
      document.body.classList.add("filters-open");
    }
  }

  function updateChrome() {
    const settings = Store.settings();
    $("announce").textContent = settings.announcement;
    $("brand-name").textContent = settings.name;
    $("footer-name").textContent = settings.name;
    $("fine-name").textContent = settings.name;
    const wa = U.waLink(settings.whatsapp);
    const waLink = $("wa-link");
    waLink.href = wa || url("/contact");
    if (wa) { waLink.target = "_blank"; waLink.rel = "noopener"; }
    else waLink.removeAttribute("target");
    const social = [];
    if (settings.instagram) social.push(["Instagram", settings.instagram]);
    if (settings.facebook) social.push(["Facebook", settings.facebook]);
    if (wa) social.push(["WhatsApp", wa]);
    if (!social.length) social.push(["Contact the counter", url("/contact")]);
    $("social").innerHTML = social.map(([label, href]) => {
      const safe = /^(https?:\/\/|\/)/.test(href) ? href : "/contact";
      return `<a href="${U.esc(safe)}"${safe.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${U.esc(label)}</a>`;
    }).join("");
    const bill = Cart.totals();
    $("cart-count").hidden = bill.count === 0;
    $("cart-count").textContent = String(bill.count);
    $("cart-open").setAttribute("aria-label", bill.count ? "Open cart, " + bill.count + (bill.count === 1 ? " item" : " items") : "Open cart");
    const account = window.BonaAuth.current();
    const accountLabel = $("account-label");
    if (accountLabel) accountLabel.textContent = account && account.name ? account.name.split(" ")[0] : "Sign in";
    $("account-open").setAttribute("aria-label", account ? "Account, " + account.name : "Sign in");
    const wishes = Cart.wishIds().length;
    $("wish-count").hidden = wishes === 0;
    $("wish-count").textContent = String(wishes);
    document.querySelectorAll("[data-nav]").forEach((link) => {
      const on = link.dataset.nav === "/" ? state.path === "/" : link.dataset.nav === "/phones" ? state.path === "/phones" : link.dataset.nav === "/accessories" ? state.path.startsWith("/accessories") : state.path === link.dataset.nav;
      if (on) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    $("year").textContent = String(new Date().getFullYear());
  }

  function addProduct(id) {
    const product = Store.product(id);
    if (!product || !Store.isListed(product) || !(Number(product.stock) > 0)) return;
    Cart.add(product, 1);
    toast("Added " + product.name);
    updateChrome();
    paintDrawer();
    openPanel("cart");
    if (["/cart", "/checkout"].includes(state.path)) renderView(false);
  }

  function changeQty(id, delta) {
    const item = Cart.items().find((entry) => entry.id === id);
    if (!item) return;
    const next = item.qty + delta;
    if (next > (item.stock || 1)) { toast("That is all of this unit we have."); return; }
    Cart.setQty(id, next);
    updateChrome();
    paintDrawer();
    if (["/cart", "/checkout"].includes(state.path)) renderView(false);
  }

  function applyRoute(scroll) {
    const route = parseRoute();
    if (route.redirect && route.redirect !== location.pathname + location.search) {
      history.replaceState({ bona: 1 }, "", route.redirect);
      return applyRoute(scroll);
    }
    const nextPath = route.missing ? "/404" : (route.parts[0] === "product" ? "/product" : route.path);
    if (nextPath === "/account" && !window.BonaAuth.current()) {
      sessionStorage.setItem("bona-return", location.pathname + location.search);
      history.replaceState({ bona: 1 }, "", "/login");
      return applyRoute(scroll);
    }
    if (nextPath !== "/contact") state.contactSent = false;
    state.path = nextPath;
    state.id = route.id;
    state.orderId = route.orderId || "";
    state.section = route.section || "";
    state.mode = modeFor(route.path);
    state.locks = locksFor(route);
    state.filters = emptyFilters();
    if (route.query.q) state.filters.q = route.query.q;
    ["brand", "sort", "condition", "category", "pta", "storage", "color", "ram", "grade", "warranty", "stock", "min", "max"].forEach((key) => {
      if (route.query[key]) state.filters[key] = route.query[key];
    });
    if (route.parts[0] === "brand" && route.parts[1]) state.filters.brand = decodeURIComponent(route.parts[1]);
    state.tracked = null;
    state.trackError = "";
    if (route.parts[0] === "accessories" && route.parts[1] && route.parts[1] !== "charging") state.filters.category = route.parts[1];
    if (nextPath === "/thanks" && !state.orderId) {
      let last = null;
      try { last = JSON.parse(sessionStorage.getItem("bona-last-order") || "null"); } catch (error) { last = null; }
      if (last && last.id) {
        history.replaceState({ bona: 1 }, "", Paths.toPublic("/thanks/" + last.id));
        state.orderId = last.id;
      }
    }
    state.shown = 12;
    state.errors = {};
    closePanels();
    renderView(scroll);
  }

  function writeListingUrl(mode) {
    if (["/product", "/404", "/thanks", "/track", "/cart", "/checkout", "/account", "/login", "/register", "/forgot", "/reset", "/contact", "/about", "/faq"].includes(state.path) || state.path.startsWith("/policy/")) return;
    const params = new URLSearchParams();
    const filters = state.filters;
    if (state.path === "/search" && filters.q) params.set("q", filters.q);
    ["brand", "sort", "condition", "category", "pta", "storage", "color", "ram", "grade", "warranty", "stock"].forEach((key) => {
      const value = filters[key];
      if (!value || value === "all") return;
      if (key === "sort" && value === "latest") return;
      if (key === "brand" && state.path.startsWith("/brand/")) return;
      if (key === "category" && state.path.startsWith("/accessories/")) return;
      params.set(key, value);
    });
    if (filters.min) params.set("min", filters.min);
    if (filters.max) params.set("max", filters.max);
    const next = Paths.toPublic(state.path).split("?")[0] + (params.toString() ? "?" + params.toString() : "");
    if (next === location.pathname + location.search) return;
    if (mode === "replace") history.replaceState({ bona: 1 }, "", next);
    else history.pushState({ bona: 1 }, "", next);
  }

  function readFilter(el, mode) {
    const name = el.dataset.filter;
    if (!name) return;
    if (el.type === "checkbox") state.filters[name] = el.checked ? "in" : "all";
    else state.filters[name] = el.value;
    state.shown = 12;
    writeListingUrl(mode || "push");
    paintResults();
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-print]")) { print(); return; }
    const move = event.target.closest("[data-move]");
    if (move) {
      const product = Store.product(move.dataset.move);
      const stock = product && Store.isListed(product) ? availability(product) : { ok: false, note: "That unit is unavailable." };
      if (!stock.ok) { toast(stock.note || "That unit is unavailable."); renderView(false); return; }
      Cart.add(product, 1);
      if (Cart.wished(product.id)) Cart.toggleWish(product.id);
      toast("Moved " + product.name + " to the cart");
      updateChrome();
      paintDrawer();
      openPanel("cart");
      if (state.path === "/wishlist") renderView(false);
      return;
    }
    const add = event.target.closest("[data-add]");
    if (add) { addProduct(add.dataset.add); return; }
    const wish = event.target.closest("[data-wish]");
    if (wish) {
      Cart.toggleWish(wish.dataset.wish);
      toast(Cart.wished(wish.dataset.wish) ? "Saved to wishlist" : "Removed from wishlist");
      updateChrome();
      if (["/wishlist", "/product", "/", "/account", "/deals"].includes(state.path)) renderView(false);
      else if ($("results")) paintResults();
      return;
    }
    const qty = event.target.closest("[data-qty]");
    if (qty) { changeQty(qty.dataset.qty, Number(qty.dataset.delta)); return; }
    const remove = event.target.closest("[data-remove]");
    if (remove) { Cart.setQty(remove.dataset.remove, 0); toast("Removed"); updateChrome(); paintDrawer(); if (["/cart", "/checkout"].includes(state.path)) renderView(false); return; }
    if (event.target.closest("[data-open-filters]")) { openPanel("filters"); return; }
    if (event.target.closest("[data-close-filters]")) { closePanels(); return; }
    if (event.target.closest("[data-reset]")) { state.filters = emptyFilters(); renderView(false); return; }
    const view = event.target.closest("[data-view]");
    if (view) { state.view = view.dataset.view; renderView(false); return; }
    if (event.target.closest("#load-more")) { state.shown += 12; paintResults(); return; }
    if (event.target.closest("[data-promo]")) {
      const ok = Cart.applyPromo($("promo")?.value || "");
      toast(ok ? "10% offer applied." : "That code is not active.");
      renderView(false);
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.dataset.filter) readFilter(event.target, "replace");
  });
  document.addEventListener("change", (event) => {
    if (event.target.dataset.filter) readFilter(event.target, "push");
    if (event.target.name === "addressId" && event.target.form && event.target.form.id === "checkout-form") {
      state.addressId = event.target.value;
      ["phone", "city", "address"].forEach((key) => delete state.draft[key]);
      renderView(false);
    }
  });

  document.addEventListener("submit", (event) => {
    if (event.target.id === "header-search" || event.target.id === "header-search-mobile") {
      event.preventDefault();
      const value = new FormData(event.target).get("q") || event.target.querySelector("input").value;
      history.pushState({ bona: 1 }, "", Paths.toPublic("/search?q=" + encodeURIComponent(String(value).trim())));
      applyRoute(true);
    }
    if (event.target.id === "checkout-form") {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target));
      state.draft = data;
      const errors = {};
      if (!data.name || data.name.trim().length < 3) errors.name = "Enter the name for delivery.";
      if ((data.phone || "").replace(/\D/g, "").length < 10) errors.phone = "Enter a phone number we can confirm on.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || "")) errors.email = "Enter an email for the receipt.";
      if (!data.city || data.city.trim().length < 2) errors.city = "Enter the city.";
      if (!data.address || data.address.trim().length < 8) errors.address = "Enter a street address.";
      state.errors = errors;
      if (Object.keys(errors).length) { renderView(false); return; }
      const quote = Cart.quote();
      if (!quote.ok) { toast(quote.error); renderView(false); return; }
      const user = window.BonaAuth.current();
      const order = Store.placeOrder({
        items: quote.lines,
        promo: quote.totals.promo,
        userId: user ? user.id : "",
        customer: {
          name: data.name,
          phone: data.phone,
          email: data.email,
          city: data.city,
          address: data.address,
          note: data.note || "",
          payment: data.payment === "transfer" ? "transfer" : "cod",
        },
      });
      if (!order) { toast("A saved unit is no longer available. Review the cart."); renderView(false); return; }
      sessionStorage.setItem("bona-last-order", JSON.stringify(order));
      Cart.clear();
      state.draft = {};
      updateChrome();
      history.pushState({ bona: 1 }, "", Paths.toPublic("/thanks/" + order.id));
      applyRoute(true);
    }
    if (event.target.id === "missing-search") {
      event.preventDefault();
      const value = new FormData(event.target).get("q") || "";
      history.pushState({ bona: 1 }, "", Paths.toPublic("/search?q=" + encodeURIComponent(String(value).trim())));
      applyRoute(true);
    }
    if (event.target.id === "track-form") {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target));
      state.draft.orderId = data.orderId || "";
      state.draft.phone = data.phone || "";
      const wanted = String(data.orderId || "").trim().toLowerCase();
      const phone = String(data.phone || "").replace(/\D/g, "");
      const order = Store.orders().find((item) => String(item.id || "").toLowerCase() === wanted && phone.length >= 10 && String(item.customer && item.customer.phone || "").replace(/\D/g, "").slice(-10) === phone.slice(-10));
      state.tracked = order || null;
      state.trackError = order ? "" : "No order matches that number and phone.";
      renderView(false);
    }
    if (event.target.id === "contact-form") {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target));
      state.draft = data;
      const errors = {};
      const contact = String(data.contact || "").trim();
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
      if (!data.name || data.name.trim().length < 2) errors.name = "Tell us who to ask for.";
      if (!emailOk && contact.replace(/\D/g, "").length < 10) errors.contact = "Enter an email or a phone number.";
      if (!data.subject) errors.subject = "Choose a subject.";
      if (!data.message || data.message.trim().length < 8) errors.message = "Write a short note.";
      state.errors = errors;
      if (Object.keys(errors).length) { renderView(false); return; }
      Store.addNote(Object.assign({ at: new Date().toISOString() }, data));
      state.contactSent = true;
      state.draft = {};
      state.errors = {};
      renderView(true);
    }
    if (event.target.id === "account-form") {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target));
      Cart.saveAccount(data);
      toast("Saved on this device");
      closePanels();
      updateChrome();
    }
  });

  $("cart-open").addEventListener("click", () => openPanel("cart"));
  $("account-open").addEventListener("click", () => {
    history.pushState({ bona: 1 }, "", window.BonaAuth.current() ? "/account" : "/login");
    applyRoute(true);
  });
  $("drawer-close").addEventListener("click", closePanels);
  $("account-close").addEventListener("click", closePanels);
  $("overlay").addEventListener("click", closePanels);
  document.addEventListener("click", (event) => {
    if (event.target.id === "sign-out") { Cart.clearAccount(); paintAccount(); toast("Signed out on this device"); }
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closePanels(); });
  window.addEventListener("popstate", () => applyRoute(true));
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link || link.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const dest = new URL(link.href, location.origin);
    if (dest.origin !== location.origin) return;
    if (dest.pathname === "/Wassmad" || dest.pathname.startsWith("/Wassmad/")) return;
    if (dest.hash && !dest.hash.startsWith("#/") && dest.pathname === location.pathname && !dest.search) return;
    if (/\.(css|js|svg|png|jpe?g|webp|xml|txt|html)$/i.test(dest.pathname)) return;
    event.preventDefault();
    const next = dest.hash.startsWith("#/") ? Paths.toPublic(dest.hash.slice(1)) : dest.pathname + dest.search;
    if (next === location.pathname + location.search) return;
    history.pushState({ bona: 1 }, "", next);
    applyRoute(true);
  }, true);
  window.BonaCustomer.bind((scroll) => applyRoute(scroll !== false));
  applyRoute(false);
  paintDrawer();
})();
