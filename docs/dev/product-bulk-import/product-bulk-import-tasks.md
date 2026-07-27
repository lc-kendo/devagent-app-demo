---
feature: product-bulk-import
complexity: standard
generated_by: architect-planner
generated_at: 2026-07-27T00:00:00Z
version: 1
based_on: product-bulk-import-design.md
---

# 任务清单: 商品批量导入 (Product Bulk Import)

## 任务总览

| ID | 任务 | 优先级 | 复杂度 | 并行组 | 依赖 |
|----|------|--------|--------|--------|------|
| T-001 | 项目初始化与基础架构搭建 | P0 | simple | G1 | 无 |
| T-002 | 领域 Schema 与共享类型定义 | P0 | simple | G2 | T-001 |
| T-003 | CSV 解析器（表头验证 + 逐行解析） | P0 | standard | G3 | T-002 |
| T-004 | 校验器（5 类规则 + 文件内唯一） | P0 | standard | G3 | T-002 |
| T-005 | SQLite 连接与 ProductRepository（Upsert） | P0 | standard | G3 | T-002 |
| T-006 | 后端 API 路由（preview + confirm） | P0 | standard | G4 | T-003, T-004, T-005 |
| T-007 | 前端两阶段交互 UI（上传→预览→确认→结果） | P1 | standard | G5 | T-006 |
| T-008 | 端到端集成测试 + 测试 fixtures | P1 | standard | G5 | T-006 |

预期并行执行路径：G1 → G2 → G3(T-003/T-004/T-005 并行) → G4 → G5(T-007/T-008 并行)。

---

## 任务详情

## T-001: 项目初始化与基础架构搭建

**并行组**: G1
**优先级**: P0
**依赖**: 无
**复杂度**: simple
**执行方式**: agent
**推荐模型**: sonnet
**预估文件数**: 6
**注入技能 (injected_skills)**: [test-governance]
**预估工时**: 3h
**涉及文件**:
- package.json
- tsconfig.json
- vitest.config.ts
- .gitignore
- src/server/index.ts
- src/server/app.ts

**描述**:
搭建 Node.js + TypeScript 项目脚手架。安装依赖：express、multer、better-sqlite3、csv-parse；开发依赖：typescript、tsx、vitest、supertest、@types/*。配置 tsconfig（ESM/CommonJS 二选一并统一）、npm scripts（dev / build / test / start）。创建 Express `app.ts`（装配 JSON 中间件、静态托管 `public/`、健康检查路由、全局错误中间件占位）与启动入口 `index.ts`（监听端口）。`.gitignore` 排除 `node_modules`、`data/*.db`、`dist`。

**验收标准**:
- [ ] `npm install` 成功，无 peer 依赖冲突
- [ ] `npm run build`（tsc）编译无错误
- [ ] `npm run dev` 服务器启动成功，健康检查路由（如 `GET /health`）返回 200
- [ ] `npm test` 可运行（即使暂无测试也不报错）
- [ ] `.gitignore` 正确排除 data 数据库与构建产物

---

## T-002: 领域 Schema 与共享类型定义

**并行组**: G2
**优先级**: P0
**依赖**: T-001
**复杂度**: simple
**执行方式**: agent
**推荐模型**: sonnet
**预估文件数**: 2
**注入技能 (injected_skills)**: []
**预估工时**: 2h
**涉及文件**:
- src/domain/schema.ts
- src/shared/types.ts

**描述**:
定义系统类型基座（其余组件的公共依赖，故独立前置）。在 `schema.ts` 中定义：固定表头常量数组（12 列，顺序严格）、字段元数据（每列的必填标志、数据类型、范围约束）、`Product` 类型、`RawRow` 类型（`Record<列名,string>` + rowNumber）。在 `shared/types.ts` 中定义前后端共享 DTO：`PreviewResponse`、`ConfirmRequest`、`ConfirmResponse`、`InvalidRow`、`ValidRow`、`ImportSummary`、错误码枚举（`INVALID_FILE_TYPE` | `EMPTY_FILE` | `HEADER_MISMATCH` | `ROW_LIMIT_EXCEEDED` | `PARSE_ERROR` | `VALIDATION_FAILED`）。

**验收标准**:
- [ ] 表头常量恰为 12 列且顺序与需求一致
- [ ] 字段元数据完整覆盖必填/数值范围/日期约束信息
- [ ] Product / RawRow / 各 DTO 类型定义完整并可被其他模块 import
- [ ] TypeScript 编译无错误

---

## T-003: CSV 解析器（表头验证 + 逐行解析）

**并行组**: G3
**优先级**: P0
**依赖**: T-002
**复杂度**: standard
**执行方式**: agent
**推荐模型**: sonnet
**预估文件数**: 2
**注入技能 (injected_skills)**: [test-governance]
**预估工时**: 3h
**涉及文件**:
- src/domain/csv-parser.ts
- tests/csv-parser.test.ts

**描述**:
实现 `parseCsv(buffer: Buffer): ParseResult`。采用 `csv-parse/sync` 解析；以 UTF-8 解码并剥离 BOM（防首列表头匹配失败）；严格验证表头（缺列/多列/顺序错误 → 抛 HeaderMismatchError 并给出 missing/unexpected/orderMismatch 明细）；空文件（无数据行）抛 EmptyFileError；>1000 行抛 RowLimitError；正确处理引号包裹的含逗号字段与中英文混排。产出 `RawRow[]`（含 rowNumber，表头为第 1 行，首数据行为 2）。采用 TDD，先写测试。

**验收标准**:
- [ ] 合法 CSV 正确解析为行数组，rowNumber 从 2 起递增
- [ ] 表头缺列/多列/乱序分别被检出并返回准确 detail
- [ ] 空文件、超 1000 行分别抛出对应错误
- [ ] 带 BOM 的 UTF-8 文件表头匹配成功
- [ ] 含引号逗号字段、中英文混排内容解析正确
- [ ] 单元测试覆盖以上全部场景且通过

---

## T-004: 校验器（5 类规则 + 文件内唯一）

**并行组**: G3
**优先级**: P0
**依赖**: T-002
**复杂度**: standard
**执行方式**: agent
**推荐模型**: sonnet
**预估文件数**: 2
**注入技能 (injected_skills)**: [test-governance]
**预估工时**: 4h
**涉及文件**:
- src/domain/validator.ts
- tests/validator.test.ts

**描述**:
实现 `validateRows(rows: RawRow[]): ValidationResult`。逐行应用规则：必填（ProductID/ProductName/Category/Brand/Price 非空）、数值范围（Price≥0、OriginalPrice≥0、Stock≥0 整数、Rating∈[0,5]）、日期（LaunchDate 非空时须为合法 YYYY-MM-DD）；跨行检测文件内 ProductID 唯一（重复行全部标记非法，错误信息指出冲突行号）。合法行转为 Product（字符串→数值/日期类型转换），非法行产出 `{ rowNumber, raw, errors: string[] }`，错误信息为中文可读。采用 TDD。

**验收标准**:
- [ ] 每类规则均有正反用例且判定正确
- [ ] 单行多错误时 errors 数组聚合全部错误
- [ ] 文件内 ProductID 重复被检出，涉及行全部标记非法
- [ ] Stock 非整数（如 5.5）、负数被判非法；Rating 越界被判非法
- [ ] LaunchDate 如 `2024/13/40` 被判非法，`2024-03-15` 通过
- [ ] 合法行正确完成类型转换（Price/Rating 为 number，可空列缺省为 null）
- [ ] 单元测试覆盖以上全部场景且通过

---

## T-005: SQLite 连接与 ProductRepository（Upsert）

**并行组**: G3
**优先级**: P0
**依赖**: T-002
**复杂度**: standard
**执行方式**: agent
**推荐模型**: sonnet
**预估文件数**: 3
**注入技能 (injected_skills)**: [test-governance]
**预估工时**: 4h
**涉及文件**:
- src/db/connection.ts
- src/db/product.repository.ts
- tests/product.repository.test.ts

**描述**:
实现 SQLite 连接（better-sqlite3）与建表迁移（`CREATE TABLE IF NOT EXISTS products`，含 created_at/updated_at 默认值，见 design DDL）。实现 `ProductRepository`：`findByProductId(id)`、`upsertMany(products)` —— 先 `SELECT product_id ... WHERE product_id IN (...)` 得已存在集合分类计数（inserted/updated），再在单事务中执行 `INSERT ... ON CONFLICT(product_id) DO UPDATE SET ..., updated_at=datetime('now')`。全部使用参数化预编译语句。测试可用内存库（`:memory:`）。采用 TDD。

**验收标准**:
- [ ] 建表迁移幂等，重复初始化不报错
- [ ] 新记录 upsert 后 findByProductId 可查到，created_at/updated_at 有值
- [ ] 已存在 ProductID upsert 后字段被更新且 updated_at 刷新，created_at 不变
- [ ] upsertMany 返回准确的 inserted/updated 计数
- [ ] 整批在单事务内提交（可通过异常回滚验证）
- [ ] 全部 SQL 使用参数化占位符，无字符串拼接
- [ ] 单元测试覆盖以上全部场景且通过

---

## T-006: 后端 API 路由（preview + confirm）

**并行组**: G4
**优先级**: P0
**依赖**: T-003, T-004, T-005
**复杂度**: standard
**执行方式**: agent
**推荐模型**: sonnet
**预估文件数**: 2
**注入技能 (injected_skills)**: [test-governance]
**预估工时**: 4h
**涉及文件**:
- src/server/routes/import.routes.ts
- src/server/app.ts

**描述**:
装配两个接口（契约见 design §3）。`POST /api/import/preview`：multer 内存存储接收 file（限制 5MB + `.csv` MIME/扩展名双校验），调用 csv-parser → validator，返回 `{ success, summary, validRows, invalidRows }`；整文件级错误（非 CSV/表头错/空/超限/解析崩溃）返回 400 + error code + detail；行级错误仍返回 200。`POST /api/import/confirm`：接收 JSON `{ rows }`，二次跑 validator（不信任前端），Upsert 合法行，二次校验失败行归入 skipped，返回 `{ success, summary: { total, inserted, updated, skipped } }`。在 app.ts 挂载路由并接线全局错误中间件（500 通用消息，不泄漏堆栈）。

**验收标准**:
- [ ] preview 合法文件返回正确 summary 与 validRows/invalidRows
- [ ] preview 非 CSV / 表头错 / 空文件 / >1000 行分别返回 400 + 对应 error code + detail
- [ ] preview 含部分非法行时返回 200，合法与非法行正确分类
- [ ] confirm 对合法行执行 Upsert，返回准确的 total/inserted/updated/skipped
- [ ] confirm 二次校验拦截被篡改的越界行并计入 skipped
- [ ] 未预期异常被全局中间件捕获返回 500，不泄漏堆栈
- [ ] TypeScript 编译无错误

---

## T-007: 前端两阶段交互 UI（上传→预览→确认→结果）

**并行组**: G5
**优先级**: P1
**依赖**: T-006
**复杂度**: standard
**执行方式**: agent
**推荐模型**: sonnet
**预估文件数**: 3
**注入技能 (injected_skills)**: [dev-frontend-standards]
**预估工时**: 4h
**涉及文件**:
- public/index.html
- public/app.js
- public/style.css

**描述**:
实现原生 HTML + ES Module 单页应用，落地 design §9 的三段式交互与状态机（IDLE/UPLOADING/PREVIEW/CONFIRMING/DONE/ERROR）。组件：FileUploader（仅接受 `.csv`，>5MB 前端拦截，触发 preview）、PreviewPanel（汇总条 + 合法/非法分区）、InvalidRowTable（行号 + 错误原因，用 textContent 渲染防 XSS）、ConfirmBar（无合法行时禁用 + loading 态）、ResultSummary（total/inserted/updated/skipped + 再次导入重置）。通过 fetch 调用 preview（multipart）与 confirm（json），错误态展示 message + detail。

**验收标准**:
- [ ] 选择非 .csv 或 >5MB 文件被前端拦截并提示
- [ ] 上传后正确展示预览：汇总条 + 合法行列表 + 非法行明细（行号 + 错误）
- [ ] 无合法行时"确认导入"按钮禁用
- [ ] 确认导入后展示结果汇总卡片（总数/新增/更新/跳过）
- [ ] 表头/格式/网络错误进入 ERROR 态并展示可读信息
- [ ] "再次导入"可重置回 IDLE
- [ ] 非法行原始内容以 textContent 渲染（无 XSS 注入）

---

## T-008: 端到端集成测试 + 测试 fixtures

**并行组**: G5
**优先级**: P1
**依赖**: T-006
**复杂度**: standard
**执行方式**: agent
**推荐模型**: sonnet
**预估文件数**: 4
**注入技能 (injected_skills)**: [test-governance]
**预估工时**: 3h
**涉及文件**:
- tests/import.api.test.ts
- fixtures/valid-sample.csv
- fixtures/invalid-header.csv
- fixtures/mixed-errors.csv

**描述**:
用 supertest 覆盖端到端 API 契约。准备 fixtures：`valid-sample.csv`（含中英文混排真实数据）、`invalid-header.csv`（缺列/多列）、`mixed-errors.csv`（含必填缺失、Price 负数、Stock 非整、Rating 越界、日期非法、ProductID 重复各类行）。测试场景：preview 成功分类、preview 表头错误 400、preview 非 CSV 400、preview 空文件 400；confirm 新增+更新混合后验证 DB 状态与汇总数字、confirm 二次校验拦截。使用内存 SQLite 隔离测试。

**验收标准**:
- [ ] 三个 fixture 文件覆盖设计所述全部校验场景
- [ ] preview 成功用例断言 summary 与合法/非法行分类正确
- [ ] preview 表头错误 / 非 CSV / 空文件分别断言 400 + error code
- [ ] confirm 混合新增更新后断言 inserted/updated/skipped 数字准确
- [ ] confirm 二次校验拦截用例通过
- [ ] `npm test` 全部通过

---

## 依赖关系图

```
T-001 (项目初始化)
   │
   ▼
T-002 (Schema + 共享类型)
   │
   ├──────────┬──────────┐
   ▼          ▼          ▼
T-003       T-004      T-005          [G3 并行]
(CSV解析)   (校验器)   (仓储Upsert)
   │          │          │
   └──────────┴──────────┘
              ▼
          T-006 (API 路由)              [G4]
              │
       ┌──────┴──────┐
       ▼             ▼
    T-007         T-008                [G5 并行]
   (前端UI)     (集成测试)
```

## 执行计划

| 阶段 | 并行组 | 任务 | 并行度 | 说明 |
|------|--------|------|--------|------|
| 1 | G1 | T-001 | 串行 | 脚手架，其余全部依赖 |
| 2 | G2 | T-002 | 串行 | 类型基座，被 G3 共享 |
| 3 | G3 | T-003, T-004, T-005 | 3 路并行 | 三个独立领域模块，互不依赖 |
| 4 | G4 | T-006 | 串行 | 装配 G3 三模块 |
| 5 | G5 | T-007, T-008 | 2 路并行 | 前端与集成测试均只依赖后端 API |

关键路径：T-001 → T-002 → (T-003/T-004/T-005) → T-006 → (T-007/T-008)。

## 风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| better-sqlite3 原生编译在本机失败 | 中 | Node ≥ 20 LTS 提供预编译二进制；失败时回退 node:sqlite（Node 22+）或内存 Map 存储 |
| CSV BOM / 中文编码导致表头匹配失败 | 中 | T-003 显式剥离 BOM 并以 UTF-8 解码，测试用例覆盖带 BOM 文件 |
| confirm 阶段前端回传数据被篡改 | 中 | T-006 强制二次校验，不信任前端 |
| inserted/updated 计数不准 | 低 | T-005 采用"预查询已存在集合分类计数"策略，避免 changes() 歧义 |
| 前端无框架导致状态管理混乱 | 低 | 按 design §9.3 状态机严格实现单一状态对象 + render |
