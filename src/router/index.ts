import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import PriceMeterView from '@/views/PriceMeterView.vue'
import MembersView from '@/views/MembersView.vue'
import OrdersView from '@/views/OrdersView.vue'
import DiscountsView from '@/views/DiscountsView.vue'
import RevenueView from '@/views/RevenueView.vue'
import AboutView from '@/views/AboutView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/price-meter',
      name: 'price-meter',
      component: PriceMeterView,
    },
    {
      path: '/orders',
      name: 'orders',
      component: OrdersView,
    },
    {
      path: '/members',
      name: 'members',
      component: MembersView,
    },
    {
      path: '/discounts',
      name: 'discounts',
      component: DiscountsView,
    },
    {
      path: '/revenue',
      name: 'revenue',
      component: RevenueView,
    },
    {
      path: '/about',
      name: 'about',
      component: AboutView,
    },
  ],
})

export default router
