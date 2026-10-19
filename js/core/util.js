(function () {
  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function money(amount) {
    const n = Math.round(Number(amount) || 0);
    return "Rs " + n.toLocaleString("en-PK");
  }

  function photo(id, w) {
    return "https://images.unsplash.com/photo-" + id + "?auto=format&fit=crop&w=" + (w || 1200) + "&q=80";
  }

  const CONDITION = {
    new: "New",
    used: "Used",
    refurbished: "Refurbished",
    "open-box": "Open box",
  };

  const CATEGORIES = {
    phones: "Phones",
    chargers: "Chargers and adapters",
    cables: "Charging cables",
    cases: "Cases and covers",
    protectors: "Screen protectors",
    camera: "Camera protectors",
    audio: "Earbuds and headphones",
    power: "Power banks",
    wearables: "Smartwatches",
    holders: "Car chargers and holders",
    speakers: "Speakers",
    stands: "Stands and grips",
    other: "Other accessories",
  };

  const SWATCH = {
    Black: "#1c1c1c",
    White: "#f4f1ea",
    Blue: "#3c6e9a",
    Pink: "#e7b7c6",
    Midnight: "#1a1e2a",
    Navy: "#24344d",
    Ivory: "#f3eadb",
    Purple: "#6e5a86",
    Sand: "#e0cfb4",
    Clear: "#d5dbe3",
    Graphite: "#4a4e55",
    Green: "#2e6b55",
  };

  function conditionLabel(product) {
    if (!product) return "";
    if (product.condition === "open-box" || (product.condition === "new" && product.seal === "opened")) return "Open box";
    return CONDITION[product.condition] || "New";
  }

  function sealLabel(product) {
    if (!product || product.kind !== "phone") return "";
    if (product.condition === "new" && product.seal === "sealed") return "Factory sealed";
    if (product.seal === "opened" || product.condition === "open-box") return "Opened, not factory sealed";
    return "";
  }

  function ptaLabel(product) {
    if (!product || product.kind !== "phone" || product.pta === "na") return "";
    return product.pta === "non-pta" ? "Non-PTA" : "PTA Approved";
  }

  function warrantyLabel(product) {
    if (!product || product.warranty === "none") return "No warranty";
    if (product.warranty === "manufacturer") return "Manufacturer warranty";
    return "Seller warranty";
  }

  function metaLine(product) {
    return [product.storage, product.color, conditionLabel(product)].filter(Boolean).join(" · ");
  }

  function stars(rating) {
    const value = Math.max(0, Math.min(5, Number(rating) || 0));
    return '<span class="stars" style="--v:' + value + '" role="img" aria-label="Rated ' + value + ' out of 5"></span>';
  }

  function icon(name) {
    const paths = {
      search: '<circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/>',
      user: '<circle cx="12" cy="8" r="3"/><path d="M5 19c1.4-3 3.8-4.5 7-4.5S17.6 16 19 19"/>',
      heart: '<path d="M12 19s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z"/>',
      bag: '<path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/>',
      chat: '<path d="M6 16l-2 4 5-2h7a4 4 0 0 0 4-4V8a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v5a3 3 0 0 0 2 3z"/>',
      close: '<path d="M6 6l12 12M18 6L6 18"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
      filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || "") + "</svg>";
  }

  function imgTag(src, alt, eager) {
    const extra = eager ? 'fetchpriority="high"' : 'loading="lazy"';
    return '<img src="' + esc(src) + '" alt="' + esc(alt) + '" ' + extra + ' decoding="async">';
  }

  document.addEventListener("load", (event) => {
    const img = event.target;
    if (!img || img.tagName !== "IMG") return;
    img.classList.add("is-ready");
  }, true);

  document.addEventListener("error", (event) => {
    const img = event.target;
    if (!img || img.tagName !== "IMG") return;
    const frame = img.closest ? img.closest(".frame") : null;
    if (frame) frame.classList.add("is-fallback");
    img.remove();
  }, true);

  function waLink(raw) {
    let digits = String(raw || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("0")) digits = "92" + digits.slice(1);
    return "https://wa.me/" + digits;
  }

  function uid(name) {
    const base = String(name || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return base + "-" + String(1000 + (bytes[0] % 9000));
  }

  window.BonaUtil = {
    esc, money, photo, icon, imgTag, stars, swatch: SWATCH, categories: CATEGORIES, conditions: CONDITION,
    conditionLabel, sealLabel, ptaLabel, warrantyLabel, metaLine, waLink, uid,
  };
})();
