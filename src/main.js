import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { initAuth } from './lib/auth';
import '../styles.css';

// Initialize auth (and consume any invite/reset link in the URL) before
// mounting, so the router sees a clean URL and the correct session.
initAuth().finally(() => {
  createApp(App).use(router).mount('#app');
});
