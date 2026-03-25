<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps({
    title: { type: String, default: 'Are you sure?' },
    message: { type: String, default: '' },
    confirmLabel: { type: String, default: 'Confirm' },
    isLoading: { type: Boolean, default: false },
    errorMessage: { type: String, default: '' },
});

const emit = defineEmits(['confirm', 'cancel']);
const dialogRef = ref(null);
let previousFocus = null;

function onKeydown(e) {
    if (e.key === 'Escape' && !props.isLoading) {
        emit('cancel');
        return;
    }
    if (e.key === 'Tab' && dialogRef.value) {
        const focusable = dialogRef.value.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
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
        <div class="confirm-backdrop" @click.self="!isLoading && emit('cancel')">
            <div ref="dialogRef" class="confirm-dialog" role="alertdialog" :aria-label="title">
                <div class="confirm-title">{{ title }}</div>
                <p v-if="message && !errorMessage" class="confirm-message" style="white-space: pre-line;" v-html="message"></p>
                <p v-if="errorMessage" class="confirm-error" role="alert">{{ errorMessage }}</p>

                <div class="confirm-actions">
                    <button class="btn secondary" type="button" :disabled="isLoading" @click="emit('cancel')">
                        {{ errorMessage ? 'Close' : 'Cancel' }}
                    </button>
                    <button
                        v-if="!errorMessage"
                        class="btn confirm-danger-btn"
                        type="button"
                        :disabled="isLoading"
                        @click="emit('confirm')"
                    >
                        {{ isLoading ? 'Deleting...' : confirmLabel }}
                    </button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.confirm-backdrop {
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

.confirm-dialog {
    width: 100%;
    max-width: 400px;
    padding: 28px;
    border-radius: 20px;
    background: #ffffff;
    box-shadow: 0 24px 60px rgba(14, 42, 99, 0.18);
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.confirm-title {
    font-size: 20px;
    font-weight: 800;
    color: #082145;
}

.confirm-message {
    margin: 0;
    color: #374151;
    font-size: 15px;
    line-height: 1.5;
}

.confirm-error {
    margin: 0;
    color: #b91c1c;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.5;
}

.confirm-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 4px;
}

.confirm-danger-btn {
    background: linear-gradient(90deg, #dc2626, #ef4444);
}

.confirm-danger-btn:hover {
    box-shadow: 0 18px 40px rgba(220, 38, 38, 0.2);
}
</style>
