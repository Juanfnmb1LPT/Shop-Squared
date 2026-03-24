<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';

const props = defineProps({
    mode: { type: String, required: true },
    initialItem: { type: Object, default: null },
    bins: { type: Array, default: () => [] },
    defaultBinId: { type: String, default: '' },
    isSaving: { type: Boolean, default: false },
    errorMessage: { type: String, default: '' },
});

const emit = defineEmits(['submit', 'cancel']);

const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];

const formName = ref('');
const formBinId = ref('');
const formBinQuery = ref('');
const isBinListOpen = ref(false);
const validationError = ref('');
const nameInput = ref(null);

const formBaseSku = ref('');
const selectedSizes = ref([]);
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
const submitLabel = computed(() => {
    if (props.isSaving) {
        return 'Saving...';
    }

    return props.mode === 'create' ? 'Create Item' : 'Save Changes';
});

const skuPreviewList = computed(() => {
    const base = formBaseSku.value.trim();
    if (!base || !selectedSizes.value.length) return [];
    return selectedSizes.value.map((size) => `${base}-${size}`);
});

onMounted(async () => {
    if (props.initialItem) {
        formName.value = props.initialItem.name ?? '';
        formBinId.value = props.initialItem.bin_id ?? props.defaultBinId ?? '';
    } else {
        formBinId.value = props.defaultBinId ?? '';
    }

    formBinQuery.value = selectedBin.value?.name ?? '';

    await nextTick();
    nameInput.value?.focus();
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
    };

    if (props.mode === 'create') {
        payload.sizes = selectedSizes.value;
        payload.baseSku = formBaseSku.value.trim();
        payload.price = formPrice.value === '' ? 0 : Number(formPrice.value);
        payload.color = formColor.value.trim();
        payload.style = formStyle.value || null;
    }

    emit('submit', payload);
}
</script>

<template>
    <Teleport to="body">
        <div class="entity-modal-backdrop" @click.self="emit('cancel')">
            <div class="entity-modal-dialog" role="dialog" :aria-label="dialogTitle">
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

                    <!-- Variation generation — create mode only -->
                    <template v-if="mode === 'create'">
                        <div class="variation-gen-divider">
                            <span>Generate Variations</span>
                            <span class="variation-gen-optional">optional</span>
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

                        <div v-if="skuPreviewList.length" class="sku-preview">
                            <span
                                v-for="(sku, i) in skuPreviewList"
                                :key="sku"
                            >{{ sku }}<span v-if="i < skuPreviewList.length - 1" class="sku-preview-sep"> · </span></span>
                        </div>

                        <template v-if="selectedSizes.length">
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

                    <p v-if="validationError" class="entity-modal-error" role="alert">{{ validationError }}</p>
                    <p v-if="errorMessage" class="entity-modal-error" role="alert">{{ errorMessage }}</p>

                    <div class="entity-modal-actions">
                        <button class="btn secondary" type="button" :disabled="isSaving" @click="emit('cancel')">
                            Cancel
                        </button>
                        <button class="btn" type="submit" :disabled="isSaving">
                            {{ submitLabel }}
                        </button>
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
    max-width: 460px;
    max-height: 90vh;
    overflow-y: auto;
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
    gap: 10px;
    justify-content: flex-end;
    margin-top: 10px;
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
