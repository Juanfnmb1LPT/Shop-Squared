<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import { updateBinName, deleteBin } from '../lib/binCrud';
import { createItem, updateItem, deleteItem } from '../lib/itemCrud';
import { createVariation, updateVariation, deleteVariation } from '../lib/variationCrud';
import BinFormModal from '../components/BinFormModal.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import ItemFormModal from '../components/ItemFormModal.vue';
import VariationFormModal from '../components/VariationFormModal.vue';

const route = useRoute();
const router = useRouter();
const bin = ref(null);
const items = ref([]);
const availableBins = ref([]);
const variationsByItemId = ref({});
const expandedItems = ref({});
const isLoading = ref(true);
const errorMessage = ref('');

const showEditModal = ref(false);
const isSaving = ref(false);
const modalError = ref('');
const showDeleteConfirm = ref(false);
const isDeleting = ref(false);
const deleteError = ref('');
const deleteConfirmMessage = ref('');

const showCreateItemModal = ref(false);
const showEditItemModal = ref(false);
const editingItem = ref(null);
const isItemSaving = ref(false);
const itemModalError = ref('');
const showDeleteItemConfirm = ref(false);
const deletingItem = ref(null);
const isItemDeleting = ref(false);
const itemDeleteError = ref('');
const itemDeleteMessage = ref('');

const showCreateVariationModal = ref(false);
const showEditVariationModal = ref(false);
const selectedVariationItem = ref(null);
const editingVariation = ref(null);
const isVariationSaving = ref(false);
const variationModalError = ref('');
const showDeleteVariationConfirm = ref(false);
const deletingVariation = ref(null);
const deletingVariationItem = ref(null);
const isVariationDeleting = ref(false);
const variationDeleteError = ref('');
const variationDeleteMessage = ref('');

const inlineEdit = ref(null); // { variationId, field, value }
const inlineSavingId = ref(null);
const inlineSaveError = ref('');

const itemSelectMode = ref(false);
const selectedItemIds = ref(new Set());
const showMassItemDeleteConfirm = ref(false);
const isMassItemDeleting = ref(false);
const massItemDeleteError = ref('');
const massItemDeleteProgress = ref('');

const binId = computed(() => route.params.id);

const sizeOrder = { XS: 0, S: 1, M: 2, L: 3, XL: 4, '2XL': 5, '3XL': 6 };

function sortVariations(variations) {
  return [...variations].sort((a, b) => {
    const aSize = a.size || '';
    const bSize = b.size || '';
    const aSizeIndex = sizeOrder[aSize] ?? 999;
    const bSizeIndex = sizeOrder[bSize] ?? 999;

    if (aSizeIndex !== bSizeIndex) {
      return aSizeIndex - bSizeIndex;
    }

    const aSku = a.sku || '';
    const bSku = b.sku || '';
    return aSku.localeCompare(bSku);
  });
}

function normalizeQuantityTotal(value, fallback = 0) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

async function fetchBinRecord() {
  const withTotalsResult = await supabase
    .from('bins')
    .select('id, name, total_quantity')
    .eq('id', binId.value)
    .maybeSingle();

  if (withTotalsResult.error && /total_quantity|column/i.test(withTotalsResult.error.message || '')) {
    return supabase.from('bins').select('id, name').eq('id', binId.value).maybeSingle();
  }

  return withTotalsResult;
}

async function fetchItemsForBin() {
  const withTotalsResult = await supabase
    .from('items')
    .select('id, name, bin_id, base_sku, total_quantity')
    .eq('bin_id', binId.value)
    .order('name', { ascending: true });

  if (withTotalsResult.error && /total_quantity|column/i.test(withTotalsResult.error.message || '')) {
    return supabase
      .from('items')
      .select('id, name, bin_id, base_sku')
      .eq('bin_id', binId.value)
      .order('name', { ascending: true });
  }

  return withTotalsResult;
}

async function loadBinDetail(options = {}) {
  const expandedItemIds = Array.isArray(options.expandedItemIds) ? options.expandedItemIds : [];

  if (!hasSupabaseConfig || !supabase) {
    errorMessage.value = 'Add VITE_SUPABASE_ANON_KEY to load bin data from Supabase.';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  const [
    { data: binOptionsData, error: binOptionsError },
    { data: binData, error: binError },
    { data: itemData, error: itemError }
  ] = await Promise.all([
    supabase.from('bins').select('id, name').order('name', { ascending: true }),
    fetchBinRecord(),
    fetchItemsForBin(),
  ]);

  if (binOptionsError || binError || itemError) {
    errorMessage.value = binOptionsError?.message || binError?.message || itemError?.message || 'Unable to load bin data.';
    bin.value = null;
    items.value = [];
    availableBins.value = [];
    variationsByItemId.value = {};
    expandedItems.value = {};
  } else {
    bin.value = binData ? { ...binData } : null;
    items.value = (itemData || []).map((item) => ({
      ...item,
      total_quantity: normalizeQuantityTotal(item.total_quantity),
    }));
    availableBins.value = binOptionsData || [];

    const itemIds = (itemData || []).map((item) => item.id);

    if (itemIds.length) {
      const { data: variationData, error: variationError } = await supabase
        .from('item_variations')
        .select('id, item_id, item_name, quantity, price, sku, color, style, size')
        .in('item_id', itemIds);

      if (variationError) {
        errorMessage.value = variationError.message;
        variationsByItemId.value = {};
      } else {
        variationsByItemId.value = (variationData || []).reduce((groupedVariations, variation) => {
          if (!groupedVariations[variation.item_id]) {
            groupedVariations[variation.item_id] = [];
          }

          groupedVariations[variation.item_id].push(variation);
          return groupedVariations;
        }, {});

        const itemTotalsById = (variationData || []).reduce((groupedTotals, variation) => {
          const previousTotal = groupedTotals[variation.item_id] || 0;
          groupedTotals[variation.item_id] = previousTotal + normalizeQuantityTotal(variation.quantity);
          return groupedTotals;
        }, {});

        items.value = items.value.map((item) => ({
          ...item,
          total_quantity: itemTotalsById[item.id] ?? normalizeQuantityTotal(item.total_quantity),
        }));
      }

        Object.keys(variationsByItemId.value).forEach((itemId) => {
          variationsByItemId.value[itemId] = sortVariations(variationsByItemId.value[itemId]);
        });
    } else {
      variationsByItemId.value = {};
    }

    const computedBinTotal = items.value.reduce(
      (runningTotal, item) => runningTotal + normalizeQuantityTotal(item.total_quantity),
      0,
    );

    if (bin.value) {
      bin.value = {
        ...bin.value,
        total_quantity: normalizeQuantityTotal(bin.value.total_quantity, computedBinTotal),
      };
    }

    expandedItems.value = expandedItemIds.reduce((groupedExpandedItems, itemId) => {
      groupedExpandedItems[itemId] = true;
      return groupedExpandedItems;
    }, {});
  }

  isLoading.value = false;
}

function toggleItem(itemId) {
  expandedItems.value = {
    ...expandedItems.value,
    [itemId]: !expandedItems.value[itemId]
  };
}

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toFixed(2);
}

function itemVariations(itemId) {
  return variationsByItemId.value[itemId] || [];
}

function formatVariationPrice(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return '—';
  }

  return `$${numericValue.toFixed(2)}`;
}

function openCreateItem() {
  itemModalError.value = '';
  editingItem.value = null;
  showCreateItemModal.value = true;
}

function openEditItem(item) {
  itemModalError.value = '';
  editingItem.value = item;
  showEditItemModal.value = true;
}

function openDeleteItem(item) {
  itemDeleteError.value = '';
  deletingItem.value = item;
  itemDeleteMessage.value = `Delete "${item.name}" and all variations in it? This action cannot be undone.`;
  showDeleteItemConfirm.value = true;
}

function closeItemModal() {
  showCreateItemModal.value = false;
  showEditItemModal.value = false;
  editingItem.value = null;
  itemModalError.value = '';
}

function closeItemDeleteConfirm() {
  showDeleteItemConfirm.value = false;
  deletingItem.value = null;
  itemDeleteError.value = '';
  itemDeleteMessage.value = '';
}

async function onCreateItemSubmit({ name, binId: targetBinId, sizes, baseSku, price, color, style }) {
  isItemSaving.value = true;
  itemModalError.value = '';
  const result = await createItem({ name, binId: targetBinId, baseSku });

  if (!result.ok) {
    isItemSaving.value = false;
    itemModalError.value = result.error;
    return;
  }

  if (sizes?.length && result.data?.id) {
    await Promise.all(
      sizes.map((size) =>
        createVariation({
          itemId: result.data.id,
          itemName: name,
          sku: baseSku ? `${baseSku}-${size}` : '',
          quantity: 0,
          price: price ?? 0,
          color: color || '',
          style: style || null,
          size,
        })
      )
    );
  }

  isItemSaving.value = false;
  closeItemModal();
  await loadBinDetail({
    expandedItemIds: targetBinId === binId.value && result.data?.id ? [result.data.id] : [],
  });
}

async function onEditItemSubmit({ name, binId: targetBinId, baseSku }) {
  isItemSaving.value = true;
  itemModalError.value = '';
  const result = await updateItem({ id: editingItem.value?.id, name, binId: targetBinId, baseSku });
  isItemSaving.value = false;

  if (!result.ok) {
    itemModalError.value = result.error;
    return;
  }

  closeItemModal();
  await loadBinDetail({
    expandedItemIds: targetBinId === binId.value && result.data?.id ? [result.data.id] : [],
  });
}

async function onDeleteItemConfirm() {
  itemDeleteError.value = '';
  isItemDeleting.value = true;

  const deleteResult = await deleteItem(deletingItem.value?.id);
  isItemDeleting.value = false;

  if (!deleteResult.ok) {
    itemDeleteError.value = deleteResult.error;
    return;
  }

  closeItemDeleteConfirm();
  await loadBinDetail();
}

function openCreateVariation(item) {
  variationModalError.value = '';
  selectedVariationItem.value = item;
  editingVariation.value = null;
  showCreateVariationModal.value = true;
}

function openEditVariation(item, variation) {
  variationModalError.value = '';
  selectedVariationItem.value = item;
  editingVariation.value = variation;
  showEditVariationModal.value = true;
}

function openDeleteVariation(item, variation) {
  variationDeleteError.value = '';
  deletingVariation.value = variation;
  deletingVariationItem.value = item;
  variationDeleteMessage.value = `Delete this variation from "${item.name}"? This action cannot be undone.`;
  showDeleteVariationConfirm.value = true;
}

function closeVariationModal() {
  showCreateVariationModal.value = false;
  showEditVariationModal.value = false;
  selectedVariationItem.value = null;
  editingVariation.value = null;
  variationModalError.value = '';
}

function closeVariationDeleteConfirm() {
  showDeleteVariationConfirm.value = false;
  deletingVariation.value = null;
  deletingVariationItem.value = null;
  variationDeleteError.value = '';
  variationDeleteMessage.value = '';
}

async function onCreateVariationSubmit(values) {
  isVariationSaving.value = true;
  variationModalError.value = '';

  const result = await createVariation({
    itemId: selectedVariationItem.value?.id,
    itemName: selectedVariationItem.value?.name,
    ...values,
  });

  isVariationSaving.value = false;

  if (!result.ok) {
    variationModalError.value = result.error;
    return;
  }

  const expandedItemId = selectedVariationItem.value?.id;
  closeVariationModal();
  await loadBinDetail({ expandedItemIds: expandedItemId ? [expandedItemId] : [] });
}

async function onEditVariationSubmit(values) {
  isVariationSaving.value = true;
  variationModalError.value = '';

  const result = await updateVariation({
    id: editingVariation.value?.id,
    itemId: selectedVariationItem.value?.id,
    itemName: selectedVariationItem.value?.name,
    ...values,
  });

  isVariationSaving.value = false;

  if (!result.ok) {
    variationModalError.value = result.error;
    return;
  }

  const expandedItemId = selectedVariationItem.value?.id;
  closeVariationModal();
  await loadBinDetail({ expandedItemIds: expandedItemId ? [expandedItemId] : [] });
}

async function onDeleteVariationConfirm() {
  variationDeleteError.value = '';
  isVariationDeleting.value = true;

  const deleteResult = await deleteVariation(deletingVariation.value?.id);
  isVariationDeleting.value = false;

  if (!deleteResult.ok) {
    variationDeleteError.value = deleteResult.error;
    return;
  }

  const expandedItemId = deletingVariationItem.value?.id;
  closeVariationDeleteConfirm();
  await loadBinDetail({ expandedItemIds: expandedItemId ? [expandedItemId] : [] });
}

function startInlineEdit(variation, field) {
  inlineSaveError.value = '';
  inlineEdit.value = {
    variationId: variation.id,
    field,
    value: field === 'quantity' ? String(variation.quantity ?? 0) : String(variation.price ?? 0),
  };
}

function cancelInlineEdit() {
  inlineEdit.value = null;
  inlineSaveError.value = '';
}

async function commitInlineEdit(variation, item) {
  if (!inlineEdit.value || inlineEdit.value.variationId !== variation.id) return;

  const { field, value } = inlineEdit.value;
  inlineEdit.value = null; // clear immediately so blur doesn't re-trigger

  const numValue = Number(value);
  if (Number.isNaN(numValue)) {
    inlineSaveError.value = `Invalid ${field}.`;
    return;
  }

  inlineSavingId.value = variation.id;
  inlineSaveError.value = '';

  const result = await updateVariation({
    id: variation.id,
    itemId: item.id,
    itemName: item.name,
    sku: variation.sku,
    quantity: field === 'quantity' ? numValue : variation.quantity,
    price: field === 'price' ? numValue : variation.price,
    color: variation.color,
    style: variation.style,
    size: variation.size,
  });

  inlineSavingId.value = null;

  if (!result.ok) {
    inlineSaveError.value = result.error;
    return;
  }

  // Patch local state — no full reload needed
  const varList = variationsByItemId.value[item.id];
  if (varList) {
    const idx = varList.findIndex((v) => v.id === variation.id);
    if (idx !== -1) {
      varList[idx] = { ...varList[idx], [field]: numValue };
    }
  }

  if (field === 'quantity') {
    const newItemTotal = (variationsByItemId.value[item.id] || [])
      .reduce((sum, v) => sum + normalizeQuantityTotal(v.quantity), 0);

    items.value = items.value.map((i) =>
      i.id === item.id ? { ...i, total_quantity: newItemTotal } : i
    );

    const newBinTotal = items.value.reduce((sum, i) => sum + normalizeQuantityTotal(i.total_quantity), 0);
    if (bin.value) {
      bin.value = { ...bin.value, total_quantity: newBinTotal };
    }
  }
}

function openEdit() {
  modalError.value = '';
  showEditModal.value = true;
}

function openDelete() {
  deleteError.value = '';
  deleteConfirmMessage.value = `Delete "${bin.value?.name}" and all items/variations in it? This action cannot be undone.`;
  showDeleteConfirm.value = true;
}

async function onEditSubmit({ name }) {
  isSaving.value = true;
  modalError.value = '';
  const result = await updateBinName(binId.value, name);
  isSaving.value = false;
  if (!result.ok) {
    modalError.value = result.error;
    return;
  }
  showEditModal.value = false;
  await loadBinDetail();
}

async function onDeleteConfirm() {
  deleteError.value = '';
  isDeleting.value = true;
  const deleteResult = await deleteBin(binId.value);
  isDeleting.value = false;
  if (!deleteResult.ok) {
    deleteError.value = deleteResult.error;
    return;
  }
  showDeleteConfirm.value = false;
  deleteError.value = '';
  deleteConfirmMessage.value = '';
  await router.push('/search-inventory');
}

function onEditVariationDelete() {
  const item = selectedVariationItem.value;
  const variation = editingVariation.value;
  closeVariationModal();
  if (item && variation) {
    openDeleteVariation(item, variation);
  }
}

function onEditItemDelete() {
  const item = editingItem.value;
  closeItemModal();
  if (item) {
    openDeleteItem(item);
  }
}

function toggleItemSelectMode() {
  itemSelectMode.value = !itemSelectMode.value;
  if (!itemSelectMode.value) {
    selectedItemIds.value = new Set();
  }
}

function toggleItemSelection(itemId) {
  const next = new Set(selectedItemIds.value);
  if (next.has(itemId)) {
    next.delete(itemId);
  } else {
    next.add(itemId);
  }
  selectedItemIds.value = next;
}

function selectAllItems() {
  const next = new Set(selectedItemIds.value);
  for (const item of items.value) {
    next.add(item.id);
  }
  selectedItemIds.value = next;
}

function deselectAllItems() {
  selectedItemIds.value = new Set();
}

const massItemDeleteMessage = computed(() => {
  const selected = items.value.filter((i) => selectedItemIds.value.has(i.id));
  const lines = selected.map((item) => {
    const count = (variationsByItemId.value[item.id] || []).length;
    return `• <b>${item.name}</b> and its <b>${count} variation${count === 1 ? '' : 's'}</b> will be completely deleted`;
  });
  return `Are you sure?\n\n${lines.join('\n')}`;
});

function openMassItemDelete() {
  massItemDeleteError.value = '';
  massItemDeleteProgress.value = '';
  showMassItemDeleteConfirm.value = true;
}

async function onMassItemDeleteConfirm() {
  const ids = [...selectedItemIds.value];
  if (!ids.length) return;

  isMassItemDeleting.value = true;
  massItemDeleteError.value = '';

  for (let i = 0; i < ids.length; i++) {
    massItemDeleteProgress.value = `Deleting ${i + 1} of ${ids.length}...`;
    const result = await deleteItem(ids[i]);
    if (!result.ok) {
      massItemDeleteError.value = `Failed on item ${i + 1} of ${ids.length}: ${result.error}`;
      isMassItemDeleting.value = false;
      massItemDeleteProgress.value = '';
      await loadBinDetail();
      selectedItemIds.value = new Set(ids.slice(i));
      return;
    }
  }

  isMassItemDeleting.value = false;
  massItemDeleteProgress.value = '';
  showMassItemDeleteConfirm.value = false;
  selectedItemIds.value = new Set();
  itemSelectMode.value = false;
  await loadBinDetail();
}

watch(binId, () => {
  loadBinDetail();
});
onMounted(loadBinDetail);
</script>

<template>
  <div class="card spacious tool-card inventory-detail-card reveal-fade-up">
    <div v-if="isLoading" class="inventory-detail-empty reveal-fade-up">
      <div class="hero-title">Loading Bin...</div>
    </div>

    <div v-else-if="bin" class="inventory-detail-shell">
      <div class="inventory-detail-header reveal-fade-up">
        <div>
          <div class="inventory-detail-kicker">Search Inventory</div>
          <div class="hero-title inventory-detail-title">{{ bin.name }}</div>
          <div class="inventory-detail-qty">Total quantity: {{ bin.total_quantity ?? 0 }}</div>
        </div>

        <div class="inventory-detail-header-actions">
          <button class="btn secondary" type="button" @click="openEdit">Edit Bin</button>
          <router-link class="btn secondary" to="/search-inventory">Back</router-link>
        </div>
      </div>

      <div class="inventory-detail-panel reveal-fade-up reveal-delay-1">
        <div class="inventory-detail-section-header">
          <div>
            <div class="inventory-detail-section-title">Inventory</div>
            <div class="inventory-detail-subtitle">Manage items and their variations for this bin.</div>
          </div>

          <div class="inventory-detail-section-buttons">
            <button class="btn" type="button" @click="openCreateItem">+ Add Item</button>
            <button
              v-if="items.length"
              class="btn"
              :class="{ 'btn-select-active': itemSelectMode }"
              type="button"
              @click="toggleItemSelectMode"
            >
              {{ itemSelectMode ? 'Cancel Select' : 'Select Items' }}
            </button>
          </div>
        </div>

        <div v-if="itemSelectMode && items.length" class="inventory-select-toolbar">
          <div class="select-toolbar-info">
            {{ selectedItemIds.size }} item{{ selectedItemIds.size === 1 ? '' : 's' }} selected
          </div>
          <div class="select-toolbar-actions">
            <button class="btn btn-sm" type="button" @click="selectAllItems">Select All</button>
            <button class="btn btn-sm secondary" type="button" @click="deselectAllItems" :disabled="!selectedItemIds.size">Deselect All</button>
            <button class="btn btn-sm btn-danger" type="button" @click="openMassItemDelete" :disabled="!selectedItemIds.size">
              Delete Selected ({{ selectedItemIds.size }})
            </button>
          </div>
        </div>

        <div v-if="items.length" class="inventory-item-list">
          <div
            v-for="item in items"
            :key="item.id"
            class="inventory-item-card"
            :class="{ 'inventory-item-selected': itemSelectMode && selectedItemIds.has(item.id) }"
          >
            <div class="inventory-item-header">
              <div v-if="itemSelectMode" class="inventory-item-checkbox" @click="toggleItemSelection(item.id)">
                <div class="checkbox-box" :class="{ checked: selectedItemIds.has(item.id) }">
                  <svg v-if="selectedItemIds.has(item.id)" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
              </div>
              <button class="inventory-item-toggle" type="button" @click="itemSelectMode ? toggleItemSelection(item.id) : toggleItem(item.id)">
                <span class="inventory-item-name-shell">
                  <span class="inventory-item-name">{{ item.name }}</span>
                  <span class="inventory-item-total"> Item Quantity: {{ item.total_quantity ?? 0 }}</span>
                </span>
                <span v-if="!itemSelectMode" class="inventory-item-toggle-label">
                  {{ expandedItems[item.id] ? `Hide ${itemVariations(item.id).length} variations` : `Show ${itemVariations(item.id).length} variations` }}
                </span>
              </button>

              <div v-if="!itemSelectMode" class="inventory-entity-actions">
                <button class="inventory-entity-button" type="button" @click="openCreateVariation(item)">
                  + Variation
                </button>
                <button class="inventory-entity-button" type="button" @click="openEditItem(item)">
                  Edit
                </button>
              </div>
            </div>

            <div v-if="expandedItems[item.id]" class="inventory-variation-panel">
              <div v-if="itemVariations(item.id).length" class="inventory-variation-list">
                <div v-for="variation in itemVariations(item.id)" :key="variation.id" class="inventory-variation-card">
                  <div class="inventory-variation-fields">
                    <div><strong>SKU:</strong> {{ variation.sku || '—' }}</div>

                    <div class="variation-inline-field">
                      <strong>Quantity:</strong>
                      <input
                        v-if="inlineEdit?.variationId === variation.id && inlineEdit?.field === 'quantity'"
                        class="variation-inline-input"
                        type="number"
                        inputmode="numeric"
                        :value="inlineEdit.value"
                        :disabled="inlineSavingId === variation.id"
                        :ref="el => el?.focus()"
                        @input="inlineEdit.value = $event.target.value"
                        @keydown.enter.prevent="commitInlineEdit(variation, item)"
                        @keydown.escape="cancelInlineEdit"
                        @blur="commitInlineEdit(variation, item)"
                      />
                      <span
                        v-else
                        class="variation-inline-value"
                        :class="{ saving: inlineSavingId === variation.id }"
                        title="Click to edit"
                        @click="startInlineEdit(variation, 'quantity')"
                      >{{ variation.quantity ?? '—' }}</span>
                    </div>

                    <div class="variation-inline-field">
                      <strong>Price:</strong>
                      <input
                        v-if="inlineEdit?.variationId === variation.id && inlineEdit?.field === 'price'"
                        class="variation-inline-input"
                        type="number"
                        inputmode="decimal"
                        min="0"
                        step="0.01"
                        :value="inlineEdit.value"
                        :disabled="inlineSavingId === variation.id"
                        :ref="el => el?.focus()"
                        @input="inlineEdit.value = $event.target.value"
                        @keydown.enter.prevent="commitInlineEdit(variation, item)"
                        @keydown.escape="cancelInlineEdit"
                        @blur="commitInlineEdit(variation, item)"
                      />
                      <span
                        v-else
                        class="variation-inline-value"
                        :class="{ saving: inlineSavingId === variation.id }"
                        title="Click to edit"
                        @click="startInlineEdit(variation, 'price')"
                      >{{ formatVariationPrice(variation.price) }}</span>
                    </div>

                    <div><strong>Color:</strong> {{ variation.color || '—' }}</div>
                    <div><strong>Style:</strong> {{ variation.style || '—' }}</div>
                    <div><strong>Size:</strong> {{ variation.size || '—' }}</div>
                  </div>

                  <div class="inventory-variation-actions">
                    <button class="inventory-entity-button" type="button" @click="openEditVariation(item, variation)">
                      Edit
                    </button>
                  </div>
                </div>

                <p v-if="inlineSaveError" class="inline-save-error" role="alert">{{ inlineSaveError }}</p>
              </div>

              <div v-else class="inventory-detail-no-items inventory-detail-no-items-inline">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="vertical-align: -2px; margin-right: 4px; opacity: 0.5;">
                  <circle cx="12" cy="12" r="10" stroke="#9CA3AF" stroke-width="1.5"/>
                  <line x1="12" y1="8" x2="12" y2="12" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round"/>
                  <line x1="12" y1="16" x2="12.01" y2="16" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                No variations yet — add a variation to track sizes, colors, and stock.
              </div>
            </div>
          </div>
        </div>

        <div v-else class="inventory-detail-no-items">
          <svg class="empty-state-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="12" y1="22.08" x2="12" y2="12" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div class="empty-state-title">No items yet</div>
          <div class="empty-state-sub">Add your first item to start tracking inventory in this bin.</div>
          <button class="btn" type="button" @click="openCreateItem">+ Add Item</button>
        </div>
      </div>
    </div>

    <div v-else class="inventory-detail-empty reveal-fade-up">
      <svg class="empty-state-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="#9CA3AF" stroke-width="1.5"/>
        <line x1="15" y1="9" x2="9" y2="15" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="9" y1="9" x2="15" y2="15" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <div class="hero-title">Bin Not Found</div>
      <div class="hero-sub">{{ errorMessage || 'That bin ID does not exist in Supabase.' }}</div>
      <router-link class="btn" to="/search-inventory">Back to Search</router-link>
    </div>

    <BinFormModal
      v-if="showEditModal"
      mode="edit"
      :initial-bin="bin"
      :is-saving="isSaving"
      :error-message="modalError"
      @submit="onEditSubmit"
      @cancel="showEditModal = false; modalError = ''"
      @delete="showEditModal = false; modalError = ''; openDelete()"
    />

    <ItemFormModal
      v-if="showCreateItemModal"
      mode="create"
      :bins="availableBins"
      :default-bin-id="binId"
      :is-saving="isItemSaving"
      :error-message="itemModalError"
      @submit="onCreateItemSubmit"
      @cancel="closeItemModal"
    />

    <ItemFormModal
      v-if="showEditItemModal"
      mode="edit"
      :initial-item="editingItem"
      :bins="availableBins"
      :default-bin-id="binId"
      :is-saving="isItemSaving"
      :error-message="itemModalError"
      @submit="onEditItemSubmit"
      @cancel="closeItemModal"
      @delete="onEditItemDelete"
    />

    <VariationFormModal
      v-if="showCreateVariationModal"
      mode="create"
      :item-name="selectedVariationItem?.name || ''"
      :base-sku="selectedVariationItem?.base_sku || ''"
      :is-saving="isVariationSaving"
      :error-message="variationModalError"
      @submit="onCreateVariationSubmit"
      @cancel="closeVariationModal"
    />

    <VariationFormModal
      v-if="showEditVariationModal"
      mode="edit"
      :item-name="selectedVariationItem?.name || ''"
      :base-sku="selectedVariationItem?.base_sku || ''"
      :initial-variation="editingVariation"
      :is-saving="isVariationSaving"
      :error-message="variationModalError"
      @submit="onEditVariationSubmit"
      @cancel="closeVariationModal"
      @delete="onEditVariationDelete"
    />

    <ConfirmModal
      v-if="showDeleteConfirm"
      title="Delete Bin"
      :message="deleteConfirmMessage"
      confirm-label="Delete"
      :is-loading="isDeleting"
      :error-message="deleteError"
      @confirm="onDeleteConfirm"
      @cancel="showDeleteConfirm = false; deleteError = ''; deleteConfirmMessage = ''"
    />

    <ConfirmModal
      v-if="showDeleteItemConfirm"
      title="Delete Item"
      :message="itemDeleteMessage"
      confirm-label="Delete"
      :is-loading="isItemDeleting"
      :error-message="itemDeleteError"
      @confirm="onDeleteItemConfirm"
      @cancel="closeItemDeleteConfirm"
    />

    <ConfirmModal
      v-if="showDeleteVariationConfirm"
      title="Delete Variation"
      :message="variationDeleteMessage"
      confirm-label="Delete"
      :is-loading="isVariationDeleting"
      :error-message="variationDeleteError"
      @confirm="onDeleteVariationConfirm"
      @cancel="closeVariationDeleteConfirm"
    />

    <ConfirmModal
      v-if="showMassItemDeleteConfirm"
      title="Delete Selected Items"
      :message="massItemDeleteProgress || massItemDeleteMessage"
      confirm-label="Delete All"
      :is-loading="isMassItemDeleting"
      :error-message="massItemDeleteError"
      @confirm="onMassItemDeleteConfirm"
      @cancel="showMassItemDeleteConfirm = false; massItemDeleteError = ''; massItemDeleteProgress = ''"
    />
  </div>
</template>

<style scoped>
.inventory-detail-card {
  display: flex;
  flex-direction: column;
}

.inventory-detail-shell,
.inventory-detail-empty {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.inventory-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.inventory-detail-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.inventory-action-delete-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 46px;
  width: 46px;
  padding: 0;
  border-radius: 12px;
  border: 1px solid rgba(220, 38, 38, 0.2);
  background: rgba(255, 238, 238, 0.95);
  color: #991b1b;
  font-weight: 700;
  cursor: pointer;
    flex: 0 0 auto;
    min-width: 40px;
}

.inventory-action-delete-btn:hover {
  background: rgba(255, 220, 220, 0.95);
  border-color: rgba(220, 38, 38, 0.35);
}

.inventory-detail-kicker,
.inventory-detail-section-title {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #0b63d6;
}

.inventory-detail-title {
  text-align: left;
}

.inventory-detail-qty {
  margin-top: 6px;
  text-align: left;
  font-weight: 700;
  color: #0f1f46;
}

.inventory-detail-subtitle {
  text-align: left;
}

.inventory-detail-panel {
  padding: 22px;
  border-radius: 20px;
  border: 1px solid rgba(18, 58, 138, 0.1);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 18px 36px rgba(14, 42, 99, 0.08);
}

.inventory-detail-section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.inventory-item-list {
  display: grid;
  gap: 14px;
  margin-top: 16px;
}

.inventory-item-card {
  border: 1px solid rgba(18, 58, 138, 0.08);
  border-radius: 16px;
  background: rgba(244, 248, 255, 0.72);
  overflow: hidden;
}

.inventory-item-header {
  display: flex;
  align-items: stretch;
  gap: 12px;
  padding: 14px 18px;
}

.inventory-item-toggle {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #082145;
  text-align: left;
  cursor: pointer;
}

.inventory-entity-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.inventory-entity-button,
.inventory-entity-delete {
  min-height: 38px;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
}

.inventory-entity-button {
  padding: 0 12px;
  border: 1px solid rgba(18, 58, 138, 0.18);
  background: rgba(230, 240, 255, 0.95);
  color: #0a2b67;
}

.inventory-entity-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid rgba(220, 38, 38, 0.2);
  background: rgba(255, 238, 238, 0.95);
  color: #991b1b;
  flex: 0 0 auto;
  min-width: 34px;
}

.inventory-item-name {
  font-size: 18px;
  font-weight: 700;
}

.inventory-item-name-shell {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
}

.inventory-item-total {
  font-size: 13px;
  font-weight: 700;
  color: #33578f;
}

.inventory-item-toggle-label {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #0b63d6;
  flex-shrink: 0;
}

.inventory-variation-panel {
  padding: 0 18px 18px;
}

.inventory-variation-list {
  display: grid;
  gap: 10px;
}

.inventory-variation-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(18, 58, 138, 0.08);
}

.inventory-variation-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 16px;
  flex: 1;
}

.inventory-variation-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.variation-inline-field {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.variation-inline-value {
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid transparent;
  transition: background 0.1s, border-color 0.1s;
}

.variation-inline-value:hover {
  background: rgba(11, 99, 214, 0.08);
  border-color: rgba(11, 99, 214, 0.2);
}

.variation-inline-value.saving {
  opacity: 0.5;
  cursor: default;
}

.variation-inline-input {
  width: 80px;
  height: 30px;
  padding: 3px 8px;
  border: 1.5px solid rgba(11, 99, 214, 0.4);
  border-radius: 8px;
  background: #fff;
  color: #082145;
  font: inherit;
  font-size: 14px;
}

.variation-inline-input:focus {
  outline: none;
  border-color: #0b63d6;
  box-shadow: 0 0 0 3px rgba(11, 99, 214, 0.12);
}

.inline-save-error {
  margin: 8px 0 0;
  color: #b91c1c;
  font-size: 13px;
  font-weight: 600;
}

.inventory-detail-no-items {
  padding: 32px 0 12px;
  color: #4b5563;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.inventory-detail-no-items-inline {
  padding: 12px 0 0;
  flex-direction: row;
  gap: 0;
  font-size: 13px;
}

.inventory-detail-empty {
  align-items: center;
  text-align: center;
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
  max-width: 320px;
  line-height: 1.5;
}

@media (max-width: 640px) {
  /* Keep title and actions on the same row when possible, allow wrapping */
  .inventory-detail-header {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* Allow the title block to shrink so actions can sit beside it */
  .inventory-detail-header > div:first-child {
    flex: 1 1 0;
    min-width: 0;
  }

  .inventory-detail-header-actions {
    justify-content: flex-start;
    flex: 0 0 auto;
    gap: 8px;
  }

  .inventory-detail-section-header,
  .inventory-item-header,
  .inventory-variation-card {
    flex-direction: column;
    align-items: stretch;
  }

  .inventory-entity-actions,
  .inventory-variation-actions {
    justify-content: flex-start;
  }

  .inventory-detail-header .btn,
  .inventory-action-delete-btn {
    width: auto;
    max-width: 220px;
  }

  .inventory-item-toggle {
    flex-direction: column;
    align-items: flex-start;
  }

  .inventory-variation-card {
    grid-template-columns: 1fr;
  }
}

/* Keep header actions horizontally aligned and compact on very small screens */
@media (max-width: 480px) {
  .inventory-detail-header {
    /* title stacked above actions but keep actions inline */
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .inventory-detail-header-actions {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    flex-wrap: nowrap;
  }

  .inventory-detail-header .btn,
  .inventory-detail-header .btn.secondary {
    height: 34px;
    padding: 6px 10px;
    font-size: 13px;
    border-radius: 8px;
    width: auto;
    max-width: none;
  }

  .inventory-action-delete-btn {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    padding: 0;
  }

  .inventory-action-delete-btn svg {
    width: 14px;
    height: 14px;
    display: block;
    min-width: 14px;
    min-height: 14px;
  }

  .inventory-entity-delete svg {
    width: 14px;
    height: 14px;
    display: block;
    min-width: 14px;
    min-height: 14px;
  }
}

.inventory-detail-section-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
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
  margin-top: 16px;
  margin-bottom: 12px;
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

.inventory-item-selected {
  border-color: rgba(37, 99, 235, 0.35) !important;
  background: rgba(219, 234, 254, 0.7) !important;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
}

.inventory-item-checkbox {
  flex-shrink: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
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
</style>