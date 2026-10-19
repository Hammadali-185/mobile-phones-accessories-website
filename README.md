# Bona

Bona is a portfolio storefront for new phones, used phones, and accessories. Prices are in Pakistani rupees. Shoppers can browse, search, filter, keep a cart, and place a cash-on-delivery or bank-transfer order. A separate counter at `/Wassmad` manages the catalog, stock, and orders.

This repository is a public copy. It does not connect to a production database, payment provider, or mail server. Catalog, accounts, carts, and orders stay in the browser that is using the site.

## Features

- Home, catalog, category, brand, search, and product pages
- Filters for condition, PTA status, storage, price, and accessory fit
- Cart, wishlist, offer code `BONA10`, and the iPhone 15 care-pair price
- Guest checkout and optional customer accounts
- Order confirmation and order tracking by order number plus phone
- Policies for shipping, returns, warranty, privacy, and terms
- Admin counter for products, inventory, orders, coupons, suppliers, and reports
- Browser session for the counter, with a salted password hash, lockout after repeated failures, and optional authenticator codes

## Technology

- HTML, CSS, and browser JavaScript. There is no frontend framework and no package manifest.
- `server.py` is a small Python static server. It uses the standard library only.
- Product photos in the sample catalog are Unsplash images.
- Shop data is stored in `localStorage`. The counter session is stored in `sessionStorage`.

There is no database, ORM, migration, or server-side API. The sample catalog is `js/data/seed.js`.

## Architecture

The browser loads `index.html` for the shop and `admin.html` for the counter. `server.py` rewrites clean paths such as `/products` and `/categories/mobile-phones` back to `index.html`, and it serves `/Wassmad` from `admin.html`. The path is not an access-control secret. `robots.txt` asks crawlers to skip the counter, account, cart, and checkout paths.

`js/data/seed.js` holds the fictional catalog. `js/core/store.js` reads and writes browser storage. `js/core/cart.js` prices the cart from the current catalog. `js/storefront/app.js` renders the shop. `js/admin/auth.js` handles the counter sign-in. `js/admin/app.js` and `js/admin/desk.js` render the counter.

An order is saved only after the catalog price, quantity, and stock are checked. New orders are `pending` and `unpaid`. Cash on delivery and bank transfer stay unpaid until someone signed in to the counter marks the payment. There is no card gateway and no webhook.

## Prerequisites

- Python 3.9 or newer
- A current browser with `localStorage`, `sessionStorage`, and Web Crypto

Node, npm, Docker, and a database are not required.

## Installation

```bash
git clone <your-repository-url>
cd mobile_website_with_admin_public
```

The shop runs from these files. It does not install packages and it does not read a `.env` file on its own.

## Environment

The defaults are enough for local use. To change the bind address, copy `.env.example` and export the variables in the shell before starting Python. The example file contains placeholders only.

| Variable | Purpose | Default |
| --- | --- | --- |
| `BONA_HOST` | Interface the local server binds to | `127.0.0.1` |
| `BONA_PORT` | Port the local server listens on | `8765` |
| `BONA_PUBLIC_ORIGIN` | Optional origin written into `sitemap.xml` and `robots.txt` | Request host |

Shop phone, email, address, hours, and social links are empty until they are typed into counter settings. Those values stay in that browser. Do not commit a filled `.env` file.

## Database

There is no database to create and no migration to run. The sample products load from `js/data/seed.js`. Orders and accounts appear only after someone uses that browser. Clearing site data removes them.

## Development

From the project directory:

```bash
python server.py
```

On Windows, `py server.py` works the same way. Then open `http://127.0.0.1:8765/`.

The first visit to `http://127.0.0.1:8765/Wassmad` creates a counter sign-in in that browser and shows the username and password once. That password is random. It is not in the source files. Change it after signing in. Customer registration does not create a counter account.

## Build and test

There is no compile step, package script, or automated test suite. Check the server syntax with:

```bash
python -m py_compile server.py
```

If Node is installed, syntax-check the scripts with:

```bash
node --check js/core/store.js
```

Repeat that for the other files under `js/`. Serve the site and walk through a product page, the cart, checkout, and the counter sign-in.

## Demo limitations

These boundaries are part of this public copy:

- Accounts, passwords, carts, orders, messages, and counter data stay on the device. Another visitor does not see them.
- Password reset codes are shown on the page because no email service is configured. The stored code is a hash.
- The counter password hash and any authenticator secret also stay in browser storage. This is not a hosted login system.
- Login lockouts live in browser storage. They are a demo control, not a network firewall.
- Delivery is Rs 490 under Rs 25,000 and free at or above that amount. The shop recalculates the total from catalog prices when the order is placed.
- `BONA10` takes 10 percent off through 31 December 2026. The care-pair offer is separate.
- Payment is cash on delivery or a bank transfer confirmed by phone. Placing an order does not mark it paid.
- Bank details are not stored in the repository. The counter would send them during a real confirmation call, which this demo does not place.
- Used-phone photos in the sample catalog are stand-ins, not photographs of a specific handset.
- Contact details stay blank until saved in the counter. The sample copy does not invent an address.

## Deployment

`server.py` is a local demo server. It binds to `127.0.0.1` unless `BONA_HOST` is changed. Do not expose it as the production server for a real shop.

A public static host can serve `index.html`, `admin.html`, and the `css/` and `js/` directories. Clean paths such as `/products` need the host to fall back to `index.html`, and `/Wassmad` needs to serve `admin.html`. The Python server already does both.

Before publishing a deployment:

- Keep real `.env` files, database dumps, certificates, and customer uploads out of Git.
- Do not copy the private project's Git history into this repository.
- Treat the counter as a browser demo. A multi-user shop needs a server that checks the session, stock, and payment before it saves an order.
- Set `BONA_PUBLIC_ORIGIN` only when generating the sitemap from `server.py`.

This repository does not include a live production URL.
