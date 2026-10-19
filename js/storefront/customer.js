(function () {
  const U = window.BonaUtil;
  function url(internal) { return U.esc(window.BonaPaths.toPublic(internal)); }
  function visit(path) {
    window.BonaPaths.go(path);
    render(true);
  }
  const Auth = window.BonaAuth;
  const Store = window.BonaStore;
  const Cart = window.BonaCart;
  const ui = { errors: {}, notice: "", code: "", identifier: "", path: "" };
  let render = function () {};

  function esc(value) { return U.esc(value); }
  function httpLink(value) {
    const text = String(value || "").trim();
    return /^https?:\/\/[^\s<>"']+$/i.test(text) ? text : "";
  }
  function telLink(value) {
    const digits = String(value || "").replace(/[^\d+]/g, "");
    return digits ? "tel:" + digits : "";
  }
  function mailLink(value) {
    const text = String(value || "").trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? "mailto:" + text : "";
  }
  function crumb(label) {
    return `<nav class="crumb" aria-label="Breadcrumb"><a href="${url("/")}">Home</a><span>/</span><span>${esc(label)}</span></nav>`;
  }
  function err(name) {
    return ui.errors[name] ? `<small class="err">${esc(ui.errors[name])}</small>` : "";
  }
  function field(name, label, type, extra, value) {
    return `<label class="field"><span>${label}</span><input name="${name}" type="${type || "text"}" value="${esc(value || "")}" ${extra || ""}>${err(name)}</label>`;
  }
  function gate(title, lede) {
    return `<div class="wrap policy">${crumb(title)}<p class="eyebrow">Account</p><h1>${esc(title)}</h1><p class="lede">${lede}</p>${ui.notice ? `<p class="hint">${esc(ui.notice)}</p>` : ""}${ui.errors.form ? `<p class="err">${esc(ui.errors.form)}</p>` : ""}`;
  }

  function loginPage() {
    return `${gate("Sign in", "Use the email or phone on your account. Guest checkout stays available if you would rather not sign in.")}
      <form id="login-form" class="panel stack auth-card" novalidate>
        ${field("identifier", "Email or phone", "text", 'autocomplete="username" inputmode="email"')}
        ${field("password", "Password", "password", 'autocomplete="current-password"')}
        <button class="btn" type="submit">Sign in</button>
        <p class="muted">Five wrong passwords lock sign-in on this device for 15 minutes.</p>
        <div class="cluster"><a class="link" href="${url("/forgot")}">Forgot password</a><a class="link" href="${url("/register")}">Create an account</a></div>
        <button class="btn btn-ghost" type="button" disabled>Continue with Google</button>
        <p class="muted">Google sign-in is not connected on this counter.</p>
      </form></div>`;
  }

  function registerPage() {
    return `${gate("Create an account", "An account is optional. You can still check out as a guest. The password is stored as a salted hash on this device, not in plain text.")}
      <form id="register-form" class="panel stack auth-card" novalidate>
        ${field("name", "Name", "text", 'autocomplete="name"')}
        ${field("email", "Email", "email", 'autocomplete="email"')}
        ${field("phone", "Phone", "tel", 'autocomplete="tel" inputmode="tel"')}
        <p class="muted">Email or phone is enough. You can enter both.</p>
        ${field("password", "Password", "password", 'autocomplete="new-password"')}
        ${field("confirm", "Confirm password", "password", 'autocomplete="new-password"')}
        <label class="check"><input type="checkbox" name="consent" value="yes"> I agree to the <a class="link" href="${url("/policy/terms")}">terms</a> and <a class="link" href="${url("/policy/privacy")}">privacy policy</a>.</label>
        ${err("consent")}
        <button class="btn" type="submit">Create account</button>
        <a class="link" href="${url("/login")}">I already have an account</a>
      </form></div>`;
  }

  function forgotPage() {
    return `${gate("Reset your password", "Enter the email or phone on the account. This shop keeps accounts on this device, so a matching account shows a one-time code here. It is not saved in plain text, and it expires in 15 minutes.")}
      <form id="forgot-form" class="panel stack auth-card" novalidate>
        ${field("identifier", "Email or phone", "text", 'autocomplete="username"', ui.identifier)}
        <button class="btn" type="submit">Send reset code</button>
        <a class="link" href="${url("/login")}">Back to sign in</a>
      </form></div>`;
  }

  function resetPage() {
    const codeNote = ui.code ? `<p class="hint">Your reset code is <strong>${esc(ui.code)}</strong>. Enter it below. It will not be shown again.</p>` : `<p class="muted">Enter the code from the reset request, then choose a new password.</p>`;
    return `${gate("Choose a new password", "The code is checked against a hash. After five wrong codes, request a new one.")}
      <form id="reset-form" class="panel stack auth-card" novalidate>
        ${codeNote}
        ${field("identifier", "Email or phone", "text", 'autocomplete="username"', ui.identifier)}
        ${field("code", "Reset code", "text", 'inputmode="numeric" autocomplete="one-time-code"')}
        ${field("password", "New password", "password", 'autocomplete="new-password"')}
        ${field("confirm", "Confirm new password", "password", 'autocomplete="new-password"')}
        <button class="btn" type="submit">Save new password</button>
      </form></div>`;
  }

  function ordersFor(user) {
    return Store.orders().filter((order) => order && order.userId && order.userId === user.id);
  }

  function orderCard(order) {
    const when = new Date(order.placedAt).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
    const items = (order.items || []).map((item) => esc(item.name) + " × " + esc(item.qty)).join(", ");
    return `<article class="panel"><div class="split"><a href="${url("/account/orders/" + order.id)}"><strong>${esc(order.id)}</strong></a><span>${U.money(order.totals && order.totals.total)}</span></div><p class="muted">${esc(when)}</p><p>${items}</p><p class="meta">${esc(order.customer.city || "")} · ${esc(order.customer.payment || "cod") === "transfer" ? "Bank transfer" : "Cash on delivery"}</p></article>`;
  }

  function accountPage(extra) {
    extra = extra || {};
    const user = Auth.current();
    if (!user) {
      return `<div class="wrap policy">${crumb("My account")}<p class="eyebrow">Account</p><h1>My account</h1><p class="lede">Sign in to see your profile, orders, and saved details. You can still place an order as a guest.</p><div class="cluster"><a class="btn" href="${url("/login")}">Sign in</a><a class="btn btn-ghost" href="${url("/register")}">Create an account</a></div></div>`;
    }
    const orders = ordersFor(user);
    const jumps = [["profile", "Profile"], ["addresses", "Addresses"], ["orders", "Orders"], ["wishlist", "Wishlist"], ["reviews", "Reviews"], ["returns", "Returns"], ["security", "Security"], ["notifications", "Notifications"]];
    if (extra.orderId) {
      const order = orders.find((item) => item.id === extra.orderId);
      if (!order) return `<div class="wrap policy">${crumb("Orders")}<p class="eyebrow">404</p><h1>That order is not on this account.</h1><p class="lede">An account only lists orders placed while that account was signed in. A guest order can be tracked with its number and phone.</p><a class="btn" href="${url("/account/orders")}">Back to orders</a></div>`;
      return `<div class="wrap policy">${crumb("Orders")}<p class="eyebrow">Order</p><h1>Order</h1>${orderCard(order)}<a class="link" href="${url("/account/orders")}">All orders</a></div>`;
    }
    if (extra.section && !jumps.some(([id]) => id === extra.section)) {
      return `<div class="wrap policy">${crumb("My account")}<p class="eyebrow">404</p><h1>That account page is not listed.</h1><a class="btn" href="${url("/account")}">My account</a></div>`;
    }
    const wishes = Cart.wishIds().slice(0, 3).map((id) => Store.product(id)).filter((item) => Store.isListed(item));
    const purchased = [];
    orders.forEach((order) => (order.items || []).forEach((item) => {
      if (!purchased.some((entry) => entry.id === item.id)) purchased.push(item);
    }));
    const section = extra.section || "";
    return `<div class="wrap policy account-page">${crumb("My account")}<p class="eyebrow">Account</p><h1>My account</h1><p class="lede">Signed in as ${esc(user.name)}. This session ends when you log out or close the tab.</p>${ui.notice ? `<p class="hint">${esc(ui.notice)}</p>` : ""}${ui.errors.form ? `<p class="err">${esc(ui.errors.form)}</p>` : ""}
      <nav class="jump" aria-label="Account sections">${jumps.map(([id, label]) => `<a href="${url("/account/" + id)}"${section === id ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
      <section class="panel stack" id="account-profile"><h2>Profile</h2><form id="profile-form" class="stack">${field("name", "Name", "text", 'autocomplete="name"', user.name)}${field("email", "Email", "email", 'autocomplete="email"', user.email)}${field("phone", "Phone", "tel", 'autocomplete="tel"', user.phone)}<button class="btn" type="submit">Save profile</button></form></section>
      <section class="panel stack" id="account-addresses"><h2>Saved addresses</h2>${user.addresses.length ? user.addresses.map((item) => `<article class="split"><div><strong>${esc(item.label)}</strong><p>${esc(item.line)}, ${esc(item.city)}</p></div><button class="btn btn-ghost btn-small" type="button" data-auth="drop-address" data-id="${esc(item.id)}">Remove</button></article>`).join("") : `<p class="muted">No saved addresses yet.</p>`}<form id="address-form" class="stack"><div class="form-grid two">${field("label", "Label", "text", 'placeholder="Home"')}${field("city", "City", "text")}</div>${field("line", "Street address", "text")}${field("phone", "Phone for this address", "tel", "", user.phone)}<button class="btn" type="submit">Save address</button></form></section>
      <section class="stack" id="account-orders"><h2>Recent orders</h2><p><a class="link" href="${url("/track")}">Track with an order number</a></p>${orders.length ? orders.slice(0, 3).map(orderCard).join("") : `<p class="lede">No orders for this account yet. Guest orders appear here when the email or phone matches.</p>`}<h2>Order history</h2>${orders.length ? orders.map(orderCard).join("") : `<p class="muted">Your full history will list every matching order.</p>`}</section>
      <section class="panel stack" id="account-wishlist"><h2>Wishlist</h2>${wishes.length ? wishes.map((item) => `<a class="split" href="${url("/product/" + item.id)}"><span>${esc(item.name)}</span><strong>${U.money(item.price)}</strong></a>`).join("") : `<p class="muted">Nothing saved yet.</p>`}<a class="link" href="${url("/wishlist")}">Open wishlist</a></section>
      <section class="panel stack" id="account-reviews"><h2>Reviews</h2>${user.reviews.length ? user.reviews.map((item) => `<article><strong>${esc(item.productName)} · ${esc(item.rating)} / 5</strong><p>${esc(item.text)}</p></article>`).join("") : `<p class="muted">You have not written a review yet.</p>`}${purchased.length ? `<form id="review-form" class="stack"><label class="field"><span>Product from your orders</span><select name="productId">${purchased.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("")}</select></label><label class="field"><span>Rating</span><select name="rating"><option value="5">5</option><option value="4">4</option><option value="3">3</option><option value="2">2</option><option value="1">1</option></select></label><label class="field"><span>Review</span><textarea name="text"></textarea>${err("text")}</label><button class="btn" type="submit">Save review</button></form>` : `<p class="muted">A review can be left on a product after it is in one of your orders.</p>`}</section>
      <section class="panel stack" id="account-returns"><h2>Return and refund requests</h2><p class="lede">Sealed pieces can be requested within 7 days. A used phone is eligible when the fault was not on its card. Sending this form does not approve a refund. The counter confirms it.</p>${user.returns.length ? user.returns.map((item) => `<article><strong>${esc(item.orderId)} · ${esc(item.status)}</strong><p>${esc(item.reason)}. ${esc(item.message)}</p></article>`).join("") : `<p class="muted">No requests yet.</p>`}${orders.length ? `<form id="return-form" class="stack"><label class="field"><span>Order</span><select name="orderId">${orders.map((order) => `<option value="${esc(order.id)}">${esc(order.id)}</option>`).join("")}</select></label><label class="field"><span>Reason</span><select name="reason"><option>Wrong item</option><option>Damaged in transit</option><option>Fault not on the card</option><option>Unused accessory</option><option>Other</option></select></label><label class="field"><span>What happened</span><textarea name="message"></textarea>${err("message")}</label><button class="btn" type="submit">Request return or refund</button></form>` : ""}</section>
      <section class="panel stack" id="account-security"><h2>Password and security</h2><p class="muted">Passwords are salted and hashed. Five wrong tries lock changes for 15 minutes on this device.</p><form id="password-form" class="stack">${field("current", "Current password", "password", 'autocomplete="current-password"')}${field("next", "New password", "password", 'autocomplete="new-password"')}${field("confirm", "Confirm new password", "password", 'autocomplete="new-password"')}<button class="btn" type="submit">Update password</button></form></section>
      <section class="panel stack" id="account-notifications"><h2>Notification preferences</h2><form id="notify-form" class="stack"><label class="check"><input type="checkbox" name="orders" value="yes" ${user.notifications.orders ? "checked" : ""}> Order updates by phone</label><label class="check"><input type="checkbox" name="offers" value="yes" ${user.notifications.offers ? "checked" : ""}> Deal notes</label><button class="btn" type="submit">Save preferences</button></form><p class="muted">These choices are kept with the account. This page does not send email on its own.</p></section>
      <section class="panel stack" id="account-logout"><h2>Log out</h2><p class="lede">Logging out ends this session on the tab.</p><button class="btn btn-ghost" type="button" data-auth="logout">Log out</button></section>
      <section class="panel stack" id="account-delete"><h2>Delete account</h2><p class="lede">This removes the login, saved addresses, reviews, and return requests from this device. Orders already placed stay on the counter so a delivery can be finished.</p><form id="delete-form" class="stack">${field("password", "Password", "password", 'autocomplete="current-password"')}<label class="check"><input type="checkbox" name="confirm" value="yes"> Delete this account from this device.</label>${err("confirm")}<button class="btn" type="submit">Request deletion</button></form></section>
    </div>`;
  }

  function finish(result, nextHash, notice) {
    const apply = (value) => {
      ui.errors = {};
      if (!value || !value.ok) {
        ui.errors.form = value && value.error ? value.error : "That could not be saved.";
        ui.notice = "";
        render(false);
        return;
      }
      ui.notice = notice || "";
      ui.code = "";
      if (nextHash) visit(nextHash);
      else render(false);
    };
    if (result && typeof result.then === "function") result.then(apply);
    else apply(result);
  }

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (form.id === "login-form") {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      Auth.login(data).then((result) => {
        const back = sessionStorage.getItem("bona-return") || "";
        sessionStorage.removeItem("bona-return");
        finish(result, back.indexOf("/account") === 0 ? back : "/account", "");
      });
    }
    if (form.id === "register-form") {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      data.consent = form.consent.checked ? "yes" : "";
      Auth.register(data).then((result) => finish(result, "/account", "Account created."));
    }
    if (form.id === "forgot-form") {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      ui.identifier = data.identifier || "";
      Auth.requestReset(data.identifier).then((result) => {
        ui.errors = {};
        if (!result.ok) { ui.errors.form = result.error; ui.notice = ""; render(false); return; }
        ui.code = result.code || "";
        ui.notice = result.neutral ? "If that account is on this device, the next step will accept its code." : "";
        visit("/reset");
      });
    }
    if (form.id === "reset-form") {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      ui.identifier = data.identifier || ui.identifier;
      Auth.completeReset(data).then((result) => {
        if (!result.ok) { ui.errors = { form: result.error }; render(false); return; }
        ui.code = "";
        ui.errors = {};
        ui.notice = "The password is updated. Sign in with the new one.";
        visit("/login");
      });
    }
    if (form.id === "profile-form") {
      event.preventDefault();
      finish(Auth.updateProfile(Object.fromEntries(new FormData(form))), "", "Profile saved.");
    }
    if (form.id === "address-form") {
      event.preventDefault();
      const result = Auth.saveAddress(Object.fromEntries(new FormData(form)));
      finish(result, "", "Address saved.");
    }
    if (form.id === "password-form") {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      Auth.changePassword(data).then((result) => finish(result, "", "Password updated."));
    }
    if (form.id === "notify-form") {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      finish(Auth.saveNotifications({ orders: data.orders || "", offers: data.offers || "" }), "", "Preferences saved.");
    }
    if (form.id === "review-form") {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const option = form.productId.selectedOptions[0];
      data.productName = option ? option.textContent : "";
      const result = Auth.addReview(data);
      if (!result.ok) ui.errors = { form: result.error, text: result.error };
      finish(result, "", "Review saved on this account.");
    }
    if (form.id === "return-form") {
      event.preventDefault();
      const result = Auth.addReturn(Object.fromEntries(new FormData(form)));
      if (!result.ok) ui.errors = { form: result.error, message: result.error };
      finish(result, "", "Request recorded. The counter still has to confirm it.");
    }
    if (form.id === "delete-form") {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      data.confirm = form.confirm.checked ? "yes" : "";
      Auth.deleteAccount(data).then((result) => {
        if (!result.ok) { ui.errors = { form: result.error, confirm: result.error }; render(false); return; }
        ui.notice = "The account has been deleted from this device.";
        visit("/login");
      });
    }
  });

  document.addEventListener("click", (event) => {
    const jump = event.target.closest("[data-jump]");
    if (jump) {
      const section = document.getElementById("account-" + jump.dataset.jump);
      if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const button = event.target.closest("[data-auth]");
    if (!button) return;
    if (button.dataset.auth === "logout") {
      Auth.logout();
      ui.notice = "You are logged out.";
      visit("/login");
    }
    if (button.dataset.auth === "drop-address") {
      finish(Auth.removeAddress(button.dataset.id), "", "Address removed.");
    }
  });

  function aboutPage() {
    const shop = Store.settings();
    const place = [shop.address, shop.city].filter(Boolean).join(", ");
    return `<div class="wrap policy">${crumb("About us")}<p class="eyebrow">The shop</p><h1>About us</h1>
      <p class="lede">${esc(shop.name)} sells the phones and accessories that are in stock now: new handsets, used and refurbished units, and the cases, chargers, and audio that fit them.</p>
      <h2>What we sell</h2>
      <p>New phones are listed as factory sealed only when the box is sealed. An opened box is marked open box. Used and refurbished phones are single units, each with its own storage, colour, PTA status, battery health, grade, and repair note when we know it.</p>
      <h2>How a phone is checked</h2>
      <p>A used listing is the unit you would buy, not a general model price. The card states the condition, the battery reading we recorded, and whether it is PTA approved. A photo on a used phone is a stand-in until a picture of that unit is attached. We do not describe an opened box as sealed.</p>
      <h2>Warranty and service</h2>
      <p>Cover is whatever is written on the product: manufacturer, seller, or none. No warranty is said before you add the phone. Orders are confirmed by phone before a rider is booked. Guest checkout does not require an account.</p>
      ${place ? `<h2>Where we are</h2><p>${esc(place)}.${shop.hours ? " Hours: " + esc(shop.hours) + "." : ""}</p>` : `<h2>Where we are</h2><p>A street address and opening hours appear here when they are saved in the shop settings. We do not invent a history or a ranking for the counter.</p>`}
    </div>`;
  }

  function contactPage(extra) {
    const shop = Store.settings();
    const wa = U.waLink(shop.whatsapp);
    const draft = extra.draft || {};
    const errors = extra.errors || {};
    const show = (label, value, href) => value ? `<p><strong>${label}</strong><br>${href ? `<a class="link" href="${esc(href)}"${href.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${esc(value)}</a>` : esc(value)}</p>` : "";
    if (extra.contactSent) {
      return `<div class="wrap policy">${crumb("Contact us")}<p class="eyebrow">${esc(shop.name)}</p><h1>Note received</h1><p class="lede">Thank you. The counter will reply on the email or phone you left.</p><a class="btn" href="${url("/products")}">Back to the shop</a></div>`;
    }
    const error = (name) => errors[name] ? `<small class="err">${esc(errors[name])}</small>` : "";
    return `<div class="wrap policy">${crumb("Contact us")}<p class="eyebrow">${esc(shop.name)}</p><h1>Contact us</h1>
      <div class="contact-grid">
        <div class="panel stack">
          <h2>The counter</h2>
          ${[shop.phone, shop.whatsapp, shop.email, shop.address, shop.city, shop.hours, shop.map, shop.instagram, shop.facebook].some(Boolean) ? "" : `<p class="muted">Phone, WhatsApp, email, address, hours, a map, and social links appear here when they are saved in the shop settings.</p>`}
          ${show("Phone", shop.phone, telLink(shop.phone))}
          ${show("WhatsApp", shop.whatsapp, wa)}
          ${show("Email", shop.email, mailLink(shop.email))}
          ${show("Address", [shop.address, shop.city].filter(Boolean).join(", "))}
          ${httpLink(shop.map) ? `<p><a class="link" href="${esc(httpLink(shop.map))}" target="_blank" rel="noopener">Open in Google Maps</a></p>` : ""}
          ${show("Hours", shop.hours)}
          ${show("Instagram", shop.instagram, httpLink(shop.instagram))}
          ${show("Facebook", shop.facebook, httpLink(shop.facebook))}
          <h2>Customer support</h2>
          <p>Ask about a unit, PTA status, battery health, or whether an accessory fits. We confirm orders by phone. Card numbers are not taken on this page. Returns and warranty follow the written policies.</p>
        </div>
        <form id="contact-form" class="panel stack" novalidate>
          <h2>Write to us</h2>
          <label class="field"><span>Name</span><input name="name" value="${esc(draft.name || "")}" autocomplete="name">${error("name")}</label>
          <label class="field"><span>Email or phone</span><input name="contact" value="${esc(draft.contact || "")}" autocomplete="email">${error("contact")}</label>
          <label class="field"><span>Subject</span><select name="subject"><option value="">Choose a subject</option>${["Order", "Used phone", "PTA or battery", "Accessory fit", "Return or warranty", "Something else"].map((item) => `<option${draft.subject === item ? " selected" : ""}>${esc(item)}</option>`).join("")}</select>${error("subject")}</label>
          <label class="field"><span>Message</span><textarea name="message">${esc(draft.message || "")}</textarea>${error("message")}</label>
          <button class="btn" type="submit">Send message</button>
        </form>
      </div>
    </div>`;
  }

  function faqPage() {
    const groups = [
      ["Orders and checkout", [
        ["Do I need an account?", "No. Guest checkout is available. An account saves your details, orders, and wishlist on this device."],
        ["When is an order confirmed?", "Placing an order asks the counter to call you. It is dispatched after that call."],
      ]],
      ["Delivery", [
        ["What does delivery cost?", "Rs 490 under Rs 25,000 after discounts. Orders at Rs 25,000 or more ship free inside Pakistan."],
        ["When does it leave?", "We call before a rider is booked. Same-city orders confirmed before 4pm are usually booked the same day."],
      ]],
      ["Payments", [
        ["How can I pay?", "Cash on delivery, or bank transfer after we confirm by phone. Card numbers are not collected here."],
        ["Does a code change the price?", "BONA10 takes 10% off the merchandise total through 31 December 2026. It applies after the iPhone 15 care-pair price, and it does not invent a second discount on a price that has no previous price."],
      ]],
      ["Used phone condition", [
        ["What am I buying?", "One handset. Grade, storage, colour, battery health, PTA status, and any known repair are for that unit."],
        ["Are the photos the unit?", "Treat a used-phone photo as a stand-in until the listing says a picture of that unit is attached."],
      ]],
      ["PTA status", [
        ["What does PTA Approved mean here?", "It is the status recorded for that unit. It is not a promise that PTA will approve a different phone later."],
        ["What is Non-PTA?", "The phone is not PTA approved. Those listings say Non-PTA on the card."],
      ]],
      ["Battery health", [
        ["Where is the battery figure?", "On used and refurbished phones that have a reading. It is the figure recorded for that unit."],
      ]],
      ["Warranty", [
        ["What cover do I get?", "Only the cover written on the product: manufacturer, seller, or none. No warranty is stated on purpose."],
      ]],
      ["Returns and refunds", [
        ["What can be returned?", "Sealed new phones and unused accessories within 7 days if the piece is wrong, damaged in transit, or faulty and still unused. A used phone is eligible when the fault was not on its card."],
        ["How is a refund paid?", "Cash for a cash-on-delivery order once the piece is back, or a transfer to the account that paid. We cannot refund a card because cards are not taken."],
      ]],
      ["Accessories compatibility", [
        ["How do I match a case or cable?", "On Accessories, use Fits phone and choose the model, such as iPhone 15 or Galaxy A55."],
      ]],
      ["Order cancellation", [
        ["Can I cancel?", "Yes, before the confirmation call dispatches the rider. Contact the counter with the order number. A used unit is released back to stock if it has not left."],
      ]],
      ["Customer support", [
        ["How do I reach you?", "Use Contact us, WhatsApp when a number is listed, or the phone on that page. Leave a number we can call."],
      ]],
    ];
    return `<div class="wrap policy">${crumb("FAQs")}<p class="eyebrow">Help</p><h1>FAQs</h1><p class="lede">Answers follow the shipping, return, warranty, and checkout rules used on this shop.</p>${groups.map(([title, items]) => `<section class="stack"><h2>${esc(title)}</h2>${items.map(([q, a]) => `<details><summary>${esc(q)}</summary><p class="lede" style="margin-top:8px">${esc(a)}</p></details>`).join("")}</section>`).join("")}</div>`;
  }

  function policyPage(key) {
    const pages = {
      shipping: ["Shipping and delivery policy", `
        <h2>Cost</h2><p>Delivery inside Pakistan is Rs 490 when the merchandise total, after any valid offer, is under Rs 25,000. At Rs 25,000 or more, delivery is free.</p>
        <h2>When it leaves</h2><p>We call before a rider is booked. If that call confirms the order before 4pm, a same-city parcel is usually booked the same day. Other cities leave on the next dispatch the counter can make. An order is not dispatched if we cannot reach you.</p>
        <h2>Your part</h2><p>Give a name, a phone that answers, a city, and a street address. Meet the rider or arrange someone who can. Check the unit against the listing when it arrives, including PTA status and battery health on a used phone.</p>
        <h2>What we do not promise</h2><p>We do not promise a same-hour delivery, coverage outside Pakistan, or a dispatch before the confirmation call.</p>`],
      returns: ["Return and refund policy", `
        <h2>Eligibility</h2><p>Sealed new phones and unused accessories can be returned within 7 days of delivery if the item is wrong, arrives damaged, or has a fault, and the seal or unused condition is intact. A used or refurbished phone can be returned when it has a fault that was not written on its card.</p>
        <h2>Deadline</h2><p>Ask within 7 days of delivery. Contact the counter before you send anything back. A request in your account is a request, not an approval.</p>
        <h2>Exclusions</h2><p>Change-of-mind returns on used or refurbished units are not accepted. Damage after handover, a missing part that was disclosed, and glass that was fitted at your request are excluded unless the glass itself is faulty. An opened sealed box is no longer a sealed return.</p>
        <h2>Refund method</h2><p>Cash-on-delivery orders are refunded in cash once the piece is back and checked. Bank transfers are returned to the account that paid. Card refunds are not available because card numbers are not taken.</p>
        <h2>Your part</h2><p>Keep the packaging for a sealed return, describe the fault, and do not wipe a listing of its stated grade or repair history. You cover a return rider if the piece matches the card and the return is not for our error.</p>`],
      warranty: ["Warranty policy", `
        <h2>What is covered</h2><p>Only the warranty written on that product. Manufacturer warranty follows the brand and needs the card in the box. Seller warranty covers faults for the period written on the listing, not cracks, liquid, or damage after you receive it. No warranty means there is no cover, and the listing says so.</p>
        <h2>Deadline</h2><p>The period is the one on the product page. We do not extend it at the counter after the sale.</p>
        <h2>Exclusions</h2><p>PTA status is not a warranty. Battery health on a used phone is a recorded reading, not a promise it will stay at that figure. Physical grade describes the unit at sale.</p>
        <h2>How a claim works</h2><p>Contact us with the order number and the fault. If the seller warranty applies, we repair, replace, or refund that unit. Manufacturer claims go through the brand's process. Refunds use the same method as the return policy.</p>`],
      privacy: ["Privacy policy", `
        <h2>What is stored</h2><p>On this device: your account name, email, phone, saved addresses, cart, wishlist, orders, messages, reviews, and return requests. Passwords are stored only as a salted hash. We do not store the password itself.</p>
        <h2>How it is used</h2><p>The phone number is used to confirm and deliver an order. Notification choices stay on the account. This page does not send them to an outside mail service.</p>
        <h2>What we do not collect</h2><p>Card numbers are not asked for. Google sign-in is not connected, so Google does not receive a login from this page.</p>
        <h2>How long it stays</h2><p>It stays in this browser until you clear the site data or delete the account. Deleting an account removes the login, addresses, reviews, and return requests. Orders already placed remain so a delivery can be completed.</p>
        <h2>Your part</h2><p>Do not share the device session if other people should not see the orders. Log out on a shared computer. This shop does not claim a separate hosted database.</p>`],
      terms: ["Terms and conditions", `
        <h2>Prices</h2><p>The price is the inventory price when you place the order. A crossed-out price appears only when that listing has a higher previous price. Offers end on the date written on the deals page. There is no countdown clock.</p>
        <h2>Used phones</h2><p>A used or refurbished listing is one unit. You are responsible for reading its grade, PTA status, battery health, and repair note before you order.</p>
        <h2>Orders</h2><p>Checkout, including guest checkout, asks the counter to confirm the order by phone. It is a request until that call. If a unit sells out before confirmation, we say so and do not pretend it can still be bought.</p>
        <h2>Accounts</h2><p>Accounts are optional. You agree to the terms and privacy policy when you create one. You are responsible for the password and for the address you give.</p>
        <h2>Offers</h2><p>BONA10 is 10% off merchandise through 31 December 2026, after any care-pair price in the cart. It cannot be used twice on one order. A pair price applies once, to one of each included item.</p>`],
    };
    const page = pages[key];
    if (!page) return `<div class="wrap policy">${crumb("Policy")}<h1>That policy is not listed.</h1></div>`;
    return `<div class="wrap policy">${crumb(page[0])}<p class="eyebrow">Policy</p><h1>${esc(page[0])}</h1>${page[1]}</div>`;
  }

  window.BonaCustomer = {
    bind(fn) { render = fn; },
    html(path, extras) {
      if (path !== ui.path) {
        if (!(ui.path === "/forgot" && path === "/reset")) ui.errors = {};
        if (path !== "/reset") ui.code = "";
        ui.path = path;
      }
      const extra = extras || {};
      let page = "";
      if (path === "/login") page = loginPage();
      else if (path === "/register") page = registerPage();
      else if (path === "/forgot") page = forgotPage();
      else if (path === "/reset") page = resetPage();
      else if (path === "/account") page = accountPage(extra);
      else if (path === "/about") page = aboutPage();
      else if (path === "/contact") page = contactPage(extra);
      else if (path === "/faq") page = faqPage();
      else if (path.indexOf("/policy/") === 0) page = policyPage(path.split("/")[2]);
      ui.notice = "";
      return page;
    },
  };
})();
