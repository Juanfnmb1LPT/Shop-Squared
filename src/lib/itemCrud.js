import { hasSupabaseConfig, supabase } from './supabase';

function normalizeName(name) {
    return String(name || '').trim();
}

function normalizeId(value) {
    return String(value || '').trim();
}

function validateItemInput(name, binId) {
    const normalizedName = normalizeName(name);
    const normalizedBinId = normalizeId(binId);

    if (!normalizedName) {
        return { ok: false, error: 'Item name is required.' };
    }

    if (!normalizedBinId) {
        return { ok: false, error: 'A bin is required.' };
    }

    return {
        ok: true,
        normalizedName,
        normalizedBinId,
    };
}

const ITEM_SELECT = 'id, name, bin_id, base_sku, shared_price, shared_color, shared_style, variation_type';

export async function createItem({ name, binId, baseSku, sharedPrice, sharedColor, sharedStyle, variationType }) {
    const validation = validateItemInput(name, binId);

    if (!validation.ok) {
        return validation;
    }

    if (!hasSupabaseConfig || !supabase) {
        return { ok: false, error: 'Supabase is not configured.' };
    }

    const generatedId = crypto.randomUUID();

    const row = {
        id: generatedId,
        name: validation.normalizedName,
        bin_id: validation.normalizedBinId,
    };

    const trimmedBaseSku = String(baseSku || '').trim();
    if (trimmedBaseSku) row.base_sku = trimmedBaseSku;
    if (sharedPrice != null) row.shared_price = Number(sharedPrice);
    if (sharedColor) row.shared_color = String(sharedColor).trim();
    if (sharedStyle) row.shared_style = String(sharedStyle).trim();
    if (variationType) row.variation_type = variationType;

    const { data, error } = await supabase
        .from('items')
        .insert(row)
        .select(ITEM_SELECT)
        .maybeSingle();

    if (error) {
        return { ok: false, error: error.message };
    }

    return { ok: true, data };
}

export async function updateItem({ id, name, binId, baseSku, sharedPrice, sharedColor, sharedStyle, variationType, oldBaseSku }) {
    const normalizedId = normalizeId(id);
    const validation = validateItemInput(name, binId);

    if (!normalizedId) {
        return { ok: false, error: 'Item id is required.' };
    }

    if (!validation.ok) {
        return validation;
    }

    if (!hasSupabaseConfig || !supabase) {
        return { ok: false, error: 'Supabase is not configured.' };
    }

    const newBaseSku = String(baseSku || '').trim() || null;

    const updates = {
        name: validation.normalizedName,
        bin_id: validation.normalizedBinId,
        base_sku: newBaseSku,
        shared_price: sharedPrice != null ? Number(sharedPrice) : null,
        shared_color: sharedColor ? String(sharedColor).trim() : null,
        shared_style: sharedStyle ? String(sharedStyle).trim() : null,
        variation_type: variationType || null,
    };

    const { data, error } = await supabase
        .from('items')
        .update(updates)
        .eq('id', normalizedId)
        .select(ITEM_SELECT)
        .maybeSingle();

    if (error) {
        return { ok: false, error: error.message };
    }

    // Propagate item_name to all variations
    const { error: nameError } = await supabase
        .from('item_variations')
        .update({ item_name: validation.normalizedName })
        .eq('item_id', normalizedId);

    if (nameError) {
        return { ok: false, error: nameError.message };
    }

    // Propagate shared fields to all variations
    if (variationType) {
        const bulkFields = {};
        if (sharedPrice != null) bulkFields.price = Number(sharedPrice);
        if (sharedStyle !== undefined) bulkFields.style = sharedStyle ? String(sharedStyle).trim() : null;
        if (variationType === 'sizes' && sharedColor !== undefined) {
            bulkFields.color = sharedColor ? String(sharedColor).trim() : '';
        }

        if (Object.keys(bulkFields).length) {
            await supabase
                .from('item_variations')
                .update(bulkFields)
                .eq('item_id', normalizedId);
        }
    }

    // Propagate base SKU prefix change to variation SKUs
    if (oldBaseSku && newBaseSku && oldBaseSku !== newBaseSku) {
        const { data: variations } = await supabase
            .from('item_variations')
            .select('id, sku')
            .eq('item_id', normalizedId);

        const skuUpdates = (variations || [])
            .filter(v => v.sku && v.sku.startsWith(oldBaseSku))
            .map(v => ({ id: v.id, sku: newBaseSku + v.sku.slice(oldBaseSku.length) }));

        if (skuUpdates.length) {
            await Promise.all(
                skuUpdates.map(u =>
                    supabase.from('item_variations').update({ sku: u.sku }).eq('id', u.id)
                )
            );
        }
    }

    return { ok: true, data };
}

export async function itemHasVariations(id) {
    const normalizedId = normalizeId(id);

    if (!normalizedId) {
        return { ok: false, error: 'Item id is required.' };
    }

    if (!hasSupabaseConfig || !supabase) {
        return { ok: false, error: 'Supabase is not configured.' };
    }

    const { count, error } = await supabase
        .from('item_variations')
        .select('id', { count: 'exact', head: true })
        .eq('item_id', normalizedId);

    if (error) {
        return { ok: false, error: error.message };
    }

    return { ok: true, hasVariations: (count ?? 0) > 0 };
}

export async function deleteItem(id) {
    const normalizedId = normalizeId(id);

    if (!normalizedId) {
        return { ok: false, error: 'Item id is required.' };
    }

    if (!hasSupabaseConfig || !supabase) {
        return { ok: false, error: 'Supabase is not configured.' };
    }

    const { error: deleteVariationsError } = await supabase
        .from('item_variations')
        .delete()
        .eq('item_id', normalizedId);

    if (deleteVariationsError) {
        return { ok: false, error: deleteVariationsError.message };
    }

    const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', normalizedId);

    if (error) {
        return { ok: false, error: error.message };
    }

    return { ok: true };
}