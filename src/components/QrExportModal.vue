<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import QRCode from 'qrcode';
import { hasSupabaseConfig, supabase } from '../lib/supabase';

const emit = defineEmits(['close']);

const isLoading = ref(true);
const error = ref('');
const bins = ref([]);
const isPrinting = ref(false);
const dialogRef = ref(null);
let previousFocus = null;

const selectedCount = computed(() => bins.value.filter(b => b.selected).length);
const allSelected = computed(() => bins.value.length > 0 && selectedCount.value === bins.value.length);
const noneSelected = computed(() => selectedCount.value === 0);

function toggleAll() {
  const newVal = !allSelected.value;
  bins.value.forEach(b => (b.selected = newVal));
}

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

async function fetchBins() {
  isLoading.value = true;
  error.value = '';
  try {
    if (!hasSupabaseConfig || !supabase) throw new Error('Supabase not configured.');

    const { data, error: fetchErr } = await supabase
      .from('bins')
      .select('id, name')
      .order('name', { ascending: true });

    if (fetchErr) throw fetchErr;
    if (!data || !data.length) throw new Error('No bins found.');

    bins.value = data.map(b => ({ ...b, selected: true }));
  } catch (err) {
    error.value = err?.message || String(err);
  } finally {
    isLoading.value = false;
  }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function doPrint() {
  isPrinting.value = true;
  error.value = '';
  try {
    const selected = bins.value.filter(b => b.selected);

    // Generate QR data URLs for all selected bins
    const qrEntries = await Promise.all(
      selected.map(async (bin) => {
        const dataUrl = await QRCode.toDataURL(String(bin.id || ''), {
          width: 280,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
        return { name: bin.name || bin.id, id: bin.id, dataUrl };
      })
    );

    // Build pages of 6
    const ITEMS_PER_PAGE = 6;
    const pages = [];
    for (let i = 0; i < qrEntries.length; i += ITEMS_PER_PAGE) {
      pages.push(qrEntries.slice(i, i + ITEMS_PER_PAGE));
    }

    // Build HTML for print
    let labelsHtml = '';
    for (let p = 0; p < pages.length; p++) {
      const page = pages[p];
      labelsHtml += `<div class="page${p > 0 ? ' page-break' : ''}">`;
      labelsHtml += '<div class="grid">';
      for (const entry of page) {
        labelsHtml += `
          <div class="label">
            <div class="label-border">
              <div class="title">${escapeHtml(entry.name)}</div>
              <img src="${entry.dataUrl}" alt="QR code for ${escapeHtml(entry.id)}" />
            </div>
          </div>`;
      }
      // Pad with empty cells so grid stays 2-col
      const remainder = page.length % 2;
      if (remainder) {
        labelsHtml += '<div class="label"></div>';
      }
      labelsHtml += '</div></div>';
    }

    const printWindow = window.open('', '_blank', 'width=800,height=1000');
    if (!printWindow) throw new Error('Popup blocked. Allow popups to print QR labels.');

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Bin QR Labels</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @page { margin: 0.4in; }
            body {
              font-family: Arial, sans-serif;
              color: #0f172a;
            }
            .page {
              width: 100%;
              height: 100vh;
              display: flex;
              align-items: stretch;
            }
            .page-break { page-break-before: always; }
            .grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              grid-template-rows: 1fr 1fr 1fr;
              gap: 12px;
              width: 100%;
              height: 100%;
            }
            .label {
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 0;
            }
            .label-border {
              border: 2px solid #0f172a;
              border-radius: 12px;
              padding: 12px 16px;
              text-align: center;
              width: 100%;
              height: 100%;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 10px;
            }
            .title {
              font-size: 28px;
              font-weight: 800;
              line-height: 1.1;
              word-break: break-word;
            }
            img {
              width: 180px;
              height: 180px;
              display: block;
            }
          </style>
        </head>
        <body>
          ${labelsHtml}
          <script>
            window.onload = function () { window.print(); };
          <\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
    emit('close');
  } catch (err) {
    error.value = err?.message || String(err);
  } finally {
    isPrinting.value = false;
  }
}

onMounted(() => {
  previousFocus = document.activeElement;
  document.addEventListener('keydown', onKeydown);
  fetchBins();
});

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
  previousFocus?.focus?.();
});
</script>

<template>
  <Teleport to="body">
    <div class="qr-backdrop" @click.self="emit('close')">
      <div ref="dialogRef" class="qr-dialog" role="dialog" aria-label="Print QR Labels">
        <!-- Header -->
        <div class="qr-header">
          <div class="qr-title">Print QR Labels</div>
          <button class="qr-close-btn" type="button" aria-label="Close" @click="emit('close')">&#x2715;</button>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="qr-loading">Loading bins...</div>

        <!-- Error -->
        <div v-else-if="error && bins.length === 0" class="qr-error">{{ error }}</div>

        <!-- Content -->
        <template v-else>
          <!-- Toolbar -->
          <div class="qr-toolbar">
            <label class="qr-select-all">
              <input type="checkbox" :checked="allSelected" :indeterminate="!allSelected && !noneSelected" @change="toggleAll" />
              Select All
            </label>
            <span class="qr-count">{{ selectedCount }} of {{ bins.length }} bins selected</span>
          </div>

          <!-- Bin list -->
          <div class="qr-list">
            <div
              v-for="bin in bins"
              :key="bin.id"
              class="qr-item"
              :class="{ deselected: !bin.selected }"
              @click="bin.selected = !bin.selected"
            >
              <input type="checkbox" :checked="bin.selected" @click.stop @change="bin.selected = !bin.selected" />
              <span class="qr-item-name">{{ bin.name || bin.id }}</span>
            </div>
          </div>

          <!-- Error during print -->
          <div v-if="error" class="qr-error">{{ error }}</div>
        </template>

        <!-- Footer -->
        <div class="qr-actions">
          <span class="qr-hint">6 labels per page &middot; 2 columns</span>
          <div class="qr-buttons">
            <button class="btn secondary" type="button" @click="emit('close')">Cancel</button>
            <button
              class="btn"
              type="button"
              :disabled="noneSelected || isLoading || isPrinting"
              @click="doPrint"
            >
              {{ isPrinting ? 'Preparing...' : `Print ${selectedCount} Label${selectedCount !== 1 ? 's' : ''}` }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.qr-backdrop {
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

.qr-dialog {
  width: 100%;
  max-width: 520px;
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

.qr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.qr-title {
  font-size: 20px;
  font-weight: 800;
  color: #082145;
}

.qr-close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: #4b5563;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}

.qr-close-btn:hover {
  background: rgba(14, 42, 99, 0.06);
}

.qr-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(244, 248, 255, 0.96);
  border-radius: 10px;
}

.qr-select-all {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: #0f172a;
  cursor: pointer;
}

.qr-select-all input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.qr-count {
  font-size: 13px;
  color: #4b5563;
}

.qr-list {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.qr-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid rgba(18, 58, 138, 0.08);
  border-radius: 10px;
  cursor: pointer;
  user-select: none;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.qr-item:hover {
  background: rgba(244, 248, 255, 0.7);
}

.qr-item.deselected {
  opacity: 0.5;
}

.qr-item input {
  width: 16px;
  height: 16px;
  cursor: pointer;
  flex-shrink: 0;
}

.qr-item-name {
  font-weight: 700;
  font-size: 15px;
  color: #0f172a;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qr-loading {
  text-align: center;
  padding: 32px;
  color: #4b5563;
  font-size: 15px;
}

.qr-error {
  color: #b91c1c;
  font-size: 14px;
  font-weight: 600;
}

.qr-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
}

.qr-hint {
  font-size: 12px;
  color: #6b7280;
}

.qr-buttons {
  display: flex;
  gap: 10px;
}

@media (max-width: 900px) {
  .qr-dialog {
    max-width: 100%;
    padding: 20px;
  }

  .qr-toolbar {
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }

  .qr-actions {
    flex-direction: column;
    gap: 10px;
    align-items: stretch;
  }

  .qr-hint {
    text-align: center;
  }

  .qr-buttons {
    justify-content: flex-end;
  }
}
</style>
