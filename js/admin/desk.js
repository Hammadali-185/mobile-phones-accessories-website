(function () {
  function install(ctx) {
    const U = ctx.U;
    const Store = ctx.Store;
    const Admin = ctx.Admin;
    const state = ctx.state;

    function actor() {
      const user = Admin.current();
      return user ? user.username : "";
    }

    function purchaseId() {
      const bytes = new Uint32Array(1);
      crypto.getRandomValues(bytes);
      return "PO" + String(1000 + (bytes[0] % 9000));
    }

    function audit(action, detail) {
      Store.logAudit({ actor: actor(), action: action, detail: detail || "" });
    }

    function head(title, lede) {
      return `<h1>${U.esc(title)}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}`;
    }

    function table(headers, rows, empty) {
      if (!rows.length) return `<p class="lede">${U.esc(empty || "Nothing to show yet.")}</p>`;
      return `<div class="table-wrap"><table><thead><tr>${headers.map((item) => `<th>${U.esc(item)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
    }

    function groups(role) {
      const sections = [
        ["Overview", [["dash", "Dashboard"], ["reports", "Reports"], ["notifications", "Notifications"], ["audit", "Audit log"]]],
        ["Catalog", [["products", "Products"], ["edit", "Add product"], ["categories", "Categories"], ["brands", "Brands"], ["used", "Used phones"], ["inspect", "Inspection"], ["stock", "Stock"], ["home", "Homepage"], ["reviews", "Reviews"]]],
        ["Orders", [["orders", "Orders"], ["payments", "Payments"], ["shipping", "Shipping"], ["returns", "Returns"]]],
        ["People", [["customers", "Customers"], ["notes", "Messages"], ["suppliers", "Suppliers"], ["purchases", "Purchase orders"], ["coupons", "Coupons"]]],
      ];
      if (role === "owner") sections.push(["Access", [["users", "Admin users"], ["settings", "Settings"]]]);
      return sections;
    }

    function categoriesPage() {
      const labels = U.categories;
      const base = Store.baseCategories();
      const rows = Object.entries(labels).map(([id, name]) => {
        const count = Store.products().filter((item) => item.category === id && !item.archived).length;
        const extra = !base[id];
        return `<tr><td><input name="label:${U.esc(id)}" value="${U.esc(name)}" aria-label="Name for ${U.esc(id)}"></td><td>${U.esc(id)}</td><td>${count}</td><td>${extra ? `<button class="btn btn-ghost btn-small" type="button" data-drop-cat="${U.esc(id)}" ${count ? "disabled" : ""}>Remove</button>` : "Built in"}</td><td><a class="link" href="${U.esc(window.BonaPaths.toPublic("/category/" + id))}">Shop</a></td></tr>`;
      });
      return `${head("Categories", "Names shown on the shop. A built-in category stays, so existing products keep their place. A new category appears in the catalog once a product uses it.")}
        <form id="cat-form" class="stack">${table(["Name", "Id", "Products", "Type", "Shop"], rows)}
        <label class="field"><span>New category</span><input name="newName" placeholder="Repair tools"></label>
        <button class="btn" type="submit">Save categories</button></form>`;
    }

    function brandsPage() {
      const extras = Store.settings().extraBrands || [];
      const names = Array.from(new Set(Store.products().map((item) => item.brand).concat(extras).filter(Boolean))).sort();
      const rows = names.map((name) => {
        const count = Store.products().filter((item) => item.brand === name && !item.archived).length;
        const extra = extras.includes(name) && count === 0;
        return `<tr><td>${U.esc(name)}</td><td>${count}</td><td>${extra ? `<button class="btn btn-ghost btn-small" type="button" data-drop-brand="${U.esc(name)}">Remove</button>` : ""}</td><td><a class="link" href="${U.esc(window.BonaPaths.toPublic("/brand/" + name))}">Shop</a></td></tr>`;
      });
      return `${head("Brands", "Brands come from the products on file. Add a name here before a product uses it.")}
        ${table(["Brand", "Products", "", "Shop"], rows, "No brands yet.")}
        <form id="brand-form" class="stack"><label class="field"><span>New brand</span><input name="name"></label><button class="btn" type="submit">Add brand</button></form>`;
    }

    function usedPage() {
      const rows = Store.products().filter((item) => item.kind === "phone" && (item.condition === "used" || item.condition === "refurbished") && !item.archived).map((item) => `<tr><td>${item.image ? `<img class="thumb" src="${U.esc(item.image)}" alt="">` : ""}</td><td>${U.esc(item.name)}</td><td>${U.esc(ctx.skuOf(item))}</td><td>${U.esc(item.storage || "")}</td><td>${U.esc(item.color || "")}</td><td>${item.battery != null && item.battery !== "" ? U.esc(item.battery) + "%" : "Not recorded"}</td><td>${U.esc(U.ptaLabel(item) || "Not recorded")}</td><td>${U.esc(item.grade || "")}</td><td>${U.esc(item.stock)}</td><td>${U.money(item.price)}</td><td><button class="btn btn-ghost btn-small" type="button" data-focus="${U.esc(item.id)}" data-focus-view="inspect">Inspect</button></td></tr>`);
      return `${head("Used phone inventory", "Each row is one handset. Battery health, PTA, and grade describe that unit. A used unit with one in stock is the unit itself, not a low-stock alert.")}${table(["", "Phone", "SKU", "Storage", "Colour", "Battery", "PTA", "Grade", "Stock", "Price", ""], rows, "No used or refurbished phones are on file.")}`;
    }

    function inspectPage() {
      const phones = Store.products().filter((item) => item.kind === "phone" && item.condition !== "new");
      const current = phones.find((item) => item.id === state.focus) || null;
      const options = phones.map((item) => `<option value="${U.esc(item.id)}"${current && current.id === item.id ? " selected" : ""}>${U.esc(item.name)}</option>`).join("");
      const form = current ? `<form id="inspect-form" class="form-2 panel">${ctx.field("battery", "Battery health %", current.battery, "number", 'min="0" max="100"')}
        ${ctx.field("grade", "Screen and body", current.grade)}
        ${ctx.field("pta", "PTA status", current.pta || "na", "select", [["approved", "PTA approved"], ["non-pta", "Non-PTA"], ["na", "Not recorded"]])}
        ${ctx.field("warranty", "Warranty", current.warranty || "none", "select", [["manufacturer", "Manufacturer"], ["seller", "Seller"], ["none", "None"]])}
        ${ctx.field("repair", "Repair history", current.repair, "textarea")}
        ${ctx.field("tests", "Functional test results", current.tests, "textarea")}
        ${ctx.field("imei", "IMEI / serial reference", current.imei || "")}
        <p class="muted span-2">The IMEI stays on this counter. It is not shown on the shop page.</p>
        <div class="span-2"><button class="btn" type="submit">Save inspection</button></div></form>` : `<p class="lede">No opened phone is on file.</p>`;
      return `${head("Individual phone inspection", "Record what was checked on this unit. A new sealed phone is not inspected here.")}
        <label class="field"><span>Phone</span><select id="inspect-pick"><option value="">Choose a phone</option>${options}</select></label>${form}`;
    }

    function stockPage() {
      const options = Store.products().filter((item) => !item.archived).map((item) => `<option value="${U.esc(item.id)}">${U.esc(item.name)} · ${U.esc(item.stock)}</option>`).join("");
      const rows = Store.inventoryLog().map((row) => `<tr><td>${U.esc(row.at ? new Date(row.at).toLocaleString("en-PK") : "")}</td><td>${U.esc(row.sku)}</td><td>${U.esc(row.name)}</td><td>${U.esc(row.change)}</td><td>${U.esc(row.reason)}</td></tr>`);
      return `${head("Inventory and stock movements", "Adjust a quantity here and the change is written to the log. The log starts empty until a real change happens.")}
        <form id="stock-form" class="form-2 panel"><label class="field span-2"><span>Product</span><select name="id">${options}</select></label>
        ${ctx.field("stock", "New quantity", "", "number", 'min="0"')}
        ${ctx.field("reason", "Reason", "")}
        <div class="span-2"><button class="btn" type="submit">Update stock</button></div></form>
        ${table(["When", "SKU", "Product", "Change", "Reason"], rows, "No stock movements yet.")}`;
    }

    function orderPage() {
      const order = Store.orders().find((item) => item.id === state.focus);
      if (!order) return `${head("Order details", "Open an order from the orders list.")}<button class="btn" type="button" data-view="orders">Back to orders</button>`;
      const person = order.customer || {};
      const options = ["pending", "confirmed", "delivered", "cancelled"];
      return `${head(order.id, "Pending and confirmed orders are not sales. Revenue starts when the order is delivered and marked paid.")}
        <div class="two"><section class="panel stack"><h2>Customer</h2><p>${U.esc(person.name || "")}</p><p>${U.esc(person.phone || "")}</p><p>${U.esc(person.email || "")}</p><p>${U.esc(person.address || "")}</p><p>${U.esc(person.city || "")}</p><p class="muted">${U.esc(person.note || "")}</p></section>
        <section class="panel stack"><h2>Status</h2><label class="field"><span>Order</span><select data-order-status="${U.esc(order.id)}">${options.map((item) => `<option value="${item}"${ctx.statusOf(order) === item ? " selected" : ""}>${item}</option>`).join("")}</select></label>
        <label class="field"><span>Payment</span><select data-order-pay="${U.esc(order.id)}"><option value="unpaid"${order.paymentStatus === "paid" ? "" : " selected"}>Unpaid</option><option value="paid"${order.paymentStatus === "paid" ? " selected" : ""}>Paid</option></select></label>
        <p>Method: ${person.payment === "transfer" ? "Bank transfer" : "Cash on delivery"}. Card numbers are not collected.</p>
        <p class="muted">Placed ${U.esc(new Date(order.placedAt).toLocaleString("en-PK"))}</p></section></div>
        ${(order.items || []).map((item) => `<div class="split"><span>${U.esc(item.name)} × ${item.qty}</span><strong>${U.money(item.price * item.qty)}</strong></div>`).join("")}
        <p>Delivery ${order.totals && order.totals.shipping ? U.money(order.totals.shipping) : "Free"} · Total <strong>${U.money(order.totals && order.totals.total)}</strong></p>`;
    }

    function paymentsPage() {
      const rows = Store.orders().map((order) => {
        const person = order.customer || {};
        return `<tr><td><button class="link" type="button" data-focus="${U.esc(order.id)}" data-focus-view="order">${U.esc(order.id)}</button></td><td>${person.payment === "transfer" ? "Bank transfer" : "Cash on delivery"}</td><td>${U.money(order.totals && order.totals.total)}</td><td><select data-order-pay="${U.esc(order.id)}"><option value="unpaid"${order.paymentStatus === "paid" ? "" : " selected"}>Unpaid</option><option value="paid"${order.paymentStatus === "paid" ? " selected" : ""}>Paid</option></select></td><td>${ctx.collected(order) ? "Counted as a sale" : "Not a sale yet"}</td></tr>`;
      });
      return `${head("Payments", "Cash on delivery and bank transfer only. This demo does not call a payment provider. Marking an order paid records that the counter received the cash or the transfer. It does not by itself make the order a sale; the order also has to be delivered.")}${table(["Order", "Method", "Total", "Payment", "Revenue"], rows, "No orders yet.")}`;
    }

    function shippingPage() {
      const rows = Store.orders().map((order) => {
        const person = order.customer || {};
        const options = ["pending", "confirmed", "delivered", "cancelled"];
        return `<tr><td>${U.esc(order.id)}</td><td>${U.esc(person.city || "")}</td><td>${U.esc(person.address || "")}</td><td>${U.esc(person.phone || "")}</td><td>${order.totals && order.totals.shipping ? U.money(order.totals.shipping) : "Free"}</td><td><select data-order-status="${U.esc(order.id)}">${options.map((item) => `<option value="${item}"${ctx.statusOf(order) === item ? " selected" : ""}>${item}</option>`).join("")}</select></td></tr>`;
      });
      return `${head("Shipping and delivery", "Delivery is free over Rs 25,000. Otherwise it is Rs 490. An order is dispatched after the confirmation call, not when the customer places it.")}${table(["Order", "City", "Address", "Phone", "Fee", "Status"], rows, "No orders to deliver.")}`;
    }

    function returnsPage() {
      const rows = Store.customerReturns();
      const body = rows.length ? rows.map((row) => `<article class="panel stack"><p><strong>${U.esc(row.orderId)}</strong> · ${U.esc(row.userName)}</p><p>${U.esc(row.reason || "")}. ${U.esc(row.message || "")}</p><label class="field"><span>Status</span><select data-return="${U.esc(row.userId)}" data-return-id="${U.esc(row.id)}">${["Requested", "Accepted", "Declined"].map((item) => `<option${row.status === item ? " selected" : ""}>${U.esc(item)}</option>`).join("")}</select></label><p class="muted">A request is not an approval.</p></article>`).join("") : `<p class="lede">No return requests yet.</p>`;
      return `${head("Returns and refunds", "Customers send a request from their account. Accepting it here is the counter's decision. It does not move money by itself.")}${body}`;
    }

    function customersPage() {
      const rows = Store.customers().map((person) => `<tr><td>${U.esc(person.name)}</td><td>${U.esc(person.email)}</td><td>${U.esc(person.phone)}</td><td>${U.esc(person.kind)}</td><td>${U.esc(person.orders)}</td></tr>`);
      return `${head("Customers", "Account holders and guest checkouts. Passwords are not shown. A guest stays a guest until they register with the same email or phone.")}${table(["Name", "Email", "Phone", "Type", "Orders"], rows, "No customers yet.")}`;
    }

    function couponsPage() {
      const rows = Store.coupons().map((item) => `<tr><td>${U.esc(item.code)}</td><td>${U.esc(item.percent)}%</td><td>${U.esc(item.until)}</td><td>${item.active === false ? "Off" : "On"}</td><td><button class="btn btn-ghost btn-small" type="button" data-coupon="${U.esc(item.code)}" data-coupon-active="${item.active === false ? "yes" : "no"}">${item.active === false ? "Turn on" : "Turn off"}</button> <button class="btn btn-ghost btn-small" type="button" data-drop-coupon="${U.esc(item.code)}">Remove</button></td></tr>`);
      return `${head("Coupons and discounts", "One code per order, applied after the care-pair price. There is no countdown. A previous price is shown only when the product already has one.")}
        ${table(["Code", "Off", "Until", "Status", ""], rows, "No coupons saved.")}
        <form id="coupon-form" class="form-2 panel">${ctx.field("code", "Code", "")}${ctx.field("percent", "Percent off", "10", "number", 'min="1" max="90"')}${ctx.field("until", "Valid through", "", "date")}<div class="span-2"><button class="btn" type="submit">Add coupon</button></div></form>
        <p class="muted">The iPhone 15 care pair stays a separate offer. It is not edited from this list.</p>`;
    }

    function suppliersPage() {
      const rows = Store.suppliers().map((item) => `<tr><td>${U.esc(item.name)}</td><td>${U.esc(item.contact || "")}</td><td>${U.esc(item.note || "")}</td><td><button class="btn btn-ghost btn-small" type="button" data-drop-supplier="${U.esc(item.id)}">Remove</button></td></tr>`);
      return `${head("Suppliers", "A name and a way to reach them. Nothing is ordered until you write a purchase order.")}
        ${table(["Name", "Contact", "Note", ""], rows, "No suppliers yet.")}
        <form id="supplier-form" class="stack">${ctx.field("name", "Name", "")}${ctx.field("contact", "Phone or email", "")}${ctx.field("note", "Note", "", "textarea")}<button class="btn" type="submit">Add supplier</button></form>`;
    }

    function purchasesPage() {
      const suppliers = Store.suppliers();
      const products = Store.products().filter((item) => !item.archived);
      const productOptions = products.map((item) => `<option value="${U.esc(item.id)}">${U.esc(item.name)}</option>`).join("");
      const supplierOptions = suppliers.map((item) => `<option value="${U.esc(item.id)}">${U.esc(item.name)}</option>`).join("");
      const rows = Store.purchaseOrders().map((item) => {
        const supplier = suppliers.find((entry) => entry.id === item.supplierId);
        const lines = (item.lines || []).map((line) => U.esc((line.name || line.productId) + " × " + line.qty)).join("<br>");
        const action = item.status === "draft" ? `<button class="btn btn-ghost btn-small" type="button" data-po="${U.esc(item.id)}" data-po-status="ordered">Mark ordered</button>` : item.status === "ordered" ? `<button class="btn btn-small" type="button" data-po="${U.esc(item.id)}" data-po-status="received">Receive into stock</button>` : "Received";
        return `<tr><td>${U.esc(item.id)}</td><td>${U.esc(supplier ? supplier.name : "")}</td><td>${lines}</td><td>${U.esc(item.status)}</td><td>${action}</td></tr>`;
      });
      const form = suppliers.length ? `<form id="po-form" class="form-2 panel"><label class="field span-2"><span>Supplier</span><select name="supplierId">${supplierOptions}</select></label>
        <label class="field span-2"><span>Product</span><select name="productId">${productOptions}</select></label>
        ${ctx.field("qty", "Quantity", "1", "number", 'min="1"')}${ctx.field("cost", "Unit cost", "", "number", 'min="0"')}
        <div class="span-2"><button class="btn" type="submit">Save purchase order</button></div></form>` : `<p class="lede">Add a supplier before writing a purchase order.</p>`;
      return `${head("Purchase orders", "A received order adds the quantity to that product and writes a stock movement. It does not create a new product.")}${form}${table(["Order", "Supplier", "Lines", "Status", ""], rows, "No purchase orders yet.")}`;
    }

    function reportsPage() {
      const from = state.range.from;
      const to = state.range.to;
      const orders = Store.orders().filter((order) => ctx.inRange(order.placedAt, from, to));
      const sales = Store.orders().filter((order) => ctx.collected(order) && ctx.inRange(ctx.saleDate(order), from, to));
      const revenue = sales.reduce((sum, order) => sum + Number(order.totals && order.totals.total || 0), 0);
      let profit = 0;
      let missing = 0;
      sales.forEach((order) => (order.items || []).forEach((line) => {
        const product = Store.product(line.id);
        const unit = product ? ctx.recordedCost(product) : null;
        if (unit == null) { missing += 1; return; }
        profit += (Number(line.price) - unit) * Number(line.qty);
      }));
      const pending = orders.filter((order) => ctx.statusOf(order) === "pending" || ctx.statusOf(order) === "confirmed").length;
      return `${head("Reports and analytics", "Collected revenue is delivered and paid. Profit uses recorded costs only. Pending orders are counted apart from sales.")}
        <form class="filters" id="range-form"><label class="field"><span>From</span><input name="from" type="date" value="${U.esc(from)}"></label><label class="field"><span>To</span><input name="to" type="date" value="${U.esc(to)}"></label><div class="cluster"><button class="btn btn-ghost btn-small" type="button" data-range="today">Today</button><button class="btn btn-ghost btn-small" type="button" data-range="month">This month</button><button class="btn btn-ghost btn-small" type="button" data-range="all">All recorded</button></div></form>
        <div class="stats"><article class="stat"><span>Collected revenue</span><strong>${U.money(revenue)}</strong></article><article class="stat"><span>Estimated gross profit</span><strong>${U.money(profit)}</strong><p class="muted">${missing} lines had no cost.</p></article><article class="stat"><span>Orders placed</span><strong>${orders.length}</strong></article><article class="stat"><span>Pending in range</span><strong>${pending}</strong><p class="muted">Not sales.</p></article></div>`;
    }

    function reviewsPage() {
      const written = Store.customerReviews();
      const cards = Store.products().filter((item) => Number(item.reviews) > 0).map((item) => `<tr><td>${U.esc(item.name)}</td><td>${U.esc(item.rating || "")}</td><td>${U.esc(item.reviews)}</td></tr>`);
      const rows = written.map((item) => `<tr><td>${U.esc(item.productName)}</td><td>${U.esc(item.userName)}</td><td>${U.esc(item.rating)} / 5</td><td>${U.esc(item.text)}</td><td><select data-review="${U.esc(item.userId)}" data-review-id="${U.esc(item.id)}">${["Held", "Shown", "Hidden"].map((status) => `<option${item.status === status ? " selected" : ""}>${status}</option>`).join("")}</select></td></tr>`);
      return `${head("Reviews and ratings", "The figures on a product card are the listing's own rating. A written review appears on the shop only after it is set to Shown.")}
        <h2>Listing figures</h2>${table(["Product", "Rating", "Count"], cards, "No listing has a review count.")}
        <h2>Written reviews</h2>${table(["Product", "Customer", "Rating", "Text", "Shop"], rows, "No written reviews yet.")}`;
    }

    function homePage() {
      const settings = Store.settings();
      const rows = Store.products().filter((item) => !item.archived).map((item) => `<tr><td>${U.esc(item.name)}</td><td><input type="checkbox" data-home-flag="featured" data-id="${U.esc(item.id)}" ${item.featured ? "checked" : ""} aria-label="Featured ${U.esc(item.name)}"></td><td><input type="checkbox" data-home-flag="latest" data-id="${U.esc(item.id)}" ${item.latest ? "checked" : ""} aria-label="Latest ${U.esc(item.name)}"></td><td><input type="checkbox" data-home-flag="bestSeller" data-id="${U.esc(item.id)}" ${item.bestSeller ? "checked" : ""} aria-label="Best seller ${U.esc(item.name)}"></td></tr>`);
      return `${head("Homepage", "The announcement bar and which products are featured, latest, or a best seller. Placement on a product form still works.")}
        <form id="home-form" class="stack"><label class="field"><span>Announcement</span><input name="announcement" value="${U.esc(settings.announcement || "")}"></label><button class="btn" type="submit">Save announcement</button></form>
        ${table(["Product", "Featured", "Latest", "Best seller"], rows, "No products.")}`;
    }

    function usersPage() {
      const staff = Admin.staffList().map((person) => `<p>${U.esc(person.username)} · ${U.esc(person.role)}${person.totpOn ? " · two-factor on" : ""}</p>`).join("");
      return `${head("Admin users and permissions", "The owner can open Settings. Staff can run the counter, products, orders, and stock. Customer accounts are separate and are not listed here.")}
        ${staff || `<p class="muted">No extra sign-ins yet.</p>`}
        <form id="staff-form" class="form-2">${ctx.field("username", "Username", "")}${ctx.field("email", "Email", "", "email")}${ctx.field("role", "Role", "staff", "select", [["staff", "Staff"], ["owner", "Owner"]])}<label class="field"><span>Password</span><span class="pass-row"><input name="password" type="password" autocomplete="new-password"><button class="btn btn-ghost" type="button" data-show-password>Show</button></span></label><div class="span-2"><button class="btn" type="submit">Add sign-in</button></div></form>
        <p class="muted">Passwords are stored as a salted hash. Two-factor for your own sign-in is on Settings.</p>`;
    }

    function notificationsPage() {
      const hidden = new Set(Store.hiddenNotices());
      const items = [];
      Store.orders().forEach((order) => {
        if (ctx.statusOf(order) === "pending" || ctx.statusOf(order) === "confirmed") items.push({ id: "order-" + order.id, text: order.id + " is " + ctx.statusOf(order) + " and is not a sale yet." });
      });
      Store.products().filter(ctx.lowStock).forEach((item) => items.push({ id: "low-" + item.id, text: item.name + " has " + item.stock + " left." }));
      Store.customerReturns().filter((item) => item.status === "Requested").forEach((item) => items.push({ id: "return-" + item.id, text: "Return request for " + item.orderId + "." }));
      Store.notes().forEach((note) => items.push({ id: "note-" + note.at, text: "Message from " + (note.name || "a customer") + "." }));
      const visible = items.filter((item) => !hidden.has(item.id));
      const body = visible.length ? visible.map((item) => `<article class="split panel"><p>${U.esc(item.text)}</p><button class="btn btn-ghost btn-small" type="button" data-dismiss="${U.esc(item.id)}">Dismiss</button></article>`).join("") : `<p class="lede">Nothing waiting. Dismissed notes stay hidden on this device.</p>`;
      return `${head("Notifications", "These are counted from orders, stock, returns, and messages already on this device. This counter does not send email or push alerts.")}${body}`;
    }

    function auditPage() {
      const audits = Store.auditLog().map((row) => `<tr><td>${U.esc(new Date(row.at).toLocaleString("en-PK"))}</td><td>${U.esc(row.actor)}</td><td>${U.esc(row.action)}</td><td>${U.esc(row.detail)}</td></tr>`);
      const stock = Store.inventoryLog().map((row) => `<tr><td>${U.esc(new Date(row.at).toLocaleString("en-PK"))}</td><td>${U.esc(row.sku)}</td><td>${U.esc(row.change)}</td><td>${U.esc(row.reason)}</td></tr>`);
      return `${head("Audit log", "Actions from this counter. Older history is not invented.")}
        <h2>Counter actions</h2>${table(["When", "Who", "Action", "Detail"], audits, "No counter actions yet.")}
        <h2>Stock movements</h2>${table(["When", "SKU", "Change", "Reason"], stock, "No stock movements yet.")}`;
    }

    const pages = {
      categories: categoriesPage,
      brands: brandsPage,
      used: usedPage,
      inspect: inspectPage,
      stock: stockPage,
      order: orderPage,
      payments: paymentsPage,
      shipping: shippingPage,
      returns: returnsPage,
      customers: customersPage,
      coupons: couponsPage,
      suppliers: suppliersPage,
      purchases: purchasesPage,
      reports: reportsPage,
      reviews: reviewsPage,
      home: homePage,
      users: usersPage,
      notifications: notificationsPage,
      audit: auditPage,
    };

    function bind(root) {
      const cat = root.querySelector("#cat-form");
      if (cat) cat.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(cat));
        const labels = {};
        Object.entries(Store.baseCategories()).forEach(([id, name]) => {
          const next = String(data["label:" + id] || "").trim();
          if (next && next !== name) labels[id] = next;
        });
        const extras = (Store.settings().extraCategories || []).map((item) => {
          const next = String(data["label:" + item.id] || "").trim();
          return { id: item.id, name: next || item.name };
        });
        const added = String(data.newName || "").trim();
        if (added) {
          const id = added.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
          if (id.length < 2 || U.categories[id]) { ctx.toast("That category needs a distinct name."); return; }
          extras.push({ id: id, name: added });
        }
        Store.saveSettings({ categoryLabels: labels, extraCategories: extras });
        audit("Categories saved", added || "Names updated");
        ctx.toast("Categories saved");
        ctx.render();
      });
      root.querySelectorAll("[data-drop-cat]").forEach((button) => button.addEventListener("click", () => {
        const id = button.dataset.dropCat;
        const extras = (Store.settings().extraCategories || []).filter((item) => item.id !== id);
        Store.saveSettings({ extraCategories: extras });
        audit("Category removed", id);
        ctx.toast("Category removed");
        ctx.render();
      }));
      const brand = root.querySelector("#brand-form");
      if (brand) brand.addEventListener("submit", (event) => {
        event.preventDefault();
        const name = String(new FormData(brand).get("name") || "").trim();
        if (name.length < 2) { ctx.toast("Enter the brand name."); return; }
        const extras = (Store.settings().extraBrands || []).slice();
        if (!extras.includes(name)) extras.push(name);
        Store.saveSettings({ extraBrands: extras });
        audit("Brand added", name);
        ctx.toast("Brand added");
        ctx.render();
      });
      root.querySelectorAll("[data-drop-brand]").forEach((button) => button.addEventListener("click", () => {
        const name = button.dataset.dropBrand;
        Store.saveSettings({ extraBrands: (Store.settings().extraBrands || []).filter((item) => item !== name) });
        audit("Brand removed", name);
        ctx.toast("Brand removed");
        ctx.render();
      }));
      const pick = root.querySelector("#inspect-pick");
      if (pick) pick.addEventListener("change", () => { state.focus = pick.value; ctx.render(); });
      const inspect = root.querySelector("#inspect-form");
      if (inspect) inspect.addEventListener("submit", (event) => {
        event.preventDefault();
        const item = Store.product(state.focus);
        if (!item) return;
        const data = Object.fromEntries(new FormData(inspect));
        const battery = data.battery === "" ? null : Number(data.battery);
        Store.saveProduct(Object.assign({}, item, { battery: Number.isFinite(battery) ? battery : null, grade: data.grade || "", pta: data.pta, warranty: data.warranty, repair: data.repair || "", tests: data.tests || "", imei: data.imei || "" }));
        audit("Inspection saved", item.name);
        ctx.toast("Inspection saved");
        ctx.render();
      });
      const stock = root.querySelector("#stock-form");
      if (stock) stock.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(stock));
        const item = Store.product(data.id);
        const qty = Number(data.stock);
        if (!item || !Number.isFinite(qty) || qty < 0) { ctx.toast("Choose a product and a quantity."); return; }
        ctx.saveCopy(item, { stock: qty, change: "Stock " + item.stock + " to " + qty, reason: data.reason || "Stock adjustment" });
        audit("Stock adjusted", item.name);
        ctx.toast("Stock updated");
        ctx.render();
      });
      const coupon = root.querySelector("#coupon-form");
      if (coupon) coupon.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(coupon));
        const code = String(data.code || "").trim().toUpperCase();
        const percent = Number(data.percent);
        if (!/^[A-Z0-9]{3,16}$/.test(code)) { ctx.toast("Use 3 to 16 letters or numbers."); return; }
        if (!(percent >= 1 && percent <= 90) || !data.until) { ctx.toast("Enter a percent from 1 to 90 and an end date."); return; }
        const list = Store.coupons().filter((item) => String(item.code).toUpperCase() !== code);
        list.push({ code: code, percent: percent, until: data.until, active: true });
        Store.saveCoupons(list);
        audit("Coupon saved", code);
        ctx.toast("Coupon saved");
        ctx.render();
      });
      root.querySelectorAll("[data-coupon]").forEach((button) => button.addEventListener("click", () => {
        const code = button.dataset.coupon;
        const list = Store.coupons().map((item) => item.code === code ? Object.assign({}, item, { active: button.dataset.couponActive === "yes" }) : item);
        Store.saveCoupons(list);
        audit("Coupon updated", code);
        ctx.toast("Coupon updated");
        ctx.render();
      }));
      root.querySelectorAll("[data-drop-coupon]").forEach((button) => button.addEventListener("click", () => {
        const code = button.dataset.dropCoupon;
        if (!confirm("Remove " + code + "?")) return;
        Store.saveCoupons(Store.coupons().filter((item) => item.code !== code));
        audit("Coupon removed", code);
        ctx.toast("Coupon removed");
        ctx.render();
      }));
      const supplier = root.querySelector("#supplier-form");
      if (supplier) supplier.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(supplier));
        if (!data.name || data.name.trim().length < 2) { ctx.toast("Enter the supplier name."); return; }
        const item = { id: U.uid(data.name), name: data.name.trim(), contact: data.contact || "", note: data.note || "" };
        Store.saveSupplier(item);
        audit("Supplier added", item.name);
        ctx.toast("Supplier added");
        ctx.render();
      });
      root.querySelectorAll("[data-drop-supplier]").forEach((button) => button.addEventListener("click", () => {
        const id = button.dataset.dropSupplier;
        if (Store.purchaseOrders().some((item) => item.supplierId === id && item.status !== "received")) { ctx.toast("Finish the open purchase order first."); return; }
        const name = (Store.suppliers().find((item) => item.id === id) || {}).name || id;
        Store.removeSupplier(id);
        audit("Supplier removed", name);
        ctx.toast("Supplier removed");
        ctx.render();
      }));
      const po = root.querySelector("#po-form");
      if (po) po.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(po));
        const product = Store.product(data.productId);
        const qty = Number(data.qty);
        if (!product || !(qty > 0)) { ctx.toast("Choose a product and a quantity."); return; }
        const item = { id: purchaseId(), supplierId: data.supplierId, status: "draft", lines: [{ productId: product.id, name: product.name, qty: qty, cost: data.cost === "" ? null : Number(data.cost) }], at: new Date().toISOString() };
        Store.savePurchaseOrder(item);
        audit("Purchase order saved", item.id);
        ctx.toast("Purchase order saved");
        ctx.render();
      });
      root.querySelectorAll("[data-po]").forEach((button) => button.addEventListener("click", () => {
        const item = Store.purchaseOrders().find((entry) => entry.id === button.dataset.po);
        if (!item) return;
        if (button.dataset.poStatus === "ordered") {
          Store.savePurchaseOrder(Object.assign({}, item, { status: "ordered" }));
          audit("Purchase order marked ordered", item.id);
          ctx.toast("Marked ordered");
          ctx.render();
          return;
        }
        if (!confirm("Receive " + item.id + " into stock?")) return;
        (item.lines || []).forEach((line) => {
          const product = Store.product(line.productId);
          if (!product || product.tracking === "untracked") return;
          const before = Number(product.stock) || 0;
          const next = before + Number(line.qty || 0);
          ctx.saveCopy(product, { stock: next, change: "Stock " + before + " to " + next, reason: "Purchase order " + item.id });
        });
        Store.savePurchaseOrder(Object.assign({}, item, { status: "received" }));
        audit("Purchase order received", item.id);
        ctx.toast("Received into stock");
        ctx.render();
      }));
      const home = root.querySelector("#home-form");
      if (home) home.addEventListener("submit", (event) => {
        event.preventDefault();
        Store.saveSettings({ announcement: new FormData(home).get("announcement") || "" });
        audit("Announcement saved", "");
        ctx.toast("Announcement saved");
        ctx.render();
      });
      root.querySelectorAll("[data-home-flag]").forEach((box) => box.addEventListener("change", () => {
        const item = Store.product(box.dataset.id);
        if (!item) return;
        const patch = {};
        patch[box.dataset.homeFlag] = box.checked;
        Store.saveProduct(Object.assign({}, item, patch));
        audit("Homepage placement", item.name);
        ctx.toast("Placement saved");
        ctx.render();
      }));
      root.querySelectorAll("[data-review]").forEach((select) => select.addEventListener("change", () => {
        Store.updateReviewStatus(select.dataset.review, select.dataset.reviewId, select.value);
        audit("Review " + select.value, select.dataset.reviewId);
        ctx.toast("Review updated");
        ctx.render();
      }));
      root.querySelectorAll("[data-dismiss]").forEach((button) => button.addEventListener("click", () => {
        Store.hideNotice(button.dataset.dismiss);
        ctx.render();
      }));
    }

    return { groups: groups, pages: pages, bind: bind };
  }

  window.BonaDesk = { install: install };
})();
