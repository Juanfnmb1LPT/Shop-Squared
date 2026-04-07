<script setup>
import { ref } from 'vue';
const props = defineProps({ compact: { type: Boolean, default: false } });
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import { downloadCsv } from '../lib/downloadCsv';

const isProcessing = ref(false);
const error = ref('');
const exportMode = ref('products'); // 'products' or 'inventory'
const defaultLocation = '1400 S International Pkwy, Lake Mary, Florida, 32746';

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function escapeCsvValue(value) {
  return `"${String(value || '').replace(/"/g, '""')}"`;
}

async function fetchVariations() {
  const { data, error: fetchError } = await supabase
    .from('item_variations')
    .select('*')
    .order('item_id', { ascending: true })
    .order('item_name', { ascending: true });

  if (fetchError) throw fetchError;
  if (!data || !data.length) throw new Error('No item_variations found.');
  return data;
}

function groupAndSort(data) {
  const groups = data.reduce((g, v) => {
    const id = v.item_id ?? 'no-id';
    if (!g[id]) g[id] = [];
    g[id].push(v);
    return g;
  }, {});

  const sizeOrder = ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl'];
  const sizeIndex = (v) => {
    const s = (v.size || '').toString().trim().toLowerCase();
    const normalized = s.replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
    const idx = sizeOrder.indexOf(normalized);
    return idx === -1 ? 999 : idx;
  };

  Object.values(groups).forEach((group) => {
    group.sort((a, b) => {
      const ia = sizeIndex(a);
      const ib = sizeIndex(b);
      if (ia !== ib) return ia - ib;
      const ca = (a.color || '').localeCompare(b.color || '');
      if (ca !== 0) return ca;
      const sa = (a.style || '').localeCompare(b.style || '');
      if (sa !== 0) return sa;
      return (a.sku || '').localeCompare(b.sku || '');
    });
  });

  return groups;
}

// Determine which option names (Size, Color, Style) are used by ANY variant in a group
function getGroupOptionNames(group) {
  const names = [];
  const hasSize = group.some((v) => (v.size || '').toString().trim());
  const hasColor = group.some((v) => (v.color || '').toString().trim());
  const hasStyle = group.some((v) => (v.style || '').toString().trim());
  if (hasSize) names.push('Size');
  if (hasColor) names.push('Color');
  if (hasStyle) names.push('Style');
  return names;
}

function getVariationOptionValue(variation, optionName) {
  if (optionName === 'Size') return (variation.size || '').toString().trim();
  if (optionName === 'Color') return (variation.color || '').toString().trim();
  if (optionName === 'Style') return (variation.style || '').toString().trim();
  return '';
}

function buildProductRows(groups) {
  const headers = [
    'Handle', 'Title',
    'Option1 Name', 'Option1 Value',
    'Option2 Name', 'Option2 Value',
    'Option3 Name', 'Option3 Value',
    'Variant Inventory Tracker',
    'SKU', 'Variant Inventory Qty', 'Variant Price'
  ];

  const rows = [headers];

  Object.keys(groups).forEach((itemId) => {
    const group = groups[itemId] || [];
    const optionNames = getGroupOptionNames(group);

    group.forEach((variation, idx) => {
      const itemName = (variation.item_name || '').toString().trim();
      const handle = slugify(itemName || itemId);
      const title = idx === 0 ? itemName : '';

      rows.push([
        handle, title,
        optionNames[0] || '', getVariationOptionValue(variation, optionNames[0]),
        optionNames[1] || '', getVariationOptionValue(variation, optionNames[1]),
        optionNames[2] || '', getVariationOptionValue(variation, optionNames[2]),
        'shopify',
        variation.sku || '',
        variation.quantity != null ? String(variation.quantity) : '',
        variation.price != null ? String(variation.price) : '',
      ]);
    });
  });

  return rows;
}

function buildInventoryRows(groups) {
  const headers = ['Handle', 'Title', 'Option1 Name', 'Option1 Value',
    'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value',
    'SKU', 'Location', 'On hand (new)'];

  const rows = [headers];

  Object.keys(groups).forEach((itemId) => {
    const group = groups[itemId] || [];
    const optionNames = getGroupOptionNames(group);

    group.forEach((variation, idx) => {
      const itemName = (variation.item_name || '').toString().trim();
      const handle = slugify(itemName || itemId);
      const title = idx === 0 ? itemName : '';

      rows.push([
        handle, title,
        optionNames[0] || '', getVariationOptionValue(variation, optionNames[0]),
        optionNames[1] || '', getVariationOptionValue(variation, optionNames[1]),
        optionNames[2] || '', getVariationOptionValue(variation, optionNames[2]),
        variation.sku || '',
        defaultLocation,
        variation.quantity != null ? String(variation.quantity) : '',
      ]);
    });
  });

  return rows;
}

async function exportShopifyFromVariations() {
  error.value = '';
  if (!hasSupabaseConfig || !supabase) {
    error.value = 'Supabase not configured. Add VITE_SUPABASE_ANON_KEY to use export.';
    return;
  }

  isProcessing.value = true;
  try {
    const data = await fetchVariations();
    const groups = groupAndSort(data);

    const isInventory = exportMode.value === 'inventory';
    const rows = isInventory ? buildInventoryRows(groups) : buildProductRows(groups);
    const filename = isInventory
      ? 'shopify_inventory_update.csv'
      : 'shopify_products_export.csv';

    const csvText = rows.map((r) => r.map((v) => escapeCsvValue(v)).join(',')).join('\r\n');
    downloadCsv(csvText, filename);
  } catch (err) {
    error.value = err?.message || String(err);
  } finally {
    isProcessing.value = false;
  }
}
</script>

<template>
  <div v-if="!props.compact" class="card spacious tool-card export-shopify-card reveal-fade-up">
    <div class="export-header">
      <div class="export-title">Export item_variations → Shopify CSV</div>
      <div class="export-sub">Choose an export format based on your Shopify import target.</div>
    </div>

    <div class="export-mode-select">
      <label class="mode-option" :class="{ active: exportMode === 'products' }">
        <input type="radio" v-model="exportMode" value="products" />
        <span class="mode-label">Products Import</span>
        <span class="mode-desc">Create or update products with inventory tracking, price, and options</span>
      </label>
      <label class="mode-option" :class="{ active: exportMode === 'inventory' }">
        <input type="radio" v-model="exportMode" value="inventory" />
        <span class="mode-label">Inventory Update</span>
        <span class="mode-desc">Update stock quantities only for existing products at a location</span>
      </label>
    </div>

    <div class="export-actions">
      <button class="btn" :disabled="isProcessing" @click="exportShopifyFromVariations">
        {{ isProcessing ? 'Exporting…' : exportMode === 'inventory' ? 'Export Inventory CSV' : 'Export Products CSV' }}
      </button>
      <div v-if="error" class="export-error">{{ error }}</div>
    </div>
  </div>

  <div v-else class="export-compact">
    <select v-model="exportMode" class="compact-select">
      <option value="products">Products</option>
      <option value="inventory">Inventory</option>
    </select>
    <button class="btn" :disabled="isProcessing" @click="exportShopifyFromVariations">
      {{ isProcessing ? 'Exporting…' : 'Export Shopify CSV' }}
    </button>
  </div>
</template>

<style scoped>
.export-shopify-card { padding: 18px; border-radius: 12px; border: 1px solid rgba(18,58,138,0.08); background: rgba(255,255,255,0.9); }
.export-header { margin-bottom: 12px; }
.export-title { font-weight: 800; font-size: 15px; }
.export-sub { font-size: 13px; color: #374151; }
.export-actions { display:flex; gap:12px; align-items:center; }
.export-error { color: #b91c1c; font-size: 13px; }

.export-mode-select { display: flex; gap: 10px; margin-bottom: 14px; }
.mode-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  border: 1.5px solid rgba(18,58,138,0.12);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.mode-option:hover { border-color: rgba(18,58,138,0.25); }
.mode-option.active { border-color: #2563eb; background: rgba(37,99,235,0.04); }
.mode-option input[type="radio"] { display: none; }
.mode-label { font-weight: 700; font-size: 13px; margin-bottom: 2px; }
.mode-desc { font-size: 12px; color: #6b7280; line-height: 1.3; }

.export-compact { display: inline-flex; align-items: center; gap: 8px; }
.compact-select {
  padding: 6px 8px;
  border: 1px solid rgba(18,58,138,0.15);
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
}
</style>
