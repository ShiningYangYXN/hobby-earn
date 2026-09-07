# HobbyEarn · 玩赚·商家端

面向个人小本生意 / 兴趣副业的商家端管理工具：开单计费、会员管理、服务与优惠配置、收益统计，全部数据本地存储、离线可用。纯前端单页应用，无需后端服务器。

## 功能特性

- **首页看板**：实时展示今日 / 本月 / 累计收入与已完成单数，数字滚动动画；最近订单一览。
- **计价器**：按「工时」(hourly) 或「计件」(perPiece) 两种模式计费，内置秒表对工时项目计时，实时计算小计与优惠后金额。
- **订单管理**：创建订单、添加会员与服务项、应用自动 / 手动优惠，支持待处理 / 执行中 / 已完成 / 已关闭多状态流转，可重开、编辑与撤销。
- **会员管理**：维护会员档案与会员类型，支持专属服务（仅指定会员或类型可用）。
- **服务管理**：配置服务项（工时 / 计件、基础价、品类归属），支持专属服务、限购、服务互斥组与限购组。
- **优惠管理**：高度灵活的「指标组合」优惠引擎，内置最优券推荐与稀缺 / 临期提示（详见下文「优惠系统」）。
- **收益统计**：按时间维度汇总收入，三合一缓存核算避免重复计算。
- **数据管理（关于页）**：一键导出 / 导入 / 合并备份（JSON），合并冲突可手动逐条求解；「实验室 / 作弊模式」解锁后支持清空与递归清理（连续点击首页 Logo 5 次解锁）。

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 框架 | Vue 3（`<script setup>` + TSX 列定义） |
| 语言 | TypeScript（全程严格类型） |
| 构建 | Vite 8 |
| 状态 | Pinia 4 |
| UI | Naive UI 2（含暗色主题、ConfigProvider 注入 CSS 变量） |
| 路由 | vue-router 5 |
| 图标 | @tabler/icons-vue |
| 工具 | @vueuse/core（暗色切换等）、lite-hl（JSON 语法高亮） |
| 校验 | oxlint + ESLint、vue-tsc 类型检查、oxfmt 格式化 |
| 存储 | IndexedDB（自封装，零依赖；不使用 localStorage） |
| 包管理 | pnpm |

## 目录结构

```
src/
├── assets/                # 全局样式（main.css）与静态资源
├── components/
│   ├── columns/           # NDataTable 列定义（.tsx，按页面划分）
│   ├── modals/            # 各类新增 / 编辑弹窗
│   └── ...                # 复用的展示 / 业务组件
├── composables/           # 通用组合式函数（如类型管理 useTypeManage）
├── router/                # 路由表（默认导出）
├── stores/                # Pinia stores + 数据层
│   ├── db.ts              # IndexedDB 封装：增删改查 / 导入导出 / 合并校验
│   ├── types.ts           # 全部领域模型类型与工具函数
│   ├── useOrderStore.ts   # 订单与收入核算
│   ├── useMemberStore.ts / useMemberTypeStore.ts
│   ├── useServiceStore.ts / 服务互斥组 / 限购组 stores
│   ├── useDiscountStore.ts# 优惠计算核心（calcDiscount / 推荐引擎）
│   ├── useCategoryStore.ts
│   ├── useExclusiveGroupStore.ts / useLimitGroupStore.ts
│   └── useUiStore.ts      # 主题、实验室开关等界面状态
└── views/                 # 8 个页面：Home / PriceMeter / Orders / Members /
                           #   Services / Discounts / Revenue / About
```

## 快速开始

### 环境要求

- Node.js `^22.18.0 || >=24.12.0`
- pnpm（推荐；亦可用 npm / yarn，对应脚本一致）

### 安装与运行

```sh
pnpm install      # 安装依赖
pnpm dev          # 启动开发服务器，终端会打印本地访问地址（默认 http://localhost:5173）
```

### 构建与预览

```sh
pnpm build        # 类型检查 + 生产构建，产物输出到 dist/
pnpm preview      # 预览生产构建
```

### 常用脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动 Vite 开发服务器（热更新） |
| `pnpm build` | 依次执行 `type-check` 与 `build-only` 产出生产包 |
| `pnpm build-only` | 仅执行 `vite build`（跳过类型检查） |
| `pnpm type-check` | 使用 `vue-tsc --build` 做全量类型检查 |
| `pnpm lint` | 并行运行 `oxlint --fix` 与 `eslint --fix --cache` |
| `pnpm format` | 使用 `oxfmt` 格式化 `src/` |

## 核心设计

### 金额一律以「分」存储

所有金额（订单小计、优惠减免、服务价格等）在数据库与运行时内部均以整数「分」表示，仅在展示层通过 `fmt()` 转换为 `¥xx.xx`，从根本上规避浮点精度误差。

### 本地优先存储

全部业务数据存于浏览器 IndexedDB（库名 `hobby-earn-db`），封装见 `src/stores/db.ts`，提供 `getAll / put / add / del / clear`、`exportAll / importAll / mergeAll / mergeManual / detectMergeConflicts / validateBackup` 等能力。项目不使用 `localStorage`（隐私模式下 `setItem` 会抛错），保证隐私浏览与离线可用。当前版本不提供旧数据迁移（假定从零开始）。

### 优惠系统（指标组合模型）

一个优惠由多个相互独立的指标自由组合而成，无需预定义「优惠类型」：

- **执行方式 `ruleType`**：`fixed`（满减 / 立减）、`percentage`（打折，0–100 表示乘客支付比例，如 85 = 8.5 折）、`stepDown`（每满减，阶梯步长 `stepAmount`）、`perItem`（件件减）。
- **作用域 `scope`**（可多选）：指定会员类型、指定会员、指定时段（含 cron 周期 `timeWindow`）、指定品类、指定单品；全部命中才生效，省略即不限。
- **随机 `random`**：随机立减（`amount`）或随机打折（`ratio`），范围随机，订单捕获后固化为 `DiscountRecord`，不再随定义变化。
- **概率触发 `triggerChance`**：0–100 概率，仅对无券码的自动优惠生效。
- **券码 `couponCode`**：固定 6 位大写（字符集剔除易混淆 I/O/0/1）；非空 = 需手动兑换且不得自动触发，空 = 自动触发。触发方式完全由券码是否非空推导。
- **限量 / 封顶**：`usageLimit`（总次数）、`memberLimit`（每会员次数）、`maxDiscount`（减免封顶）、`maxUnits`（`perItem` 立减件数 / `stepDown` 阶梯数上限）。
- **互斥组 `exclusiveGroupIds` / 上限组 `limitGroups`**：可归属多个，执行时须同时满足各组规则；互斥按「候选在其每个所属组都是当前减免最大者」裁决，上限组按组内最小缩放系数一次性封顶。

订单落库时，命中的优惠会写入 `Order.discountRecords`，固化名称、执行方式、作用域快照与随机捕获值，确保历史订单金额不受后续优惠定义改动影响。结算面板内置「推荐选券」：按优惠额最大 → 用券数最少 → 优先消耗稀缺券 → 优先消耗临期券给出最优组合，用户也可手动改写。

### 计价器

`PriceMeterView` 以路由 `/price-meter/:id?` 承载：无参数时进入列表，带订单 id 时打开该订单的计费弹窗。「计费节点」= 所有秒表暂停，此时触发随机优惠的资格与数额捕获；金额随小计实时跳动，打开弹窗即算一次。

### 实验室与数据管理

- 关于页默认展示「数据导入导出」卡片，支持导出当前全部数据、导入覆盖、合并（含冲突自动检测与手动逐条求解，JSON 预览经 `lite-hl` 高亮并跟随 Naive 主题）。
- 连续快速点击首页产品 Logo 5 次解锁「实验室」：内含「作弊模式」开关（绕过部分业务校验，用于调试）与「清空全部数据」。

## 部署

`pnpm build` 生成静态站点于 `dist/`，可直接托管到任意静态文件服务器（Nginx、GitHub Pages、Vercel 等）。因数据存于用户浏览器本地 IndexedDB，无需服务端数据库；若使用子路径部署，请相应配置 `base`（见 `vite.config.ts` 的 `resolve.alias` 与 `import.meta.env.BASE_URL`）。

## 许可

MIT License。项目仓库：<https://github.com/ShiningYangYXN/hobby-earn>
