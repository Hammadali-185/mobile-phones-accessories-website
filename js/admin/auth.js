(function () {
  const USERS_KEY = "bona-admin-users";
  const LIMIT_KEY = "bona-admin-limit";
  const RESET_KEY = "bona-admin-reset";
  const SESSION_KEY = "bona-admin-session";
  const SETUP_KEY = "bona-admin-totp-setup";
  const ITERATIONS = 120000;
  const LOCK_MS = 15 * 60 * 1000;
  const RESET_MS = 15 * 60 * 1000;
  const SESSION_MS = 8 * 60 * 60 * 1000;
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
      username: user.username,
      email: user.email || "",
      role: user.role === "staff" ? "staff" : "owner",
      starter: !!user.starter,
      defaultHint: !!user.defaultHint,
      totpOn: !!(user.totp && user.totp.enabled),
    };
  }

  function keyOf(value) {
    return String(value || "").trim().toLowerCase();
  }

  function findByIdentifier(value) {
    const key = keyOf(value);
    if (!key) return null;
    return users().find((user) => keyOf(user.username) === key || keyOf(user.email) === key) || null;
  }

  function limits() {
    const saved = read(LIMIT_KEY, {});
    return saved && typeof saved === "object" ? saved : {};
  }

  function lockLeft(key) {
    const slot = limits()[key];
    if (!slot || !(slot.until > Date.now())) return 0;
    return slot.until - Date.now();
  }

  function noteFail(key) {
    const all = limits();
    const slot = all[key] || { fails: 0, until: 0 };
    if (slot.until > Date.now()) return slot.until - Date.now();
    slot.fails += 1;
    if (slot.fails >= MAX_FAILS) {
      slot.until = Date.now() + LOCK_MS;
      slot.fails = 0;
    }
    all[key] = slot;
    write(LIMIT_KEY, all);
    return slot.until > Date.now() ? slot.until - Date.now() : 0;
  }

  function clearFail(key) {
    const all = limits();
    delete all[key];
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

  function readSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !(parsed.exp > Date.now())) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return users().find((user) => user.id === parsed.id) || null;
    } catch {
      return null;
    }
  }

  function startSession(user) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      id: user.id,
      exp: Date.now() + SESSION_MS,
    }));
  }

  function current() {
    return publicUser(readSession());
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SETUP_KEY);
  }

  function randomPassword() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  }

  async function ready() {
    if (users().length) return;
    const pin = randomPassword();
    const secret = await hashSecret(pin);
    const username = "owner";
    saveUsers([{
      id: crypto.randomUUID ? crypto.randomUUID() : "owner-" + Date.now(),
      username,
      email: "",
      role: "owner",
      passwordHash: secret.hash,
      salt: secret.salt,
      iterations: secret.iterations,
      starter: true,
      totp: null,
    }]);
    sessionStorage.setItem("bona-admin-setup", JSON.stringify({ username, password: pin }));
  }

  async function login(identifier, password) {
    const key = keyOf(identifier);
    if (!key) return { ok: false, error: "Enter the email or username." };
    if (!password) return { ok: false, error: "Enter the password." };
    const wait = lockLeft(key);
    if (wait) return { ok: false, error: waitText(wait) };
    const user = findByIdentifier(key);
    const secret = user ? await hashSecret(password, user.salt, user.iterations) : await hashSecret(password);
    const match = user && same(secret.hash, user.passwordHash);
    if (!match) {
      const locked = noteFail(key);
      return { ok: false, error: locked ? waitText(locked) : "That email, username, or password does not match." };
    }
    clearFail(key);
    if (user.totp && user.totp.enabled) return { ok: true, totp: true, userId: user.id };
    startSession(user);
    return { ok: true, user: publicUser(user) };
  }

  async function confirmLoginCode(userId, code) {
    const user = users().find((item) => item.id === userId);
    if (!user || !user.totp || !user.totp.enabled) return { ok: false, error: "Sign in again." };
    const wait = lockLeft("totp:" + user.id);
    if (wait) return { ok: false, error: waitText(wait) };
    const match = await verifyTotp(user.totp.secret, code);
    if (!match) {
      const locked = noteFail("totp:" + user.id);
      return { ok: false, error: locked ? waitText(locked) : "That code does not match." };
    }
    clearFail("totp:" + user.id);
    startSession(user);
    return { ok: true, user: publicUser(user) };
  }

  async function requestReset(identifier) {
    const key = keyOf(identifier);
    if (!key) return { ok: false, error: "Enter the email or username." };
    const wait = lockLeft("reset:" + key);
    if (wait) return { ok: false, error: waitText(wait) };
    const locked = noteFail("reset:" + key);
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
    const key = keyOf(input.identifier);
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
    list[index] = Object.assign({}, list[index], {
      passwordHash: next.hash,
      salt: next.salt,
      iterations: next.iterations,
      starter: false,
    });
    saveUsers(list);
    delete all[key];
    write(RESET_KEY, all);
    clearFail(key);
    sessionStorage.removeItem("bona-admin-setup");
    return { ok: true };
  }

  async function changePassword(input) {
    const user = readSession();
    if (!user) return { ok: false, error: "Sign in again." };
    const current = await hashSecret(input.current || "", user.salt, user.iterations);
    if (!same(current.hash, user.passwordHash)) return { ok: false, error: "The current password does not match." };
    if (!validPassword(input.next)) return { ok: false, error: "Use a password of at least 8 characters." };
    if (input.next !== input.confirm) return { ok: false, error: "The new passwords do not match." };
    const secret = await hashSecret(input.next);
    const list = users();
    const index = list.findIndex((item) => item.id === user.id);
    list[index] = Object.assign({}, list[index], {
      passwordHash: secret.hash,
      salt: secret.salt,
      iterations: secret.iterations,
      starter: false,
    });
    saveUsers(list);
    sessionStorage.removeItem("bona-admin-setup");
    return { ok: true };
  }

  async function addStaff(input) {
    const actor = readSession();
    if (!actor || actor.role !== "owner") return { ok: false, error: "Only the owner can add a sign-in." };
    const username = keyOf(input.username);
    const email = keyOf(input.email);
    const role = input.role === "owner" ? "owner" : "staff";
    if (username.length < 3) return { ok: false, error: "Use a username of at least 3 characters." };
    if (!validPassword(input.password)) return { ok: false, error: "Use a password of at least 8 characters." };
    if (users().some((user) => keyOf(user.username) === username || (email && keyOf(user.email) === email))) {
      return { ok: false, error: "That username or email is already used." };
    }
    const secret = await hashSecret(input.password);
    const list = users();
    list.push({
      id: crypto.randomUUID ? crypto.randomUUID() : "staff-" + Date.now(),
      username,
      email,
      role,
      passwordHash: secret.hash,
      salt: secret.salt,
      iterations: secret.iterations,
      starter: false,
      defaultHint: false,
      totp: null,
    });
    saveUsers(list);
    return { ok: true };
  }

  function staffList() {
    const actor = readSession();
    if (!actor || actor.role !== "owner") return [];
    return users().map(publicUser);
  }

  function base32(bytes) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0;
    let value = 0;
    let out = "";
    bytes.forEach((byte) => {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        out += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    });
    if (bits) out += alphabet[(value << (5 - bits)) & 31];
    return out;
  }

  function base32Decode(text) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const clean = String(text || "").toUpperCase().replace(/=+$/g, "").replace(/\s/g, "");
    let bits = 0;
    let value = 0;
    const out = [];
    for (let i = 0; i < clean.length; i += 1) {
      const index = alphabet.indexOf(clean[i]);
      if (index < 0) continue;
      value = (value << 5) | index;
      bits += 5;
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return new Uint8Array(out);
  }

  async function hotp(secret, counter) {
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    const high = Math.floor(counter / 0x100000000);
    view.setUint32(0, high);
    view.setUint32(4, counter >>> 0);
    const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf));
    const offset = sig[sig.length - 1] & 15;
    const binary = ((sig[offset] & 127) << 24) | (sig[offset + 1] << 16) | (sig[offset + 2] << 8) | sig[offset + 3];
    return String(binary % 1000000).padStart(6, "0");
  }

  async function verifyTotp(secretText, code) {
    const wanted = String(code || "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(wanted)) return false;
    const secret = base32Decode(secretText);
    const counter = Math.floor(Date.now() / 30000);
    for (let drift = -1; drift <= 1; drift += 1) {
      if (await hotp(secret, counter + drift) === wanted) return true;
    }
    return false;
  }

  function beginTotp() {
    const user = readSession();
    if (!user) return { ok: false, error: "Sign in again." };
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    const secret = base32(bytes);
    sessionStorage.setItem(SETUP_KEY, secret);
    return { ok: true, secret, label: user.username };
  }

  async function confirmTotp(code) {
    const user = readSession();
    const secret = sessionStorage.getItem(SETUP_KEY);
    if (!user || !secret) return { ok: false, error: "Start the authenticator setup again." };
    if (!(await verifyTotp(secret, code))) return { ok: false, error: "That code does not match the authenticator." };
    const list = users();
    const index = list.findIndex((item) => item.id === user.id);
    list[index] = Object.assign({}, list[index], { totp: { enabled: true, secret } });
    saveUsers(list);
    sessionStorage.removeItem(SETUP_KEY);
    return { ok: true };
  }

  async function disableTotp(password) {
    const user = readSession();
    if (!user) return { ok: false, error: "Sign in again." };
    const current = await hashSecret(password || "", user.salt, user.iterations);
    if (!same(current.hash, user.passwordHash)) return { ok: false, error: "The password does not match, so two-factor stays on." };
    const list = users();
    const index = list.findIndex((item) => item.id === user.id);
    list[index] = Object.assign({}, list[index], { totp: null });
    saveUsers(list);
    return { ok: true };
  }

  function setupNotice() {
    let parsed = null;
    try { parsed = JSON.parse(sessionStorage.getItem("bona-admin-setup") || "null"); } catch (error) { parsed = null; }
    const starter = parsed && users().some((user) => user.starter && user.username === parsed.username);
    if (!starter) {
      sessionStorage.removeItem("bona-admin-setup");
      return null;
    }
    return { username: parsed.username, password: parsed.password };
  }

  function needsDefaultHint() {
    return !!setupNotice();
  }

  window.BonaAdmin = {
    ready, current, login, confirmLoginCode, logout, requestReset, completeReset,
    changePassword, addStaff, staffList, beginTotp, confirmTotp, disableTotp, needsDefaultHint, setupNotice,
  };
})();
