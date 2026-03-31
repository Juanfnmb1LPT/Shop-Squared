<script setup>
import { ref } from 'vue';
import ShopifyExportVariations from '../components/ShopifyExportVariations.vue';
import ExportPreviewModal from '../components/ExportPreviewModal.vue';
import QrExportModal from '../components/QrExportModal.vue';
import LowStockExportModal from '../components/LowStockExportModal.vue';

const showExportModal = ref(false);
const showQrExportModal = ref(false);
const showLowStockModal = ref(false);
</script>

<template>
  <div class="reports-page">
    <div class="hero reports-hero">
      <div class="hero-title reveal-fade-up">Reports</div>
      <div class="hero-sub reveal-fade-up reveal-delay-1">
        Export and print inventory data.
      </div>
    </div>

    <div class="reports-grid reveal-fade-up reveal-delay-2">
      <button class="report-card" type="button" @click="showExportModal = true">
        <svg class="report-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9V2h12v7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <rect x="6" y="14" width="12" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        <div class="report-card-title">Print Inventory</div>
        <div class="report-card-desc">Export a formatted Word doc price sheet with item details in a printable grid.</div>
      </button>

      <button class="report-card" type="button" @click="showQrExportModal = true">
        <svg class="report-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/>
          <rect x="14" y="2" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/>
          <rect x="2" y="14" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/>
          <path d="M14 14h4v4h-4zM20 14v4h-2M14 20h4M20 20h0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="report-card-title">Print QR Labels</div>
        <div class="report-card-desc">Select bins and print QR code labels for warehouse scanning.</div>
      </button>

      <button class="report-card" type="button" @click="showLowStockModal = true">
        <svg class="report-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 9v4M12 17h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="report-card-title">Low Stock Export</div>
        <div class="report-card-desc">Find variations below a quantity threshold and export as CSV for reordering.</div>
      </button>

      <div class="report-card report-card-shopify">
        <svg class="report-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <div class="report-card-title">Shopify Export</div>
        <div class="report-card-desc">Export all variations as a Shopify-compatible CSV file.</div>
        <ShopifyExportVariations compact class="report-card-action" />
      </div>
    </div>

    <ExportPreviewModal
      v-if="showExportModal"
      @close="showExportModal = false"
    />

    <QrExportModal
      v-if="showQrExportModal"
      @close="showQrExportModal = false"
    />

    <LowStockExportModal
      v-if="showLowStockModal"
      @close="showLowStockModal = false"
    />
  </div>
</template>

<style scoped>
.reports-page {
  padding: 0 0 40px;
}

.reports-hero {
  text-align: center;
  padding: 48px 24px 32px;
}

.reports-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  max-width: 960px;
  margin: 0 auto;
  padding: 0 24px;
}

.report-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 20px;
  border: 1px solid rgba(18, 58, 138, 0.12);
  border-radius: 16px;
  background: #ffffff;
  cursor: pointer;
  text-align: center;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.report-card:hover {
  border-color: rgba(11, 99, 214, 0.3);
  box-shadow: 0 8px 24px rgba(14, 42, 99, 0.1);
}

.report-card-shopify {
  cursor: default;
}

.report-card-shopify:hover {
  border-color: rgba(11, 99, 214, 0.3);
  box-shadow: 0 8px 24px rgba(14, 42, 99, 0.1);
}

.report-icon {
  color: #0b63d6;
}

.report-card-title {
  font-size: 15px;
  font-weight: 700;
  color: #082145;
}

.report-card-desc {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.4;
}

.report-card-action {
  margin-top: 4px;
}
</style>
