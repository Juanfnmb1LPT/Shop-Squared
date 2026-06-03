<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { loginWithEmail, sendPasswordReset } from '../lib/auth';

const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const errorMessage = ref('');
const infoMessage = ref('');
const isSubmitting = ref(false);

async function onSubmit() {
  errorMessage.value = '';
  infoMessage.value = '';
  isSubmitting.value = true;

  const result = await loginWithEmail(email.value, password.value);
  if (!result.ok) {
    errorMessage.value = result.error || 'Invalid email or password.';
    isSubmitting.value = false;
    return;
  }

  const redirectTarget = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
  await router.replace(redirectTarget);
  isSubmitting.value = false;
}

async function onForgotPassword() {
  errorMessage.value = '';
  infoMessage.value = '';

  const result = await sendPasswordReset(email.value);
  if (!result.ok) {
    errorMessage.value = result.error || 'Could not send reset email.';
    return;
  }

  infoMessage.value = 'If that email has an account, a password reset link is on its way.';
}
</script>

<template>
  <div class="card login-card">
    <div class="hero">
      <div class="hero-title">Login</div>
      <div class="hero-sub">Sign in to access CSV Converter tools.</div>
    </div>

    <form class="login-form" @submit.prevent="onSubmit">
      <label class="login-label" for="email">Email</label>
      <input id="email" v-model="email" class="login-input" type="email" autocomplete="email" required />

      <label class="login-label" for="password">Password</label>
      <input id="password" v-model="password" class="login-input" type="password" autocomplete="current-password" required />

      <p v-if="errorMessage" class="login-error" role="alert">{{ errorMessage }}</p>
      <p v-if="infoMessage" class="login-info" role="status">{{ infoMessage }}</p>

      <button class="btn login-submit" type="submit" :disabled="isSubmitting">
        {{ isSubmitting ? 'Signing In...' : 'Sign In' }}
      </button>

      <button class="login-forgot" type="button" @click="onForgotPassword">Forgot password?</button>
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

.login-info {
  margin: 4px 0 0;
  color: #0b6b3a;
  font-size: 13px;
  font-weight: 600;
}

.login-submit {
  margin-top: 6px;
}

.login-forgot {
  margin-top: 2px;
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0;
  color: #123a8a;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}
</style>
