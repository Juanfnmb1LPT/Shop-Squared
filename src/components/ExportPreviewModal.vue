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
const items = ref([]);
const expandedIds = ref(new Set());
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

const selectedCount = computed(() => items.value.filter(i => i.selected).length);
const allSelected = computed(() => items.value.length > 0 && selectedCount.value === items.value.length);
const noneSelected = computed(() => selectedCount.value === 0);

function toggleAll() {
  const newVal = !allSelected.value;
  items.value.forEach(i => (i.selected = newVal));
}

function toggleExpand(itemId) {
  if (expandedIds.value.has(itemId)) {
    expandedIds.value.delete(itemId);
  } else {
    expandedIds.value.add(itemId);
  }
}

async function fetchData() {
  isLoading.value = true;
  error.value = '';
  try {
    if (!hasSupabaseConfig || !supabase) {
      throw new Error('Supabase not configured.');
    }

    const { data, error: fetchError } = await supabase
      .from('item_variations')
      .select('*')
      .order('item_id', { ascending: true })
      .order('item_name', { ascending: true });

    if (fetchError) throw fetchError;
    if (!data || !data.length) throw new Error('No items found.');

    // Group by item_id
    const groups = {};
    for (const v of data) {
      const id = v.item_id ?? 'no-id';
      if (!groups[id]) {
        groups[id] = {
          itemId: id,
          itemName: (v.item_name || '').trim(),
          selected: true,
          variations: [],
        };
      }
      groups[id].variations.push(v);
    }

    // Sort variations within each group
    for (const g of Object.values(groups)) {
      g.variations.sort((a, b) => {
        const sa = sizeIndex(a.size);
        const sb = sizeIndex(b.size);
        if (sa !== sb) return sa - sb;
        return (a.color || '').localeCompare(b.color || '');
      });
    }

    items.value = Object.values(groups).sort((a, b) =>
      a.itemName.localeCompare(b.itemName)
    );
  } catch (err) {
    error.value = err?.message || String(err);
  } finally {
    isLoading.value = false;
  }
}

function buildItemCell(d, item) {
  const { Paragraph, TextRun, TableCell, WidthType, AlignmentType, BorderStyle } = d;

  // Collect unique styles and colors
  const styles = [...new Set(item.variations.map(v => (v.style || '').trim()).filter(Boolean))];
  const colors = [...new Set(item.variations.map(v => (v.color || '').trim()).filter(Boolean))];
  const sizes = item.variations.map(v => (v.size || '').trim()).filter(Boolean);
  const price = item.variations[0]?.price;

  const paragraphs = [];

  // Style line (MENS | WOMENS)
  if (styles.length) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: styles.join(' | ').toUpperCase(), bold: true, size: 18, font: 'Arial' })],
    }));
  }

  // Item name
  paragraphs.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [new TextRun({ text: (item.itemName || 'Unnamed').toUpperCase(), bold: true, size: 22, font: 'Arial' })],
  }));

  // Color(s)
  if (colors.length) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: colors.join(' / ').toUpperCase(), size: 18, font: 'Arial', color: '555555' })],
    }));
  }

  // Price
  if (price != null) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: `$${Number(price).toFixed(0)}`, bold: true, size: 36, font: 'Arial' })],
    }));
  }

  // Sizes
  if (sizes.length) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [new TextRun({ text: sizes.join('  '), bold: true, size: 18, font: 'Arial' })],
    }));
  }

  return new TableCell({
    width: { size: 25, type: WidthType.PERCENTAGE },
    margins: { top: 120, bottom: 120, left: 100, right: 100 },
    verticalAlign: 'center',
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

    const selected = items.value.filter(i => i.selected);
    const COLS = 4;
    const ROWS_PER_PAGE = 3;
    const ITEMS_PER_PAGE = COLS * ROWS_PER_PAGE; // 12

    // Split items into pages of 12
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
    // First page has title (~600 twips), so rows are shorter on page 1
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

      // Pad with empty rows so every page has exactly 3 rows
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
        <div v-if="isLoading" class="export-loading">Loading items...</div>

        <!-- Error -->
        <div v-else-if="error && items.length === 0" class="export-error">{{ error }}</div>

        <!-- Content -->
        <template v-else>
          <!-- Toolbar -->
          <div class="export-toolbar">
            <label class="export-select-all">
              <input type="checkbox" :checked="allSelected" :indeterminate="!allSelected && !noneSelected" @change="toggleAll" />
              Select All
            </label>
            <span class="export-count">{{ selectedCount }} of {{ items.length }} items selected</span>
          </div>

          <!-- Item list -->
          <div class="export-list">
            <div v-for="item in items" :key="item.itemId" class="export-item" :class="{ deselected: !item.selected }">
              <div class="export-item-row" @click="item.selected = !item.selected">
                <input type="checkbox" :checked="item.selected" @click.stop @change="item.selected = !item.selected" />
                <span class="export-item-name">{{ item.itemName || 'Unnamed Item' }}</span>
                <span class="export-item-badge">{{ item.variations.length }} variation{{ item.variations.length !== 1 ? 's' : '' }}</span>
                <button
                  class="export-expand-btn"
                  type="button"
                  :aria-label="expandedIds.has(item.itemId) ? 'Collapse' : 'Expand'"
                  @click.stop="toggleExpand(item.itemId)"
                >
                  {{ expandedIds.has(item.itemId) ? '&#x25B2;' : '&#x25BC;' }}
                </button>
              </div>

              <!-- Expanded variation detail -->
              <div v-if="expandedIds.has(item.itemId)" class="export-variations">
                <table>
                  <thead>
                    <tr>
                      <th>Size</th>
                      <th>Color</th>
                      <th>Style</th>
                      <th>SKU</th>
                      <th>Qty</th>
                      <th>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="v in item.variations" :key="v.id">
                      <td>{{ v.size || '—' }}</td>
                      <td>{{ v.color || '—' }}</td>
                      <td>{{ v.style || '—' }}</td>
                      <td>{{ v.sku || '—' }}</td>
                      <td>{{ v.quantity ?? '—' }}</td>
                      <td>{{ v.price != null ? `$${Number(v.price).toFixed(2)}` : '—' }}</td>
                    </tr>
                  </tbody>
                </table>
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
            {{ isExporting ? 'Exporting...' : `Export ${selectedCount} Item${selectedCount !== 1 ? 's' : ''}` }}
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
  max-width: 720px;
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
  gap: 6px;
}

.export-item {
  border: 1px solid rgba(18, 58, 138, 0.08);
  border-radius: 10px;
  overflow: hidden;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.export-item.deselected {
  opacity: 0.5;
}

.export-item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  cursor: pointer;
  user-select: none;
}

.export-item-row:hover {
  background: rgba(244, 248, 255, 0.7);
}

.export-item-row input {
  width: 16px;
  height: 16px;
  cursor: pointer;
  flex-shrink: 0;
}

.export-item-name {
  font-weight: 700;
  font-size: 15px;
  color: #0f172a;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.export-item-badge {
  font-size: 12px;
  color: #4b5563;
  background: rgba(14, 42, 99, 0.06);
  padding: 2px 8px;
  border-radius: 12px;
  white-space: nowrap;
}

.export-expand-btn {
  background: none;
  border: none;
  font-size: 12px;
  color: #4b5563;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
}

.export-expand-btn:hover {
  background: rgba(14, 42, 99, 0.06);
}

.export-variations {
  padding: 0 14px 12px;
}

.export-variations table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.export-variations th {
  text-align: left;
  padding: 6px 8px;
  font-weight: 600;
  color: #4b5563;
  border-bottom: 1px solid rgba(18, 58, 138, 0.1);
  font-size: 12px;
}

.export-variations td {
  padding: 5px 8px;
  color: #0f172a;
  border-bottom: 1px solid rgba(18, 58, 138, 0.04);
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
