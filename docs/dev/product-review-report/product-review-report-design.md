---
feature: product-review-report
complexity: simple
generated_by: droid
generated_at: 2026-07-28T00:00:00Z
version: 1
based_on: GitHub Issue #2
---

# 技术设计文档: 商品评论数统计报表 (Product Review-Count Report)

## 1. 背景与需求

来源：GitHub Issue #2「增加商品统计报表功能」。

1. 根据商品的评论数（`ReviewCount`），统计各区间的商品个数，以**柱形图**方式呈现。区间：
   - `500以下`：`[0, 500)`
   - `500-1500`：`[500, 1500)`
   - `1500-2500`：`[1500, 2500)`
   - `2500-3500`：`[2500, 3500)`
   - `3500-4500`：`[3500, 4500)`
   - `4500以上`：`[4500, +∞)`
2. 将该报表的链接挂在**导入页**上，点击可访问。

## 2. 架构决策

在已有「商品批量导入」全栈单体（Express + TypeScript + 原生前端 + node:sqlite）基础上**增量扩展**，复用既有分层与约定：

- **领域层（纯函数）** `src/domain/report.ts`：`computeReviewCountReport(products)` 负责分桶逻辑，无 IO，易于单测。区间边界采用「下界闭、上界开」`[min, max)`，`max === null` 表示无上界。
- **数据层**：直接复用既有 `findAll(db)`（数据量 ≤1000 行，全量读取后内存分桶即可，无需额外 SQL 聚合）。
- **接口层** `src/server/routes/report.routes.ts`：`createReportRouter(getDbFn)` 工厂函数，与 `import.routes.ts` 保持一致的依赖注入风格，便于测试注入内存库。
  - `GET /api/report/review-count` → `{ success, report }`。
- **装配** `src/server/app.ts`：`createApp` 增加可选 `overrideReportRouter` 参数并挂载 `/api/report`。
- **前端**：新增独立页面 `public/report.html` + `public/report.js`，用纯 DOM/CSS 渲染柱形图（不引入任何图表库，与既有原生前端风格一致）。导入页 `index.html` 顶部增加跳转链接。

### 数据契约

```ts
interface ReviewCountBucket { label: string; min: number; max: number | null; count: number; }
interface ReviewCountReport {
  buckets: ReviewCountBucket[]; // 固定 6 个，按展示顺序
  totalProducts: number;        // 全部商品数
  counted: number;              // 成功分桶的商品数
  missingReviewCount: number;   // ReviewCount 为 null/非法，未计入柱形图
}
```

### 关键取舍

- **null 评论数**：`ReviewCount` 可为空。空值不属于任何评论数区间，**排除**出六个柱子，单独以 `missingReviewCount` 汇总并在页面提示，避免把「无数据」误计入「500以下」造成统计失真。
- **边界归属**：`500` 归入 `500-1500`，`4500` 归入 `4500以上`（下界闭上界开），区间互斥且完整覆盖非负整数。
- **无图表库**：纯 CSS 柱状条（高度按最大值归一化），零新增依赖，保持轻量与可离线运行。

## 3. 测试策略

- `tests/report.test.ts`：领域分桶纯函数单测（边界值、null、负值、空输入、计数守恒）。
- `tests/report.api.test.ts`：`GET /api/report/review-count` 集成测试（空库、正常分桶、标签顺序），注入内存库。
