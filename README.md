# CSV Shopify & Square Converter (Vue)
Live at https://juanfnmb1lpt.github.io/Shop-Squared/

Browser-based CSV tools for ecommerce workflows, now implemented as a Vue 3 single-page app with Vite.

All parsing and processing runs locally in the browser. No file data is uploaded to a server.

## Features

- Shopify → Square conversion (`square_import.csv` output)
- Update Shopify variant quantities from a Square inventory file
- Upload input supports CSV, XLSX, and XLS files
- Excel uploads use the first sheet and first row as headers, then flatten to row-based data
- Client-side parsing via PapaParse (CSV) and SheetJS (Excel)
- Search Inventory with QR scan support for bin lookup and auto-navigation
- Bin CRUD from Search Inventory
- Item and variation CRUD from the Bin Detail page
- Auto-generate variations when creating an item — toggle between Sizes (XS–3XL chips) or Colors (name + SKU abbreviation entry); variations are batch-created with SKUs like `TSHIRT-BLK-XS` or `TSHIRT-BLK`
- Base SKU stored on items — editable in create and edit item modals; auto-fills the SKU field when adding new variations
- Inline quantity and price editing on variation cards — click to edit, Enter or blur to save, Escape to cancel
- Quick +1 quantity button on each variation card for fast counting
- Mass QR code label printing — select bins and print QR labels in bulk
- Print inventory as a formatted Word doc price sheet (4x3 grid per page)
- Bins sorted alphabetically by name across all views

## Run locally

Requirements:

- Node.js 18+

Commands:

```bash
npm install
npm run dev
```

Open the URL shown by Vite (usually `http://localhost:5173`).

## Login

The app now requires login before accessing tools.

- Username: `admin`
- Password: `test`

Successful login is persisted in the browser, so users stay signed in across refresh/reopen until they click Logout.

## Build

```bash
npm run build
npm run preview
```

The production build is generated in `dist/`.

## GitHub Pages deployment

This Vue app works on GitHub Pages.

This repo also includes an automated Pages workflow at [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) that builds and deploys from `main`.

Set these GitHub Actions secrets before deploying:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

In GitHub repo settings, set **Pages → Source** to **GitHub Actions** so the live site always matches the latest `main` build.

After enabling it, push to `main` (or run the workflow manually from the Actions tab) to publish the latest build.

Routing uses hash mode (`/#/`) so direct page refresh works on GitHub Pages without server rewrites.

## App routes

- `/#/login` Login page
- `/` Home page with step page options (requires login)
- `/#/pre-con` Pre-Con step page
- `/#/post-con` Post-Con step page
- `/#/shopify-to-square` Shopify → Square tool
- `/#/update-quantity` Update Shopify quantity tool
- `/#/search-inventory` Search inventory page
- `/#/search-inventory/:id` Bin detail and item/variation management page
- `/#/update-inventory` Bulk update variation quantities from a Shopify or Square CSV file
- `/#/reports` Reports hub for inventory exports (Shopify export, QR labels, low-stock CSV, Word price sheet)

The app uses a persistent left dashboard for navigation between all pages.

## Project structure

- `src/views/LoginView.vue` Login form
- `src/views/HomeView.vue` Home page with step options
- `src/views/PreConView.vue` Pre-conversion checklist page
- `src/views/PostConView.vue` Post-conversion checklist page
- `src/views/ShopifyToSquareView.vue` Shopify → Square UI
- `src/views/UpdateQuantityView.vue` Quantity update UI
- `src/views/SearchInventoryView.vue` Bin search and bin CRUD UI (with inventory filter modal)
- `src/views/BinDetailView.vue` Bin detail plus item and variation CRUD UI (inline qty/price editing, +1 quantity button)
- `src/views/UpdateInventoryView.vue` Bulk DB update from uploaded Shopify or Square CSV
- `src/views/ReportsView.vue` Reports hub — entry point for Shopify export, QR labels, low-stock, Word price sheet
- `src/components/ItemFormModal.vue` Create/edit item — includes size/color variation auto-generator and base SKU
- `src/components/VariationFormModal.vue` Create/edit individual variation (auto-fills base SKU)
- `src/components/BinFormModal.vue` Create/edit bin
- `src/components/ConfirmModal.vue` Generic delete confirmation
- `src/components/QrExportModal.vue` Mass QR code label printing
- `src/components/ExportPreviewModal.vue` Print inventory as Word doc price sheet
- `src/components/LowStockExportModal.vue` Low-stock variation CSV export with quantity threshold
- `src/components/ShopifyExportVariations.vue` Shopify CSV export of products / inventory from the DB
- `src/components/InventoryFilterModal.vue` Search Inventory filter popup (size, style, color families with Select-all)
- `src/components/InfiniteCarousel.vue` Reusable looping image carousel
- `src/lib/convertShopToSquare.js` Shopify → Square transformation logic
- `src/lib/updateInventoryFromSquare.js` Quantity sync logic (Square → DB)
- `src/lib/updateInventoryFromShopify.js` Quantity sync logic (Shopify → DB)
- `src/lib/parseUploadedTable.js` CSV + XLSX/XLS file parsing
- `src/lib/downloadCsv.js` Browser CSV download helper
- `src/lib/binCrud.js` Bin CRUD helpers
- `src/lib/itemCrud.js` Item CRUD helpers
- `src/lib/variationCrud.js` Variation CRUD helpers
- `src/lib/auth.js` Auth helpers (localStorage session)
- `src/lib/supabase.js` Supabase client setup (reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`)
- `src/lib/inventoryFilters.js` Shared filter state for Search Inventory + Bin Detail (sessionStorage-backed) plus matching helpers
- `src/lib/colorFamilies.js` Color family taxonomy + substring classifier used by the inventory filter modal
- `src/router/index.js` Vue Router setup with auth guard
- `supabase/get_inventory_summary.sql` Postgres RPC returning distinct sizes/colors/styles + counts in one call
- `styles.css` Shared styling

## Inventory color families

The Search Inventory filter groups colors into families (Grey, Blue, Green, …) using a substring keyword scan. To add a new family or extend an existing one with more keywords (e.g. `sage`, `crimson`, `taupe`), edit the `COLOR_FAMILIES` config in [`src/lib/colorFamilies.js`](src/lib/colorFamilies.js) — no other code changes needed; `classifyColor` will pick it up automatically.

## Test data

Sample CSV files are in `assets/`:

- `shopify_test.csv`
- `shopify_large_test.csv`
- `square_new_quantities.csv`
