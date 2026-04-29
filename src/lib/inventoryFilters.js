import { ref, watch } from 'vue';

const STORAGE_KEY = 'inventory-filters';

export function canonicalColor(value) {
    return String(value ?? '').trim().toLowerCase();
}

export function displayColor(value) {
    const lower = canonicalColor(value);
    if (!lower) return '';
    return lower.replace(/\b([a-z])/g, (_, ch) => ch.toUpperCase());
}

function uniqueCanonical(list) {
    return [...new Set((list || []).map(canonicalColor).filter(Boolean))];
}

export function defaultFilters() {
    return { inStockOnly: false, sizes: [], colors: [], styles: [] };
}

function readStoredFilters() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultFilters();
        const parsed = JSON.parse(raw);
        return {
            inStockOnly: !!parsed.inStockOnly,
            sizes: Array.isArray(parsed.sizes) ? parsed.sizes : [],
            colors: Array.isArray(parsed.colors) ? uniqueCanonical(parsed.colors) : [],
            styles: Array.isArray(parsed.styles) ? parsed.styles : [],
        };
    } catch {
        return defaultFilters();
    }
}

export function hasActiveFilters(filters) {
    if (!filters) return false;
    return (
        !!filters.inStockOnly ||
        (filters.sizes?.length ?? 0) > 0 ||
        (filters.colors?.length ?? 0) > 0 ||
        (filters.styles?.length ?? 0) > 0
    );
}

export function activeFilterCount(filters) {
    if (!filters) return 0;
    return (
        (filters.inStockOnly ? 1 : 0) +
        (filters.sizes?.length ?? 0) +
        (filters.colors?.length ?? 0) +
        (filters.styles?.length ?? 0)
    );
}

export function variationMatchesFilters(variation, filters) {
    if (!hasActiveFilters(filters)) return true;
    if (filters.inStockOnly && Number(variation?.quantity || 0) <= 0) return false;
    if (filters.sizes.length) {
        const v = String(variation?.size ?? '').trim();
        if (!filters.sizes.includes(v)) return false;
    }
    if (filters.colors.length) {
        const v = canonicalColor(variation?.color);
        if (!filters.colors.includes(v)) return false;
    }
    if (filters.styles.length) {
        const v = String(variation?.style ?? '').trim();
        if (!filters.styles.includes(v)) return false;
    }
    return true;
}

const inventoryFilters = ref(readStoredFilters());

watch(
    inventoryFilters,
    (value) => {
        if (hasActiveFilters(value)) {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
        } else {
            sessionStorage.removeItem(STORAGE_KEY);
        }
    },
    { deep: true },
);

if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_KEY) {
            inventoryFilters.value = readStoredFilters();
        }
    });
}

export function useInventoryFilters() {
    return inventoryFilters;
}

export function setInventoryFilters(next) {
    inventoryFilters.value = {
        inStockOnly: !!next?.inStockOnly,
        sizes: [...(next?.sizes || [])],
        colors: uniqueCanonical(next?.colors),
        styles: [...(next?.styles || [])],
    };
}

export function clearInventoryFilters() {
    inventoryFilters.value = defaultFilters();
}
