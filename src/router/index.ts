import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import PriceMeterView from '@/views/PriceMeterView.vue'
import MembersView from '@/views/MembersView.vue'
import OrdersView from '@/views/OrdersView.vue'
import DiscountsView from '@/views/DiscountsView.vue'
import PricesView from '@/views/PricesView.vue'
import RevenueView from '@/views/RevenueView.vue'
import AboutView from '@/views/AboutView.vue'
import NewOrderModal from '@/components/modals/NewOrderModal.vue'
import OrderDetailModal from '@/components/modals/OrderDetailModal.vue'
import DiscountModal from '@/components/modals/DiscountModal.vue'
import ExclusiveGroupModal from '@/components/modals/ExclusiveGroupModal.vue'
import MemberModal from '@/components/modals/MemberModal.vue'
import MemberTypeModal from '@/components/modals/MemberTypeModal.vue'
import PriceModal from '@/components/modals/PriceModal.vue'
import CategoryManagerModal from '@/components/modals/CategoryManagerModal.vue'
import LimitGroupModal from '@/components/modals/LimitGroupModal.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    // 计价器：/price-meter 为列表，/price-meter/:id 打开对某订单的计价弹窗（路由传参）
    {
      path: '/price-meter/:id?',
      name: 'price-meter',
      component: PriceMeterView,
    },
    {
      path: '/orders',
      name: 'orders',
      component: OrdersView,
      children: [
        { path: 'new', name: 'order-new', component: NewOrderModal },
        { path: ':id', name: 'order-detail', component: OrderDetailModal, props: true },
      ],
    },
    {
      path: '/members',
      name: 'members',
      component: MembersView,
      children: [
        { path: 'new', name: 'member-new', component: MemberModal },
        { path: ':id', name: 'member-edit', component: MemberModal, props: true },
        { path: 'types', name: 'member-types', component: MemberTypeModal },
      ],
    },
    {
      path: '/prices',
      name: 'prices',
      component: PricesView,
      children: [
        { path: 'new', name: 'price-new', component: PriceModal },
        { path: ':id', name: 'price-edit', component: PriceModal, props: true },
        { path: 'categories', name: 'categories', component: CategoryManagerModal },
      ],
    },
    {
      path: '/discounts',
      name: 'discounts',
      component: DiscountsView,
      children: [
        { path: 'new', name: 'discount-new', component: DiscountModal },
        { path: 'exclusive-groups', name: 'exclusive-groups', component: ExclusiveGroupModal },
        { path: 'limit-groups', name: 'limit-groups', component: LimitGroupModal },
        { path: ':id', name: 'discount-edit', component: DiscountModal, props: true },
      ],
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
