(function () {
  const U = window.BonaUtil;
  const Store = window.BonaStore;
  const Admin = window.BonaAdmin;
  const Paths = window.BonaPaths;
  const app = document.getElementById("app");
  const today = () => {
    const date = new Date();
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  };
  const monthStart = () => today().slice(0, 8) + "01";
  const state = {
    view: "dash",
    edit: null,
    q: "",
    notice: "",
    error: "",
    authView: "login",
    identifier: "",
    code: "",
    pendingId: "",
    filters: { category: "all", brand: "all", condition: "all", stock: "all", publication: "all" },
    range: { from: monthStart(), to: today() },
  };

  const blank = () => ({
    id: "", sku: "", name: "", brand: "", model: "", kind: "phone", category: "phones",
    condition: "new", seal: "sealed", pta: "approved", storage: "128 GB", ram: "",
    color: "Black", battery: "", grade: "", warranty: "manufacturer", repair: "",
    price: "", cost: "", compareAt: "", rating: "", reviews: "", stock: 1, featured: false,
    latest: false, bestSeller: false, deal: false, published: true, archived: false,
    compatible: "", image: "", imageAlt: "", images: [], blurb: "", story: "",
    subcategory: "", accessoryType: "", connector: "", power: "", material: "", authenticity: "",
    imei: "", tests: "", repairCost: "", otherCosts: "", lowStockAt: 2, tracking: "quantity",
    seoTitle: "", seoDescription: "", addedAt: today(),
  });

  function toast(message) { state.notice = message; }
  function day(iso) { return iso ? String(iso).slice(0, 10) : ""; }
  function statusOf(order) { return order.status || "pending"; }
  function collected(order) { return statusOf(order) === "delivered" && order.paymentStatus === "paid"; }
  function saleDate(order) { return order.paidAt || order.deliveredAt || order.placedAt; }
  function inRange(iso, from, to) {
    const stamp = new Date(iso).getTime();
    return stamp >= new Date(from + "T00:00:00").getTime() && stamp <= new Date(to + "T23:59:59").getTime();
  }
  function recordedCost(product) {
    const parts = [product.cost, product.repairCost, product.otherCosts].filter((value) => value != null && value !== "" && Number.isFinite(Number(value))).map(Number);
    return parts.length ? parts.reduce((sum, value) => sum + value, 0) : null;
  }
  function lowStock(item) {
    const stock = Number(item.stock);
    if (!(stock > 0) || item.archived) return false;
    if (item.tracking === "unit" || item.tracking === "untracked") return false;
    if (item.kind === "phone" && (item.condition === "used" || item.condition === "refurbished")) return false;
    const limit = Number(item.lowStockAt);
    const threshold = Number.isFinite(limit) && String(item.lowStockAt) !== "" ? limit : 2;
    return stock <= threshold;
  }
  function skuOf(item) { return item.sku || item.id; }
  function publication(item) {
    if (item.archived) return ["Archived", "stop"];
    if (item.published === false) return ["Draft", "warn"];
    if (!(Number(item.stock) > 0)) return ["Out of stock", "stop"];
    if (lowStock(item)) return ["Low stock", "warn"];
    return ["Live", "ok"];
  }

  function field(name, label, value, type, extra) {
    const val = value ?? "";
    if (type === "textarea") return `<label class="field span-2"><span>${label}</span><textarea name="${name}">${U.esc(val)}</textarea></label>`;
    if (type === "select") return `<label class="field"><span>${label}</span><select name="${name}">${extra.map(([v, text]) => `<option value="${U.esc(v)}"${String(val) === String(v) ? " selected" : ""}>${U.esc(text)}</option>`).join("")}</select></label>`;
    if (type === "check") return `<label class="field"><span>${label}</span><select name="${name}"><option value="no"${val ? "" : " selected"}>No</option><option value="yes"${val ? " selected" : ""}>Yes</option></select></label>`;
    return `<label class="field"><span>${label}</span><input name="${name}" type="${type || "text"}" value="${U.esc(val)}" ${extra || ""}></label>`;
  }

  function passwordField(name, label, autocomplete) {
    return `<label class="field"><span>${label}</span><span class="pass-row"><input name="${name}" type="password" autocomplete="${autocomplete}"><button class="btn btn-ghost" type="button" data-show-password>Show</button></span></label>`;
  }

  function shell(user, body) {
    const groups = desk().groups(user.role);
    const role = user.role === "owner" ? "Owner" : "Staff";
    const current = state.view === "edit" || state.view === "view" ? "products" : state.view === "order" ? "orders" : state.view;
    const nav = groups.map(([label, links]) => `<p class="side-label">${U.esc(label)}</p>${links.map(([id, text]) => `<a href="${U.esc(Paths.adminHref(id))}" data-view="${id}" ${current === id ? 'aria-current="page"' : ""}>${text}</a>`).join("")}`).join("");
    const jump = `<label class="side-jump"><span class="sr">Go to</span><select data-jump>${groups.map(([label, links]) => `<optgroup label="${U.esc(label)}">${links.map(([id, text]) => `<option value="${id}"${state.view === id ? " selected" : ""}>${U.esc(text)}</option>`).join("")}</optgroup>`).join("")}</select></label>`;
    return `<div class="admin-shell"><aside class="side"><p class="side-kicker">Counter</p>${jump}<nav aria-label="Admin">${nav}</nav></aside><header class="admin-bar"><a class="logo" href="/"><span class="mark">B</span><span>${U.esc(Store.settings().name)}</span></a><div class="cluster"><span class="pill">${role}</span><a href="/">View shop</a><button class="btn btn-cream btn-small" type="button" id="sign-out">Sign out</button></div></header><main class="admin-main">${state.notice ? `<p class="hint">${U.esc(state.notice)}</p>` : ""}${body}</main></div>`;
  }

  function card(label, value, note) {
    return `<article class="stat"><span>${U.esc(label)}</span><strong>${value}</strong>${note ? `<p class="muted">${note}</p>` : ""}</article>`;
  }

  function dash() {
    const from = state.range.from || monthStart();
    const to = state.range.to || today();
    const orders = Store.orders();
    const ranged = orders.filter((order) => inRange(order.placedAt, from, to));
    const sales = orders.filter((order) => collected(order) && inRange(saleDate(order), from, to));
    const revenue = sales.reduce((sum, order) => sum + Number(order.totals && order.totals.total || 0), 0);
    const todaySales = orders.filter((order) => collected(order) && day(saleDate(order)) === today());
    const monthSales = orders.filter((order) => collected(order) && day(saleDate(order)).slice(0, 7) === today().slice(0, 7));
    const pendingValue = ranged.filter((order) => statusOf(order) === "pending" || statusOf(order) === "confirmed").reduce((sum, order) => sum + Number(order.totals && order.totals.total || 0), 0);
    let profit = 0;
    let known = 0;
    let missing = 0;
    sales.forEach((order) => (order.items || []).forEach((line) => {
      const product = Store.product(line.id);
      const unit = product ? recordedCost(product) : null;
      if (unit == null) { missing += 1; return; }
      profit += (Number(line.price) - unit) * Number(line.qty);
      known += 1;
    }));
    const products = Store.products().filter((item) => !item.archived);
    const available = products.filter((item) => Store.isListed(item) && Number(item.stock) > 0).reduce((sum, item) => sum + Number(item.stock), 0);
    const lows = Store.products().filter(lowStock);
    const outs = products.filter((item) => !(Number(item.stock) > 0));
    const count = (list, test) => list.filter(test).length;
    const cards = [
      ["Total sales", U.money(revenue), "Collected revenue in the selected range. Pending orders are not included."],
      ["Today's sales", U.money(todaySales.reduce((sum, order) => sum + Number(order.totals && order.totals.total || 0), 0)), "Delivered and paid today."],
      ["Monthly sales", U.money(monthSales.reduce((sum, order) => sum + Number(order.totals && order.totals.total || 0), 0)), "Delivered and paid this calendar month."],
      ["Total orders", String(ranged.length), "Placed in the selected range."],
      ["Pending orders", String(count(ranged, (order) => statusOf(order) === "pending" || statusOf(order) === "confirmed")), "Not delivered. Value " + U.money(pendingValue) + "."],
      ["Delivered orders", String(count(ranged, (order) => statusOf(order) === "delivered")), "Marked delivered. A sale still needs payment."],
      ["Cancelled orders", String(count(ranged, (order) => statusOf(order) === "cancelled")), "Left out of revenue and profit."],
      ["Pending payments", String(orders.filter((order) => statusOf(order) !== "cancelled" && order.paymentStatus !== "paid").length), "Open now, including cash due on delivery."],
      ["Total products", String(products.length), "Archived products are not in this count."],
      ["Available inventory", String(available), "Units currently listed and in stock."],
      ["Low-stock products", String(lows.length), "At or under each product's low-stock threshold. The default is 2. A used unit is not an alert."],
      ["Out-of-stock products", String(outs.length), "Listed or unpublished, not archived."],
      ["Estimated gross profit", U.money(profit), known ? known + " lines had a cost. " + missing + " did not, so they are left out." : "No cost is on file yet, so this stays at zero."],
    ];
    return `<div class="split"><h1>Dashboard</h1><p class="pill">${U.esc(Admin.current().role === "owner" ? "Owner" : "Staff")}</p></div>
      <p class="lede">Collected revenue is money on delivered orders marked paid. Profit subtracts purchase, repair, and other costs where those amounts are recorded. Pending orders stay in their own cards.</p>
      <form class="filters" id="range-form"><label class="field"><span>From</span><input name="from" type="date" value="${U.esc(from)}"></label><label class="field"><span>To</span><input name="to" type="date" value="${U.esc(to)}"></label><div class="cluster"><button class="btn btn-ghost btn-small" type="button" data-range="today">Today</button><button class="btn btn-ghost btn-small" type="button" data-range="month">This month</button><button class="btn btn-ghost btn-small" type="button" data-range="all">All recorded</button></div></form>
      <div class="stats">${cards.map((item) => card(item[0], item[1], item[2])).join("")}</div>
      <section class="panel stack"><h2>Sales chart</h2>${salesChart(sales, from, to)}</section>
      <section class="stack"><h2>Recent orders</h2>${recentOrders(ranged)}</section>
      <div class="two"><section class="panel stack"><h2>Top-selling products</h2>${topSellers(sales)}</section><section class="panel stack"><h2>Low-stock alerts</h2>${lows.length ? lows.map((item) => `<p><strong>${U.esc(item.name)}</strong> · ${U.esc(skuOf(item))} · ${U.esc(item.stock)} left</p>`).join("") : `<p class="lede">No low-stock alerts.</p>`}</section></div>
      <div class="two"><section class="panel stack"><h2>Recent inventory changes</h2>${inventoryChanges()}</section><section class="panel stack"><h2>Return requests</h2>${returnsBlock()}</section></div>
      <section class="panel stack"><h2>Quick actions</h2><div class="cluster"><button class="btn" type="button" data-view="edit">Add product</button><button class="btn btn-ghost" type="button" data-view="orders">Review orders</button><button class="btn btn-ghost" type="button" id="export-csv">Export products</button><a class="btn btn-ghost" href="/">Open the shop</a></div></section>`;
  }

  function salesChart(sales, from, to) {
    const start = new Date(from + "T12:00:00");
    const end = new Date(to + "T12:00:00");
    const span = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const buckets = [];
    if (span > 31) {
      for (let index = 0; index < span; index += 7) {
        const fromDay = new Date(start.getTime() + index * 86400000);
        const toDay = new Date(Math.min(end.getTime(), fromDay.getTime() + 6 * 86400000));
        buckets.push({ label: day(fromDay.toISOString()).slice(5), from: day(fromDay.toISOString()), to: day(toDay.toISOString()) });
      }
    } else {
      for (let index = 0; index < span; index += 1) {
        const date = day(new Date(start.getTime() + index * 86400000).toISOString());
        buckets.push({ label: date.slice(8), from: date, to: date });
      }
    }
    const values = buckets.map((bucket) => sales.filter((order) => {
      const stamp = day(saleDate(order));
      return stamp >= bucket.from && stamp <= bucket.to;
    }).reduce((sum, order) => sum + Number(order.totals.total || 0), 0));
    const peak = Math.max.apply(null, values.concat(1));
    if (!values.some((value) => value > 0)) return `<p class="lede">No collected revenue in this range.</p>`;
    return `<div class="chart" role="img" aria-label="Collected revenue in the selected range">${buckets.map((bucket, index) => `<div><span style="height:${Math.max(4, Math.round(values[index] / peak * 120))}px" title="${U.esc(U.money(values[index]))}"></span><small>${U.esc(bucket.label)}</small></div>`).join("")}</div><p class="muted">Each bar is collected revenue. The tallest bar is ${U.money(peak)}.</p>`;
  }

  function recentOrders(list) {
    const rows = list.slice(0, 8);
    if (!rows.length) return `<p class="lede">No orders in this range.</p>`;
    return `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Status</th><th>Payment</th><th>Total</th><th>Sale</th></tr></thead><tbody>${rows.map((order) => `<tr><td>${U.esc(order.id)}</td><td>${U.esc(new Date(order.placedAt).toLocaleString("en-PK"))}</td><td>${U.esc(order.customer && order.customer.name || "")}</td><td><span class="pill ${statusOf(order) === "delivered" ? "ok" : statusOf(order) === "cancelled" ? "stop" : "warn"}">${U.esc(statusOf(order))}</span></td><td>${order.paymentStatus === "paid" ? "Paid" : "Unpaid"}</td><td>${U.money(order.totals && order.totals.total)}</td><td>${collected(order) ? "Counted" : "Not a sale"}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function topSellers(sales) {
    const map = {};
    sales.forEach((order) => (order.items || []).forEach((line) => {
      const row = map[line.id] || { name: line.name, qty: 0 };
      row.qty += Number(line.qty) || 0;
      map[line.id] = row;
    }));
    const rows = Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5);
    if (!rows.length) return `<p class="lede">No delivered, paid orders in this range.</p>`;
    return rows.map((row) => `<p class="split"><span>${U.esc(row.name)}</span><strong>${U.esc(row.qty)}</strong></p>`).join("");
  }

  function inventoryChanges() {
    const rows = Store.inventoryLog().slice(0, 6);
    if (!rows.length) return `<p class="lede">Changes made from this counter appear here.</p>`;
    return rows.map((row) => `<p><strong>${U.esc(row.name)}</strong> · ${U.esc(row.sku)}<br><span class="muted">${U.esc(row.change)}. ${U.esc(row.reason)}. ${U.esc(new Date(row.at).toLocaleString("en-PK"))}</span></p>`).join("");
  }

  function returnsBlock() {
    const rows = Store.customerReturns();
    if (!rows.length) return `<p class="lede">No return requests yet. A request is not an approval.</p>`;
    return rows.slice(0, 6).map((row) => `<article><p><strong>${U.esc(row.orderId)}</strong> · ${U.esc(row.userName)}</p><p>${U.esc(row.reason || "")}. ${U.esc(row.message || "")}</p><label class="field"><span>Status</span><select data-return="${U.esc(row.userId)}" data-return-id="${U.esc(row.id)}">${["Requested", "Accepted", "Declined"].map((item) => `<option${row.status === item ? " selected" : ""}>${U.esc(item)}</option>`).join("")}</select></label></article>`).join("");
  }

  function filteredProducts() {
    const filters = state.filters;
    const q = state.q.toLowerCase();
    return Store.products().filter((item) => {
      if (q && ![item.name, item.brand, item.model, skuOf(item), item.category].join(" ").toLowerCase().includes(q)) return false;
      if (filters.category !== "all" && item.category !== filters.category) return false;
      if (filters.brand !== "all" && item.brand !== filters.brand) return false;
      if (filters.condition !== "all" && item.condition !== filters.condition) return false;
      if (filters.stock === "in" && !(Number(item.stock) > 0)) return false;
      if (filters.stock === "low" && !lowStock(item)) return false;
      if (filters.stock === "out" && Number(item.stock) > 0) return false;
      if (filters.publication === "live" && (item.archived || item.published === false)) return false;
      if (filters.publication === "unpublished" && (item.archived || item.published !== false)) return false;
      if (filters.publication === "archived" && !item.archived) return false;
      return true;
    });
  }

  function productsPage() {
    const list = filteredProducts();
    const brands = Array.from(new Set(Store.products().map((item) => item.brand).filter(Boolean))).sort();
    const cats = Object.entries(U.categories);
    const select = (name, label, options) => `<label class="field"><span>${label}</span><select data-product-filter="${name}">${options.map(([value, text]) => `<option value="${U.esc(value)}"${state.filters[name] === value ? " selected" : ""}>${U.esc(text)}</option>`).join("")}</select></label>`;
    return `<div class="split"><h1>Products</h1><div class="cluster"><button class="btn" type="button" data-view="edit">Add product</button><button class="btn btn-ghost" type="button" id="export-csv">Export</button><label class="btn btn-ghost">Import<input id="import-csv" type="file" accept=".csv,text/csv" hidden></label></div></div>
      <div class="filters">${select("category", "Category", [["all", "All categories"]].concat(cats))}${select("brand", "Brand", [["all", "All brands"]].concat(brands.map((brand) => [brand, brand])))}${select("condition", "Condition", [["all", "All conditions"], ["new", "New"], ["used", "Used"], ["refurbished", "Refurbished"], ["open-box", "Open box"]])}${select("stock", "Stock", [["all", "Any stock"], ["in", "In stock"], ["low", "Low stock"], ["out", "Out of stock"]])}${select("publication", "Publication", [["all", "Any status"], ["live", "Published"], ["unpublished", "Draft"], ["archived", "Archived"]])}</div>
      <input id="find" placeholder="Search name, brand, or SKU" value="${U.esc(state.q)}" aria-label="Search products">
      <p class="muted">${list.length} ${list.length === 1 ? "product" : "products"}</p>
      <div class="table-wrap"><table><thead><tr><th>Image</th><th>Product</th><th>SKU</th><th>Category</th><th>Brand</th><th>Condition</th><th>Price</th><th>Stock</th><th>Status</th><th>Added</th></tr></thead><tbody>${list.map((item) => {
        const status = publication(item);
        const live = !item.archived && item.published !== false;
        const shot = item.image ? `<img class="thumb" src="${U.esc(item.image)}" alt="">` : `<span class="thumb"></span>`;
        const actions = `<div class="row-actions"><button class="btn btn-ghost btn-small" type="button" data-edit="${U.esc(item.id)}">Edit</button><button class="btn btn-ghost btn-small" type="button" data-open="${U.esc(item.id)}">View</button><button class="btn btn-ghost btn-small" type="button" data-duplicate="${U.esc(item.id)}">Duplicate</button><button class="btn btn-ghost btn-small" type="button" data-publish="${U.esc(item.id)}">${live ? "Unpublish" : "Publish"}</button><button class="btn btn-ghost btn-small" type="button" data-archive="${U.esc(item.id)}" ${item.archived ? "disabled" : ""}>Archive</button></div>`;
        return `<tr><td><div class="product-cell"><div class="product-shot">${shot}</div>${actions}</div></td><td><strong>${U.esc(item.name)}</strong></td><td>${U.esc(skuOf(item))}</td><td>${U.esc(U.categories[item.category] || item.category)}</td><td>${U.esc(item.brand)}</td><td>${U.esc(U.conditionLabel(item))}</td><td>${U.money(item.price)}</td><td>${U.esc(item.stock)}</td><td><span class="pill ${status[1]}">${U.esc(status[0])}</span></td><td>${U.esc(item.addedAt || "")}</td></tr>`;
      }).join("") || `<tr><td colspan="10">No products match these filters.</td></tr>`}</tbody></table></div>`;
  }

  function viewer() {
    const item = state.edit && Store.product(state.edit.id);
    if (!item) return `<h1>Product</h1><p class="lede">That product is not in the inventory.</p>`;
    const status = publication(item);
    const rows = [["SKU", skuOf(item)], ["Category", U.categories[item.category] || item.category], ["Brand", item.brand], ["Condition", U.conditionLabel(item)], ["Price", U.money(item.price)], ["Cost", item.cost == null || item.cost === "" ? "Not recorded" : U.money(item.cost)], ["Stock", item.stock], ["Status", status[0]], ["Added", item.addedAt || ""]];
    return `<h1>${U.esc(item.name)}</h1><div class="two"><div>${item.image ? `<img class="preview" src="${U.esc(item.image)}" alt="">` : ""}</div><div class="stack">${rows.map(([label, value]) => `<p><span class="muted">${U.esc(label)}</span><br><strong>${U.esc(value)}</strong></p>`).join("")}${Store.isListed(item) ? `<a class="link" href="${U.esc(Paths.toPublic("/product/" + item.id))}">Open on the shop</a>` : `<p class="muted">This is hidden from the shop.</p>`}<div class="cluster"><button class="btn" type="button" data-edit="${U.esc(item.id)}">Edit</button>${Admin.current().role === "owner" ? `<button class="btn btn-ghost" type="button" data-delete="${U.esc(item.id)}">Delete</button>` : ""}</div></div></div>`;
  }

  const SUBS = {
    phones: ["Flagship", "Mid-range", "Budget", "Fold"],
    chargers: ["Wall charger", "Wireless pad", "Car charger", "GaN"],
    cables: ["USB-C", "Lightning", "USB-A"],
    cases: ["Clear", "Rugged", "Wallet", "Silicone"],
    protectors: ["Tempered glass", "Privacy", "Matte"],
    camera: ["Lens glass", "Full kit"],
    audio: ["Earbuds", "Headphones", "Wired"],
    power: ["Power bank"],
    wearables: ["Smartwatch", "Band"],
    holders: ["Car mount", "Car charger"],
    speakers: ["Bluetooth speaker"],
    stands: ["Desk stand", "Grip"],
    other: ["Other"],
  };

  function optionalNumber(value) {
    if (value == null || String(value).trim() === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function formPrices(item) {
    const price = optionalNumber(item.price);
    const compare = optionalNumber(item.compareAt);
    if (price != null && compare != null && compare > price) return { selling: compare, sale: price };
    return { selling: item.price == null ? "" : item.price, sale: "" };
  }

  function formImages(item) {
    if (Array.isArray(item.images) && item.images.length && item.images[0] && item.images[0].src) {
      return item.images.map((shot) => ({ src: shot.src, alt: shot.alt || "" }));
    }
    if (item.image) return [{ src: item.image, alt: item.imageAlt || "" }];
    return [];
  }

  function prepare(source) {
    const item = Object.assign(blank(), source || {});
    const prices = formPrices(item);
    const images = formImages(source || item);
    let primary = images.findIndex((shot) => shot.src === item.image);
    if (primary < 0) primary = 0;
    const sourceTracking = source && source.tracking;
    const usedPhone = item.kind === "phone" && (item.condition === "used" || item.condition === "refurbished");
    return Object.assign(item, {
      selling: prices.selling,
      sale: prices.sale,
      status: item.archived ? "archived" : item.published === false ? "draft" : "active",
      placement: item.latest && item.bestSeller ? "both" : item.latest ? "latest" : item.bestSeller ? "best" : "none",
      images,
      primary,
      compatible: Array.isArray(item.compatible) ? item.compatible.join(", ") : (item.compatible || ""),
      battery: item.battery == null ? "" : item.battery,
      cost: item.cost == null ? "" : item.cost,
      repairCost: item.repairCost == null ? "" : item.repairCost,
      otherCosts: item.otherCosts == null ? "" : item.otherCosts,
      tracking: sourceTracking || (usedPhone ? "unit" : "quantity"),
      lowStockAt: item.lowStockAt == null || item.lowStockAt === "" ? 2 : item.lowStockAt,
    });
  }

  function subOptions(category, current) {
    const list = (SUBS[category] || ["Other"]).slice();
    if (current && !list.includes(current)) list.unshift(current);
    return [["", "None"]].concat(list.map((name) => [name, name]));
  }

  function phoneMode(item) { return item.kind !== "accessory"; }
  function usedPhone(item) { return phoneMode(item) && (item.condition === "used" || item.condition === "refurbished"); }
  function openedPhone(item) { return phoneMode(item) && item.condition !== "new"; }

  function listingPreview(data) {
    const images = data.images || [];
    const primary = images[Number(data.primary)] || images[0];
    const selling = optionalNumber(data.selling);
    const sale = optionalNumber(data.sale);
    const onSale = selling != null && sale != null && sale < selling;
    const price = onSale ? sale : selling;
    const title = data.name || "Product name";
    const meta = phoneMode(data)
      ? [data.storage, data.color].filter(Boolean).join(" · ")
      : [data.accessoryType || data.subcategory, data.color].filter(Boolean).join(" · ");
    const status = data.status === "active" ? ["Active", "ok"] : data.status === "archived" ? ["Archived", "stop"] : ["Draft", "warn"];
    return `<p class="eyebrow">Listing preview</p><article class="preview-card">${primary ? `<img src="${U.esc(primary.src)}" alt="${U.esc(primary.alt || title)}">` : `<div class="preview-empty">No primary image</div>`}<p class="brand">${U.esc(data.brand || "Brand")}</p><h3>${U.esc(title)}</h3><p class="muted">${U.esc(meta)}</p><p><strong>${price == null ? "Rs —" : U.money(price)}</strong>${onSale ? ` <s>${U.money(selling)}</s>` : ""}</p><p class="muted">${U.esc(data.blurb || "Short description")}</p><span class="pill ${status[1]}">${status[0]}</span></article>`;
  }

  function imageRows(item) {
    const images = item.images || [];
    if (!images.length) return `<p class="muted span-2">No images yet. The first primary image is the one on the shop card.</p>`;
    return `<div class="shots span-2">${images.map((shot, index) => `<article class="shot"><img src="${U.esc(shot.src)}" alt=""><div class="stack"><label class="field"><span>Alt text</span><input data-alt="${index}" value="${U.esc(shot.alt || "")}"></label><label class="check-line"><input type="radio" name="primary" value="${index}"${Number(item.primary) === index ? " checked" : ""}> Primary image</label><div class="cluster"><button class="btn btn-ghost" type="button" data-img-up="${index}" ${index === 0 ? "disabled" : ""}>Move up</button><button class="btn btn-ghost" type="button" data-img-down="${index}" ${index === images.length - 1 ? "disabled" : ""}>Move down</button><button class="btn btn-ghost" type="button" data-img-remove="${index}">Remove</button></div></div></article>`).join("")}</div>`;
  }

  function section(title, note, body) {
    return `<section class="form-section"><h2>${title}</h2>${note ? `<p class="muted">${note}</p>` : ""}<div class="form-2">${body}</div></section>`;
  }

  function pullForm() {
    const form = app.querySelector("#product-form");
    if (!form || !state.edit) return;
    const data = Object.fromEntries(new FormData(form));
    const images = (state.edit.images || []).map((shot, index) => {
      const alt = form.querySelector(`[data-alt="${index}"]`);
      return { src: shot.src, alt: alt ? alt.value : (shot.alt || "") };
    });
    const primary = Number(data.primary);
    Object.assign(state.edit, data, {
      images,
      primary: Number.isFinite(primary) ? primary : 0,
      featured: data.featured === "on" || data.featured === "yes",
    });
  }

  function updatePreview() {
    const host = app.querySelector("#listing-preview");
    if (!host) return;
    pullForm();
    host.innerHTML = listingPreview(state.edit);
  }

  function shrinkImage(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => resolve("");
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 960;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.72));
        };
        img.onerror = () => resolve("");
        img.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }

  function buildItem(intent) {
    pullForm();
    const data = state.edit;
    const status = intent === "draft" ? "draft" : intent === "archived" ? "archived" : intent === "active" ? "active" : (data.status || "draft");
    const selling = optionalNumber(data.selling);
    const sale = optionalNumber(data.sale);
    if (!String(data.name || "").trim()) return { error: "A product name is required." };
    if (selling == null) return { error: "A selling price is required." };
    if (sale != null && sale >= selling) return { error: "The sale price has to be lower than the selling price. Leave it blank when the piece is not on sale." };
    const phone = phoneMode(data);
    const used = usedPhone(data);
    const opened = openedPhone(data);
    const images = (data.images || []).filter((shot) => shot && shot.src);
    const primary = images[Number(data.primary)] || images[0];
    const placement = data.placement || "none";
    const item = {
      id: data.id || U.uid(data.name),
      sku: String(data.sku || "").trim(),
      name: String(data.name || "").trim(),
      brand: String(data.brand || "").trim(),
      subcategory: String(data.subcategory || "").trim(),
      model: String(data.model || data.name || "").trim(),
      kind: phone ? "phone" : "accessory",
      category: phone ? "phones" : (data.category === "phones" ? "other" : data.category || "other"),
      condition: data.condition || "new",
      seal: phone ? (data.condition === "new" ? (data.seal || "sealed") : "opened") : "na",
      pta: phone ? (data.pta || "approved") : "na",
      storage: phone ? String(data.storage || "").trim() : "",
      ram: phone ? String(data.ram || "").trim() : "",
      color: String(data.color || "").trim(),
      battery: opened && data.battery !== "" && data.battery != null ? Number(data.battery) : null,
      grade: opened ? (data.grade || "") : "",
      warranty: data.warranty || (phone ? "manufacturer" : "seller"),
      repair: opened ? String(data.repair || "").trim() : "",
      tests: opened ? String(data.tests || "").trim() : "",
      imei: phone ? String(data.imei || "").trim() : "",
      connector: phone ? "" : String(data.connector || "").trim(),
      power: phone ? "" : String(data.power || "").trim(),
      material: phone ? "" : String(data.material || "").trim(),
      authenticity: phone ? "" : String(data.authenticity || "").trim(),
      accessoryType: phone ? "" : String(data.accessoryType || "").trim(),
      price: sale != null ? sale : selling,
      cost: optionalNumber(data.cost),
      repairCost: optionalNumber(data.repairCost),
      otherCosts: optionalNumber(data.otherCosts),
      compareAt: sale != null ? selling : null,
      lowStockAt: optionalNumber(data.lowStockAt) == null ? 2 : optionalNumber(data.lowStockAt),
      tracking: data.tracking || (used ? "unit" : "quantity"),
      rating: optionalNumber(data.rating) || 0,
      reviews: optionalNumber(data.reviews) || 0,
      stock: optionalNumber(data.stock) == null ? 0 : optionalNumber(data.stock),
      published: status === "active",
      archived: status === "archived",
      featured: data.featured === true || data.featured === "on" || data.featured === "yes",
      latest: placement === "latest" || placement === "both",
      bestSeller: placement === "best" || placement === "both",
      deal: sale != null,
      compatible: phone ? [] : String(data.compatible || "").split(",").map((part) => part.trim()).filter(Boolean),
      image: primary ? primary.src : "",
      imageAlt: primary ? (primary.alt || "") : "",
      images: images.map((shot) => ({ src: shot.src, alt: shot.alt || "" })),
      blurb: String(data.blurb || "").trim(),
      story: String(data.story || "").trim(),
      seoTitle: String(data.seoTitle || "").trim(),
      seoDescription: String(data.seoDescription || "").trim(),
      addedAt: data.addedAt || today(),
    };
    if (!item.sku) item.sku = item.id;
    return { item };
  }

  function editor() {
    if (!state.edit || !Array.isArray(state.edit.images)) state.edit = prepare(state.edit || blank());
    const item = state.edit;
    const phone = phoneMode(item);
    const cats = Object.entries(U.categories).filter(([key]) => phone ? key === "phones" : key !== "phones");
    const conditions = [["new", "New"], ["used", "Used"], ["refurbished", "Refurbished"], ["open-box", "Open box"]];
    const warranty = [["manufacturer", "Manufacturer"], ["seller", "Seller"], ["none", "None"]];
    const basic = [
      field("name", "Product name", item.name),
      field("brand", "Brand", item.brand),
      field("kind", "Product type", item.kind, "select", [["phone", "Phone"], ["accessory", "Accessory"]]),
      field("category", "Category", item.category, "select", cats),
      field("subcategory", "Subcategory", item.subcategory, "select", subOptions(item.category, item.subcategory)),
      field("sku", "SKU", item.sku || item.id),
      field("blurb", "Short description", item.blurb, "textarea"),
      field("story", "Full description", item.story, "textarea"),
    ].join("");
    const pricing = [
      field("cost", "Purchase cost", item.cost, "number", 'min="0"'),
      field("repairCost", "Repair / refurbishment cost", item.repairCost, "number", 'min="0"'),
      field("otherCosts", "Other costs", item.otherCosts, "number", 'min="0"'),
      field("selling", "Selling price", item.selling, "number", 'min="0"'),
      field("sale", "Sale price", item.sale, "number", 'min="0"'),
      field("stock", "Stock quantity", item.stock, "number", 'min="0"'),
      field("lowStockAt", "Low-stock threshold", item.lowStockAt, "number", 'min="0"'),
      field("tracking", "Inventory tracking", item.tracking, "select", [["quantity", "Counted stock"], ["unit", "Single unit"], ["untracked", "Not tracked"]]),
    ].join("");
    const phoneFields = [
      field("model", "Model", item.model, "text", 'placeholder="iPhone 15"'),
      field("storage", "Storage", item.storage),
      field("ram", "RAM", item.ram),
      field("color", "Color", item.color),
      field("condition", "Condition", item.condition, "select", conditions),
      field("pta", "PTA status", item.pta, "select", [["approved", "PTA approved"], ["non-pta", "Non-PTA"], ["na", "Not recorded"]]),
      item.condition === "new" ? field("seal", "Box", item.seal, "select", [["sealed", "Factory sealed"], ["opened", "Opened"]]) : "",
      openedPhone(item) ? field("battery", "Battery health %", item.battery, "number", 'min="0" max="100"') : "",
      field("imei", "IMEI / serial reference", item.imei),
      field("warranty", "Warranty", item.warranty, "select", warranty),
      openedPhone(item) ? field("grade", "Screen / body condition", item.grade, "select", [["", "Not graded"], ["Excellent", "Excellent"], ["Good", "Good"], ["Fair", "Fair"]]) : "",
      openedPhone(item) ? field("repair", "Repair history", item.repair, "textarea") : "",
      openedPhone(item) ? field("tests", "Functional test results", item.tests, "textarea") : "",
    ].join("");
    const gearFields = [
      field("accessoryType", "Accessory type", item.accessoryType, "text", 'placeholder="35W GaN wall charger"'),
      field("connector", "Connector", item.connector, "select", [["", "Not set"], ["USB-C", "USB-C"], ["Lightning", "Lightning"], ["USB-A", "USB-A"], ["Wireless", "Wireless"], ["3.5 mm", "3.5 mm"], ["None", "None"]]),
      field("power", "Power output or capacity", item.power, "text", 'placeholder="35W or 10,000 mAh"'),
      field("compatible", "Compatible phone models", item.compatible, "textarea"),
      field("material", "Material", item.material),
      field("color", "Color", item.color),
      field("authenticity", "Authenticity / type", item.authenticity, "select", [["", "Not set"], ["Original", "Original"], ["Compatible", "Compatible"], ["OEM", "OEM"]]),
      field("condition", "Condition", item.condition, "select", conditions),
      field("warranty", "Warranty", item.warranty, "select", warranty),
    ].join("");
    const publishLabel = item.status === "archived" ? "Save as archived" : "Publish";
    const publishValue = item.status === "archived" ? "archived" : "active";
    return `<div class="editor-layout"><form id="product-form" class="stack" novalidate>
      <div class="split"><h1>${item.id ? "Edit product" : "Add product"}</h1></div>
      <p class="lede">Phone fields stay on phones. Battery health, repair notes, and test results appear for used and refurbished phones. A charger does not ask for them.</p>
      ${section("Basic information", "", basic)}
      ${section("Pricing and inventory", "Leave a cost blank when you do not know it. A blank is left out of profit. It is not stored as zero. The sale price is what the shop charges, and only when it is lower than the selling price.", pricing)}
      ${phone ? section("Phone details", item.condition === "new" ? "A new phone does not ask for battery health, repair history, or test results. An opened box cannot be marked factory sealed." : "Battery health and the test notes are for this unit because it is not a new sealed phone.", phoneFields) : ""}
      ${phone ? "" : section("Accessory details", "These fields replace the phone section. PTA, IMEI, storage, and battery health are not part of an accessory.", gearFields)}
      ${section("Images", "Upload photos from this device, or paste a link. Choose the primary image, reorder them, and add alt text for each one.", imageRows(item) + `<label class="btn">Upload images<input id="product-images" type="file" accept="image/*" multiple hidden></label><label class="field span-2"><span>Image link</span><span class="pass-row"><input id="image-url" type="url" placeholder="https://"><button class="btn btn-ghost" type="button" id="add-image-url">Add image link</button></span></label>`)}
      ${section("Publishing", "A draft stays off the shop. Publish lists it. Archived hides it and keeps the record.", [
        field("status", "Status", item.status, "select", [["draft", "Draft"], ["active", "Active"], ["archived", "Archived"]]),
        `<label class="check-line"><input type="checkbox" name="featured" ${item.featured ? "checked" : ""}> Featured product</label>`,
        field("placement", "Homepage placement", item.placement, "select", [["none", "Not placed"], ["latest", "Latest arrivals"], ["best", "Best sellers"], ["both", "Latest and best sellers"]]),
        field("seoTitle", "SEO title", item.seoTitle),
        field("seoDescription", "SEO description", item.seoDescription, "textarea"),
        `<div class="span-2 form-actions"><button class="btn btn-ghost" type="submit" value="draft">Save draft</button><button class="btn" type="submit" value="${publishValue}">${publishLabel}</button><button class="btn btn-ghost" type="button" data-view="products">Cancel</button></div>`,
      ].join(""))}
    </form><aside class="listing-preview" id="listing-preview">${listingPreview(item)}</aside></div>`;
  }

  function ordersPage() {
    const list = Store.orders();
    if (!list.length) return `<h1>Orders</h1><p class="lede">Orders placed from the shop will show here. A new order stays pending until you mark it.</p>`;
    const options = ["pending", "confirmed", "delivered", "cancelled"];
    return `<h1>Orders</h1><p class="lede">Pending and confirmed orders are not sales. Revenue starts when an order is delivered and marked paid.</p><div class="table-wrap"><table><thead><tr><th>Order</th><th>When</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Payment</th></tr></thead><tbody>${list.map((order) => `<tr><td><button class="link" type="button" data-focus="${U.esc(order.id)}" data-focus-view="order">${U.esc(order.id)}</button></td><td>${U.esc(new Date(order.placedAt).toLocaleString("en-PK"))}</td><td>${U.esc(order.customer.name)}<br>${U.esc(order.customer.phone)}<br>${U.esc(order.customer.city)}</td><td>${order.items.map((item) => U.esc(item.name + " × " + item.qty)).join("<br>")}</td><td>${U.money(order.totals.total)}</td><td><select data-order-status="${U.esc(order.id)}">${options.map((item) => `<option value="${item}"${statusOf(order) === item ? " selected" : ""}>${item}</option>`).join("")}</select></td><td><select data-order-pay="${U.esc(order.id)}"><option value="unpaid"${order.paymentStatus === "paid" ? "" : " selected"}>Unpaid</option><option value="paid"${order.paymentStatus === "paid" ? " selected" : ""}>Paid</option></select></td></tr>`).join("")}</tbody></table></div>`;
  }

  function notesPage() {
    const list = Store.notes();
    if (!list.length) return `<h1>Messages</h1><p class="lede">Contact notes from the shop will show here.</p>`;
    return `<h1>Messages</h1><div class="stack">${list.map((note) => `<article class="stat"><strong>${U.esc(note.name)}</strong><p>${U.esc(note.contact || note.phone || "")}</p><p>${U.esc(note.subject || "")}</p><p>${U.esc(note.message)}</p><p class="muted">${U.esc(new Date(note.at).toLocaleString("en-PK"))}</p></article>`).join("")}</div>`;
  }

  function settingsPage() {
    const item = Store.settings();
    const user = Admin.current();
    return `<h1>Settings</h1><form id="settings-form" class="form-2 panel">${field("name", "Shop name", item.name)}${field("announcement", "Announcement", item.announcement)}${field("phone", "Phone", item.phone, "tel")}${field("whatsapp", "WhatsApp number", item.whatsapp, "tel")}${field("email", "Email", item.email, "email")}${field("address", "Street address", item.address)}${field("city", "City", item.city)}${field("hours", "Business hours", item.hours)}${field("map", "Google Maps link", item.map, "url")}${field("instagram", "Instagram URL", item.instagram)}${field("facebook", "Facebook URL", item.facebook)}<div class="span-2 cluster"><button class="btn" type="submit">Save settings</button><button class="btn btn-ghost" type="button" id="reset-catalog">Restore sample catalog</button></div><p class="muted span-2">Leave address, hours, and the map blank until they are real. The shop sign-in is separate from this counter.</p></form>
      <section class="panel stack"><h2>Password</h2><form id="admin-password" class="stack">${passwordField("current", "Current password", "current-password")}${passwordField("next", "New password", "new-password")}${passwordField("confirm", "Confirm new password", "new-password")}<button class="btn" type="submit">Update password</button></form></section>
      <section class="panel stack"><h2>Two-factor authentication</h2><p class="lede">${user.totpOn ? "A code is required after the password." : "Optional. Off until you confirm a code from an authenticator app."}</p><p class="muted">The shared secret stays on this device because this counter has no separate server. The code itself is checked with the standard 30-second authenticator algorithm.</p>${user.totpOn ? `<form id="totp-off" class="stack">${passwordField("password", "Password", "current-password")}<button class="btn btn-ghost" type="submit">Turn off two-factor</button></form>` : `<button class="btn" type="button" id="totp-start">Set up authenticator</button>`}${state.totpSecret ? `<p class="hint">Add this secret to an authenticator app, then enter a code. Secret: <strong>${U.esc(state.totpSecret)}</strong></p><form id="totp-on" class="stack"><label class="field"><span>Code</span><input name="code" inputmode="numeric" autocomplete="one-time-code"></label><button class="btn" type="submit">Confirm two-factor</button></form>` : ""}</section>
      <p class="muted">Sign-in accounts are managed on Admin users. This page keeps the shop details and your own password.</p>`;
  }

  function saveCopy(source, patch) {
    const next = Object.assign({}, source, patch);
    const change = next.change;
    const reason = next.reason;
    delete next.change;
    delete next.reason;
    Store.saveProduct(next);
    Store.logInventory({ sku: skuOf(next), name: next.name, change: change || "Updated", reason: reason || "Products" });
    return next;
  }

  function exportCsv() {
    const headers = ["sku", "name", "brand", "category", "condition", "price", "cost", "stock", "published", "archived", "added"];
    const lines = [headers.join(",")].concat(filteredProducts().map((item) => headers.map((key) => {
      const value = key === "sku" ? skuOf(item) : key === "added" ? (item.addedAt || "") : key === "published" ? item.published !== false : key === "archived" ? !!item.archived : item[key];
      const text = value == null ? "" : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "bona-products.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    toast("Exported the current product filters");
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quoted && ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) { row.push(cell); cell = ""; }
      else if ((ch === "\n" || ch === "\r") && !quoted) {
        if (ch === "\r" && text[i + 1] === "\n") i += 1;
        row.push(cell);
        cell = "";
        if (row.some((part) => part !== "")) rows.push(row);
        row = [];
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); if (row.some((part) => part !== "")) rows.push(row); }
    return rows;
  }

  function importCsv(text) {
    const rows = parseCsv(text);
    if (rows.length < 2) { toast("The file needs a header and one product."); render(); return; }
    const header = rows[0].map((item) => item.trim().toLowerCase());
    let saved = 0;
    rows.slice(1).forEach((row) => {
      const data = {};
      header.forEach((key, index) => { data[key] = row[index] == null ? "" : String(row[index]).trim(); });
      if (!data.name || !Number.isFinite(Number(data.price))) return;
      const existing = Store.products().find((item) => skuOf(item) === data.sku || item.id === data.sku);
      const item = Object.assign(blank(), existing || {}, {
        id: existing ? existing.id : U.uid(data.name),
        sku: data.sku || (existing ? skuOf(existing) : ""),
        name: data.name,
        brand: data.brand || (existing && existing.brand) || "",
        category: data.category || (existing && existing.category) || "other",
        condition: data.condition || (existing && existing.condition) || "new",
        price: Number(data.price),
        cost: data.cost === "" || data.cost == null ? (existing ? existing.cost : null) : Number(data.cost),
        stock: data.stock === "" || data.stock == null ? (existing ? existing.stock : 0) : Number(data.stock),
        published: data.published === "" || data.published == null ? (existing ? existing.published !== false : true) : data.published !== "false",
        archived: data.archived == null || data.archived === "" ? !!(existing && existing.archived) : data.archived === "true",
        addedAt: data.added || (existing && existing.addedAt) || today(),
      });
      if (!item.sku) item.sku = item.id;
      Store.saveProduct(item);
      saved += 1;
    });
    Store.logInventory({ sku: "", name: "Import", change: saved + " rows", reason: "CSV import" });
    toast(saved + " products imported");
    show("products");
  }

  function gate() {
    const error = state.error ? `<p class="err">${U.esc(state.error)}</p>` : "";
    const setup = Admin.setupNotice ? Admin.setupNotice() : null;
    const hint = setup
      ? `<p class="hint">This browser created a sign-in just now. Username <strong>${U.esc(setup.username)}</strong>. Password <strong>${U.esc(setup.password)}</strong>. It exists only in this browser and is not saved in the project files. Change it after you sign in.</p>`
      : `<p class="muted">Use the owner or staff username saved on this device.</p>`;
    let form = "";
    if (state.authView === "forgot") {
      form = `<h1>Reset the counter password</h1><p class="lede">Enter the username or email. A matching account shows a one-time code here. It is not stored in plain text.</p><form id="admin-forgot" class="stack"><label class="field"><span>Email or username</span><input name="identifier" value="${U.esc(state.identifier)}" autocomplete="username"></label><button class="btn" type="submit">Send reset code</button></form><button class="link" type="button" data-auth-view="login">Back to sign in</button>`;
    } else if (state.authView === "reset") {
      form = `<h1>Choose a new password</h1>${state.code ? `<p class="hint">Your reset code is <strong>${U.esc(state.code)}</strong>. It will not be shown again.</p>` : `<p class="muted">Enter the code from the reset request.</p>`}<form id="admin-reset" class="stack"><label class="field"><span>Email or username</span><input name="identifier" value="${U.esc(state.identifier)}" autocomplete="username"></label><label class="field"><span>Reset code</span><input name="code" inputmode="numeric" autocomplete="one-time-code"></label>${passwordField("password", "New password", "new-password")}${passwordField("confirm", "Confirm password", "new-password")}<button class="btn" type="submit">Save password</button></form>`;
    } else if (state.authView === "totp") {
      form = `<h1>Authenticator code</h1><p class="lede">Enter the 6-digit code from the authenticator app. Five wrong codes lock this sign-in for 15 minutes.</p><form id="admin-totp" class="stack"><label class="field"><span>Code</span><input name="code" inputmode="numeric" autocomplete="one-time-code"></label><button class="btn" type="submit">Continue</button></form>`;
    } else {
      form = `<p class="eyebrow">Shop counter</p><h1>Admin sign in</h1><p class="lede">Portfolio demo. This counter is stored in this browser. The page address is not a password, and there is no server account.</p>${hint}<form id="admin-login" class="stack" novalidate><label class="field"><span>Email or username</span><input name="identifier" autocomplete="username" value="${U.esc(state.identifier)}"></label>${passwordField("password", "Password", "current-password")}<button class="btn" type="submit">Log in</button></form><button class="link" type="button" data-auth-view="forgot">Forgot password</button><p class="muted">The session stays in this tab for up to 8 hours. Two-factor is optional and stays off until it is turned on after sign-in. Passwords are stored as a salted hash. Five wrong passwords lock that name on this device for 15 minutes. Reset codes are shown here because no mail server is configured.</p>`;
    }
    app.innerHTML = `<div class="login"><div class="login-card">${form}${state.flash ? `<p class="hint">${U.esc(state.flash)}</p>` : ""}${error}<a class="link" href="/">Back to the shop</a></div></div>`;
    state.flash = "";
    bindGate();
  }

  function bindGate() {
    app.querySelectorAll("[data-show-password]").forEach((button) => button.addEventListener("click", () => {
      const input = button.parentElement.querySelector("input");
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.textContent = show ? "Hide" : "Show";
    }));
    app.querySelectorAll("[data-auth-view]").forEach((button) => button.addEventListener("click", () => {
      state.authView = button.dataset.authView;
      state.error = "";
      gate();
    }));
    const login = app.querySelector("#admin-login");
    if (login) login.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(login));
      state.identifier = data.identifier || "";
      Admin.login(data.identifier, data.password).then((result) => {
        if (!result.ok) { state.error = result.error; gate(); return; }
        state.error = "";
        if (result.totp) { state.authView = "totp"; state.pendingId = result.userId; gate(); return; }
        applyAdminRoute();
        render();
      });
    });
    const forgot = app.querySelector("#admin-forgot");
    if (forgot) forgot.addEventListener("submit", (event) => {
      event.preventDefault();
      const identifier = new FormData(forgot).get("identifier");
      state.identifier = identifier || "";
      Admin.requestReset(identifier).then((result) => {
        if (!result.ok) { state.error = result.error; gate(); return; }
        state.code = result.code || "";
        state.error = "";
        state.authView = "reset";
        if (result.neutral) state.notice = "";
        gate();
      });
    });
    const reset = app.querySelector("#admin-reset");
    if (reset) reset.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(reset));
      Admin.completeReset(data).then((result) => {
        if (!result.ok) { state.error = result.error; gate(); return; }
        state.code = "";
        state.error = "";
        state.flash = "The password is updated. Sign in with the new one.";
        state.authView = "login";
        gate();
      });
    });
    const totp = app.querySelector("#admin-totp");
    if (totp) totp.addEventListener("submit", (event) => {
      event.preventDefault();
      Admin.confirmLoginCode(state.pendingId, new FormData(totp).get("code")).then((result) => {
        if (!result.ok) { state.error = result.error; gate(); return; }
        state.authView = "login";
        state.pendingId = "";
        applyAdminRoute();
        render();
      });
    });
  }

  function show(view, options) {
    options = options || {};
    state.view = view;
    if (options.focus != null) state.focus = options.focus;
    if (view === "edit") state.edit = prepare(options.product || blank());
    else if (view === "view") state.edit = options.product || null;
    const record = view === "order" ? (state.focus || "") : ((state.edit && state.edit.id) || "");
    const href = Paths.adminHref(view, record);
    if (location.pathname !== href) history.pushState({ bona: 1 }, "", href);
    render();
  }

  function applyAdminRoute() {
    const route = Paths.adminFrom(location.pathname) || { view: "dash", id: "" };
    if (route.redirect && route.redirect !== location.pathname) {
      history.replaceState({ bona: 1 }, "", route.redirect);
      return applyAdminRoute();
    }
    const user = Admin.current();
    if (user && location.pathname === Paths.ADMIN) {
      history.replaceState({ bona: 1 }, "", Paths.adminHref("dash"));
      return applyAdminRoute();
    }
    if (!user) return;
    let view = route.view || "dash";
    if (user.role !== "owner" && (view === "settings" || view === "users")) {
      history.replaceState({ bona: 1 }, "", Paths.adminHref("dash"));
      view = "dash";
    }
    state.view = view;
    if (view === "edit") state.edit = prepare(route.id ? (Store.product(route.id) || blank()) : blank());
    else if (view === "view") state.edit = route.id ? Store.product(route.id) : null;
    else if (view === "order") state.focus = route.id || "";
  }

  function render() {
    const user = Admin.current();
    const canon = document.querySelector('link[rel="canonical"]');
    if (canon) canon.setAttribute("href", location.pathname);
    if (!user) { gate(); return; }
    if (user.role !== "owner" && (state.view === "settings" || state.view === "users")) {
      state.view = "dash";
      history.replaceState({ bona: 1 }, "", Paths.adminHref("dash"));
    }
    const pages = { dash, products: productsPage, view: viewer, edit: editor, orders: ordersPage, notes: notesPage, settings: settingsPage };
    const draw = pages[state.view] || desk().pages[state.view] || dash;
    app.innerHTML = shell(user, draw());
    bind();
    state.notice = "";
  }

  function bind() {
    app.querySelectorAll("[data-show-password]").forEach((button) => button.addEventListener("click", () => {
      const input = button.parentElement.querySelector("input");
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.textContent = show ? "Hide" : "Show";
    }));
    const jump = app.querySelector("[data-jump]");
    if (jump) jump.addEventListener("change", () => {
      if (jump.value === "edit") show("edit");
      else show(jump.value);
    });
    app.querySelectorAll("[data-focus-view]").forEach((button) => button.addEventListener("click", () => {
      show(button.dataset.focusView, { focus: button.dataset.focus || "" });
    }));
    app.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const view = button.dataset.view;
      if (view === "edit" && !button.dataset.edit) show("edit");
      else show(view);
    }));
    const out = app.querySelector("#sign-out");
    if (out) out.addEventListener("click", () => { Admin.logout(); state.authView = "login"; state.error = ""; render(); });
    const find = app.querySelector("#find");
    if (find) find.addEventListener("input", () => {
      state.q = find.value;
      state.view = "products";
      render();
      const next = app.querySelector("#find");
      if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
    });
    app.querySelectorAll("[data-product-filter]").forEach((select) => select.addEventListener("change", () => {
      state.filters[select.dataset.productFilter] = select.value;
      render();
    }));
    app.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => {
      show("edit", { product: Store.product(button.dataset.edit) || blank() });
    }));
    app.querySelectorAll("[data-open]").forEach((button) => button.addEventListener("click", () => {
      show("view", { product: Store.product(button.dataset.open) });
    }));
    app.querySelectorAll("[data-duplicate]").forEach((button) => button.addEventListener("click", () => {
      const item = Store.product(button.dataset.duplicate);
      if (!item) return;
      const copy = Object.assign({}, item, { id: U.uid(item.name), sku: "", name: "Copy of " + item.name, published: false, archived: false });
      copy.sku = copy.id;
      Store.saveProduct(copy);
      Store.logInventory({ sku: copy.sku, name: copy.name, change: "Duplicated from " + skuOf(item), reason: "Products" });
      toast("Duplicated as an unpublished product");
      render();
    }));
    app.querySelectorAll("[data-publish]").forEach((button) => button.addEventListener("click", () => {
      const item = Store.product(button.dataset.publish);
      if (!item) return;
      const live = !item.archived && item.published !== false;
      saveCopy(item, { published: !live, archived: false, change: live ? "Unpublished" : "Published", reason: "Products" });
      toast(live ? "Unpublished" : "Published");
      render();
    }));
    app.querySelectorAll("[data-archive]").forEach((button) => button.addEventListener("click", () => {
      const item = Store.product(button.dataset.archive);
      if (!item || item.archived) return;
      if (!confirm("Archive " + item.name + "? It will leave the shop.")) return;
      saveCopy(item, { archived: true, published: false, change: "Archived", reason: "Products" });
      toast("Archived");
      render();
    }));
    app.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => {
      const item = Store.product(button.dataset.delete);
      if (item && confirm("Delete " + item.name + "?")) {
        Store.removeProduct(item.id);
        Store.logInventory({ sku: skuOf(item), name: item.name, change: "Deleted", reason: "Products" });
        toast("Deleted");
        show("products");
      }
    }));
    const form = app.querySelector("#product-form");
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const intent = event.submitter && event.submitter.value;
        const built = buildItem(intent);
        if (built.error) { toast(built.error); render(); return; }
        const item = built.item;
        const previous = state.edit && state.edit.id ? Store.product(state.edit.id) : null;
        Store.saveProduct(item);
        const stockNote = previous && Number(previous.stock) !== Number(item.stock) ? " Stock " + previous.stock + " to " + item.stock + "." : "";
        const label = item.archived ? "Archived" : item.published ? "Published" : "Saved as a draft";
        Store.logInventory({ sku: item.sku, name: item.name, change: (previous ? "Edited" : "Added") + " — " + label + stockNote, reason: "Product form" });
        state.edit = null;
        toast(label);
        show("products");
      });
      form.addEventListener("change", (event) => {
        const name = event.target.name;
        if (name !== "kind" && name !== "condition" && name !== "category" && name !== "status" && name !== "tracking") return;
        pullForm();
        if (name === "kind") {
          if (state.edit.kind === "phone") state.edit.category = "phones";
          else if (state.edit.category === "phones") state.edit.category = "chargers";
        }
        if (name === "category") state.edit.kind = state.edit.category === "phones" ? "phone" : "accessory";
        const allowed = SUBS[state.edit.category] || [];
        if (state.edit.subcategory && !allowed.includes(state.edit.subcategory)) state.edit.subcategory = "";
        render();
      });
      form.addEventListener("input", (event) => {
        if (event.target && event.target.dataset && event.target.dataset.alt != null) {
          const index = Number(event.target.dataset.alt);
          if (state.edit.images[index]) state.edit.images[index].alt = event.target.value;
        }
        updatePreview();
      });
    }
    app.querySelectorAll("[data-img-up], [data-img-down], [data-img-remove]").forEach((button) => button.addEventListener("click", () => {
      pullForm();
      const images = state.edit.images || [];
      const index = Number(button.dataset.imgUp || button.dataset.imgDown || button.dataset.imgRemove);
      if (button.dataset.imgRemove != null) {
        const primary = Number(state.edit.primary);
        images.splice(index, 1);
        if (primary === index) state.edit.primary = 0;
        else if (primary > index) state.edit.primary = primary - 1;
      } else {
        const next = index + (button.dataset.imgUp != null ? -1 : 1);
        if (next < 0 || next >= images.length) return;
        const swap = images[index];
        images[index] = images[next];
        images[next] = swap;
        if (Number(state.edit.primary) === index) state.edit.primary = next;
        else if (Number(state.edit.primary) === next) state.edit.primary = index;
      }
      state.edit.images = images;
      render();
    }));
    const uploads = app.querySelector("#product-images");
    if (uploads) uploads.addEventListener("change", () => {
      const files = Array.from(uploads.files || []);
      pullForm();
      Promise.all(files.map(shrinkImage)).then((srcs) => {
        srcs.filter(Boolean).forEach((src) => {
          if (state.edit.images.length >= 8) return;
          state.edit.images.push({ src, alt: "" });
        });
        if (files.length && state.edit.images.length >= 8) toast("Eight images is the limit on this device.");
        render();
      });
    });
    const addLink = app.querySelector("#add-image-url");
    if (addLink) addLink.addEventListener("click", () => {
      const input = app.querySelector("#image-url");
      const src = input && input.value.trim();
      if (!src) { toast("Paste an image link first."); return; }
      pullForm();
      if (state.edit.images.length >= 8) { toast("Eight images is the limit on this device."); return; }
      state.edit.images.push({ src, alt: "" });
      render();
    });

    const range = app.querySelector("#range-form");
    if (range) {
      range.addEventListener("change", () => {
        const data = Object.fromEntries(new FormData(range));
        if (data.from) state.range.from = data.from;
        if (data.to) state.range.to = data.to;
        render();
      });
    }
    app.querySelectorAll("[data-range]").forEach((button) => button.addEventListener("click", () => {
      if (button.dataset.range === "today") state.range = { from: today(), to: today() };
      else if (button.dataset.range === "month") state.range = { from: monthStart(), to: today() };
      else {
        const dates = Store.orders().map((order) => order.placedAt).filter(Boolean).sort();
        state.range = { from: dates.length ? day(dates[0]) : "2026-01-01", to: today() };
      }
      render();
    }));
    app.querySelectorAll("[data-order-status]").forEach((select) => select.addEventListener("change", () => {
      const patch = { status: select.value };
      if (select.value === "delivered") patch.deliveredAt = new Date().toISOString();
      Store.updateOrder(select.dataset.orderStatus, patch);
      toast("Order updated");
      render();
    }));
    app.querySelectorAll("[data-order-pay]").forEach((select) => select.addEventListener("change", () => {
      const patch = { paymentStatus: select.value };
      if (select.value === "paid") patch.paidAt = new Date().toISOString();
      Store.updateOrder(select.dataset.orderPay, patch);
      toast("Payment updated");
      render();
    }));
    app.querySelectorAll("[data-return]").forEach((select) => select.addEventListener("change", () => {
      Store.updateReturnStatus(select.dataset.return, select.dataset.returnId, select.value);
      toast("Return request updated");
      render();
    }));
    const exportButton = app.querySelector("#export-csv");
    if (exportButton) exportButton.addEventListener("click", exportCsv);
    const importer = app.querySelector("#import-csv");
    if (importer) importer.addEventListener("change", () => {
      const file = importer.files && importer.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => importCsv(String(reader.result || ""));
      reader.readAsText(file);
    });
    const settingsForm = app.querySelector("#settings-form");
    if (settingsForm) settingsForm.addEventListener("submit", (event) => {
      event.preventDefault();
      Store.saveSettings(Object.fromEntries(new FormData(settingsForm)));
      toast("Settings saved");
      render();
    });
    const reset = app.querySelector("#reset-catalog");
    if (reset) reset.addEventListener("click", () => {
      if (confirm("Replace the saved catalog with the sample inventory?")) {
        Store.resetProducts();
        Store.logInventory({ sku: "", name: "Catalog", change: "Sample catalog restored", reason: "Settings" });
        toast("Sample catalog restored");
        render();
      }
    });
    const password = app.querySelector("#admin-password");
    if (password) password.addEventListener("submit", (event) => {
      event.preventDefault();
      Admin.changePassword(Object.fromEntries(new FormData(password))).then((result) => {
        toast(result.ok ? "Password updated" : result.error);
        render();
      });
    });
    const start = app.querySelector("#totp-start");
    if (start) start.addEventListener("click", () => {
      const result = Admin.beginTotp();
      if (!result.ok) { toast(result.error); render(); return; }
      state.totpSecret = result.secret;
      render();
    });
    const totpOn = app.querySelector("#totp-on");
    if (totpOn) totpOn.addEventListener("submit", (event) => {
      event.preventDefault();
      Admin.confirmTotp(new FormData(totpOn).get("code")).then((result) => {
        if (result.ok) state.totpSecret = "";
        toast(result.ok ? "Two-factor is on for this sign-in" : result.error);
        render();
      });
    });
    const totpOff = app.querySelector("#totp-off");
    if (totpOff) totpOff.addEventListener("submit", (event) => {
      event.preventDefault();
      Admin.disableTotp(new FormData(totpOff).get("password")).then((result) => {
        toast(result.ok ? "Two-factor is off" : result.error);
        render();
      });
    });
    const staff = app.querySelector("#staff-form");
    if (staff) staff.addEventListener("submit", (event) => {
      event.preventDefault();
      Admin.addStaff(Object.fromEntries(new FormData(staff))).then((result) => {
        toast(result.ok ? "Sign-in added" : result.error);
        render();
      });
    });
    desk().bind(app);
  }

  let deskApi = null;
  function desk() {
    if (!deskApi) {
      deskApi = window.BonaDesk.install({
        U, Store, Admin, state, toast, field, skuOf, statusOf, collected, lowStock,
        inRange, recordedCost, saleDate, saveCopy, render,
      });
    }
    return deskApi;
  }

  window.addEventListener("popstate", () => { applyAdminRoute(); render(); });
  Admin.ready().then(() => { applyAdminRoute(); render(); });
})();
