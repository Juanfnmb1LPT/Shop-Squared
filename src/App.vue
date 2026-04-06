<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import logoUrl from '../assets/lpt_realty.png';
import { isAuthenticated, logout } from './lib/auth';

const isNavOpen = ref(false);
const route = useRoute();
const router = useRouter();
const shouldShowShell = computed(() => route.name !== 'login');

const GROUP_ROUTES = {
  conversion: ['/pre-con', '/post-con', '/shopify-to-square', '/update-quantity'],
  inventory: ['/search-inventory', '/update-inventory', '/reports'],
};

function loadNavGroups() {
  try {
    const saved = JSON.parse(localStorage.getItem('nav-groups'));
    if (saved) return { conversion: saved.conversion ?? true, inventory: saved.inventory ?? true };
  } catch {}
  return { conversion: true, inventory: true };
}

const navGroups = ref(loadNavGroups());

function toggleGroup(key) {
  navGroups.value[key] = !navGroups.value[key];
  localStorage.setItem('nav-groups', JSON.stringify(navGroups.value));
}

// Auto-expand group if active route is inside a collapsed group
watch(() => route.path, (path) => {
  for (const [key, routes] of Object.entries(GROUP_ROUTES)) {
    if (routes.some(r => path.startsWith(r)) && !navGroups.value[key]) {
      navGroups.value[key] = true;
      localStorage.setItem('nav-groups', JSON.stringify(navGroups.value));
    }
  }
}, { immediate: true });

function toggleNav() {
  isNavOpen.value = !isNavOpen.value;
}

function closeNav() {
  isNavOpen.value = false;
}

function handleLogout() {
  if (!isAuthenticated()) {
    return;
  }

  logout();
  closeNav();
  router.replace('/login');
}
</script>

<template>
  <div class="app-layout">
    <header v-if="shouldShowShell" class="mobile-topbar">
      <div class="mobile-topbar-brand">
        <img :src="logoUrl" alt="LPT Realty logo" width="44" height="44" />
        <div class="mobile-topbar-title">Shop²</div>
      </div>

      <button
        type="button"
        class="mobile-nav-trigger"
        @click="toggleNav"
        aria-label="Open navigation menu"
        :aria-expanded="isNavOpen ? 'true' : 'false'"
      >
        <span class="nav-toggle-bar"></span>
        <span class="nav-toggle-bar"></span>
        <span class="nav-toggle-bar"></span>
      </button>
    </header>

    <aside v-if="shouldShowShell" class="dashboard" :class="{ 'is-mobile-open': isNavOpen }">
      <div class="dashboard-header">
        <div class="dashboard-brand">
          <img :src="logoUrl" alt="LPT Realty logo" width="88" height="88" />
          <div class="dashboard-title">Shop²</div>
        </div>

        <button
          type="button"
          class="nav-collapse-btn"
          aria-label="Close navigation menu"
          @click="closeNav"
        >
          Close
        </button>

      </div>

      <nav class="dashboard-nav" :class="{ 'is-open': isNavOpen }">
        <router-link class="nav-group-toggle nav-top-link" to="/" @click="closeNav">
          <span class="nav-group-label">
            <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 10.5 12 3l9 7.5" />
              <path d="M6 9.5V21h12V9.5" />
            </svg>
            <span>Home</span>
          </span>
          <span class="nav-group-arrow nav-group-arrow-placeholder" aria-hidden="true"></span>
        </router-link>

        <div class="nav-group">
          <button class="nav-group-toggle nav-top-link" type="button" @click="toggleGroup('inventory')">
            <span class="nav-group-label">
              <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 4h6" />
                <path d="M9 4a2 2 0 0 0-2 2v1h10V6a2 2 0 0 0-2-2" />
                <path d="M6 7h12v13H6z" />
                <path d="M9 12h6" />
                <path d="M9 16h6" />
              </svg>
              <span>Inventory</span>
            </span>
            <span class="nav-group-arrow" :class="{ open: navGroups.inventory }">&#x25B8;</span>
          </button>
          <div v-if="navGroups.inventory" class="nav-group-links">
            <router-link class="dash-link" to="/search-inventory" @click="closeNav">Search Inventory</router-link>
            <router-link class="dash-link" to="/update-inventory" @click="closeNav">Update Inventory</router-link>
            <router-link class="dash-link" to="/reports" @click="closeNav">Reports</router-link>
          </div>
        </div>

        <div class="nav-group">
          <button class="nav-group-toggle nav-top-link" type="button" @click="toggleGroup('conversion')">
            <span class="nav-group-label">
              <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 7h11" />
                <path d="m15 4 3 3-3 3" />
                <path d="M17 17H6" />
                <path d="m9 14-3 3 3 3" />
              </svg>
              <span>Conversion Tools</span>
            </span>
            <span class="nav-group-arrow" :class="{ open: navGroups.conversion }">&#x25B8;</span>
          </button>
          <div v-if="navGroups.conversion" class="nav-group-links">
            <router-link class="dash-link" to="/pre-con" @click="closeNav">Pre-Con Steps</router-link>
            <router-link class="dash-link" to="/post-con" @click="closeNav">Post-Con Steps</router-link>
            <router-link class="dash-link" to="/shopify-to-square" @click="closeNav">Shopify to Square</router-link>
            <router-link class="dash-link" to="/update-quantity" @click="closeNav">Update Shopify Quantity</router-link>
          </div>
        </div>

      </nav>
      <button class="nav-group-toggle nav-top-link logout-link" type="button" @click="handleLogout">
        <span class="nav-group-label">
          <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 5H5v14h5" />
            <path d="M14 12H6" />
            <path d="m11 9 3 3-3 3" />
            <path d="M20 3h-6" />
            <path d="M20 21h-6" />
          </svg>
          <span>Logout</span>
        </span>
        <span class="nav-group-arrow nav-group-arrow-placeholder" aria-hidden="true"></span>
      </button>
    </aside>

    <button
      v-if="shouldShowShell && isNavOpen"
      type="button"
      class="nav-overlay"
      aria-label="Close navigation menu"
      @click="closeNav"
    ></button>

    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>
