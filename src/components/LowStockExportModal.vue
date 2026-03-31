<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import { downloadCsv } from '../lib/downloadCsv';

const emit = defineEmits(['close']);

const threshold = ref('5');
const isLoading = ref(false);
const hasSearched = ref(false);
const error = ref('');
const results = ref([]);
const dialogRef = ref(null);
const thresholdInput = ref(null);
let previousFocus = null;

function onKeydown(e) {
  if (e.key === 'Escape') { emit('close'); return; }
  if (e.key === 'Tab' && dialogRef.value) {
    const focusable = dialogRef.value.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

const totalVariations = computed(() =>
  results.value.reduce((sum, group) => sum + group.variations.length, 0)
);

async function search() {
  const num = Number(threshold.value);
  if (threshold.value === '' || Number.isNaN(num) || num < 0) {
    error.value = 'Enter a valid threshold (0 or above).';
    return;
  }

  isLoading.value = true;
  hasSearched.value = true;
  error.value = '';
  results.value = [];

  try {
    if (!hasSupabaseConfig || !supabase) throw new Error('Supabase not configured.');

    const [
      { data: variations, error: varErr },
      { data: itemsData, error: itemErr },
      { data: binsData, error: binErr },
    ] = await Promise.all([
      supabase.from('item_variations')
        .select('id, item_id, item_name, sku, quantity, price, color, style, size')
        .lte('quantity', num)
        .order('quantity', { ascending: true }),
      supabase.from('items').select('id, bin_id'),
      supabase.from('bins').select('id, name'),
    ]);

    if (varErr) throw varErr;
    if (itemErr) throw itemErr;
    if (binErr) throw binErr;

    const binMap = {};
    for (const b of (binsData || [])) {
      binMap[b.id] = b.name;
    }

    const itemBinMap = {};
    for (const i of (itemsData || [])) {
      itemBinMap[i.id] = binMap[i.bin_id] || '—';
    }

    const groups = {};
    for (const v of (variations || [])) {
      const id = v.item_id ?? 'no-id';
      if (!groups[id]) {
        groups[id] = {
          itemId: id,
          itemName: (v.item_name || '').trim(),
          binName: itemBinMap[id] || '—',
          variations: [],
        };
      }
      groups[id].variations.push(v);
    }

    results.value = Object.values(groups).sort((a, b) =>
      a.itemName.localeCompare(b.itemName)
    );
  } catch (err) {
    error.value = err?.message || String(err);
  } finally {
    isLoading.value = false;
  }
}

function escapeCsvValue(val) {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function exportCsv() {
  const header = 'Item Name,SKU,Quantity,Price,Color,Style,Size,Bin Name';
  const rows = [];
  for (const group of results.value) {
    for (const v of group.variations) {
      rows.push([
        escapeCsvValue(group.itemName),
        escapeCsvValue(v.sku),
        v.quantity ?? 0,
        v.price ?? 0,
        escapeCsvValue(v.color),
        escapeCsvValue(v.style),
        escapeCsvValue(v.size),
        escapeCsvValue(group.binName),
      ].join(','));
    }
  }
  downloadCsv(header + '\n' + rows.join('\n'), 'low-stock-export.csv');
}

onMounted(() => {
  previousFocus = document.activeElement;
  document.addEventListener('keydown', onKeydown);
  thresholdInput.value?.focus();
});

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
  previousFocus?.focus?.();
});
</script>

<template>
  <Teleport to="body">
    <div class="ls-backdrop" @click.self="emit('close')">
      <div ref="dialogRef" class="ls-dialog" role="dialog" aria-label="Low Stock Export">
        <div class="ls-header">
          <div class="ls-title">Low Stock Export</div>
          <button class="ls-close" type="button" aria-label="Close" @click="emit('close')">&#x2715;</button>
        </div>

        <div class="ls-threshold-row">
          <label class="ls-label" for="ls-threshold">Threshold</label>
          <input
            id="ls-threshold"
            ref="thresholdInput"
            v-model="threshold"
            class="ls-input"
            type="number"
            inputmode="numeric"
            min="0"
            placeholder="e.g. 5"
            @keydown.enter.prevent="search"
          />
          <button class="btn ls-search-btn" type="button" :disabled="isLoading" @click="search">
            {{ isLoading ? 'Searching...' : 'Search' }}
          </button>
        </div>

        <p v-if="error" class="ls-error" role="alert">{{ error }}</p>

        <div v-if="hasSearched && !isLoading && !error" class="ls-results">
          <p v-if="totalVariations === 0" class="ls-empty">No variations at or below this threshold.</p>

          <template v-else>
            <p class="ls-count">{{ totalVariations }} variation{{ totalVariations !== 1 ? 's' : '' }} at or below {{ threshold }}</p>

            <div class="ls-list">
              <div v-for="group in results" :key="group.itemId" class="ls-group">
                <div class="ls-group-header">
                  <span class="ls-item-name">{{ group.itemName }}</span>
                  <span class="ls-bin-name">{{ group.binName }}</span>
                </div>
                <div v-for="v in group.variations" :key="v.id" class="ls-variation">
                  <span class="ls-sku">{{ v.sku || '—' }}</span>
                  <span class="ls-qty" :class="{ zero: (v.quantity ?? 0) === 0 }">{{ v.quantity ?? 0 }}</span>
                  <span class="ls-price">${{ (v.price ?? 0).toFixed(2) }}</span>
                  <span class="ls-detail">{{ [v.color, v.style, v.size].filter(Boolean).join(' · ') || '—' }}</span>
                </div>
              </div>
            </div>
          </template>
        </div>

        <div class="ls-actions">
          <button class="btn secondary" type="button" @click="emit('close')">Cancel</button>
          <button
            class="btn"
            type="button"
            :disabled="totalVariations === 0"
            @click="exportCsv"
          >Export CSV</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ls-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(8, 33, 69, 0.45);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.ls-dialog {
  width: 100%;
  max-width: 580px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  padding: 28px 28px 24px;
  border-radius: 20px;
  background: #ffffff;
  box-shadow: 0 24px 60px rgba(14, 42, 99, 0.18);
}

.ls-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.ls-title {
  font-size: 20px;
  font-weight: 800;
  color: #082145;
}

.ls-close {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: rgba(18, 58, 138, 0.06);
  color: #4b5563;
  font-size: 14px;
  cursor: pointer;
}

.ls-threshold-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.ls-label {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: #0b63d6;
  white-space: nowrap;
}

.ls-input {
  flex: 1;
  min-height: 42px;
  padding: 8px 14px;
  border: 1px solid rgba(18, 58, 138, 0.2);
  border-radius: 12px;
  background: rgba(244, 248, 255, 0.96);
  color: #082145;
  font: inherit;
  font-size: 15px;
}

.ls-input:focus {
  outline: 2px solid rgba(14, 165, 255, 0.22);
  border-color: rgba(37, 99, 235, 0.28);
}

.ls-search-btn {
  white-space: nowrap;
}

.ls-error {
  margin: 0 0 12px;
  color: #b91c1c;
  font-size: 14px;
  font-weight: 600;
}

.ls-results {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 16px;
}

.ls-empty {
  color: #6b7280;
  font-size: 14px;
  text-align: center;
  padding: 24px 0;
}

.ls-count {
  font-size: 14px;
  font-weight: 600;
  color: #082145;
  margin: 0 0 12px;
}

.ls-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ls-group {
  border: 1px solid rgba(18, 58, 138, 0.1);
  border-radius: 12px;
  overflow: hidden;
}

.ls-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(244, 248, 255, 0.96);
  border-bottom: 1px solid rgba(18, 58, 138, 0.08);
}

.ls-item-name {
  font-weight: 700;
  color: #082145;
  font-size: 14px;
}

.ls-bin-name {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  background: rgba(18, 58, 138, 0.06);
  padding: 2px 8px;
  border-radius: 6px;
}

.ls-variation {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  font-size: 13px;
  border-bottom: 1px solid rgba(18, 58, 138, 0.05);
}

.ls-variation:last-child {
  border-bottom: 0;
}

.ls-sku {
  font-weight: 600;
  color: #082145;
  min-width: 120px;
}

.ls-qty {
  font-weight: 700;
  color: #b45309;
  min-width: 30px;
  text-align: right;
}

.ls-qty.zero {
  color: #b91c1c;
}

.ls-price {
  color: #4b5563;
  min-width: 60px;
  text-align: right;
}

.ls-detail {
  color: #6b7280;
  flex: 1;
  text-align: right;
}

.ls-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
