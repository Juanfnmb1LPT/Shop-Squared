<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { updatePassword } from '../lib/auth';

const router = useRouter();

const password = ref('');
const confirm = ref('');
const errorMessage = ref('');
const isSubmitting = ref(false);

async function onSubmit() {
  errorMessage.value = '';

  if (password.value !== confirm.value) {
    errorMessage.value = 'Passwords do not match.';
    return;
  }

  isSubmitting.value = true;
  const result = await updatePassword(password.value);
  if (!result.ok) {
    errorMessage.value = result.error || 'Could not set your password.';
    isSubmitting.value = false;
    return;
  }

  await router.replace('/');
  isSubmitting.value = false;
}
</script>

<template>
  <div class="card login-card">
    <div class="hero">
      <div class="hero-title">Set your password</div>
      <div class="hero-sub">Choose a password to finish setting up your account.</div>
    </div>

    <form class="login-form" @submit.prevent="onSubmit">
      <label class="login-label" for="password">New password</label>
      <input id="password" v-model="password" class="login-input" type="password" autocomplete="new-password" minlength="6" required />

      <label class="login-label" for="confirm">Confirm password</label>
      <input id="confirm" v-model="confirm" class="login-input" type="password" autocomplete="new-password" minlength="6" required />

      <p v-if="errorMessage" class="login-error" role="alert">{{ errorMessage }}</p>

      <button class="btn login-submit" type="submit" :disabled="isSubmitting">
        {{ isSubmitting ? 'Saving...' : 'Save Password' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.login-card {
  max-width: 520px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 360px;
  margin: 8px auto 0;
}

.login-label {
  color: #0f1f46;
  font-size: 14px;
  font-weight: 700;
}

.login-input {
  width: 100%;
  height: 42px;
  padding: 10px 12px;
  border: 1px solid rgba(18, 58, 138, 0.2);
  border-radius: 10px;
  font: inherit;
  color: #082145;
}

.login-input:focus {
  outline: 2px solid rgba(14, 165, 255, 0.35);
  outline-offset: 1px;
}

.login-error {
  margin: 4px 0 0;
  color: #b42318;
  font-size: 13px;
  font-weight: 600;
}

.login-submit {
  margin-top: 6px;
}
</style>
