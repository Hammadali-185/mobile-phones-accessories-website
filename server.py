#!/usr/bin/env python3
"""Serve Bona with clean URLs.

Static files are served as themselves. Every other shop path returns index.html,
so a refresh or a shared link still opens the right page. /Wassmad is the only
admin entry. The path is case-sensitive: /wassmad redirects to /Wassmad.

This process does not authenticate anyone and does not connect to a database.
Shop data stays in the browser. Hiding /Wassmad is not access control.
The admin screens require their own browser session before they show the counter.
"""

import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ADMIN = "/Wassmad"
PUBLIC = [
    "/",
    "/products",
    "/categories/mobile-phones",
    "/categories/mobile-phones/new",
    "/categories/mobile-phones/used",
    "/categories/accessories",
    "/categories/accessories/charging",
    "/offers",
    "/about",
    "/contact",
    "/faq",
    "/shipping-policy",
    "/return-policy",
    "/warranty-policy",
    "/privacy-policy",
    "/terms-and-conditions",
]


def slugify(value):
    text = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")
    return text[:72]


def product_slugs():
    text = (ROOT / "js" / "data" / "seed.js").read_text(encoding="utf-8")
    pairs = re.findall(r'id:\s*"([^"]+)"\s*,\s*name:\s*"([^"]+)"', text)
    used = set()
    slugs = []
    for item_id, name in sorted(pairs, key=lambda pair: pair[0]):
        slug = slugify(name) or slugify(item_id) or "product"
        if slug in used:
            id_slug = slugify(item_id)
            slug = id_slug if id_slug and id_slug not in used else slug + "-" + (id_slug or "2")
        n = 2
        unique = slug
        while unique in used:
            unique = slug + "-" + str(n)
            n += 1
        used.add(unique)
        slugs.append(unique)
    return slugs


LEGACY = {
    "/phones": "/categories/mobile-phones",
    "/phones/new": "/categories/mobile-phones/new",
    "/phones/used": "/categories/mobile-phones/used",
    "/accessories": "/categories/accessories",
    "/accessories/charging": "/categories/accessories/charging",
    "/deals": "/offers",
    "/track": "/track-order",
    "/forgot": "/forgot-password",
    "/reset": "/reset-password",
    "/policy/shipping": "/shipping-policy",
    "/policy/returns": "/return-policy",
    "/policy/warranty": "/warranty-policy",
    "/policy/privacy": "/privacy-policy",
    "/policy/terms": "/terms-and-conditions",
}
CATEGORY_SLUGS = {
    "phones": "mobile-phones",
    "chargers": "chargers",
    "cables": "cables",
    "cases": "cases",
    "protectors": "screen-protectors",
    "camera": "camera-protectors",
    "audio": "audio",
    "power": "power-banks",
    "wearables": "wearables",
    "holders": "holders",
    "speakers": "speakers",
    "stands": "stands",
    "other": "other",
}


def seed_pairs():
    text = (ROOT / "js" / "data" / "seed.js").read_text(encoding="utf-8")
    return re.findall(r'id:\s*"([^"]+)"\s*,\s*name:\s*"([^"]+)"', text)


def slug_for_id(item_id):
    pairs = sorted(seed_pairs(), key=lambda pair: pair[0])
    used = set()
    found = ""
    for current_id, name in pairs:
        slug = slugify(name) or slugify(current_id) or "product"
        if slug in used:
            id_slug = slugify(current_id)
            slug = id_slug if id_slug and id_slug not in used else slug + "-" + (id_slug or "2")
        unique = slug
        n = 2
        while unique in used:
            unique = slug + "-" + str(n)
            n += 1
        used.add(unique)
        if current_id == item_id:
            found = unique
    return found


def legacy_target(path):
    if path in LEGACY:
        return LEGACY[path]
    if path.startswith("/accessories/"):
        category = path.split("/", 2)[2]
        return "/categories/" + CATEGORY_SLUGS.get(category, slugify(category))
    if path.startswith("/thanks/"):
        return "/order-confirmation/" + path.split("/", 2)[2]
    if path == "/thanks":
        return "/order-confirmation"
    if path.startswith("/product/"):
        item_id = path.split("/", 2)[2]
        slug = slug_for_id(item_id) or slugify(item_id)
        return "/products/" + (slug or "product")
    if path.startswith("/category/"):
        category = path.split("/", 2)[2]
        if category == "phones":
            return "/categories/mobile-phones"
        return "/categories/" + CATEGORY_SLUGS.get(category, slugify(category))
    if path.startswith("/brand/"):
        return "/brands/" + slugify(path.split("/", 2)[2])
    return ""


def absolute(handler, path):
    origin = os.environ.get("BONA_PUBLIC_ORIGIN", "").strip().rstrip("/")
    if origin.startswith("http://") or origin.startswith("https://"):
        return origin + path
    host = handler.headers.get("Host") or "localhost"
    if not re.fullmatch(r"[A-Za-z0-9.:-]+", host):
        host = "localhost"
    return "http://" + host + path


def sensitive(file_path):
    try:
        rel = file_path.resolve().relative_to(ROOT)
    except ValueError:
        return True
    name = rel.name.lower()
    if name == ".env" or (name.startswith(".env.") and name != ".env.example"):
        return True
    if name.endswith((".pem", ".key", ".sqlite", ".db", ".dump", ".sql", ".bak")):
        return True
    return any(part.startswith(".") or part == "__pycache__" for part in rel.parts)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "img-src 'self' data: blob: https://images.unsplash.com; "
            "connect-src 'self'; "
            "object-src 'none'; "
            "base-uri 'self'; "
            "form-action 'self'; "
            "frame-ancestors 'none'",
        )
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404, "Not found")
        return None

    def do_GET(self):
        return self.dispatch(False)

    def do_HEAD(self):
        return self.dispatch(True)

    def dispatch(self, head):
        path = self.path.split("?", 1)[0]
        if path == "/sitemap.xml":
            return self.bytes(self.sitemap(), "application/xml; charset=utf-8", head)
        if path == "/robots.txt":
            return self.bytes(self.robots(), "text/plain; charset=utf-8", head)
        target = self.canonical(path) or legacy_target(path)
        if target:
            return self.redirect(target)
        file_path = (ROOT / path.lstrip("/")).resolve()
        if path != "/" and (ROOT != file_path and ROOT not in file_path.parents):
            self.send_error(404, "Not found")
            return None
        if path != "/" and sensitive(file_path):
            self.send_error(404, "Not found")
            return None
        if path == ADMIN or path.startswith(ADMIN + "/"):
            self.path = "/admin.html"
        elif path != "/" and file_path.is_file():
            self.path = "/" + file_path.relative_to(ROOT).as_posix()
        else:
            self.path = "/index.html"
        if head:
            return super().do_HEAD()
        return super().do_GET()

    def canonical(self, path):
        lower = path.lower()
        if len(path) > 1 and path.endswith("/"):
            return path[:-1]
        if lower in ("/index.html", "/admin.html", "/admin"):
            return "/" if lower == "/index.html" else ADMIN + "/dashboard"
        if path == ADMIN or path.startswith(ADMIN + "/"):
            return ""
        if lower == ADMIN.lower() or lower.startswith(ADMIN.lower() + "/"):
            return ADMIN + path[len(ADMIN):].lower()
        return ""

    def redirect(self, target):
        self.send_response(301)
        self.send_header("Location", target + (("?" + self.path.split("?", 1)[1]) if "?" in self.path else ""))
        self.end_headers()

    def bytes(self, payload, content_type, head=False):
        body = payload.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def sitemap(self):
        paths = PUBLIC + ["/categories/" + slug for slug in (
            "chargers", "cables", "cases", "screen-protectors", "camera-protectors",
            "audio", "power-banks", "wearables", "holders", "speakers", "stands", "other",
        )] + ["/products/" + slug for slug in product_slugs()]
        urls = "\n".join("<url><loc>" + absolute(self, item) + "</loc></url>" for item in paths)
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n" + urls + "\n</urlset>\n"

    def robots(self):
        lines = [
            "User-agent: *",
            "Disallow: /Wassmad",
            "Disallow: /account",
            "Disallow: /cart",
            "Disallow: /checkout",
            "Disallow: /login",
            "Disallow: /register",
            "Disallow: /forgot-password",
            "Disallow: /reset-password",
            "Disallow: /track-order",
            "Disallow: /order-confirmation",
            "Disallow: /wishlist",
            "Sitemap: " + absolute(self, "/sitemap.xml"),
            "",
        ]
        return "\n".join(lines)


if __name__ == "__main__":
    host = os.environ.get("BONA_HOST", "127.0.0.1").strip() or "127.0.0.1"
    raw_port = os.environ.get("BONA_PORT", "8765").strip() or "8765"
    try:
        port = int(raw_port)
    except ValueError:
        port = 8765
    if port < 1 or port > 65535:
        port = 8765
    server = ThreadingHTTPServer((host, port), Handler)
    print("Bona is at http://" + host + ":" + str(port) + "/")
    server.serve_forever()
