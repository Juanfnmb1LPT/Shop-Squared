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
| Word Export | docx + file-saver |
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
│   ├── ExportPreviewModal.vue       # Preview & print inventory as Word doc (4x3 grid)
│   ├── QrExportModal.vue            # Mass QR code label printing
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
items             — id, name, bin_id, base_sku
item_variations   — id, item_id, item_name, sku, quantity, price, color, style, size
```

Cascading deletes: bin → items → variations.

---

## Key Algorithms

- **Shopify→Square mapping** (`convertShopToSquare.js`): groups rows by Handle, detects gender from Title/Tags/Options, maps Option columns to Square format
- **SKU matching** (`updateInventoryFromSquare.js`): fuzzy header detection + SKU-keyed Map for bulk quantity sync
- **Size sorting** (BinDetailView, ShopifyExportVariations): `XS→3XL` order, then SKU
- **QR scanning**: decodes bin ID from QR, navigates to `/search-inventory/:id`
- **Mass variation generation** (ItemFormModal): toggle between Sizes or Colors mode when creating an item; sizes use chip selectors (XS–3XL), colors use a name + SKU abbreviation entry form; auto-generates variations with SKU pattern `{baseSku}-{size}` or `{baseSku}-{abbr}`
- **Base SKU** (items table): stored on the item record; editable in both create and edit item modals; auto-fills the SKU field with `{baseSku}-` when creating new variations
- **Inline editing** (BinDetailView): click quantity or price on a variation card to edit in-place; Enter/blur to save, Escape to cancel
- **Quick quantity increment** (BinDetailView): +1 button on each variation card to increment quantity with a single click
- **Mass delete** (SearchInventoryView, BinDetailView): select multiple bins or items and delete them in bulk; trash icons moved inside edit mode for cleaner UX
- **Word doc print** (ExportPreviewModal): preview all items with toggle selection, exports a `.docx` price sheet in a 4-column × 3-row grid per page with item name, style, color, price, and available sizes
- **Mass QR code printing** (QrExportModal): select bins and print QR code labels in bulk

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
- **Bin sorting** — bins are sorted alphabetically by name across all views
- **QR scan requires HTTPS or localhost** — won't work on plain HTTP
- **Excel support** — only reads the first sheet of multi-sheet workbooks
- **Single location** — Square quantity sync assumes a single store location; multi-location not supported

---

## Future Tasks

### High Priority

- [ ] **Input validation** — add required-field and format validation to all modal forms (BinFormModal, ItemFormModal, VariationFormModal)

### Features

- [ ] **Bulk CSV import into inventory DB** — allow uploading a CSV to create/update many items and variations at once (not just quantity sync)
- [x] **Bulk delete** — select multiple bins or items and delete them in bulk
- [x] **Variation inline editing** — edit quantity/price directly in the table without opening a modal
- [x] **Mass variation generation** — select sizes or colors when creating an item to auto-generate variations (sizes via chips, colors via name + abbreviation)
- [x] **Base SKU on items** — stored on item record, editable in create/edit, auto-fills variation SKU field
- [x] **Quick quantity increment** — +1 button on variation cards for fast counting
- [x] **Word doc price sheet print** — preview/toggle items and export as a formatted `.docx` grid
- [x] **Mass QR code printing** — select bins and print QR labels in bulk
- [x] **Alphabetical bin sorting** — bins sorted by name across all views
- [ ] **Multi-location Square support** — let user select which Square location's quantity column to use during sync
- [ ] **Search within BinDetailView** — filter items/variations by SKU or name within a bin
- [ ] **Item move between bins** — drag or reassign an item to a different bin from BinDetailView
- [ ] **Duplicate bin/item** — copy a bin or item (with its variations) as a starting point

### UX / Polish

- [ ] **Undo delete** — brief toast with undo for accidental deletes (bins, items, variations)
- [x] **Empty-state illustrations** — friendly empty states with icons, contextual messages, and CTAs when bins/items/variations are empty or search returns nothing
- [x] **Keyboard navigation** — ESC to close all modals, Tab focus trapping within modals, focus restore on close
- [ ] **Mobile layout for BinDetailView** — variation table is wide and doesn't reflow well on small screens
- [ ] **Loading skeletons** — replace blank states during Supabase fetches with skeleton placeholders
- [ ] **Confirm on navigate away** — warn if user has unsaved modal changes and navigates away

### Tech Debt

- [ ] **Pinia store for inventory** — centralize bin/item/variation state to avoid redundant Supabase fetches across views
- [ ] **Consolidate CSV header detection** — `findHeader()` logic is duplicated across `updateInventoryFromSquare.js` and `updateInventoryFromShopify.js`; extract to `parseUploadedTable.js`
- [ ] **Error boundary component** — global error handler for failed Supabase calls instead of per-component try/catch patterns
- [ ] **Unit tests** — add Vitest tests for the pure conversion functions in `lib/` (convertShopToSquare, updateInventoryFromSquare, parseUploadedTable)
- [ ] **TypeScript migration** — convert `lib/` utilities to TS for safer CSV field access
