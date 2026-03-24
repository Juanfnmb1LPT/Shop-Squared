# CSV Shopify & Square Converter — Project Overview

## What It Is

A browser-based Vue 3 SPA for ecommerce inventory workflows. All CSV/Excel processing runs client-side (no server uploads). Core use cases:

- Convert Shopify inventory exports to Square import format
- Sync quantities from Square back to Shopify
- Manage a warehouse bin/item/variation inventory database via Supabase
- Scan and generate QR codes for bin labels

**Live:** https://juanfnmb1lpt.github.io/CSV-Converter/

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Vue 3 (Composition API, `<script setup>`) |
| Build | Vite 5 |
| Router | Vue Router 4 (hash mode for GitHub Pages) |
| CSV | PapaParse |
| Excel | SheetJS (XLSX) |
| QR Codes | html5-qrcode (scan), qrcode (generate) |
| Database | Supabase (PostgreSQL) |
| Auth | Custom localStorage session (queries Supabase `users` table) |
| Styling | Scoped CSS + global `styles.css` (no CSS framework) |

---

## Project Structure

```
src/
├── main.js
├── App.vue                          # Nav shell
├── router/index.js                  # Routes + auth guard
├── views/
│   ├── LoginView.vue
│   ├── HomeView.vue                 # Dashboard
│   ├── PreConView.vue               # Guided Shopify→Square wizard (3 steps)
│   ├── PostConView.vue              # Guided Square→Shopify qty sync wizard (4 steps)
│   ├── ShopifyToSquareView.vue      # Quick converter (no wizard)
│   ├── UpdateQuantityView.vue       # Quick qty updater (no wizard)
│   ├── SearchInventoryView.vue      # Bin browser + QR scan
│   ├── BinDetailView.vue            # Bin detail: item/variation CRUD
│   └── UpdateInventoryView.vue      # Bulk DB update from CSV file
├── components/
│   ├── BinFormModal.vue
│   ├── ItemFormModal.vue
│   ├── VariationFormModal.vue
│   ├── ConfirmModal.vue
│   ├── InfiniteCarousel.vue         # Step-guide image slider
│   └── ShopifyExportVariations.vue  # Export DB variations as Shopify CSV
└── lib/
    ├── auth.js
    ├── supabase.js
    ├── convertShopToSquare.js
    ├── updateInventoryFromSquare.js
    ├── updateInventoryFromShopify.js
    ├── parseUploadedTable.js        # CSV + XLSX/XLS parsing
    ├── downloadCsv.js
    ├── binCrud.js
    ├── itemCrud.js
    └── variationCrud.js
```

---

## Routes

| Path | View | Purpose |
|---|---|---|
| `/login` | LoginView | Auth (no guard) |
| `/` | HomeView | Dashboard |
| `/pre-con` | PreConView | Guided Shopify→Square |
| `/post-con` | PostConView | Guided qty sync |
| `/shopify-to-square` | ShopifyToSquareView | Quick converter |
| `/update-quantity` | UpdateQuantityView | Quick qty update |
| `/update-inventory` | UpdateInventoryView | Bulk DB update from CSV |
| `/search-inventory` | SearchInventoryView | Bin browser |
| `/search-inventory/:id` | BinDetailView | Bin detail + CRUD |

All routes except `/login` require auth.

---

## Database Schema (Supabase)

```
users             — id, username, password
bins              — id, name
items             — id, name, bin_id
item_variations   — id, item_id, item_name, sku, quantity, price, color, style, size
```

Cascading deletes: bin → items → variations.

---

## Key Algorithms

- **Shopify→Square mapping** (`convertShopToSquare.js`): groups rows by Handle, detects gender from Title/Tags/Options, maps Option columns to Square format
- **SKU matching** (`updateInventoryFromSquare.js`): fuzzy header detection + SKU-keyed Map for bulk quantity sync
- **Size sorting** (BinDetailView, ShopifyExportVariations): `XXS→XXL` order, then color, then SKU
- **QR scanning**: decodes bin ID from QR, navigates to `/search-inventory/:id`

---

## Build & Deploy

```bash
npm run dev              # Dev server (port 5173)
npm run build            # Production build → dist/
npm run build:gh-pages   # Build with base: /CSV-Converter/ for GitHub Pages
npm run preview          # Preview production build
```

GitHub Pages deployment via Actions. Requires env secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

---

## Current Limitations / Known Issues

- **No global state management** (no Pinia/Vuex) — all state is local or fetched live from Supabase; no caching
- **No batch CRUD** in inventory UI — items/variations must be created/edited one at a time
- **QR scan requires HTTPS or localhost** — won't work on plain HTTP
- **Excel support** — only reads the first sheet of multi-sheet workbooks
- **Single location** — Square quantity sync assumes a single store location; multi-location not supported

---

## Future Tasks

### High Priority

- [ ] **Input validation** — add required-field and format validation to all modal forms (BinFormModal, ItemFormModal, VariationFormModal)

### Features

- [ ] **Bulk CSV import into inventory DB** — allow uploading a CSV to create/update many items and variations at once (not just quantity sync)
- [ ] **Bulk delete** — checkboxes + bulk-delete action for items/variations in BinDetailView
- [ ] **Variation inline editing** — edit quantity/price directly in the table without opening a modal
- [ ] **Multi-location Square support** — let user select which Square location's quantity column to use during sync
- [ ] **Export all bins to CSV** — dump entire inventory DB to a single CSV for backup/review
- [ ] **Search within BinDetailView** — filter items/variations by SKU or name within a bin
- [ ] **Item move between bins** — drag or reassign an item to a different bin from BinDetailView
- [ ] **Duplicate bin/item** — copy a bin or item (with its variations) as a starting point

### UX / Polish

- [ ] **Undo delete** — brief toast with undo for accidental deletes (bins, items, variations)
- [ ] **Empty-state illustrations** — add friendly empty states when a bin has no items or a search returns nothing
- [ ] **Keyboard navigation** — full keyboard accessibility in modals and tables
- [ ] **Mobile layout for BinDetailView** — variation table is wide and doesn't reflow well on small screens
- [ ] **Loading skeletons** — replace blank states during Supabase fetches with skeleton placeholders
- [ ] **Confirm on navigate away** — warn if user has unsaved modal changes and navigates away

### Tech Debt

- [ ] **Pinia store for inventory** — centralize bin/item/variation state to avoid redundant Supabase fetches across views
- [ ] **Consolidate CSV header detection** — `findHeader()` logic is duplicated across `updateInventoryFromSquare.js` and `updateInventoryFromShopify.js`; extract to `parseUploadedTable.js`
- [ ] **Error boundary component** — global error handler for failed Supabase calls instead of per-component try/catch patterns
- [ ] **Unit tests** — add Vitest tests for the pure conversion functions in `lib/` (convertShopToSquare, updateInventoryFromSquare, parseUploadedTable)
- [ ] **TypeScript migration** — convert `lib/` utilities to TS for safer CSV field access
