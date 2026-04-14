<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
// Lazy-loaded at export time to keep initial bundle small
let docxModule = null;
let fileSaverModule = null;

async function loadDocxDeps() {
  if (!docxModule) docxModule = await import('docx');
  if (!fileSaverModule) fileSaverModule = await import('file-saver');
  return { docx: docxModule, fileSaver: fileSaverModule };
}

const emit = defineEmits(['close']);

const isLoading = ref(true);
const error = ref('');
const binGroups = ref([]);
const expandedBins = ref(new Set());
const isExporting = ref(false);
const dialogRef = ref(null);
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

const sizeOrder = { XS: 0, S: 1, M: 2, L: 3, XL: 4, '2XL': 5, '3XL': 6 };

function sizeIndex(size) {
  const s = (size || '').toString().trim().toUpperCase();
  return sizeOrder[s] ?? 999;
}

function sortBins(list) {
  return [...list].sort((a, b) => {
    const aHasNum = a.binNumber != null;
    const bHasNum = b.binNumber != null;
    if (aHasNum && bHasNum) return a.binNumber - b.binNumber;
    if (aHasNum && !bHasNum) return -1;
    if (!aHasNum && bHasNum) return 1;
    return (a.binName || '').localeCompare(b.binName || '');
  });
}

const selectedItemCount = computed(() => {
  let count = 0;
  for (const bin of binGroups.value) {
    for (const item of bin.items) {
      if (item.selected) count++;
    }
  }
  return count;
});

const totalItemCount = computed(() => {
  let count = 0;
  for (const bin of binGroups.value) {
    count += bin.items.length;
  }
  return count;
});

const allSelected = computed(() => totalItemCount.value > 0 && selectedItemCount.value === totalItemCount.value);
const noneSelected = computed(() => selectedItemCount.value === 0);

function toggleAll() {
  const newVal = !allSelected.value;
  for (const bin of binGroups.value) {
    bin.selected = newVal;
    for (const item of bin.items) {
      item.selected = newVal;
    }
  }
}

function toggleBin(bin) {
  bin.selected = !bin.selected;
  for (const item of bin.items) {
    item.selected = bin.selected;
  }
}

function toggleItem(bin, item) {
  item.selected = !item.selected;
  // Update bin selected state based on items
  bin.selected = bin.items.some(i => i.selected);
}

function toggleExpanded(binId) {
  const next = new Set(expandedBins.value);
  if (next.has(binId)) {
    next.delete(binId);
  } else {
    next.add(binId);
  }
  expandedBins.value = next;
}

async function fetchData() {
  isLoading.value = true;
  error.value = '';
  try {
    if (!hasSupabaseConfig || !supabase) {
      throw new Error('Supabase not configured.');
    }

    const [{ data: binData, error: binErr }, { data: itemData, error: itemErr }, { data: varData, error: varErr }] = await Promise.all([
      supabase.from('bins').select('id, name, number'),
      supabase.from('items').select('id, name, bin_id').order('name', { ascending: true }),
      supabase.from('item_variations').select('*').order('item_id', { ascending: true }),
    ]);

    if (binErr) throw binErr;
    if (itemErr) throw itemErr;
    if (varErr) throw varErr;
    if (!binData || !binData.length) throw new Error('No bins found.');

    // Group variations by item_id
    const varsByItem = (varData || []).reduce((map, v) => {
      if (!map[v.item_id]) map[v.item_id] = [];
      map[v.item_id].push(v);
      return map;
    }, {});

    // Sort variations within each group
    for (const vars of Object.values(varsByItem)) {
      vars.sort((a, b) => {
        const sa = sizeIndex(a.size);
        const sb = sizeIndex(b.size);
        if (sa !== sb) return sa - sb;
        return (a.color || '').localeCompare(b.color || '');
      });
    }

    // Build bin number lookup
    const binNumberMap = {};
    for (const b of binData) {
      binNumberMap[b.id] = b.number;
    }

    // Group items by bin_id
    const itemsByBin = (itemData || []).reduce((map, item) => {
      if (!map[item.bin_id]) map[item.bin_id] = [];
      map[item.bin_id].push({
        itemId: item.id,
        itemName: (item.name || '').trim(),
        binNumber: binNumberMap[item.bin_id] ?? null,
        selected: true,
        variations: varsByItem[item.id] || [],
      });
      return map;
    }, {});

    binGroups.value = sortBins(binData.map(b => ({
      binId: b.id,
      binName: (b.name || '').trim(),
      binNumber: b.number,
      selected: true,
      items: itemsByBin[b.id] || [],
    })));

    // Auto-expand all bins
    expandedBins.value = new Set(binGroups.value.map(b => b.binId));
  } catch (err) {
    error.value = err?.message || String(err);
  } finally {
    isLoading.value = false;
  }
}

function buildItemCell(d, item) {
  const { Paragraph, TextRun, TableCell, WidthType, AlignmentType, BorderStyle } = d;

  const styles = [...new Set(item.variations.map(v => (v.style || '').trim()).filter(Boolean))];
  const colors = [...new Set(item.variations.map(v => (v.color || '').trim()).filter(Boolean))];
  const sizes = item.variations.map(v => (v.size || '').trim()).filter(Boolean);
  const price = item.variations[0]?.price;

  const paragraphs = [];

  if (styles.length) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: styles.join(' | ').toUpperCase(), bold: true, size: 18, font: 'Arial' })],
    }));
  }

  paragraphs.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [new TextRun({ text: (item.itemName || 'Unnamed').toUpperCase(), bold: true, size: 22, font: 'Arial' })],
  }));

  if (colors.length) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: colors.join(' / ').toUpperCase(), size: 18, font: 'Arial', color: '555555' })],
    }));
  }

  if (price != null) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: `$${Number(price).toFixed(0)}`, bold: true, size: 36, font: 'Arial' })],
    }));
  }

  if (sizes.length) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [new TextRun({ text: sizes.join('  '), bold: true, size: 18, font: 'Arial' })],
    }));
  }

  if (item.binNumber != null) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 20 },
      children: [new TextRun({ text: `Bin #${item.binNumber}`, size: 16, font: 'Arial', color: '777777' })],
    }));
  }

  return new TableCell({
    width: { size: 25, type: WidthType.PERCENTAGE },
    margins: { top: 120, bottom: 120, left: 100, right: 100 },
    verticalAlign: 'bottom',
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    },
    children: paragraphs,
  });
}

function buildEmptyCell(d) {
  const { Paragraph, TableCell, WidthType, BorderStyle } = d;
  return new TableCell({
    width: { size: 25, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
    },
    children: [new Paragraph('')],
  });
}

async function doExport() {
  isExporting.value = true;
  error.value = '';
  try {
    const { docx: d, fileSaver } = await loadDocxDeps();
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, WidthType, AlignmentType, HeightRule, TableLayoutType } = d;

    const selected = [];
    for (const bin of binGroups.value) {
      for (const item of bin.items) {
        if (item.selected) selected.push(item);
      }
    }

    const COLS = 4;
    const ROWS_PER_PAGE = 3;
    const ITEMS_PER_PAGE = COLS * ROWS_PER_PAGE; // 12

    const pages = [];
    for (let i = 0; i < selected.length; i += ITEMS_PER_PAGE) {
      pages.push(selected.slice(i, i + ITEMS_PER_PAGE));
    }

    const pageProps = {
      page: {
        margin: { top: 400, bottom: 400, left: 500, right: 500 },
      },
    };

    // US Letter = 15840 twips tall, margins 400+400 = 800, usable = 15040
    const PAGE_HEIGHT = 15840;
    const MARGIN_V = 800;
    const TITLE_HEIGHT = 600;
    const usableFirst = PAGE_HEIGHT - MARGIN_V - TITLE_HEIGHT;
    const usableRest = PAGE_HEIGHT - MARGIN_V;
    const rowHeightFirst = Math.floor(usableFirst / ROWS_PER_PAGE);
    const rowHeightRest = Math.floor(usableRest / ROWS_PER_PAGE);

    const sections = pages.map((pageItems, pageIndex) => {
      const isFirst = pageIndex === 0;
      const rowH = isFirst ? rowHeightFirst : rowHeightRest;

      const tableRows = [];
      for (let i = 0; i < pageItems.length; i += COLS) {
        const cells = [];
        for (let j = 0; j < COLS; j++) {
          const item = pageItems[i + j];
          cells.push(item ? buildItemCell(d, item) : buildEmptyCell(d));
        }
        tableRows.push(new TableRow({
          height: { value: rowH, rule: HeightRule.EXACT },
          children: cells,
        }));
      }

      while (tableRows.length < ROWS_PER_PAGE) {
        const emptyCells = [];
        for (let j = 0; j < COLS; j++) emptyCells.push(buildEmptyCell(d));
        tableRows.push(new TableRow({
          height: { value: rowH, rule: HeightRule.EXACT },
          children: emptyCells,
        }));
      }

      const table = new Table({
        layout: TableLayoutType.FIXED,
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: tableRows,
      });

      const children = [];
      if (isFirst) {
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          children: [new TextRun({ text: 'INVENTORY PRICE SHEET', bold: true, size: 32, font: 'Arial' })],
        }));
      }
      children.push(table);

      return { properties: pageProps, children };
    });

    const doc = new Document({ sections });

    const blob = await Packer.toBlob(doc);
    const today = new Date().toISOString().slice(0, 10);
    fileSaver.saveAs(blob, `inventory_export_${today}.docx`);
    emit('close');
  } catch (err) {
    error.value = err?.message || String(err);
  } finally {
    isExporting.value = false;
  }
}

onMounted(() => {
  previousFocus = document.activeElement;
  document.addEventListener('keydown', onKeydown);
  fetchData();
});

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
  previousFocus?.focus?.();
});
</script>

<template>
  <Teleport to="body">
    <div class="export-backdrop" @click.self="emit('close')">
      <div ref="dialogRef" class="export-dialog" role="dialog" aria-label="Print Inventory">
        <!-- Header -->
        <div class="export-header">
          <div class="export-title">Print Inventory</div>
          <button class="export-close-btn" type="button" aria-label="Close" @click="emit('close')">&#x2715;</button>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="export-loading">Loading inventory...</div>

        <!-- Error -->
        <div v-else-if="error && binGroups.length === 0" class="export-error">{{ error }}</div>

        <!-- Content -->
        <template v-else>
          <!-- Toolbar -->
          <div class="export-toolbar">
            <label class="export-select-all">
              <input type="checkbox" :checked="allSelected" :indeterminate="!allSelected && !noneSelected" @change="toggleAll" />
              Select All
            </label>
            <span class="export-count">{{ selectedItemCount }} of {{ totalItemCount }} items selected</span>
          </div>

          <!-- Bin list with item dropdowns -->
          <div class="export-list">
            <div
              v-for="bin in binGroups"
              :key="bin.binId"
              class="export-bin-group"
              :class="{ deselected: !bin.selected }"
            >
              <div class="export-bin-header" @click="toggleExpanded(bin.binId)">
                <input type="checkbox" :checked="bin.selected" @click.stop @change="toggleBin(bin)" />
                <svg
                  class="export-chevron"
                  :class="{ expanded: expandedBins.has(bin.binId) }"
                  width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                >
                  <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span class="export-bin-name">{{ bin.binName || bin.binId }}<span v-if="bin.binNumber != null" class="export-bin-number"> #{{ bin.binNumber }}</span></span>
                <span class="export-bin-count">{{ bin.items.length }} item{{ bin.items.length !== 1 ? 's' : '' }}</span>
              </div>

              <div v-if="expandedBins.has(bin.binId)" class="export-bin-items">
                <div v-if="!bin.items.length" class="export-item-row export-empty-bin">Empty bin</div>
                <div
                  v-for="item in bin.items"
                  :key="item.itemId"
                  class="export-item-row"
                  :class="{ deselected: !item.selected }"
                  @click="toggleItem(bin, item)"
                >
                  <input type="checkbox" :checked="item.selected" @click.stop @change="toggleItem(bin, item)" />
                  <span class="export-item-name">{{ item.itemName || 'Unnamed Item' }}</span>
                  <span class="export-item-badge">{{ item.variations.length }} var{{ item.variations.length !== 1 ? 's' : '' }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Error during export -->
          <div v-if="error" class="export-error">{{ error }}</div>
        </template>

        <!-- Footer -->
        <div class="export-actions">
          <button class="btn secondary" type="button" @click="emit('close')">Cancel</button>
          <button
            class="btn"
            type="button"
            :disabled="noneSelected || isLoading || isExporting"
            @click="doExport"
          >
            {{ isExporting ? 'Exporting...' : `Export ${selectedItemCount} Item${selectedItemCount !== 1 ? 's' : ''}` }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.export-backdrop {
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

.export-dialog {
  width: 100%;
  max-width: 600px;
  padding: 28px;
  border-radius: 20px;
  background: #ffffff;
  box-shadow: 0 24px 60px rgba(14, 42, 99, 0.18);
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 85vh;
  overflow: hidden;
}

.export-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.export-title {
  font-size: 20px;
  font-weight: 800;
  color: #082145;
}

.export-close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: #4b5563;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}

.export-close-btn:hover {
  background: rgba(14, 42, 99, 0.06);
}

.export-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(244, 248, 255, 0.96);
  border-radius: 10px;
}

.export-select-all {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: #0f172a;
  cursor: pointer;
}

.export-select-all input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.export-count {
  font-size: 13px;
  color: #4b5563;
}

.export-list {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.export-bin-group {
  border: 1px solid rgba(18, 58, 138, 0.08);
  border-radius: 10px;
  overflow: hidden;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.export-bin-group.deselected {
  opacity: 0.5;
}

.export-bin-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
}

.export-bin-header:hover {
  background: rgba(244, 248, 255, 0.7);
}

.export-bin-header input {
  width: 16px;
  height: 16px;
  cursor: pointer;
  flex-shrink: 0;
}

.export-chevron {
  flex-shrink: 0;
  color: #4b5563;
  transition: transform 0.15s;
}

.export-chevron.expanded {
  transform: rotate(90deg);
}

.export-bin-name {
  font-weight: 700;
  font-size: 15px;
  color: #0f172a;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.export-bin-number {
  color: #4b5563;
  font-weight: 600;
}

.export-bin-count {
  font-size: 12px;
  color: #6b7280;
  flex-shrink: 0;
}

.export-bin-items {
  border-top: 1px solid rgba(18, 58, 138, 0.06);
}

.export-item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px 8px 48px;
  cursor: pointer;
  user-select: none;
  transition: opacity 0.15s;
}

.export-item-row:hover {
  background: rgba(244, 248, 255, 0.5);
}

.export-item-row.deselected {
  opacity: 0.5;
}

.export-item-row input {
  width: 15px;
  height: 15px;
  cursor: pointer;
  flex-shrink: 0;
}

.export-item-name {
  font-weight: 600;
  font-size: 14px;
  color: #0f172a;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.export-item-badge {
  font-size: 11px;
  color: #6b7280;
  flex-shrink: 0;
}

.export-empty-bin {
  color: #9ca3af;
  font-style: italic;
  font-size: 13px;
  cursor: default;
}

.export-loading {
  text-align: center;
  padding: 32px;
  color: #4b5563;
  font-size: 15px;
}

.export-error {
  color: #b91c1c;
  font-size: 14px;
  font-weight: 600;
}

.export-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 4px;
}

@media (max-width: 900px) {
  .export-dialog {
    max-width: 100%;
    padding: 20px;
  }

  .export-toolbar {
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }
}
</style>
