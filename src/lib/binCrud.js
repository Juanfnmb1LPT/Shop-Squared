import { hasSupabaseConfig, supabase } from './supabase';

export async function createBin(name, number = null) {
    const normalizedName = String(name || '').trim();

    if (!normalizedName) {
        return { ok: false, error: 'Bin name is required.' };
    }

    if (!hasSupabaseConfig || !supabase) {
        return { ok: false, error: 'Supabase is not configured.' };
    }

    const generatedId = crypto.randomUUID();
    const row = { id: generatedId, name: normalizedName };
    if (number != null && String(number).trim() !== '') {
        row.number = Number(number);
    }

    const { data, error } = await supabase
        .from('bins')
        .insert(row)
        .select('id, name, number')
        .maybeSingle();

    if (error) {
        return { ok: false, error: error.message };
    }

    return { ok: true, data };
}

export async function updateBinName(id, name, number = null) {
    const normalizedName = String(name || '').trim();

    if (!normalizedName) {
        return { ok: false, error: 'Bin name is required.' };
    }

    if (!hasSupabaseConfig || !supabase) {
        return { ok: false, error: 'Supabase is not configured.' };
    }

    // Fetch old bin number before updating
    const { data: oldBin } = await supabase
        .from('bins')
        .select('number')
        .eq('id', id)
        .maybeSingle();

    const oldNumber = oldBin?.number ?? null;
    const newNumber = (number != null && String(number).trim() !== '') ? Number(number) : null;

    const updates = { name: normalizedName, number: newNumber };

    const { data, error } = await supabase
        .from('bins')
        .update(updates)
        .eq('id', id)
        .select('id, name, number')
        .maybeSingle();

    if (error) {
        return { ok: false, error: error.message };
    }

    // Propagate bin number change to item base_sku and variation SKUs
    if (oldNumber !== newNumber) {
        await propagateBinNumberToSkus(id, oldNumber, newNumber);
    }

    return { ok: true, data };
}

async function propagateBinNumberToSkus(binId, oldNumber, newNumber) {
    const oldPrefix = oldNumber != null ? `${oldNumber}-` : null;
    const newPrefix = newNumber != null ? `${newNumber}-` : null;

    // Fetch all items in this bin
    const { data: items } = await supabase
        .from('items')
        .select('id, base_sku')
        .eq('bin_id', binId);

    if (!items || !items.length) return;

    for (const item of items) {
        const currentSku = item.base_sku || '';
        let updatedSku;

        if (oldPrefix && currentSku.startsWith(oldPrefix)) {
            // Replace old prefix with new (or remove if newPrefix is null)
            const skuWithoutOld = currentSku.slice(oldPrefix.length);
            updatedSku = newPrefix ? newPrefix + skuWithoutOld : skuWithoutOld;
        } else if (newPrefix) {
            // No old prefix — prepend new number
            updatedSku = currentSku ? newPrefix + currentSku : String(newNumber);
        } else {
            continue; // null→null, nothing to do
        }

        // Update item base_sku
        await supabase
            .from('items')
            .update({ base_sku: updatedSku || null })
            .eq('id', item.id);

        // Propagate to variation SKUs
        if (currentSku) {
            const { data: variations } = await supabase
                .from('item_variations')
                .select('id, sku')
                .eq('item_id', item.id);

            const skuUpdates = (variations || [])
                .filter(v => v.sku && v.sku.startsWith(currentSku))
                .map(v => ({
                    id: v.id,
                    sku: updatedSku + v.sku.slice(currentSku.length),
                }));

            if (skuUpdates.length) {
                await Promise.all(
                    skuUpdates.map(u =>
                        supabase.from('item_variations').update({ sku: u.sku }).eq('id', u.id)
                    )
                );
            }
        }
    }
}

export async function binHasItems(id) {
    if (!hasSupabaseConfig || !supabase) {
        return { ok: false, error: 'Supabase is not configured.' };
    }

    const { count, error } = await supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('bin_id', id);

    if (error) {
        return { ok: false, error: error.message };
    }

    return { ok: true, hasItems: (count ?? 0) > 0 };
}

export async function deleteBin(id) {
    if (!hasSupabaseConfig || !supabase) {
        return { ok: false, error: 'Supabase is not configured.' };
    }

    const { data: itemsInBin, error: fetchItemsError } = await supabase
        .from('items')
        .select('id')
        .eq('bin_id', id);

    if (fetchItemsError) {
        return { ok: false, error: fetchItemsError.message };
    }

    const itemIds = (itemsInBin || []).map((item) => item.id).filter(Boolean);

    if (itemIds.length) {
        const { error: deleteVariationsError } = await supabase
            .from('item_variations')
            .delete()
            .in('item_id', itemIds);

        if (deleteVariationsError) {
            return { ok: false, error: deleteVariationsError.message };
        }

        const { error: deleteItemsError } = await supabase
            .from('items')
            .delete()
            .eq('bin_id', id);

        if (deleteItemsError) {
            return { ok: false, error: deleteItemsError.message };
        }
    }

    const { error } = await supabase
        .from('bins')
        .delete()
        .eq('id', id);

    if (error) {
        return { ok: false, error: error.message };
    }

    return { ok: true };
}
