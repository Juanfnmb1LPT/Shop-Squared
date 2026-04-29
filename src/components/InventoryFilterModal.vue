<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { canonicalColor, displayColor } from '../lib/inventoryFilters';
import { groupColorsByFamily } from '../lib/colorFamilies';

const props = defineProps({
    initialFilters: {
        type: Object,
        default: () => ({ inStockOnly: false, sizes: [], colors: [], styles: [] }),
    },
    availableSizes: { type: Array, default: () => [] },
    availableColors: { type: Array, default: () => [] },
    availableStyles: { type: Array, default: () => [] },
});

const emit = defineEmits(['apply', 'cancel']);
const dialogRef = ref(null);
let previousFocus = null;

const inStockOnly = ref(!!props.initialFilters.inStockOnly);
const selectedSizes = ref([...(props.initialFilters.sizes || [])]);
const selectedColors = ref([...(props.initialFilters.colors || [])].map(canonicalColor).filter(Boolean));
const selectedStyles = ref([...(props.initialFilters.styles || [])]);

const sizeOrder = { XS: 0, S: 1, M: 2, L: 3, XL: 4, '2XL': 5, '3XL': 6 };

const sortedSizes = computed(() => {
    return [...props.availableSizes].sort((a, b) => {
        const ai = sizeOrder[a] ?? 999;
        const bi = sizeOrder[b] ?? 999;
        if (ai !== bi) return ai - bi;
        return String(a).localeCompare(String(b));
    });
});

const colorEntries = computed(() => {
    const map = new Map();
    for (const raw of props.availableColors) {
        const canon = canonicalColor(raw);
        if (!canon) continue;
        if (!map.has(canon)) {
            map.set(canon, { canonical: canon, label: displayColor(raw) });
        }
    }
    return [...map.values()];
});

const colorFamilies = computed(() => groupColorsByFamily(colorEntries.value));

const expandedFamily = ref('');

const activeFamily = computed(() => {
    if (!expandedFamily.value) return null;
    return colorFamilies.value.find((f) => f.name === expandedFamily.value) || null;
});

function isFamilyExpanded(name) {
    return expandedFamily.value === name;
}

function toggleFamily(name) {
    expandedFamily.value = expandedFamily.value === name ? '' : name;
}

function selectedInFamilyCount(family) {
    return family.items.reduce(
        (n, item) => (selectedColors.value.includes(item.canonical) ? n + 1 : n),
        0,
    );
}

function allSelectedInFamily(family) {
    return (
        family.items.length > 0 &&
        family.items.every((i) => selectedColors.value.includes(i.canonical))
    );
}

function toggleAllInFamily(family) {
    if (allSelectedInFamily(family)) {
        const remove = new Set(family.items.map((i) => i.canonical));
        selectedColors.value = selectedColors.value.filter((c) => !remove.has(c));
    } else {
        const next = new Set(selectedColors.value);
        for (const item of family.items) next.add(item.canonical);
        selectedColors.value = [...next];
    }
}

const sortedStyles = computed(() => {
    return [...props.availableStyles].sort((a, b) => String(a).localeCompare(String(b)));
});

function toggleArray(arrRef, value) {
    const idx = arrRef.value.indexOf(value);
    if (idx === -1) {
        arrRef.value = [...arrRef.value, value];
    } else {
        arrRef.value = arrRef.value.filter((v) => v !== value);
    }
}

function toggleSize(value) { toggleArray(selectedSizes, value); }
function toggleColor(value) { toggleArray(selectedColors, value); }
function toggleStyle(value) { toggleArray(selectedStyles, value); }

function clearAll() {
    inStockOnly.value = false;
    selectedSizes.value = [];
    selectedColors.value = [];
    selectedStyles.value = [];
}

const activeCount = computed(() => {
    return (
        (inStockOnly.value ? 1 : 0) +
        selectedSizes.value.length +
        selectedColors.value.length +
        selectedStyles.value.length
    );
});

function applyFilters() {
    emit('apply', {
        inStockOnly: inStockOnly.value,
        sizes: [...selectedSizes.value],
        colors: [...selectedColors.value],
        styles: [...selectedStyles.value],
    });
}

function onKeydown(e) {
    if (e.key === 'Escape') {
        emit('cancel');
        return;
    }
    if (e.key === 'Tab' && dialogRef.value) {
        const focusable = dialogRef.value.querySelectorAll(
            'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
}

onMounted(() => {
    previousFocus = document.activeElement;
    document.addEventListener('keydown', onKeydown);
    requestAnimationFrame(() => {
        const firstBtn = dialogRef.value?.querySelector('button:not([disabled])');
        firstBtn?.focus();
    });
});

onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown);
    previousFocus?.focus?.();
});
</script>

<template>
    <Teleport to="body">
        <div class="filter-backdrop" @click.self="emit('cancel')">
            <div ref="dialogRef" class="filter-dialog" role="dialog" aria-label="Inventory filters">
                <div class="filter-header">
                    <div class="filter-title">Inventory Filters</div>
                    <button class="filter-close" type="button" @click="emit('cancel')" aria-label="Close filters">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>

                <div class="filter-body">
                    <section class="filter-section">
                        <label class="filter-toggle">
                            <input type="checkbox" v-model="inStockOnly" />
                            <span class="filter-toggle-label">Only show in stock (quantity &gt; 0)</span>
                        </label>
                    </section>

                    <section class="filter-section">
                        <div class="filter-section-title">
                            Size
                            <span v-if="selectedSizes.length" class="filter-count-badge">{{ selectedSizes.length }}</span>
                        </div>
                        <div v-if="sortedSizes.length" class="filter-chip-row">
                            <button
                                v-for="size in sortedSizes"
                                :key="`size-${size}`"
                                type="button"
                                class="filter-chip"
                                :class="{ 'filter-chip-active': selectedSizes.includes(size) }"
                                @click="toggleSize(size)"
                            >
                                {{ size }}
                            </button>
                        </div>
                        <div v-else class="filter-empty">No sizes recorded yet.</div>
                    </section>

                    <section class="filter-section">
                        <div class="filter-section-title">
                            Style
                            <span v-if="selectedStyles.length" class="filter-count-badge">{{ selectedStyles.length }}</span>
                        </div>
                        <div v-if="sortedStyles.length" class="filter-chip-row">
                            <button
                                v-for="style in sortedStyles"
                                :key="`style-${style}`"
                                type="button"
                                class="filter-chip"
                                :class="{ 'filter-chip-active': selectedStyles.includes(style) }"
                                @click="toggleStyle(style)"
                            >
                                {{ style }}
                            </button>
                        </div>
                        <div v-else class="filter-empty">No styles recorded yet.</div>
                    </section>

                    <section class="filter-section">
                        <div class="filter-section-title">
                            Color
                            <span v-if="selectedColors.length" class="filter-count-badge">{{ selectedColors.length }}</span>
                        </div>
                        <div v-if="colorFamilies.length" class="filter-family-wrap">
                            <div class="filter-family-pills">
                                <button
                                    v-for="family in colorFamilies"
                                    :key="`fam-pill-${family.name}`"
                                    type="button"
                                    class="filter-family-pill"
                                    :class="{
                                        'filter-family-pill-active': isFamilyExpanded(family.name),
                                        'filter-family-pill-has-selection': selectedInFamilyCount(family) > 0,
                                    }"
                                    :aria-expanded="isFamilyExpanded(family.name)"
                                    @click="toggleFamily(family.name)"
                                >
                                    <span class="filter-family-pill-name">{{ family.name }}</span>
                                    <span class="filter-family-pill-count">{{ family.items.length }}</span>
                                    <span
                                        v-if="selectedInFamilyCount(family) > 0"
                                        class="filter-family-pill-selected"
                                    >{{ selectedInFamilyCount(family) }}</span>
                                </button>
                            </div>
                            <div v-if="activeFamily" class="filter-family-panel">
                                <div class="filter-family-panel-header">
                                    <span class="filter-family-panel-title">{{ activeFamily.name }}</span>
                                    <button
                                        type="button"
                                        class="filter-family-action"
                                        @click="toggleAllInFamily(activeFamily)"
                                    >
                                        {{ allSelectedInFamily(activeFamily) ? 'Clear all' : 'Select all' }}
                                    </button>
                                </div>
                                <div class="filter-chip-row">
                                    <button
                                        v-for="item in activeFamily.items"
                                        :key="`color-${activeFamily.name}-${item.canonical}`"
                                        type="button"
                                        class="filter-chip"
                                        :class="{ 'filter-chip-active': selectedColors.includes(item.canonical) }"
                                        @click="toggleColor(item.canonical)"
                                    >
                                        {{ item.label }}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div v-else class="filter-empty">No colors recorded yet.</div>
                    </section>
                </div>

                <div class="filter-actions">
                    <button class="btn secondary" type="button" @click="clearAll" :disabled="!activeCount">
                        Clear All
                    </button>
                    <div class="filter-actions-right">
                        <button class="btn secondary" type="button" @click="emit('cancel')">Cancel</button>
                        <button class="btn" type="button" @click="applyFilters">
                            Apply{{ activeCount ? ` (${activeCount})` : '' }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.filter-backdrop {
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

.filter-dialog {
    width: 100%;
    max-width: 560px;
    max-height: calc(100vh - 32px);
    display: flex;
    flex-direction: column;
    border-radius: 20px;
    background: #ffffff;
    box-shadow: 0 24px 60px rgba(14, 42, 99, 0.18);
    overflow: hidden;
}

.filter-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 22px 24px 12px;
    border-bottom: 1px solid rgba(18, 58, 138, 0.08);
}

.filter-title {
    font-size: 20px;
    font-weight: 800;
    color: #082145;
}

.filter-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: 1px solid transparent;
    background: transparent;
    color: #4b5563;
    cursor: pointer;
}

.filter-close:hover {
    background: rgba(18, 58, 138, 0.06);
    color: #082145;
}

.filter-body {
    padding: 18px 24px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 22px;
}

.filter-section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #0b63d6;
}

.filter-count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    border-radius: 999px;
    background: #0b63d6;
    color: #fff;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: none;
}

.filter-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.filter-chip {
    min-height: 36px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid rgba(18, 58, 138, 0.18);
    background: rgba(244, 248, 255, 0.96);
    color: #0a2b67;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.12s ease;
}

.filter-chip:hover {
    border-color: rgba(37, 99, 235, 0.32);
    background: rgba(215, 230, 255, 0.95);
}

.filter-chip-active {
    background: linear-gradient(90deg, #2563eb, #0b63d6);
    color: #fff;
    border-color: transparent;
}

.filter-chip-active:hover {
    background: linear-gradient(90deg, #1e4fd1, #0856bf);
}

.filter-empty {
    color: #6b7280;
    font-size: 13px;
}

.filter-family-wrap {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.filter-family-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.filter-family-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid rgba(18, 58, 138, 0.18);
    background: rgba(244, 248, 255, 0.96);
    color: #0a2b67;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.12s ease;
}

.filter-family-pill:hover {
    border-color: rgba(37, 99, 235, 0.32);
    background: rgba(215, 230, 255, 0.95);
}

.filter-family-pill-active {
    background: linear-gradient(90deg, #2563eb, #0b63d6);
    color: #fff;
    border-color: transparent;
}

.filter-family-pill-active:hover {
    background: linear-gradient(90deg, #1e4fd1, #0856bf);
}

.filter-family-pill-has-selection:not(.filter-family-pill-active) {
    border-color: rgba(11, 99, 214, 0.55);
    background: rgba(11, 99, 214, 0.08);
}

.filter-family-pill-name {
    font-size: 14px;
}

.filter-family-pill-count {
    font-size: 12px;
    font-weight: 700;
    opacity: 0.7;
}

.filter-family-pill-selected {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: #ffffff;
    color: #0b63d6;
    font-size: 11px;
    font-weight: 800;
}

.filter-family-pill:not(.filter-family-pill-active) .filter-family-pill-selected {
    background: #0b63d6;
    color: #fff;
}

.filter-family-panel {
    border: 1px solid rgba(11, 99, 214, 0.22);
    border-radius: 12px;
    background: #ffffff;
    padding: 12px 14px;
}

.filter-family-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
}

.filter-family-panel-title {
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #082145;
}

.filter-family-action {
    border: 1px solid rgba(11, 99, 214, 0.18);
    background: rgba(255, 255, 255, 0.9);
    color: #0b63d6;
    font-size: 12px;
    font-weight: 700;
    padding: 6px 10px;
    border-radius: 8px;
    cursor: pointer;
}

.filter-family-action:hover {
    background: rgba(11, 99, 214, 0.08);
}

.filter-toggle {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    user-select: none;
}

.filter-toggle input {
    width: 18px;
    height: 18px;
    accent-color: #0b63d6;
    cursor: pointer;
}

.filter-toggle-label {
    font-weight: 600;
    color: #082145;
    font-size: 15px;
}

.filter-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 16px 24px 20px;
    border-top: 1px solid rgba(18, 58, 138, 0.08);
    background: #fafcff;
}

.filter-actions-right {
    display: flex;
    gap: 10px;
}

@media (max-width: 600px) {
    .filter-actions {
        flex-direction: column-reverse;
        align-items: stretch;
    }

    .filter-actions-right {
        flex-direction: column-reverse;
    }
}
</style>
