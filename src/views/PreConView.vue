<script setup>
import { ref } from 'vue';
import { convertShopifyToSquareCsv } from '../lib/convertShopToSquare';
import { downloadCsv } from '../lib/downloadCsv';

const csvFile = ref(null);
const fileName = ref('No file chosen');
const isProcessing = ref(false);

function onFileChange(event) {
  const file = event.target.files?.[0] || null;
  csvFile.value = file;
  fileName.value = file ? file.name : 'No file chosen';
}

async function onConvert() {
  if (!csvFile.value) {
    window.alert('Upload a Shopify CSV first.');
    return;
  }

  isProcessing.value = true;
  try {
    const csvText = await convertShopifyToSquareCsv(csvFile.value);
    downloadCsv(csvText, 'square_import.csv');
  } catch (error) {
    window.alert(`Error processing file: ${error?.message || error}`);
  } finally {
    isProcessing.value = false;
  }
}
</script>

<template>
  <div class="card spacious tool-card step-card">
    <div class="hero">
      <div class="hero-title">Pre-Con Steps</div>
      <div class="hero-sub">Follow these steps before running the Shopify → Square conversion.</div>
    </div>

    <ol class="step-list">
      <li>Export CSV from Shopify.</li>
      <li>Upload Shopify CSV below.</li>
      <li>Click <strong>Download Square Ready CSV</strong> to create the Square file.</li>
    </ol>

    <div class="function-block">
      <div class="function-callout">
        <strong>What this function does:</strong>
        <br>
        Reads the Shopify CSV and creates a Square-ready CSV mapped by key fields such as <strong>SKU</strong>, <strong>Handle</strong>, etc.
      </div>

      <div class="note-container">
        <label class="file-control">
          <span class="file-btn">Choose File</span>
          <span class="file-name">{{ fileName }}</span>
          <input type="file" accept=".csv" @change="onFileChange" />
        </label>
        <button class="btn" type="button" :disabled="isProcessing" @click="onConvert">
          {{ isProcessing ? 'Processing…' : 'Download Square Ready CSV' }}
        </button>
      </div>
    </div>

    <ol class="step-list" start="4">
      <li>Upload the Square CSV to Square and check for errors.</li>
    </ol>
  </div>
</template>
