import { createRouter, createWebHashHistory } from 'vue-router';

const HomeView = () => import('../views/HomeView.vue');
const PreConView = () => import('../views/PreConView.vue');
const PostConView = () => import('../views/PostConView.vue');
const ShopifyToSquareView = () => import('../views/ShopifyToSquareView.vue');
const UpdateQuantityView = () => import('../views/UpdateQuantityView.vue');

const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        { path: '/', name: 'home', component: HomeView },
        { path: '/pre-con', name: 'pre-con', component: PreConView },
        { path: '/post-con', name: 'post-con', component: PostConView },
        { path: '/shopify-to-square', name: 'shopify-to-square', component: ShopifyToSquareView },
        { path: '/update-quantity', name: 'update-quantity', component: UpdateQuantityView },
    ],
});

export default router;
