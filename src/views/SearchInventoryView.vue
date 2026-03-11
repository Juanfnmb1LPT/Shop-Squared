<script setup>
import { computed, onMounted, ref } from 'vue';
import { hasSupabaseConfig, supabase } from '../lib/supabase';

const searchTerm = ref('');
const bins = ref([]);
const isLoading = ref(true);
const errorMessage = ref('');

const filteredBins = computed(() => {
  const normalizedQuery = searchTerm.value.trim().toLowerCase();

  if (!normalizedQuery) {
    return bins.value;
  }

  return bins.value.filter((bin) => {
    const haystack = [bin.id, bin.name, ...bin.items.map((item) => item.name)]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
});

async function loadBins() {
  if (!hasSupabaseConfig || !supabase) {
    errorMessage.value = 'Add VITE_SUPABASE_ANON_KEY to load bins from Supabase.';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  const [{ data: binData, error: binError }, { data: itemData, error: itemError }] = await Promise.all([
    supabase.from('bins').select('id, name').order('id', { ascending: true }),
    supabase.from('items').select('id, name, bin_id').order('name', { ascending: true })
  ]);

  if (binError || itemError) {
    errorMessage.value = binError?.message || itemError?.message || 'Unable to load bins.';
    bins.value = [];
  } else {
    const itemsByBinId = (itemData || []).reduce((groupedItems, item) => {
      if (!groupedItems[item.bin_id]) {
        groupedItems[item.bin_id] = [];
      }

      groupedItems[item.bin_id].push(item);
      return groupedItems;
    }, {});

    bins.value = (binData || []).map((bin) => ({
      ...bin,
      items: itemsByBinId[bin.id] || []
    }));
  }

  isLoading.value = false;
}

onMounted(loadBins);
</script>

<template>
  <div class="card spacious tool-card inventory-card reveal-fade-up">
    <div class="hero inventory-hero">
      <div class="hero-title reveal-fade-up">Search Inventory</div>
      <div class="hero-sub reveal-fade-up reveal-delay-1">
        Search bins by ID or name from Supabase inventory data.
      </div>
    </div>

    <div class="inventory-search-panel reveal-fade-up reveal-delay-1">
      <label class="inventory-search-label" for="inventory-search-input">Search bins</label>
      <input
        id="inventory-search-input"
        v-model="searchTerm"
        class="inventory-search-input"
        type="search"
        placeholder="Try bin-1 or Bin 1"
      />
    </div>

    <div class="inventory-grid reveal-fade-up reveal-delay-2">
      <div v-if="isLoading" class="inventory-empty-state">
        Loading bins...
      </div>

      <div v-else-if="errorMessage" class="inventory-empty-state">
        {{ errorMessage }}
      </div>

      <router-link
        v-for="bin in filteredBins"
        :key="bin.id"
        class="inventory-bin-card"
        :to="`/search-inventory/${bin.id}`"
      >
        <div class="inventory-bin-name">{{ bin.name }}</div>

        <div class="inventory-bin-summary">Items:</div>

        <ul class="inventory-preview-list">
          <li v-for="item in bin.items" :key="item.id">{{ item.name }}</li>
          <li v-if="!bin.items.length" class="inventory-preview-empty">No items in this bin.</li>
        </ul>
      </router-link>

      <div v-if="!isLoading && !errorMessage && !filteredBins.length" class="inventory-empty-state">
        No bins matched that search.
      </div>
    </div>
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

.inventory-search-input {
  width: 100%;
  min-height: 50px;
  padding: 12px 16px;
  border: 1px solid rgba(18, 58, 138, 0.12);
  border-radius: 14px;
  background: rgba(244, 248, 255, 0.96);
  color: #082145;
  font: inherit;
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
  border: 1px solid rgba(18, 58, 138, 0.1);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 16px 34px rgba(14, 42, 99, 0.08);
}

.inventory-bin-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: inherit;
  text-decoration: none;
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, background-color 0.16s ease;
}

.inventory-bin-card:hover {
  transform: translateY(-4px);
  border-color: rgba(37, 99, 235, 0.2);
  background: rgba(231, 239, 255, 0.92);
  box-shadow: 0 20px 38px rgba(14, 42, 99, 0.1);
}

.inventory-bin-name {
  font-size: 22px;
  font-weight: 800;
  color: #082145;
}

.inventory-bin-summary {
  color: #4b5563;
}

.inventory-preview-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 8px;
  color: #0f1f46;
  text-align: left;
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
}

@media (max-width: 900px) {
  .inventory-grid {
    grid-template-columns: 1fr;
  }
}
</style>