<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps({
    mode: { type: String, required: true },
    initialItem: { type: Object, default: null },
    bins: { type: Array, default: () => [] },
    defaultBinId: { type: String, default: '' },
    isSaving: { type: Boolean, default: false },
    errorMessage: { type: String, default: '' },
});

const emit = defineEmits(['submit', 'cancel', 'delete']);

const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];

const formName = ref('');
const formBinId = ref('');
const formBinQuery = ref('');
const isBinListOpen = ref(false);
const validationError = ref('');
const nameInput = ref(null);
const dialogRef = ref(null);
let previousFocus = null;

function onKeydown(e) {
    if (e.key === 'Escape') { emit('cancel'); return; }
    if (e.key === 'Tab' && dialogRef.value) {
        const focusable = dialogRef.value.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
}

const formBaseSku = ref('');
const genMode = ref('sizes');
const selectedSizes = ref([]);
const colorTags = ref([]);       // [{ name: 'Black', abbr: 'BLK' }, ...]
const colorNameInput = ref('');
const colorAbbrInput = ref('');
const formPrice = ref('');
const formColor = ref('');
const formStyle = ref('');

const dialogTitle = computed(() => (props.mode === 'create' ? 'Create Item' : 'Edit Item'));
const selectedBin = computed(() => props.bins.find((bin) => bin.id === formBinId.value) || null);
const filteredBins = computed(() => {
    const normalizedQuery = formBinQuery.value.trim().toLowerCase();

    if (!normalizedQuery) {
        return props.bins;
    }

    return props.bins.filter((bin) => {
        const searchableText = `${bin.name || ''} ${bin.id || ''}`.trim().toLowerCase();
        return searchableText.includes(normalizedQuery);
    });
});
const variationCount = computed(() =>
    genMode.value === 'sizes' ? selectedSizes.value.length : colorTags.value.length
);

const submitLabel = computed(() => {
    if (props.isSaving) {
        return 'Saving...';
    }

    if (props.mode === 'edit') return 'Save Changes';

    if (variationCount.value > 0) {
        return `Create Item + ${variationCount.value} Variation${variationCount.value > 1 ? 's' : ''}`;
    }

    return 'Create Item';
});

const hasVariationsSelected = computed(() =>
    genMode.value === 'sizes' ? selectedSizes.value.length > 0 : colorTags.value.length > 0
);

const skuPreviewList = computed(() => {
    const base = formBaseSku.value.trim();
    if (!base) return [];
    if (genMode.value === 'sizes') {
        if (!selectedSizes.value.length) return [];
        return selectedSizes.value.map((size) => `${base}-${size}`);
    }
    if (!colorTags.value.length) return [];
    return colorTags.value.map((c) => `${base}-${c.abbr}`);
});

onMounted(async () => {
    previousFocus = document.activeElement;
    document.addEventListener('keydown', onKeydown);
    if (props.initialItem) {
        formName.value = props.initialItem.name ?? '';
        formBinId.value = props.initialItem.bin_id ?? props.defaultBinId ?? '';
        formBaseSku.value = props.initialItem.base_sku ?? '';
        formPrice.value = props.initialItem.shared_price != null ? String(props.initialItem.shared_price) : '';
        formColor.value = props.initialItem.shared_color ?? '';
        formStyle.value = props.initialItem.shared_style ?? '';
    } else {
        formBinId.value = props.defaultBinId ?? '';
    }

    formBinQuery.value = selectedBin.value?.name ?? '';

    await nextTick();
    nameInput.value?.focus();
});

onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown);
    previousFocus?.focus?.();
});

watch(
    () => props.bins,
    () => {
        if (!formBinId.value) {
            return;
        }

        formBinQuery.value = selectedBin.value?.name ?? '';
    },
    { deep: true }
);

function onBinInput() {
    isBinListOpen.value = true;

    if (selectedBin.value?.name !== formBinQuery.value) {
        formBinId.value = '';
    }
}

function onBinFocus() {
    isBinListOpen.value = true;

    if (selectedBin.value) {
        formBinQuery.value = '';
    }
}

function onBinBlur() {
    window.setTimeout(() => {
        isBinListOpen.value = false;

        if (!formBinId.value) {
            formBinQuery.value = '';
            return;
        }

        formBinQuery.value = selectedBin.value?.name ?? '';
    }, 120);
}

function selectBin(bin) {
    formBinId.value = bin.id;
    formBinQuery.value = bin.name;
    isBinListOpen.value = false;
    validationError.value = '';
}

function toggleSize(size) {
    if (selectedSizes.value.includes(size)) {
        selectedSizes.value = selectedSizes.value.filter((s) => s !== size);
    } else {
        selectedSizes.value = ALL_SIZES.filter((s) => selectedSizes.value.includes(s) || s === size);
    }
}

function addColor() {
    const name = colorNameInput.value.trim();
    const abbr = colorAbbrInput.value.trim();
    if (!name || !abbr) return;
    if (colorTags.value.some((c) => c.abbr === abbr)) return;
    colorTags.value.push({ name, abbr });
    colorNameInput.value = '';
    colorAbbrInput.value = '';
}

function removeColor(index) {
    colorTags.value.splice(index, 1);
}

function onSubmit() {
    validationError.value = '';

    if (!formName.value.trim()) {
        validationError.value = 'Item name is required.';
        return;
    }

    if (!String(formBinId.value || '').trim()) {
        validationError.value = 'Select a bin for this item.';
        return;
    }

    const payload = {
        name: formName.value.trim(),
        binId: String(formBinId.value).trim(),
        baseSku: formBaseSku.value.trim(),
    };

    if (props.mode === 'create') {
        payload.genMode = genMode.value;
        payload.sizes = genMode.value === 'sizes' ? selectedSizes.value : [];
        payload.colors = genMode.value === 'colors' ? colorTags.value.map((c) => ({ ...c })) : [];
        payload.price = formPrice.value === '' ? 0 : Number(formPrice.value);
        payload.color = genMode.value === 'sizes' ? formColor.value.trim() : '';
        payload.style = formStyle.value || null;
    }

    if (props.mode === 'edit' && props.initialItem?.variation_type) {
        payload.sharedPrice = formPrice.value === '' ? null : Number(formPrice.value);
        payload.sharedColor = props.initialItem.variation_type === 'sizes' ? formColor.value.trim() || null : null;
        payload.sharedStyle = formStyle.value || null;
        payload.variationType = props.initialItem.variation_type;
        payload.oldBaseSku = props.initialItem.base_sku || '';
    }

    emit('submit', payload);
}
</script>

<template>
    <Teleport to="body">
        <div class="entity-modal-backdrop" @click.self="emit('cancel')">
            <div ref="dialogRef" class="entity-modal-dialog" role="dialog" :aria-label="dialogTitle">
                <div class="entity-modal-header">
                    <div class="entity-modal-title">{{ dialogTitle }}</div>
                    <button class="entity-modal-close" type="button" aria-label="Close" @click="emit('cancel')">
                        X
                    </button>
                </div>

                <form class="entity-modal-form" @submit.prevent="onSubmit">
                    <label class="entity-modal-label" for="item-form-name">Name</label>
                    <input
                        id="item-form-name"
                        ref="nameInput"
                        v-model="formName"
                        class="entity-modal-input"
                        type="text"
                        autocomplete="off"
                        placeholder="e.g. T-Shirt"
                        :disabled="isSaving"
                    />

                    <label class="entity-modal-label" for="item-form-bin">Bin</label>
                    <div class="entity-modal-combobox">
                        <input
                            id="item-form-bin"
                            v-model="formBinQuery"
                            class="entity-modal-input"
                            type="text"
                            autocomplete="off"
                            placeholder="Search bins by name or id"
                            role="combobox"
                            :aria-expanded="isBinListOpen"
                            aria-autocomplete="list"
                            aria-controls="item-form-bin-list"
                            :disabled="isSaving"
                            @input="onBinInput"
                            @focus="onBinFocus"
                            @blur="onBinBlur"
                        />

                        <div v-if="selectedBin" class="entity-modal-selected-bin">
                            Selected: {{ selectedBin.name }}
                        </div>

                        <div
                            v-if="isBinListOpen"
                            id="item-form-bin-list"
                            class="entity-modal-dropdown"
                            role="listbox"
                        >
                            <button
                                v-for="bin in filteredBins"
                                :key="bin.id"
                                class="entity-modal-option"
                                type="button"
                                @mousedown.prevent="selectBin(bin)"
                            >
                                <span>{{ bin.name }}</span>
                                <span class="entity-modal-option-id">{{ bin.id }}</span>
                            </button>

                            <div v-if="!filteredBins.length" class="entity-modal-empty">
                                No bins matched that search.
                            </div>
                        </div>
                    </div>

                    <label class="entity-modal-label" for="item-form-base-sku">Base SKU</label>
                    <input
                        id="item-form-base-sku"
                        v-model="formBaseSku"
                        class="entity-modal-input"
                        type="text"
                        autocomplete="off"
                        placeholder="e.g. TSHIRT-BLK"
                        :disabled="isSaving"
                    />

                    <!-- Shared variation fields — edit mode only -->
                    <template v-if="mode === 'edit' && initialItem?.variation_type">
                        <div class="variation-gen-divider">
                            <span>Shared Variation Fields</span>
                            <span class="variation-gen-optional">applies to all</span>
                        </div>

                        <div class="variation-shared-grid">
                            <div>
                                <label class="entity-modal-label" for="item-form-edit-price">Price</label>
                                <input
                                    id="item-form-edit-price"
                                    v-model="formPrice"
                                    class="entity-modal-input"
                                    type="number"
                                    inputmode="decimal"
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    :disabled="isSaving"
                                />
                            </div>
                            <div>
                                <label class="entity-modal-label" for="item-form-edit-style">Style</label>
                                <select
                                    id="item-form-edit-style"
                                    v-model="formStyle"
                                    class="entity-modal-input"
                                    :disabled="isSaving"
                                >
                                    <option value="">—</option>
                                    <option value="Mens">Mens</option>
                                    <option value="Womens">Womens</option>
                                </select>
                            </div>
                        </div>

                        <template v-if="initialItem.variation_type === 'sizes'">
                            <label class="entity-modal-label" for="item-form-edit-color">Color</label>
                            <input
                                id="item-form-edit-color"
                                v-model="formColor"
                                class="entity-modal-input"
                                type="text"
                                autocomplete="off"
                                placeholder="e.g. Black"
                                :disabled="isSaving"
                            />
                        </template>
                    </template>

                    <!-- Variation generation — create mode only -->
                    <template v-if="mode === 'create'">
                        <div class="variation-gen-divider">
                            <span>Generate Variations</span>
                            <span class="variation-gen-optional">optional</span>
                        </div>

                        <div class="gen-mode-toggle">
                            <button
                                type="button"
                                class="gen-mode-btn"
                                :class="{ active: genMode === 'sizes' }"
                                :disabled="isSaving"
                                @click="genMode = 'sizes'"
                            >Sizes</button>
                            <button
                                type="button"
                                class="gen-mode-btn"
                                :class="{ active: genMode === 'colors' }"
                                :disabled="isSaving"
                                @click="genMode = 'colors'"
                            >Colors</button>
                        </div>

                        <!-- Size chips -->
                        <template v-if="genMode === 'sizes'">
                            <label class="entity-modal-label">Sizes</label>
                            <div class="size-chips">
                                <button
                                    v-for="size in ALL_SIZES"
                                    :key="size"
                                    type="button"
                                    class="size-chip"
                                    :class="{ active: selectedSizes.includes(size) }"
                                    :disabled="isSaving"
                                    @click="toggleSize(size)"
                                >
                                    {{ size }}
                                </button>
                            </div>
                        </template>

                        <!-- Color tags -->
                        <template v-if="genMode === 'colors'">
                            <div class="color-add-row">
                                <div class="color-add-field">
                                    <label class="entity-modal-label" for="item-form-color-name">Color Name</label>
                                    <input
                                        id="item-form-color-name"
                                        v-model="colorNameInput"
                                        class="entity-modal-input"
                                        type="text"
                                        autocomplete="off"
                                        placeholder="e.g. Black"
                                        :disabled="isSaving"
                                        @keydown.enter.prevent
                                    />
                                </div>
                                <div class="color-add-field">
                                    <label class="entity-modal-label" for="item-form-color-abbr">SKU Abbr</label>
                                    <input
                                        id="item-form-color-abbr"
                                        v-model="colorAbbrInput"
                                        class="entity-modal-input"
                                        type="text"
                                        autocomplete="off"
                                        placeholder="e.g. BLK"
                                        :disabled="isSaving"
                                        @keydown.enter.prevent
                                    />
                                </div>
                                <button
                                    type="button"
                                    class="color-add-btn"
                                    :disabled="isSaving || !colorNameInput.trim() || !colorAbbrInput.trim()"
                                    @click="addColor"
                                >+</button>
                            </div>

                            <div v-if="colorTags.length" class="color-tag-list">
                                <div
                                    v-for="(color, i) in colorTags"
                                    :key="color.abbr"
                                    class="color-tag"
                                >
                                    <span class="color-tag-name">{{ color.name }}</span>
                                    <span class="color-tag-abbr">{{ color.abbr }}</span>
                                    <button type="button" class="color-tag-remove" @click="removeColor(i)">&times;</button>
                                </div>
                            </div>
                        </template>

                        <div v-if="skuPreviewList.length" class="sku-preview">
                            <span
                                v-for="(sku, i) in skuPreviewList"
                                :key="sku"
                            >{{ sku }}<span v-if="i < skuPreviewList.length - 1" class="sku-preview-sep"> · </span></span>
                        </div>

                        <template v-if="hasVariationsSelected">
                            <div class="variation-shared-grid">
                                <div>
                                    <label class="entity-modal-label" for="item-form-price">Price</label>
                                    <input
                                        id="item-form-price"
                                        v-model="formPrice"
                                        class="entity-modal-input"
                                        type="number"
                                        inputmode="decimal"
                                        min="0"
                                        step="0.01"
                                        placeholder="0.00"
                                        :disabled="isSaving"
                                    />
                                </div>
                                <div>
                                    <label class="entity-modal-label" for="item-form-style">Style</label>
                                    <select
                                        id="item-form-style"
                                        v-model="formStyle"
                                        class="entity-modal-input"
                                        :disabled="isSaving"
                                    >
                                        <option value="">—</option>
                                        <option value="Mens">Mens</option>
                                        <option value="Womens">Womens</option>
                                    </select>
                                </div>
                            </div>

                            <template v-if="genMode === 'sizes'">
                                <label class="entity-modal-label" for="item-form-color">Color</label>
                                <input
                                    id="item-form-color"
                                    v-model="formColor"
                                    class="entity-modal-input"
                                    type="text"
                                    autocomplete="off"
                                    placeholder="e.g. Black"
                                    :disabled="isSaving"
                                />
                            </template>
                        </template>
                    </template>

                    <p v-if="validationError" class="entity-modal-error" role="alert">{{ validationError }}</p>
                    <p v-if="errorMessage" class="entity-modal-error" role="alert">{{ errorMessage }}</p>

                    <div class="entity-modal-actions">
                        <button v-if="mode === 'edit'" class="entity-modal-delete-btn" type="button" :disabled="isSaving" @click="emit('delete')" title="Delete item">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M3 6h18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M10 11v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M14 11v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                        <div class="entity-modal-actions-right">
                            <button class="btn secondary" type="button" :disabled="isSaving" @click="emit('cancel')">
                                Cancel
                            </button>
                            <button class="btn" type="submit" :disabled="isSaving">
                                {{ submitLabel }}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.entity-modal-backdrop {
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

.entity-modal-dialog {
    width: 100%;
    max-width: 540px;
    max-height: 90vh;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 28px 28px 24px;
    border-radius: 20px;
    background: #ffffff;
    box-shadow: 0 24px 60px rgba(14, 42, 99, 0.18);
    display: flex;
    flex-direction: column;
}

.entity-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
}

.entity-modal-title {
    font-size: 20px;
    font-weight: 800;
    color: #082145;
}

.entity-modal-close {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 8px;
    background: rgba(18, 58, 138, 0.06);
    color: #4b5563;
    font-size: 14px;
    cursor: pointer;
}

.entity-modal-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.entity-modal-label {
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #0b63d6;
}

.entity-modal-input {
    min-height: 46px;
    padding: 10px 14px;
    border: 1px solid rgba(18, 58, 138, 0.2);
    border-radius: 12px;
    background: rgba(244, 248, 255, 0.96);
    color: #082145;
    font: inherit;
    font-size: 15px;
}

.entity-modal-input:focus {
    outline: 2px solid rgba(14, 165, 255, 0.22);
    border-color: rgba(37, 99, 235, 0.28);
}

.entity-modal-combobox {
    position: relative;
}

.entity-modal-selected-bin {
    margin-top: 8px;
    color: #4b5563;
    font-size: 13px;
    font-weight: 600;
}

.entity-modal-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    right: 0;
    z-index: 10;
    max-height: 220px;
    overflow-y: auto;
    border: 1px solid rgba(18, 58, 138, 0.14);
    border-radius: 14px;
    background: #ffffff;
    box-shadow: 0 18px 32px rgba(14, 42, 99, 0.14);
}

.entity-modal-option {
    width: 100%;
    padding: 12px 14px;
    border: 0;
    border-bottom: 1px solid rgba(18, 58, 138, 0.08);
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: #082145;
    text-align: left;
    cursor: pointer;
}

.entity-modal-option:hover {
    background: rgba(244, 248, 255, 0.96);
}

.entity-modal-option:last-child {
    border-bottom: 0;
}

.entity-modal-option-id {
    color: #6b7280;
    font-size: 12px;
}

.entity-modal-empty {
    padding: 12px 14px;
    color: #6b7280;
    font-size: 14px;
}

.entity-modal-error {
    margin: 4px 0 0;
    color: #b91c1c;
    font-size: 14px;
    font-weight: 600;
}

.entity-modal-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 10px;
}

.entity-modal-actions-right {
    display: flex;
    gap: 10px;
    margin-left: auto;
}

.entity-modal-delete-btn {
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
    cursor: pointer;
}

.entity-modal-delete-btn:hover {
    background: rgba(255, 220, 220, 0.95);
    border-color: rgba(220, 38, 38, 0.35);
}

/* Variation generation section */

.variation-gen-divider {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    padding-top: 14px;
    border-top: 1px solid rgba(18, 58, 138, 0.1);
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #082145;
}

.gen-mode-toggle {
    display: flex;
    gap: 0;
    border: 1px solid rgba(18, 58, 138, 0.2);
    border-radius: 10px;
    overflow: hidden;
}

.gen-mode-btn {
    flex: 1;
    height: 38px;
    border: 0;
    background: rgba(244, 248, 255, 0.96);
    color: #4b5563;
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
}

.gen-mode-btn + .gen-mode-btn {
    border-left: 1px solid rgba(18, 58, 138, 0.2);
}

.gen-mode-btn.active {
    background: #0b63d6;
    color: #ffffff;
}

.gen-mode-btn:hover:not(.active):not(:disabled) {
    background: rgba(11, 99, 214, 0.08);
    color: #0b63d6;
}

.color-add-row {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 8px;
    align-items: end;
}

.color-add-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}

.color-add-field .entity-modal-input {
    width: 100%;
    box-sizing: border-box;
    min-width: 0;
}

.color-add-btn {
    height: 46px;
    width: 40px;
    flex-shrink: 0;
    border: 1px solid rgba(18, 58, 138, 0.2);
    border-radius: 12px;
    background: #0b63d6;
    color: #ffffff;
    font-size: 22px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}

.color-add-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.color-add-btn:hover:not(:disabled) {
    background: #0952b3;
}

.color-tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.color-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 8px;
    background: #0b63d6;
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
}

.color-tag-name {
    opacity: 0.9;
}

.color-tag-abbr {
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.2);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.04em;
}

.color-tag-remove {
    border: 0;
    background: transparent;
    color: rgba(255, 255, 255, 0.6);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    padding: 0 2px;
}

.color-tag-remove:hover {
    color: #ffffff;
}

.variation-gen-optional {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: #6b7280;
    text-transform: uppercase;
    background: rgba(18, 58, 138, 0.06);
    padding: 2px 7px;
    border-radius: 20px;
}

.size-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.size-chip {
    height: 38px;
    min-width: 48px;
    padding: 0 12px;
    border: 1px solid rgba(18, 58, 138, 0.2);
    border-radius: 10px;
    background: rgba(244, 248, 255, 0.96);
    color: #4b5563;
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.size-chip:hover:not(:disabled) {
    background: rgba(11, 99, 214, 0.08);
    border-color: rgba(11, 99, 214, 0.3);
    color: #0b63d6;
}

.size-chip.active {
    background: #0b63d6;
    border-color: #0b63d6;
    color: #ffffff;
}

.size-chip.active:hover:not(:disabled) {
    background: #0952b3;
    border-color: #0952b3;
}

.size-chip:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.sku-preview {
    padding: 10px 14px;
    border-radius: 10px;
    background: rgba(11, 99, 214, 0.05);
    border: 1px solid rgba(11, 99, 214, 0.12);
    font-size: 13px;
    font-weight: 600;
    color: #082145;
    word-break: break-all;
    line-height: 1.6;
}

.sku-preview-sep {
    color: #9ca3af;
}

.variation-shared-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 12px;
}

.variation-shared-grid .entity-modal-label {
    display: block;
    margin-bottom: 6px;
}
</style>
