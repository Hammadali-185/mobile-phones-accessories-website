(function () {
  const USERS_KEY = "bona-users";
  const LIMIT_KEY = "bona-auth-limit";
  const RESET_KEY = "bona-auth-reset";
  const SESSION_KEY = "bona-customer";
  const ITERATIONS = 120000;
  const LOCK_MS = 15 * 60 * 1000;
  const RESET_MS = 15 * 60 * 1000;
  const MAX_FAILS = 5;

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function users() {
    const list = read(USERS_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function saveUsers(list) {
    write(USERS_KEY, list);
  }

  function bytesToB64(bytes) {
    let text = "";
    bytes.forEach((value) => { text += String.fromCharCode(value); });
    return btoa(text);
  }

  function b64ToBytes(value) {
    const text = atob(value);
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
    return bytes;
  }

  function same(left, right) {
    const a = String(left);
    const b = String(right);
    const length = Math.max(a.length, b.length);
    let diff = a.length === b.length ? 0 : 1;
    for (let i = 0; i < length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  async function hashSecret(secret, saltB64, iterations) {
    const rounds = iterations || ITERATIONS;
    const salt = saltB64 ? b64ToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: rounds, hash: "SHA-256" }, key, 256);
    return { hash: bytesToB64(new Uint8Array(bits)), salt: bytesToB64(salt), iterations: rounds };
  }

  function publicUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email || "",
      phone: user.phone || "",
      addresses: Array.isArray(user.addresses) ? user.addresses : [],
      notifications: Object.assign({ orders: true, offers: false }, user.notifications),
      reviews: Array.isArray(user.reviews) ? user.reviews : [],
      returns: Array.isArray(user.returns) ? user.returns : [],
      createdAt: user.createdAt,
    };
  }

  function current() {
    const id = sessionStorage.getItem(SESSION_KEY);
    if (!id) return null;
    return publicUser(users().find((user) => user.id === id));
  }

  function emailKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function phoneKey(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function identifierKey(value) {
    const text = String(value || "").trim();
    return text.includes("@") ? emailKey(text) : phoneKey(text);
  }

  function findByIdentifier(value) {
    const key = identifierKey(value);
    if (!key) return null;
    return users().find((user) => emailKey(user.email) === key || phoneKey(user.phone) === key) || null;
  }

  function limits() {
    const saved = read(LIMIT_KEY, {});
    return { login: saved.login || {}, reset: saved.reset || {}, code: saved.code || {} };
  }

  function lockLeft(bucket, key) {
    const slot = limits()[bucket][key];
    if (!slot || !(slot.until > Date.now())) return 0;
    return slot.until - Date.now();
  }

  function noteFail(bucket, key) {
    const all = limits();
    const slot = all[bucket][key] || { fails: 0, until: 0 };
    if (slot.until > Date.now()) return slot.until - Date.now();
    slot.fails += 1;
    if (slot.fails >= MAX_FAILS) {
      slot.until = Date.now() + LOCK_MS;
      slot.fails = 0;
    }
    all[bucket][key] = slot;
    write(LIMIT_KEY, all);
    return slot.until > Date.now() ? slot.until - Date.now() : 0;
  }

  function clearFail(bucket, key) {
    const all = limits();
    delete all[bucket][key];
    write(LIMIT_KEY, all);
  }

  function waitText(ms) {
    const minutes = Math.max(1, Math.ceil(ms / 60000));
    return "Too many attempts. Try again in " + minutes + " minute" + (minutes === 1 ? "" : "s") + ".";
  }

  function validPassword(password) {
    return String(password || "").length >= 8;
  }

  function randomCode() {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return String(100000 + (bytes[0] % 900000));
  }

  async function register(input) {
    const name = String(input.name || "").trim();
    const email = emailKey(input.email);
    const phone = phoneKey(input.phone);
    const password = String(input.password || "");
    const confirm = String(input.confirm || "");
    if (name.length < 2) return { ok: false, error: "Enter the name for this account." };
    if (!email && phone.length < 10) return { ok: false, error: "Enter an email or a phone number." };
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email." };
    if (phone && phone.length < 10) return { ok: false, error: "Enter a phone number with at least 10 digits." };
    if (!validPassword(password)) return { ok: false, error: "Use a password of at least 8 characters." };
    if (password !== confirm) return { ok: false, error: "The passwords do not match." };
    if (input.consent !== "yes" && input.consent !== true) return { ok: false, error: "Accept the terms and privacy policy to create an account." };
    const list = users();
    if (email && list.some((user) => emailKey(user.email) === email)) return { ok: false, error: "An account already uses that email." };
    if (phone && list.some((user) => phoneKey(user.phone) === phone)) return { ok: false, error: "An account already uses that phone number." };
    const secret = await hashSecret(password);
    const user = {
      id: crypto.randomUUID ? crypto.randomUUID() : "user-" + Date.now(),
      name,
      email,
      phone,
      passwordHash: secret.hash,
      salt: secret.salt,
      iterations: secret.iterations,
      addresses: [],
      notifications: { orders: true, offers: false },
      reviews: [],
      returns: [],
      createdAt: new Date().toISOString(),
    };
    list.push(user);
    saveUsers(list);
    sessionStorage.setItem(SESSION_KEY, user.id);
    return { ok: true, user: publicUser(user) };
  }

  async function login(input) {
    const key = identifierKey(input.identifier);
    if (!key || !input.password) return { ok: false, error: "Enter the email or phone and the password." };
    const wait = lockLeft("login", key);
    if (wait) return { ok: false, error: waitText(wait) };
    const user = findByIdentifier(key);
    const secret = user ? await hashSecret(input.password, user.salt, user.iterations) : await hashSecret(input.password);
    const match = user && same(secret.hash, user.passwordHash);
    if (!match) {
      const locked = noteFail("login", key);
      return { ok: false, error: locked ? waitText(locked) : "That email, phone, or password does not match." };
    }
    clearFail("login", key);
    sessionStorage.setItem(SESSION_KEY, user.id);
    return { ok: true, user: publicUser(user) };
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function updateCurrent(mutator) {
    const id = sessionStorage.getItem(SESSION_KEY);
    const list = users();
    const index = list.findIndex((user) => user.id === id);
    if (index < 0) return { ok: false, error: "Sign in again to change this account." };
    const next = mutator(list[index]);
    if (next && next.ok === false) return next;
    list[index] = next || list[index];
    saveUsers(list);
    return { ok: true, user: publicUser(list[index]) };
  }

  async function updateProfile(input) {
    const email = emailKey(input.email);
    const phone = phoneKey(input.phone);
    const name = String(input.name || "").trim();
    if (name.length < 2) return { ok: false, error: "Enter your name." };
    if (!email && phone.length < 10) return { ok: false, error: "Keep an email or a phone number on the account." };
    const id = sessionStorage.getItem(SESSION_KEY);
    const list = users();
    if (email && list.some((user) => user.id !== id && emailKey(user.email) === email)) return { ok: false, error: "Another account uses that email." };
    if (phone && list.some((user) => user.id !== id && phoneKey(user.phone) === phone)) return { ok: false, error: "Another account uses that phone number." };
    return updateCurrent((user) => Object.assign({}, user, { name, email, phone }));
  }

  function saveAddress(input) {
    const line = String(input.line || "").trim();
    const city = String(input.city || "").trim();
    if (city.length < 2 || line.length < 8) return { ok: false, error: "Enter a city and a street address." };
    return updateCurrent((user) => {
      const addresses = (user.addresses || []).slice();
      const address = {
        id: input.id || (crypto.randomUUID ? crypto.randomUUID() : "addr-" + Date.now()),
        label: String(input.label || "Home").trim() || "Home",
        line,
        city,
        phone: phoneKey(input.phone) || user.phone,
      };
      const index = addresses.findIndex((item) => item.id === address.id);
      if (index >= 0) addresses[index] = address;
      else addresses.push(address);
      return Object.assign({}, user, { addresses });
    });
  }

  function removeAddress(id) {
    return updateCurrent((user) => Object.assign({}, user, {
      addresses: (user.addresses || []).filter((item) => item.id !== id),
    }));
  }

  function saveNotifications(input) {
    return updateCurrent((user) => Object.assign({}, user, {
      notifications: { orders: input.orders === "yes" || input.orders === true, offers: input.offers === "yes" || input.offers === true },
    }));
  }

  function addReview(input) {
    const rating = Number(input.rating);
    const text = String(input.text || "").trim();
    if (!input.productId) return { ok: false, error: "Choose a product from one of your orders." };
    if (!(rating >= 1 && rating <= 5)) return { ok: false, error: "Choose a rating from 1 to 5." };
    if (text.length < 8) return { ok: false, error: "Write a short review." };
    return updateCurrent((user) => Object.assign({}, user, {
      reviews: [{ id: "rev-" + Date.now(), productId: input.productId, productName: input.productName || "", rating, text, at: new Date().toISOString() }].concat(user.reviews || []),
    }));
  }

  function addReturn(input) {
    const message = String(input.message || "").trim();
    if (!input.orderId) return { ok: false, error: "Choose an order." };
    if (message.length < 8) return { ok: false, error: "Describe the return or refund." };
    return updateCurrent((user) => Object.assign({}, user, {
      returns: [{
        id: "ret-" + Date.now(),
        orderId: input.orderId,
        reason: input.reason || "Other",
        message,
        status: "Requested",
        at: new Date().toISOString(),
      }].concat(user.returns || []),
    }));
  }

  async function changePassword(input) {
    const user = users().find((item) => item.id === sessionStorage.getItem(SESSION_KEY));
    if (!user) return { ok: false, error: "Sign in again to change the password." };
    const wait = lockLeft("login", user.id);
    if (wait) return { ok: false, error: waitText(wait) };
    const current = await hashSecret(input.current || "", user.salt, user.iterations);
    if (!same(current.hash, user.passwordHash)) {
      const locked = noteFail("login", user.id);
      return { ok: false, error: locked ? waitText(locked) : "The current password does not match." };
    }
    if (!validPassword(input.next)) return { ok: false, error: "Use a new password of at least 8 characters." };
    if (input.next !== input.confirm) return { ok: false, error: "The new passwords do not match." };
    const secret = await hashSecret(input.next);
    clearFail("login", user.id);
    return updateCurrent((record) => Object.assign({}, record, {
      passwordHash: secret.hash,
      salt: secret.salt,
      iterations: secret.iterations,
    }));
  }

  async function requestReset(identifier) {
    const key = identifierKey(identifier);
    if (!key) return { ok: false, error: "Enter the email or phone on the account." };
    const wait = lockLeft("reset", key);
    if (wait) return { ok: false, error: waitText(wait) };
    const locked = noteFail("reset", key);
    if (locked) return { ok: false, error: waitText(locked) };
    const user = findByIdentifier(key);
    if (!user) return { ok: true, neutral: true };
    const code = randomCode();
    const secret = await hashSecret(code);
    const all = read(RESET_KEY, {});
    all[key] = { userId: user.id, hash: secret.hash, salt: secret.salt, iterations: secret.iterations, expires: Date.now() + RESET_MS, attempts: 0 };
    write(RESET_KEY, all);
    return { ok: true, code };
  }

  async function completeReset(input) {
    const key = identifierKey(input.identifier);
    const all = read(RESET_KEY, {});
    const pending = all[key];
    if (!pending || pending.expires < Date.now()) return { ok: false, error: "Request a new reset code." };
    if (pending.attempts >= MAX_FAILS) return { ok: false, error: "That code was tried too many times. Request a new one." };
    const secret = await hashSecret(String(input.code || "").trim(), pending.salt, pending.iterations);
    if (!same(secret.hash, pending.hash)) {
      pending.attempts += 1;
      all[key] = pending;
      write(RESET_KEY, all);
      return { ok: false, error: "That code does not match." };
    }
    if (!validPassword(input.password)) return { ok: false, error: "Use a password of at least 8 characters." };
    if (input.password !== input.confirm) return { ok: false, error: "The passwords do not match." };
    const next = await hashSecret(input.password);
    const list = users();
    const index = list.findIndex((user) => user.id === pending.userId);
    if (index < 0) return { ok: false, error: "That account is no longer on this device." };
    list[index] = Object.assign({}, list[index], { passwordHash: next.hash, salt: next.salt, iterations: next.iterations });
    saveUsers(list);
    delete all[key];
    write(RESET_KEY, all);
    clearFail("login", key);
    return { ok: true };
  }

  async function deleteAccount(input) {
    const id = sessionStorage.getItem(SESSION_KEY);
    const list = users();
    const user = list.find((item) => item.id === id);
    if (!user) return { ok: false, error: "Sign in again to delete this account." };
    if (input.confirm !== "yes") return { ok: false, error: "Confirm that you want the account deleted." };
    const secret = await hashSecret(input.password || "", user.salt, user.iterations);
    if (!same(secret.hash, user.passwordHash)) return { ok: false, error: "The password does not match, so the account was kept." };
    saveUsers(list.filter((item) => item.id !== id));
    logout();
    return { ok: true };
  }

  window.BonaAuth = {
    current, register, login, logout, updateProfile, saveAddress, removeAddress,
    saveNotifications, addReview, addReturn, changePassword, requestReset, completeReset, deleteAccount,
  };
})();
