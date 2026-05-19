## 目标

让 Education 用户在 Cases（`/customers`）列表就能直接看到并使用 Pipeline、Additional Services、Comparison 三个新功能，而不是埋在 customer detail 页里。

---

## 1. 卡片快捷按钮（每个 case 一行）

在 `src/routes/customers.tsx` 现有 `📲 WA` 按钮旁，仅当 `bizType === "education"` 时显示三个小图标按钮：

- 📞 **Pipeline** → 跳到 `/customer/$customerId` 并锚到 `#pipeline`
- 🎓 **Services** → 跳到 `/customer/$customerId` 并锚到 `#services`
- ☑️ **Compare select**（多选模式才出现，详见第 3 点）

为支持锚点，在 `src/routes/customer.$customerId.tsx` 给 `<FollowupPipeline>` 和 `<AdditionalServices>` 外层 section 加上 `id="pipeline"` / `id="services"`，并在 mount 时根据 `location.hash` 自动 scrollIntoView。

卡片上同时显示一个迷你 pipeline 进度条（已完成 stage / 10），从 `education_followup_stages` 聚合（在现有 eduDetails 那个 useEffect 里多查一次 `count`）。

---

## 2. 列表顶部工具栏

在 header 那行（"Cases · 12 total · ⚖️ Compare"）之下，Education 模式追加一行横向滚动按钮：

- **📊 Pipeline Overview** → 新路由 `/pipeline-overview`（见第 4 点）
- **🎓 Services Summary** → 新路由 `/services-summary`（见第 4 点）
- **⚖️ Compare**（已存在）
- **🔀 Kanban View** → 切到 Kanban tab（见第 3 点）

---

## 3. List / Kanban Tab 切换

在 `customers.tsx` 加 `viewMode: "list" | "kanban"` state。Education 时显示 tab 切换器；其它 bizType 不显示，保持原样。

Kanban 视图：
- 横向滚动的 10 列，对应 `FOLLOWUP_STAGES`（Initial Contact … Enrolled）
- 每个 case 一次性 fetch 它的 `current_followup_stage`，按 stage 分组渲染成小卡（头像 + 姓名 + 大学）
- 点小卡 → 跳到 detail 页 `#pipeline`
- 长按或拖拽暂不做（保持轻量）

新组件：`src/components/CasesKanban.tsx`，接收 `customers` 和 `eduStages` map。

---

## 4. 两个汇总页

新建两个 route 文件，纯只读聚合视图：

### `src/routes/pipeline-overview.tsx`
- 顶部统计卡：每个 stage 的 case 数量条形图
- 下方按 stage 分组列出 case，点击进 detail `#pipeline`
- "本周需跟进"（has overdue follow_ups）置顶提醒

### `src/routes/services-summary.tsx`
- 列出所有 `education_additional_services` 行，按服务类型分组（Hostel / Scholarship / PTPTN / Visa…）
- 显示每项的状态 + 总费用合计
- 点 case 名进 detail `#services`

两个页面在 `__root.tsx` 的底部导航无需加 tab；只通过 customers 工具栏入口进入。

---

## 5. i18n keys（3 语言 BM / 中文 / EN）

在 `src/contexts/I18nContext.tsx` 追加：

```
view_list, view_kanban,
pipeline_overview, services_summary,
weekly_followup, stage_distribution,
mini_progress, // e.g. "{done}/10 stages"
quick_pipeline, quick_services
```

---

## 6. 技术细节（仅给开发者参考）

- 不需要新的 DB 迁移；所有数据来自上一次已建好的 `education_followup_stages` / `education_additional_services` / `client_education_details`。
- `customers.tsx` 的 eduDetails useEffect 扩展为同时拉 stages count，组装成 `{ clientId: { stagesDone, totalStages, currentStage, ... } }`。
- 锚点滚动：在 `customer.$customerId.tsx` `useEffect(() => { const h = window.location.hash; if (h) document.querySelector(h)?.scrollIntoView({ behavior: "smooth" }); }, [loading])`。
- Kanban 列宽 `w-64 shrink-0`，外层 `overflow-x-auto snap-x`。

---

## 文件清单

新增：
- `src/components/CasesKanban.tsx`
- `src/routes/pipeline-overview.tsx`
- `src/routes/services-summary.tsx`

修改：
- `src/routes/customers.tsx`（卡片快捷按钮、工具栏、List/Kanban tab、mini progress、扩展 eduDetails fetch）
- `src/routes/customer.$customerId.tsx`（给 pipeline / services 加 `id` + hash 自动 scroll）
- `src/contexts/I18nContext.tsx`（新 keys × 3 语言）

不动：数据库、其他 bizType 的 UI、现有 detail 页的所有逻辑。
