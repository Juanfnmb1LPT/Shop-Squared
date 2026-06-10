<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { canonicalColor, displayColor, MISC_STYLE, styleMatches } from '../lib/inventoryFilters';
import { groupColorsByFamily } from '../lib/colorFamilies';

const props = defineProps({
    initialFilters: {
        type: Object,
        default: () => ({ inStockOnly: false, requireAllSizesInStock: false, sizes: [], colors: [], styles: [] }),
    },
    availableSizes: { type: Array, default: () => [] },
    availableColors: { type: Array, default: () => [] },
    availableStyles: { type: Array, default: () => [] },
    // Raw [{ size, color, style, quantity }] combos for faceted disabling.
    variations: { type: Array, default: () => [] },
});

const emit = defineEmits(['apply', 'cancel']);
const dialogRef = ref(null);
let previousFocus = null;

const inStockOnly = ref(!!props.initialFilters.inStockOnly);
const requireAllSizesInStock = ref(!!props.initialFilters.requireAllSizesInStock);
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

function selectableItemsInFamily(family) {
    return family.items.filter((i) => !isColorDisabled(i.canonical));
}

function allSelectedInFamily(family) {
    const items = selectableItemsInFamily(family);
    return items.length > 0 && items.every((i) => selectedColors.value.includes(i.canonical));
}

function toggleAllInFamily(family) {
    const items = selectableItemsInFamily(family);
    if (allSelectedInFamily(family)) {
        const remove = new Set(items.map((i) => i.canonical));
        selectedColors.value = selectedColors.value.filter((c) => !remove.has(c));
    } else {
        const next = new Set(selectedColors.value);
        for (const item of items) next.add(item.canonical);
        selectedColors.value = [...next];
    }
}

const sortedStyles = computed(() => {
    return [...props.availableStyles]
        .filter((s) => s != null && String(s).trim() !== '' && s !== MISC_STYLE)
        .sort((a, b) => String(a).localeCompare(String(b)));
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

// The "require all sizes" run is meaningless with no sizes picked, so turn it
// off (rather than leaving it checked-but-disabled) once sizes are cleared.
watch(
    () => selectedSizes.value.length,
    (len) => {
        if (!len) requireAllSizesInStock.value = false;
    },
);

// --- Faceted availability -------------------------------------------------
// As filters are picked, options in the other facets that no combination
// matches are grayed out. An option is judged against the selections in the
// OTHER facets only, so a facet never disables its own options.
function styleKey(style) {
    return styleMatches(style, [MISC_STYLE]) ? MISC_STYLE : String(style ?? '').trim();
}

const normalizedVariations = computed(() =>
    (props.variations || []).map((v) => ({
        itemId: v.item_id,
        size: String(v.size ?? '').trim(),
        color: canonicalColor(v.color),
        style: v.style,
        inStock: Number(v.quantity ?? 0) > 0,
    })),
);

const hasFacetData = computed(() => normalizedVariations.value.length > 0);

// When "require all selected sizes in stock" is active, an option is only
// available if some item has EVERY selected size in stock within a single
// color (matching the other facets). This needs in-stock variations per item.
const requireRun = computed(
    () => requireAllSizesInStock.value && selectedSizes.value.length > 0,
);

const inStockItemGroups = computed(() => {
    const map = new Map();
    for (const v of normalizedVariations.value) {
        if (!v.inStock) continue;
        let group = map.get(v.itemId);
        if (!group) {
            group = [];
            map.set(v.itemId, group);
        }
        group.push(v);
    }
    return map;
});

// Does any item have a single color whose in-stock variations (passing the
// given color/style predicates) cover all `required` sizes? Per-color, so it
// matches the run logic in the search/bin views.
function someColorCoversSizes(required, colorPred, stylePred) {
    if (!required.length) return true;
    for (const variations of inStockItemGroups.value.values()) {
        const sizesByColor = new Map();
        for (const v of variations) {
            if (!colorPred(v) || !stylePred(v)) continue;
            let set = sizesByColor.get(v.color);
            if (!set) {
                set = new Set();
                sizesByColor.set(v.color, set);
            }
            set.add(v.size);
        }
        for (const sizes of sizesByColor.values()) {
            if (required.every((s) => sizes.has(s))) return true;
        }
    }
    return false;
}

function passSize(v) {
    return !selectedSizes.value.length || selectedSizes.value.includes(v.size);
}
function passColor(v) {
    return !selectedColors.value.length || selectedColors.value.includes(v.color);
}
function passStyle(v) {
    return styleMatches(v.style, selectedStyles.value);
}
function passStock(v) {
    // Both toggles imply the combo must be in stock to remain available.
    return (!inStockOnly.value && !requireAllSizesInStock.value) || v.inStock;
}

const availableSizeSet = computed(() => {
    const set = new Set();
    if (requireRun.value) {
        // A size stays available only if adding it keeps the "all sizes" run
        // satisfiable for some item within the current color/style filter.
        for (const v of normalizedVariations.value) {
            if (selectedSizes.value.includes(v.size)) continue;
            const required = [...selectedSizes.value, v.size];
            if (someColorCoversSizes(required, passColor, passStyle)) set.add(v.size);
        }
        for (const s of selectedSizes.value) set.add(s);
        return set;
    }
    for (const v of normalizedVariations.value) {
        if (passColor(v) && passStyle(v) && passStock(v)) set.add(v.size);
    }
    return set;
});

const availableColorSet = computed(() => {
    const set = new Set();
    if (requireRun.value) {
        // A color stays available only if some item has every selected size in
        // stock in that color (within the current style filter).
        for (const v of normalizedVariations.value) {
            if (set.has(v.color)) continue;
            if (someColorCoversSizes(selectedSizes.value, (x) => x.color === v.color, passStyle)) {
                set.add(v.color);
            }
        }
        return set;
    }
    for (const v of normalizedVariations.value) {
        if (passSize(v) && passStyle(v) && passStock(v)) set.add(v.color);
    }
    return set;
});

const availableStyleSet = computed(() => {
    const set = new Set();
    if (requireRun.value) {
        // A style stays available only if some item has every selected size in
        // stock under that style (within the current color filter).
        for (const v of normalizedVariations.value) {
            const key = styleKey(v.style);
            if (set.has(key)) continue;
            if (someColorCoversSizes(selectedSizes.value, passColor, (x) => styleKey(x.style) === key)) {
                set.add(key);
            }
        }
        return set;
    }
    for (const v of normalizedVariations.value) {
        if (!(passSize(v) && passColor(v) && passStock(v))) continue;
        set.add(styleKey(v.style));
    }
    return set;
});

function isSizeDisabled(size) {
    if (!hasFacetData.value || selectedSizes.value.includes(size)) return false;
    return !availableSizeSet.value.has(size);
}
function isColorDisabled(canon) {
    if (!hasFacetData.value || selectedColors.value.includes(canon)) return false;
    return !availableColorSet.value.has(canon);
}
function isStyleDisabled(style) {
    if (!hasFacetData.value || selectedStyles.value.includes(style)) return false;
    return !availableStyleSet.value.has(style);
}
function isFamilyDisabled(family) {
    return family.items.every((i) => isColorDisabled(i.canonical));
}

function clearAll() {
    inStockOnly.value = false;
    requireAllSizesInStock.value = false;
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
        requireAllSizesInStock: requireAllSizesInStock.value,
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
                                :disabled="isSizeDisabled(size)"
                                @click="toggleSize(size)"
                            >
                                {{ size }}
                            </button>
                        </div>
                        <div v-else class="filter-empty">No sizes recorded yet.</div>
                        <label class="filter-toggle filter-toggle-inline">
                            <input type="checkbox" v-model="requireAllSizesInStock" :disabled="!selectedSizes.length" />
                            <span class="filter-toggle-label">Require all selected sizes in stock</span>
                        </label>
                        <div class="filter-subnote">
                            Only show items that come in every selected size within a single color (matching the chosen colors and style). Sizes and colors that can't complete the set are grayed out.
                        </div>
                        <label class="filter-toggle filter-toggle-inline">
                            <input type="checkbox" v-model="inStockOnly" />
                            <span class="filter-toggle-label">Only show in stock (quantity &gt; 0)</span>
                        </label>
                    </section>

                    <section class="filter-section">
                        <div class="filter-section-title">
                            Style
                            <span v-if="selectedStyles.length" class="filter-count-badge">{{ selectedStyles.length }}</span>
                        </div>
                        <div class="filter-chip-row">
                            <button
                                v-for="style in sortedStyles"
                                :key="`style-${style}`"
                                type="button"
                                class="filter-chip"
                                :class="{ 'filter-chip-active': selectedStyles.includes(style) }"
                                :disabled="isStyleDisabled(style)"
                                @click="toggleStyle(style)"
                            >
                                {{ style }}
                            </button>
                            <button
                                type="button"
                                class="filter-chip"
                                :class="{ 'filter-chip-active': selectedStyles.includes(MISC_STYLE) }"
                                :disabled="isStyleDisabled(MISC_STYLE)"
                                @click="toggleStyle(MISC_STYLE)"
                            >
                                Miscellaneous
                            </button>
                        </div>
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
                                    :disabled="isFamilyDisabled(family)"
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
                                        :disabled="isColorDisabled(item.canonical)"
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

.filter-chip:disabled,
.filter-family-pill:disabled {
    opacity: 0.38;
    cursor: not-allowed;
    background: rgba(241, 245, 249, 0.9);
    color: #94a3b8;
    border-color: rgba(148, 163, 184, 0.25);
}

.filter-chip:disabled:hover,
.filter-family-pill:disabled:hover {
    border-color: rgba(148, 163, 184, 0.25);
    background: rgba(241, 245, 249, 0.9);
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

.filter-toggle-inline {
    margin-top: 12px;
}

.filter-toggle-inline input:disabled {
    cursor: not-allowed;
}

.filter-toggle-inline input:disabled + .filter-toggle-label {
    color: #9ca3af;
}

.filter-subnote {
    margin-top: 4px;
    color: #6b7280;
    font-size: 12px;
    line-height: 1.4;
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
