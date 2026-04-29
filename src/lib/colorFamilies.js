export const COLOR_FAMILIES = [
    { name: 'Grey', keywords: ['grey', 'gray', 'graphite', 'charcoal', 'silver', 'slate', 'ash', 'pewter', 'smoke'] },
    { name: 'Blue', keywords: ['blue', 'denim', 'cornflower', 'navy', 'sapphire', 'cobalt', 'azure', 'royal', 'cerulean', 'aqua', 'turquoise'] },
    { name: 'Green', keywords: ['green', 'mint', 'teal', 'olive', 'sage', 'forest', 'emerald', 'lime', 'kelly', 'jade', 'moss', 'pistachio'] },
    { name: 'Pink', keywords: ['pink', 'mauve', 'rose', 'fuchsia', 'magenta', 'salmon', 'coral', 'blush'] },
    { name: 'Yellow', keywords: ['yellow', 'gold', 'mustard', 'lemon', 'honey', 'butter', 'canary'] },
    { name: 'Red', keywords: ['red', 'maroon', 'crimson', 'scarlet', 'burgundy', 'cherry', 'wine'] },
    { name: 'Orange', keywords: ['orange', 'peach', 'apricot', 'rust', 'amber', 'terracotta', 'pumpkin'] },
    { name: 'Brown', keywords: ['brown', 'oatmeal', 'beige', 'tan', 'khaki', 'taupe', 'chocolate', 'coffee', 'mocha', 'sand', 'camel', 'walnut', 'hazelnut'] },
    { name: 'Purple', keywords: ['purple', 'pansy', 'violet', 'lavender', 'plum', 'lilac', 'indigo', 'eggplant'] },
    { name: 'Black', keywords: ['black', 'jet', 'onyx', 'ebony'] },
    { name: 'White', keywords: ['white', 'cream', 'ivory', 'eggshell', 'pearl'] },
];

const OTHER_FAMILY = 'Other';

export function classifyColor(canonical) {
    const lower = String(canonical || '').toLowerCase();
    if (!lower) return [];
    const matches = [];
    for (const family of COLOR_FAMILIES) {
        if (family.keywords.some((kw) => lower.includes(kw))) {
            matches.push(family.name);
        }
    }
    return matches;
}

export function groupColorsByFamily(colorEntries) {
    const groups = new Map();
    for (const family of COLOR_FAMILIES) {
        groups.set(family.name, []);
    }
    groups.set(OTHER_FAMILY, []);

    for (const entry of colorEntries) {
        const families = classifyColor(entry.canonical);
        if (families.length === 0) {
            groups.get(OTHER_FAMILY).push(entry);
        } else {
            for (const f of families) {
                groups.get(f).push(entry);
            }
        }
    }

    const result = [];
    for (const [name, items] of groups) {
        if (items.length === 0) continue;
        items.sort((a, b) => a.label.localeCompare(b.label));
        result.push({ name, items });
    }
    return result;
}
