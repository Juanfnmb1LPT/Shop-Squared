<script setup>
import { Html5Qrcode } from "html5-qrcode";
import QRCode from "qrcode";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import { createBin, updateBinName, deleteBin } from "../lib/binCrud";
import BinFormModal from "../components/BinFormModal.vue";
import ConfirmModal from "../components/ConfirmModal.vue";

const router = useRouter();
const searchTerm = ref(sessionStorage.getItem("inventory-search") || "");

watch(searchTerm, (value) => {
  if (value.trim()) {
    sessionStorage.setItem("inventory-search", value.trim());
  } else {
    sessionStorage.removeItem("inventory-search");
  }
});

const bins = ref([]);
const totalItems = ref(null);
const totalVariations = ref(null);
const isLoading = ref(true);
const errorMessage = ref("");
const isScanning = ref(false);
const scannerError = ref("");
const qrPrintError = ref("");
const printingBinId = ref("");

let scannerInstance = null;
let hasHandledDecode = false;

const showCreateModal = ref(false);
const showEditModal = ref(false);
const editingBin = ref(null);
const isSaving = ref(false);
const modalError = ref("");
const showDeleteConfirm = ref(false);
const deletingBin = ref(null);
const isDeleting = ref(false);
const deleteError = ref("");
const deleteConfirmMessage = ref("");

const selectMode = ref(false);
const selectedBinIds = ref(new Set());
const showMassDeleteConfirm = ref(false);
const isMassDeleting = ref(false);
const massDeleteError = ref("");
const massDeleteProgress = ref("");

function normalizeQuantityTotal(value, fallback = 0) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

async function fetchBinsWithTotals() {
  const withTotalsResult = await supabase
    .from("bins")
    .select("id, name, number, total_quantity")
    .order("name", { ascending: true });

  if (
    withTotalsResult.error &&
    /total_quantity|column/i.test(withTotalsResult.error.message || "")
  ) {
    const fallbackResult = await supabase
      .from("bins")
      .select("id, name, number")
      .order("name", { ascending: true });

    return { ...fallbackResult, includesTotals: false };
  }

  return { ...withTotalsResult, includesTotals: true };
}

async function fetchItemsWithTotals() {
  const withTotalsResult = await supabase
    .from("items")
    .select("id, name, bin_id, total_quantity")
    .order("name", { ascending: true });

  if (
    withTotalsResult.error &&
    /total_quantity|column/i.test(withTotalsResult.error.message || "")
  ) {
    const fallbackResult = await supabase
      .from("items")
      .select("id, name, bin_id")
      .order("name", { ascending: true });

    return { ...fallbackResult, includesTotals: false };
  }

  return { ...withTotalsResult, includesTotals: true };
}

function normalizeValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

async function stopScan() {
  if (!scannerInstance) {
    isScanning.value = false;
    hasHandledDecode = false;
    return;
  }

  try {
    await scannerInstance.stop();
  } catch {
    // Ignore stop errors when scanner is already inactive.
  }

  try {
    await scannerInstance.clear();
  } catch {
    // Ignore clear errors if scanner did not fully initialize.
  }

  scannerInstance = null;
  isScanning.value = false;
  hasHandledDecode = false;
}

async function handleDecodedText(decodedText) {
  if (hasHandledDecode) {
    return;
  }

  hasHandledDecode = true;
  const scannedValue = String(decodedText || "").trim();

  if (!scannedValue) {
    hasHandledDecode = false;
    return;
  }

  searchTerm.value = scannedValue;
  await stopScan();

  const matchedBin = bins.value.find(
    (bin) => normalizeValue(bin.id) === normalizeValue(scannedValue) || normalizeValue(bin.name) === normalizeValue(scannedValue)
  );

  if (matchedBin) {
    router.push(`/search-inventory/${matchedBin.id}`);
  }
}

async function startScan() {
  scannerError.value = "";

  if (isScanning.value) {
    return;
  }

  if (!window.isSecureContext) {
    scannerError.value = "Camera scanning requires HTTPS or localhost.";
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    scannerError.value =
      "This browser does not support camera access for scanning.";
    return;
  }

  const scannerTargetId = "qr-reader";
  isScanning.value = true;
  hasHandledDecode = false;
  await nextTick();

  scannerInstance = new Html5Qrcode(scannerTargetId);

  try {
    await scannerInstance.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 260, height: 260 },
      },
      (decodedText) => {
        handleDecodedText(decodedText);
      }
    );
  } catch (error) {
    scannerError.value = error?.message || "Unable to start camera scanning.";
    await stopScan();
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function printBinQr(bin) {
  qrPrintError.value = "";
  printingBinId.value = String(bin.id || "");

  try {
    const qrDataUrl = await QRCode.toDataURL(String(bin.id || ""), {
      width: 320,
      margin: 1,
      errorCorrectionLevel: "M",
    });

    const printWindow = window.open("", "_blank", "width=540,height=700");

    if (!printWindow) {
      throw new Error("Popup blocked. Allow popups to print QR labels.");
    }

    const safeName = escapeHtml(bin.name || bin.id);
    const safeId = escapeHtml(bin.id);

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Bin QR - ${safeId}</title>
          <style>
            body {
              margin: 0;
              padding: 24px;
              font-family: Arial, sans-serif;
              color: #0f172a;
            }
            .label {
              border: 2px solid #0f172a;
              border-radius: 12px;
              max-width: 420px;
              margin: 0 auto;
              padding: 20px;
              text-align: center;
            }
            .title {
              font-size: 48px;
              font-weight: 800;
              line-height: 1.05;
              margin-bottom: 18px;
            }
            img {
              width: 300px;
              height: 300px;
              display: block;
              margin: 0 auto;
            }
          </style>
        </head>
        <body>
          <main class="label">
            <div class="title">${safeName}</div>
            <img src="${qrDataUrl}" alt="QR code for ${safeId}" />
          </main>
          <script>
            window.onload = function () {
              window.print();
            };
          <\/script>
        </body>
      </html>
    `);

    printWindow.document.close();
  } catch (error) {
    qrPrintError.value =
      error?.message || "Unable to generate printable QR label.";
  } finally {
    printingBinId.value = "";
  }
}

const abbreviations = {
  // Colors
  "blk":   "black",
  "blck":  "black",
  "blu":   "blue",
  "gry":   "grey",
  "grn":   "green",
  "wht":   "white",
  "gld":   "gold",
  // Products
  "wtr":   "water",
  "bott":  "bottle",
  "btl":   "bottle",
  "mtn":   "mountain",
  "tmblr": "tumbler",
  "qzip":  "quarter zip",
  "hood":  "hoodie",
  "asstd": "assorted",
  "prep":  "prepper",
  // Places / brands
  "wlst":  "wallstreet",
  "wst":   "wallstreet",
};

const sanitize = (str) =>
  str.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();

const expand = (word) => {
  const mapped = abbreviations[word];
  return mapped ? [word, mapped] : [word];
};

function sortBins(list) {
  return [...list].sort((a, b) => {
    const aHasNum = a.number != null;
    const bHasNum = b.number != null;
    if (aHasNum && bHasNum) return a.number - b.number;
    if (aHasNum && !bHasNum) return -1;
    if (!aHasNum && bHasNum) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });
}

const filteredBins = computed(() => {
  const query = sanitize(searchTerm.value);

  if (!query) {
    return sortBins(bins.value);
  }

  const queryWords = query.split(" ");

  const filtered = bins.value.filter((bin) => {
    const haystack = sanitize(
      [bin.id, bin.name, bin.number != null ? String(bin.number) : '', ...bin.items.map((item) => item.name)]
        .filter(Boolean)
        .join(" "),
    );
    const haystackWords = haystack.split(" ");
    return queryWords.every((qw) => {
      const variants = expand(qw);
      return haystackWords.some((hw) =>
        variants.some((v) => hw.startsWith(v)),
      );
    });
  });

  return sortBins(filtered);
});

const grandTotalQuantity = computed(() => {
  return bins.value.reduce(
    (sum, bin) => sum + normalizeQuantityTotal(bin.total_quantity),
    0,
  );
});

function openCreate() {
  modalError.value = "";
  showCreateModal.value = true;
}

function openEdit(bin) {
  editingBin.value = bin;
  modalError.value = "";
  showEditModal.value = true;
}

function onEditBinDelete() {
  const bin = editingBin.value;
  showEditModal.value = false;
  editingBin.value = null;
  modalError.value = "";
  if (bin) {
    openDelete(bin);
  }
}

function openDelete(bin) {
  deletingBin.value = bin;
  deleteError.value = "";
  deleteConfirmMessage.value = `Delete "${bin.name}" and all items/variations in it? This action cannot be undone.`;
  showDeleteConfirm.value = true;
}

async function onCreateSubmit({ name, number }) {
  isSaving.value = true;
  modalError.value = "";
  const result = await createBin(name, number);
  isSaving.value = false;
  if (!result.ok) {
    modalError.value = result.error;
    return;
  }
  showCreateModal.value = false;
  await loadBins();
}

async function onEditSubmit({ name, number }) {
  isSaving.value = true;
  modalError.value = "";
  const result = await updateBinName(editingBin.value.id, name, number);
  isSaving.value = false;
  if (!result.ok) {
    modalError.value = result.error;
    return;
  }
  showEditModal.value = false;
  editingBin.value = null;
  await loadBins();
}

async function onDeleteConfirm() {
  deleteError.value = "";
  isDeleting.value = true;
  const deleteResult = await deleteBin(deletingBin.value.id);
  isDeleting.value = false;
  if (!deleteResult.ok) {
    deleteError.value = deleteResult.error;
    return;
  }
  showDeleteConfirm.value = false;
  deletingBin.value = null;
  deleteConfirmMessage.value = "";
  await loadBins();
}

function toggleSelectMode() {
  selectMode.value = !selectMode.value;
  if (!selectMode.value) {
    selectedBinIds.value = new Set();
  }
}

function toggleBinSelection(binId) {
  const next = new Set(selectedBinIds.value);
  if (next.has(binId)) {
    next.delete(binId);
  } else {
    next.add(binId);
  }
  selectedBinIds.value = next;
}

function selectAllVisible() {
  const next = new Set(selectedBinIds.value);
  for (const bin of filteredBins.value) {
    next.add(bin.id);
  }
  selectedBinIds.value = next;
}

function deselectAll() {
  selectedBinIds.value = new Set();
}

const massDeleteMessage = computed(() => {
  const selected = bins.value.filter((b) => selectedBinIds.value.has(b.id));
  const lines = selected.map((bin) => {
    const count = bin.items.length;
    return `• <b>${bin.name}</b> and its <b>${count} item${count === 1 ? '' : 's'}</b> will be completely deleted`;
  });
  return `Are you sure?\n\n${lines.join("\n")}`;
});

function openMassDelete() {
  massDeleteError.value = "";
  massDeleteProgress.value = "";
  showMassDeleteConfirm.value = true;
}

async function onMassDeleteConfirm() {
  const ids = [...selectedBinIds.value];
  if (!ids.length) return;

  isMassDeleting.value = true;
  massDeleteError.value = "";

  for (let i = 0; i < ids.length; i++) {
    massDeleteProgress.value = `Deleting ${i + 1} of ${ids.length}...`;
    const result = await deleteBin(ids[i]);
    if (!result.ok) {
      massDeleteError.value = `Failed on bin ${i + 1} of ${ids.length}: ${result.error}`;
      isMassDeleting.value = false;
      massDeleteProgress.value = "";
      await loadBins();
      selectedBinIds.value = new Set(ids.slice(i));
      return;
    }
  }

  isMassDeleting.value = false;
  massDeleteProgress.value = "";
  showMassDeleteConfirm.value = false;
  selectedBinIds.value = new Set();
  selectMode.value = false;
  await loadBins();
}

async function loadBins() {
  if (!hasSupabaseConfig || !supabase) {
    errorMessage.value =
      "Add VITE_SUPABASE_ANON_KEY to load bins from Supabase.";
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = "";

  const [
    { data: binData, error: binError, includesTotals: binsIncludeTotals },
    { data: itemData, error: itemError, includesTotals: itemsIncludeTotals },
  ] = await Promise.all([fetchBinsWithTotals(), fetchItemsWithTotals()]);

  if (binError || itemError) {
    errorMessage.value =
      binError?.message || itemError?.message || "Unable to load bins.";
    bins.value = [];
  } else {
    let variationTotalsByItemId = {};

    if (!binsIncludeTotals || !itemsIncludeTotals) {
      const { data: variationData, error: variationError } = await supabase
        .from("item_variations")
        .select("item_id, quantity");

      if (variationError) {
        errorMessage.value = variationError.message;
        bins.value = [];
        isLoading.value = false;
        return;
      }

      variationTotalsByItemId = (variationData || []).reduce((groupedTotals, variation) => {
        const previousTotal = groupedTotals[variation.item_id] || 0;
        groupedTotals[variation.item_id] =
          previousTotal + normalizeQuantityTotal(variation.quantity);
        return groupedTotals;
      }, {});
    }

    const normalizedItems = (itemData || []).map((item) => ({
      ...item,
      total_quantity: itemsIncludeTotals
        ? normalizeQuantityTotal(item.total_quantity)
        : normalizeQuantityTotal(variationTotalsByItemId[item.id]),
    }));

    const itemsByBinId = normalizedItems.reduce((groupedItems, item) => {
      if (!groupedItems[item.bin_id]) {
        groupedItems[item.bin_id] = [];
      }

      groupedItems[item.bin_id].push(item);
      return groupedItems;
    }, {});

    bins.value = (binData || []).map((bin) => ({
      ...bin,
      items: itemsByBinId[bin.id] || [],
    }));

    // Fetch total variations count and unique items count
    try {
      const { error: countError, count } = await supabase
        .from('item_variations')
        .select('id', { count: 'exact', head: true });
      totalVariations.value = countError ? null : (count ?? 0);

      const { data: itemData, error: itemError } = await supabase
        .from('item_variations')
        .select('item_id');
      if (itemError) {
        totalItems.value = null;
      } else {
        const uniqueItems = new Set(itemData.map((r) => r.item_id));
        totalItems.value = uniqueItems.size;
      }
    } catch (e) {
      totalVariations.value = null;
      totalItems.value = null;
    }
    bins.value = (binData || []).map((bin) => {
      const groupedItems = itemsByBinId[bin.id] || [];
      const computedBinTotal = groupedItems.reduce(
        (runningTotal, item) => runningTotal + normalizeQuantityTotal(item.total_quantity),
        0,
      );

      return {
        ...bin,
        total_quantity: binsIncludeTotals
          ? normalizeQuantityTotal(bin.total_quantity)
          : computedBinTotal,
        items: groupedItems,
      };
    });
  }

  isLoading.value = false;
}

onMounted(loadBins);
onUnmounted(stopScan);
</script>

<template>
  <div class="card spacious tool-card inventory-card reveal-fade-up">
    <div class="hero inventory-hero">
      <div class="hero-title reveal-fade-up">Search Inventory</div>
      <div class="hero-sub reveal-fade-up reveal-delay-1">
        Search bins by ID or name from Supabase inventory data.
      </div>
      <div class="hero-actions reveal-fade-up reveal-delay-2">
        <button class="btn" type="button" @click="openCreate">+ Create Bin</button>
        <button
          class="btn"
          :class="{ 'btn-select-active': selectMode }"
          type="button"
          @click="toggleSelectMode"
        >
          {{ selectMode ? 'Cancel Select' : 'Select Bins' }}
        </button>
      </div>
    </div>
<div class="inventory-total">Total Items: {{ totalItems === null ? '—' : totalItems }}</div>
    <div class="inventory-total">Total Variations: {{ totalVariations === null ? '—' : totalVariations }}</div>
    <div class="inventory-total">Total Quantity: {{ grandTotalQuantity }}</div>
    <div class="inventory-search-panel reveal-fade-up reveal-delay-1">
      <label class="inventory-search-label" for="inventory-search-input"
        >Search bins</label
      >

      <div class="inventory-search-row">
        <input
          id="inventory-search-input"
          v-model="searchTerm"
          class="inventory-search-input"
          type="search"
          placeholder="Try bin-1 or Bin 1"
        />

        <button
          class="inventory-scan-button"
          type="button"
          :aria-label="isScanning ? 'Stop QR scanner' : 'Start QR scanner'"
          @click="isScanning ? stopScan() : startScan()"
        >
          <span class="inventory-scan-icon" aria-hidden="true">CAM</span>
          <span>{{ isScanning ? "Stop" : "Scan" }}</span>
        </button>
      </div>

      <p class="inventory-search-help">
        Scan a printed bin QR code to jump directly to that bin.
      </p>

      <p v-if="scannerError" class="inventory-scan-error">{{ scannerError }}</p>
      <p v-if="qrPrintError" class="inventory-scan-error">{{ qrPrintError }}</p>

      <div v-if="isScanning" class="inventory-scanner-panel">
        <div id="qr-reader" class="inventory-scanner-reader"></div>
      </div>
    </div>

    <div v-if="selectMode" class="inventory-select-toolbar">
      <div class="select-toolbar-info">
        {{ selectedBinIds.size }} bin{{ selectedBinIds.size === 1 ? '' : 's' }} selected
      </div>
      <div class="select-toolbar-actions">
        <button class="btn btn-sm" type="button" @click="selectAllVisible">Select All</button>
        <button class="btn btn-sm secondary" type="button" @click="deselectAll" :disabled="!selectedBinIds.size">Deselect All</button>
        <button class="btn btn-sm btn-danger" type="button" @click="openMassDelete" :disabled="!selectedBinIds.size">
          Delete Selected ({{ selectedBinIds.size }})
        </button>
      </div>
    </div>

    <div class="inventory-grid reveal-fade-up reveal-delay-2">
      <div v-if="isLoading" class="inventory-empty-state">Loading bins...</div>

      <div v-else-if="errorMessage" class="inventory-empty-state">
        {{ errorMessage }}
      </div>

      <article
        v-for="bin in filteredBins"
        :key="bin.id"
        class="inventory-bin-card"
        :class="{ 'inventory-bin-selected': selectMode && selectedBinIds.has(bin.id) }"
        @click="selectMode ? toggleBinSelection(bin.id) : null"
      >
        <div v-if="selectMode" class="inventory-bin-checkbox" @click.stop="toggleBinSelection(bin.id)">
          <div class="checkbox-box" :class="{ checked: selectedBinIds.has(bin.id) }">
            <svg v-if="selectedBinIds.has(bin.id)" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>
        <router-link v-if="!selectMode" class="inventory-bin-full" :to="`/search-inventory/${bin.id}`">
          <div class="inventory-bin-link">
            <div class="inventory-bin-name">{{ bin.name }}<span v-if="bin.number != null" class="inventory-bin-number"> #{{ bin.number }}</span></div>
            <div class="inventory-bin-total">Total quantity: {{ bin.total_quantity ?? 0 }}</div>

            <div class="inventory-bin-summary">Items: {{ bin.items.length }}</div>

            <ul class="inventory-preview-list">
              <li v-for="item in bin.items.slice(0, 5)" :key="item.id">{{ item.name }}</li>
              <li v-if="bin.items.length > 5" class="inventory-preview-more">
                + {{ bin.items.length - 5 }} more item{{ bin.items.length - 5 === 1 ? '' : 's' }}
              </li>
              <li v-if="!bin.items.length" class="inventory-preview-empty">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="vertical-align: -2px; margin-right: 4px;">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Empty bin — tap to add items
              </li>
            </ul>
          </div>
        </router-link>
        <div v-if="!selectMode" class="inventory-bin-actions">
          <button
            class="inventory-print-button"
            type="button"
            :disabled="printingBinId === String(bin.id)"
            @click="printBinQr(bin)"
          >
            {{
              printingBinId === String(bin.id)
                ? "Preparing label..."
                : "Print QR Label"
            }}
          </button>
          <button class="inventory-print-button" type="button" @click="openEdit(bin)">
            Edit
          </button>
          <button class="inventory-delete-btn" type="button" @click="openDelete(bin)" :aria-label="`Delete ${bin.name}`" title="Delete bin">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M3 6h18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M10 11v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M14 11v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div v-else class="inventory-bin-full">
          <div class="inventory-bin-link">
            <div class="inventory-bin-name">{{ bin.name }}<span v-if="bin.number != null" class="inventory-bin-number"> #{{ bin.number }}</span></div>
            <div class="inventory-bin-total">Total quantity: {{ bin.total_quantity ?? 0 }}</div>
            <div class="inventory-bin-summary">Items: {{ bin.items.length }}</div>
          </div>
        </div>
      </article>

      <div
        v-if="!isLoading && !errorMessage && !filteredBins.length"
        class="inventory-empty-state"
      >
        <div class="empty-state-content">
          <svg class="empty-state-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path v-if="searchTerm.trim()" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path v-else d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline v-if="!searchTerm.trim()" points="3.27 6.96 12 12.01 20.73 6.96" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <line v-if="!searchTerm.trim()" x1="12" y1="22.08" x2="12" y2="12" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div class="empty-state-title">{{ searchTerm.trim() ? 'No results found' : 'No bins yet' }}</div>
          <div class="empty-state-sub">{{ searchTerm.trim() ? `Nothing matched "${searchTerm.trim()}". Try a different search.` : 'Create your first bin to start organizing inventory.' }}</div>
          <button v-if="!searchTerm.trim()" class="btn" type="button" @click="openCreate">+ Create Bin</button>
        </div>
      </div>
    </div>

    <BinFormModal
      v-if="showCreateModal"
      mode="create"
      :is-saving="isSaving"
      :error-message="modalError"
      @submit="onCreateSubmit"
      @cancel="showCreateModal = false; modalError = ''"
    />

    <BinFormModal
      v-if="showEditModal"
      mode="edit"
      :initial-bin="editingBin"
      :is-saving="isSaving"
      :error-message="modalError"
      @submit="onEditSubmit"
      @cancel="showEditModal = false; editingBin = null; modalError = ''"
      @delete="onEditBinDelete"
    />

    <ConfirmModal
      v-if="showDeleteConfirm"
      title="Delete Bin"
      :message="deleteConfirmMessage"
      confirm-label="Delete"
      :is-loading="isDeleting"
      :error-message="deleteError"
      @confirm="onDeleteConfirm"
      @cancel="showDeleteConfirm = false; deletingBin = null; deleteError = ''; deleteConfirmMessage = ''"
    />

  </div>
</template>

<style scoped>
.inventory-card {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.inventory-search-panel {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 18px;
  border: 1px solid rgba(18, 58, 138, 0.1);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 14px 30px rgba(14, 42, 99, 0.06);
}

.inventory-search-label {
  display: block;
  margin-bottom: 10px;
  text-align: left;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #0b63d6;
}

.inventory-search-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.inventory-total {  
  text-align: center;
  font-weight: bold;
}

/* reduce space between the total line and the hero action buttons */
.inventory-total {
  margin-top: 6px;
}

.inventory-search-input {
  flex: 1;
  min-height: 50px;
  padding: 12px 16px;
  border: 1px solid rgba(18, 58, 138, 0.12);
  border-radius: 14px;
  background: rgba(244, 248, 255, 0.96);
  color: #082145;
  font: inherit;
}

.inventory-scan-button {
  min-height: 50px;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(18, 58, 138, 0.18);
  border-radius: 14px;
  background: rgba(233, 241, 255, 0.9);
  color: #0a2b67;
  font-weight: 700;
  cursor: pointer;
}

.inventory-scan-icon {
  font-size: 11px;
  letter-spacing: 0.06em;
}

.inventory-scan-button:hover {
  border-color: rgba(37, 99, 235, 0.32);
  background: rgba(215, 230, 255, 0.95);
}

.inventory-search-help {
  margin: 10px 0 0;
  text-align: left;
  color: #4b5563;
  font-size: 14px;
}

.inventory-hero {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.inventory-hero .hero-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  align-items: center;
}

@media (max-width: 640px) {
  .inventory-hero .hero-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
}

.inventory-scan-error {
  margin: 10px 0 0;
  text-align: left;
  color: #b91c1c;
  font-weight: 600;
}

.inventory-scanner-panel {
  margin-top: 14px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(18, 58, 138, 0.12);
  background: rgba(244, 248, 255, 0.78);
}

.inventory-scanner-reader {
  width: 100%;
}

:deep(#qr-reader) {
  border: 0 !important;
}

:deep(#qr-reader__dashboard) {
  padding: 8px 0 0;
}

:deep(#qr-reader__status_span) {
  color: #082145;
  font-weight: 600;
}

.inventory-search-input:focus {
  outline: 2px solid rgba(14, 165, 255, 0.22);
  border-color: rgba(37, 99, 235, 0.28);
}

.inventory-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.inventory-bin-card,
.inventory-empty-state {
  min-height: 180px;
  padding: 22px 20px;
  border-radius: 18px;
  border: 1px solid rgba(11, 99, 214, 0.06);
  background: linear-gradient(180deg, #ffffff 0%, #f6fbff 100%);
  box-shadow: 0 12px 22px rgba(14, 42, 99, 0.035);
}

.inventory-bin-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, background-color 0.16s ease;
}

.inventory-bin-link {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: inherit;
  text-decoration: none;
  position: relative;
}

.inventory-bin-full {
  display: flex;
  flex-direction: column;
  flex: 1;
  color: inherit;
  text-decoration: none;
}

/* apply the hover effect to the whole card */
.inventory-bin-card:hover {
  transform: translateY(-4px);
  border-color: rgba(37, 99, 235, 0.12);
  background: rgba(237, 245, 252, 0.95);
  box-shadow: 0 14px 28px rgba(14, 42, 99, 0.06);
}

/* removed overlay; using full-card router-link instead */

.inventory-bin-actions {
  margin-top: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-start;
  position: relative;
  z-index: 2;
  padding-top: 12px;
}

.inventory-delete-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  min-width: 40px;
  padding: 0;
  border-radius: 12px;
  border: 1px solid rgba(220, 38, 38, 0.2);
  background: rgba(255, 238, 238, 0.95);
  color: #991b1b;
  font-weight: 700;
  cursor: pointer;
}

.inventory-delete-btn:hover {
  background: rgba(255, 220, 220, 0.95);
  border-color: rgba(220, 38, 38, 0.35);
}

.inventory-print-button {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid rgba(18, 58, 138, 0.2);
  background: rgba(230, 240, 255, 0.95);
  color: #0a2b67;
  font-weight: 700;
  cursor: pointer;
}

.inventory-print-button:disabled {
  opacity: 0.7;
  cursor: wait;
}

.inventory-bin-name {
  font-size: 22px;
  font-weight: 800;
  color: #082145;
}

.inventory-bin-number {
  font-weight: 600;
  color: #4b5563;
  font-size: 0.85em;
}

.inventory-bin-summary {
  color: #4b5563;
}

.inventory-bin-total {
  font-weight: 700;
  color: #0f1f46;
}

.inventory-preview-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 8px;
  color: #0f1f46;
  text-align: left;
}

.inventory-preview-more {
  color: #0b63d6;
  font-weight: 600;
  font-size: 13px;
  list-style: none;
  margin-left: -18px;
}

.inventory-preview-empty {
  color: #6b7280;
}

.inventory-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  grid-column: 1 / -1;
  color: #4b5563;
  text-align: center;
  padding: 48px 24px;
}

.empty-state-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.empty-state-icon {
  margin-bottom: 4px;
  opacity: 0.7;
}

.empty-state-title {
  font-size: 17px;
  font-weight: 700;
  color: #082145;
}

.empty-state-sub {
  font-size: 14px;
  color: #6b7280;
  max-width: 300px;
  line-height: 1.5;
}

.btn-select-active {
  background: linear-gradient(90deg, #f59e0b, #d97706);
}

.btn-select-active:hover {
  box-shadow: 0 18px 40px rgba(245, 158, 11, 0.2);
}

.inventory-select-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  border-radius: 14px;
  border: 1px solid rgba(245, 158, 11, 0.25);
  background: rgba(255, 251, 235, 0.95);
  flex-wrap: wrap;
}

.select-toolbar-info {
  font-weight: 700;
  color: #92400e;
  font-size: 15px;
}

.select-toolbar-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-sm {
  min-height: 36px;
  padding: 0 14px;
  font-size: 13px;
  border-radius: 10px;
}

.btn-danger {
  background: linear-gradient(90deg, #dc2626, #ef4444);
  color: #fff;
}

.btn-danger:hover {
  box-shadow: 0 12px 30px rgba(220, 38, 38, 0.2);
}

.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.inventory-bin-card.inventory-bin-selected,
.inventory-bin-card[class*="inventory-bin-selected"] {
  border-color: rgba(37, 99, 235, 0.35) !important;
  background: rgba(219, 234, 254, 0.7) !important;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
  cursor: pointer;
}

.inventory-bin-checkbox {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 3;
  cursor: pointer;
}

.checkbox-box {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 2px solid rgba(18, 58, 138, 0.25);
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.checkbox-box.checked {
  background: #2563eb;
  border-color: #2563eb;
}

.checkbox-box:hover {
  border-color: #2563eb;
}

@media (max-width: 900px) {
  .inventory-search-row {
    flex-direction: column;
    align-items: stretch;
  }

  .inventory-scan-button {
    justify-content: center;
  }

  .inventory-grid {
    grid-template-columns: 1fr;
  }

  .inventory-select-toolbar {
    flex-direction: column;
    align-items: stretch;
    text-align: center;
  }

  .select-toolbar-actions {
    justify-content: center;
  }
}
</style>