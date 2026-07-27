---
feature: product-bulk-import
complexity: standard
generated_by: architect-planner
generated_at: 2026-07-27T00:00:00Z
version: 1
based_on: product-bulk-import-requirements.md
---

# 技术设计文档: 商品批量导入 (Product Bulk Import)

## 1. 架构概览

### 1.1 整体架构

全新从零搭建的全栈单体应用（monorepo 单包），后端提供 REST API，前端为轻量单页应用。两阶段导入流程（预览校验 → 确认入库）通过两个无状态 API 接口实现——预览接口不落库，确认接口才真正写入。为避免服务端会话状态，**确认阶段由前端回传预览时已校验过的合法行数据**（≤1000 行体量可控），服务端在确认时二次校验后入库，保证幂等与安全。

```
┌────────────────────────────────────────────────────────────┐
│                        Browser (前端 SPA)                     │
│  ┌───────────┐   ┌────────────┐   ┌────────────────────┐    │
│  │ 上传组件   │→ │ 预览表格    │→ │ 确认操作 + 结果展示  │    │
│  │(file input)│   │(合法/非法) │   │ (汇总卡片)          │    │
│  └───────────┘   └────────────┘   └────────────────────┘    │
└───────────────┬──────────────────────────┬──────────────────┘
                │ POST /api/import/preview   │ POST /api/import/confirm
                │ (multipart: file)          │ (json: validRows[])
                ▼                            ▼
┌────────────────────────────────────────────────────────────┐
│                     Express Server (后端)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Route Layer  │→ │ CSV Parser   │→ │ Validator        │   │
│  │(controllers) │  │ (header+row) │  │ (rules engine)   │   │
│  └──────────────┘  └──────────────┘  └────────┬─────────┘   │
│                                                 ▼             │
│                                       ┌──────────────────┐   │
│                                       │ ProductRepository │  │
│                                       │ (Upsert by SQLite)│  │
│                                       └────────┬─────────┘   │
└────────────────────────────────────────────────┼────────────┘
                                                  ▼
                                          ┌──────────────┐
                                          │ SQLite (file) │
                                          │ products 表   │
                                          └──────────────┘
```

### 1.2 目录结构

```
product-bulk-import/               (工作目录根)
├── package.json                   # 依赖与脚本
├── tsconfig.json                  # TS 编译配置
├── vitest.config.ts               # 测试配置
├── data/
│   └── products.db                # SQLite 数据文件 (gitignore)
├── src/
│   ├── server/
│   │   ├── index.ts               # Express 启动入口
│   │   ├── app.ts                 # Express app 装配 (中间件/路由)
│   │   └── routes/
│   │       └── import.routes.ts   # /api/import/* 路由
│   ├── domain/
│   │   ├── schema.ts              # 表头常量、字段定义、Product 类型
│   │   ├── csv-parser.ts          # CSV 解析器 (表头验证+逐行)
│   │   └── validator.ts           # 校验器 (规则引擎)
│   ├── db/
│   │   ├── connection.ts          # SQLite 连接与迁移
│   │   └── product.repository.ts  # products 表 CRUD + Upsert
│   └── shared/
│       └── types.ts               # 前后端共享 DTO 类型
├── public/                        # 前端静态资源
│   ├── index.html
│   ├── app.js                     # 前端逻辑 (原生 ES module)
│   └── style.css
└── tests/
    ├── csv-parser.test.ts
    ├── validator.test.ts
    ├── product.repository.test.ts
    └── import.api.test.ts         # API 集成测试
```

### 1.3 数据流

**阶段一（预览）**：前端上传 CSV → 后端 `csv-parser` 验证表头并解析为行数组 → `validator` 逐行应用规则 + 文件内 ProductID 唯一性检查 → 返回 `{ summary, validRows[], invalidRows[] }`（不落库）。

**阶段二（确认）**：前端将预览得到的 `validRows` 回传 → 后端二次校验（防篡改）→ `product.repository.upsertMany()` 在单事务中按 ProductID Upsert → 返回 `{ total, inserted, updated, skipped }`。

## 2. 组件设计

### 2.1 新增组件

| 组件 | 职责 | 文件 |
|------|------|------|
| CSV Parser | 解析上传的 CSV Buffer，验证固定表头，逐行拆分为原始字段字典 | `src/domain/csv-parser.ts` |
| Validator | 对解析后的行应用全部校验规则，产出合法行/非法行分类 | `src/domain/validator.ts` |
| Schema | 表头顺序常量、字段元数据（必填/类型/范围）、Product/RawRow 类型 | `src/domain/schema.ts` |
| ProductRepository | products 表建表迁移、按 ProductID Upsert、查询 | `src/db/product.repository.ts` |
| DB Connection | 创建 SQLite 连接、执行迁移 | `src/db/connection.ts` |
| Import Routes | 两个 REST 接口的控制器，装配 parser/validator/repository | `src/server/routes/import.routes.ts` |
| Frontend App | 上传→预览→确认三段式交互 | `public/app.js`, `public/index.html` |

### 2.2 修改组件

无（全新项目，无既有代码）。

## 3. 接口设计

### 3.1 POST /api/import/preview

上传 CSV，解析并校验，返回预览结果（不落库）。

**Request**：`Content-Type: multipart/form-data`，字段 `file`（`.csv`）。

**Response 200**：
```jsonc
{
  "success": true,
  "summary": { "total": 100, "valid": 92, "invalid": 8 },
  "validRows": [
    { "rowNumber": 2, "product": { "ProductID": "P001", "ProductName": "无线鼠标", "Category": "数码", "Brand": "Logitech", "Price": 99.9, "OriginalPrice": 129.0, "Stock": 50, "Rating": 4.5, "ReviewCount": 320, "SalesVolume": 1500, "LaunchDate": "2025-03-01", "Description": "2.4G wireless mouse" } }
  ],
  "invalidRows": [
    { "rowNumber": 5, "raw": { /* 原始字段 */ }, "errors": ["Price 不得为负数", "LaunchDate 非合法 YYYY-MM-DD 日期"] }
  ]
}
```

**Response 400**（表头/格式错误，整文件拒绝）：
```jsonc
{
  "success": false,
  "error": "HEADER_MISMATCH",
  "message": "CSV 表头与预定义不一致",
  "detail": { "missing": ["Rating"], "unexpected": ["Score"], "orderMismatch": false }
}
```
其他 error code：`INVALID_FILE_TYPE`（非 .csv）、`EMPTY_FILE`、`ROW_LIMIT_EXCEEDED`（>1000 行）、`PARSE_ERROR`。

### 3.2 POST /api/import/confirm

接收预览产出的合法行，二次校验后 Upsert 入库。

**Request**：`Content-Type: application/json`
```jsonc
{ "rows": [ { "ProductID": "P001", "ProductName": "无线鼠标", "...": "..." } ] }
```

**Response 200**：
```jsonc
{
  "success": true,
  "summary": { "total": 92, "inserted": 40, "updated": 52, "skipped": 0 }
}
```
- `total`：本次提交的行数；`skipped`：二次校验失败被丢弃的行数（正常应为 0）。

**Response 400**：`{ "success": false, "error": "VALIDATION_FAILED", "invalidRows": [...] }`（提交行未通过二次校验时）。

### 3.3 内部接口

```ts
// csv-parser.ts
parseCsv(buffer: Buffer): ParseResult
//   -> { rows: RawRow[] }  (RawRow = Record<ColumnName, string> + rowNumber)
//   throw HeaderMismatchError | EmptyFileError | RowLimitError

// validator.ts
validateRows(rows: RawRow[]): ValidationResult
//   -> { validRows: ValidRow[], invalidRows: InvalidRow[], summary }

// product.repository.ts
upsertMany(products: Product[]): Promise<{ inserted: number; updated: number }>
findByProductId(id: string): Promise<Product | null>
```

## 4. 数据设计

### 4.1 数据结构（Product 类型）

字段与 CSV 12 列一一对应，顺序严格：

| 字段 | TS 类型 | SQLite 类型 | 约束 |
|------|---------|-------------|------|
| ProductID | string | TEXT | PRIMARY KEY，非空 |
| ProductName | string | TEXT | NOT NULL |
| Category | string | TEXT | NOT NULL |
| Brand | string | TEXT | NOT NULL |
| Price | number | REAL | NOT NULL，≥ 0 |
| OriginalPrice | number \| null | REAL | ≥ 0（可空） |
| Stock | number \| null | INTEGER | ≥ 0 整数（可空） |
| Rating | number \| null | REAL | ∈ [0,5]（可空） |
| ReviewCount | number \| null | INTEGER | ≥ 0（可空，无强制规则） |
| SalesVolume | number \| null | INTEGER | ≥ 0（可空，无强制规则） |
| LaunchDate | string \| null | TEXT | YYYY-MM-DD（可空但非空时须合法） |
| Description | string \| null | TEXT | 可空 |

### 4.2 表结构（DDL）

```sql
CREATE TABLE IF NOT EXISTS products (
  product_id     TEXT PRIMARY KEY,
  product_name   TEXT NOT NULL,
  category       TEXT NOT NULL,
  brand          TEXT NOT NULL,
  price          REAL NOT NULL,
  original_price REAL,
  stock          INTEGER,
  rating         REAL,
  review_count   INTEGER,
  sales_volume   INTEGER,
  launch_date    TEXT,
  description    TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 4.3 存储方案

- 采用 **SQLite（better-sqlite3）**，单文件 `data/products.db`，同步 API 契合 ≤1000 行同步处理。
- Upsert 使用 SQLite 原生 `INSERT ... ON CONFLICT(product_id) DO UPDATE SET ...`，并在语句中区分是否更新以统计 inserted/updated（借助 `changes()` 前后查询或按预查询已存在集合计数）。
- 整批 Upsert 包裹在一个事务（`db.transaction()`）中，保证部分成功语义下批内一致提交。

### 4.4 inserted/updated 计数策略

确认阶段先 `SELECT product_id FROM products WHERE product_id IN (...)` 得到已存在集合 → 分类计数（存在=updated，不存在=inserted）→ 再执行事务化 upsertMany。避免逐行 changes 判定的复杂性。

## 5. 技术选型

| 层 | 选型 | 理由 |
|----|------|------|
| 运行时 | Node.js ≥ 20 LTS | 现代 LTS，原生 fetch/ESM 支持 |
| 语言 | TypeScript 5.x | 需求指定，类型安全强 |
| Web 框架 | Express 4.x | 轻量成熟，路由/中间件生态完善 |
| 文件上传 | multer（内存存储）| 单文件小体量，内存 Buffer 免落盘 |
| CSV 解析 | csv-parse（`csv-parse/sync`）| 成熟、正确处理引号/换行/UTF-8 中英文 |
| 数据库 | SQLite via better-sqlite3 | 零外部依赖、同步 API、原生 Upsert |
| 前端 | 原生 HTML + ES Module JS + CSS | 需求允许轻量，无需构建链，降低脚手架成本 |
| 测试 | Vitest + supertest | 快速、TS 原生、supertest 做 API 集成测试 |

**前端选型说明**：需求明确"React 或纯 HTML+JS（轻量即可）"，选纯 HTML+JS 免去打包/构建工具链，由 Express 静态托管 `public/`，交付更快、可维护性满足两阶段交互需求。

## 6. 安全考量

- **文件类型校验**：双重校验（MIME + 扩展名），仅放行 `.csv`。
- **文件大小限制**：multer `limits.fileSize`（如 5MB）+ 行数上限 1000，防止内存耗尽。
- **确认阶段二次校验**：confirm 接口不信任前端回传数据，重新跑 validator，防篡改注入越界/脏数据。
- **SQL 注入防护**：全部使用参数化预编译语句（better-sqlite3 prepared statements）。
- **CSV 注入（公式注入）**：入库为纯数据存储、不导出到 Excel，本期风险低；如后续导出需转义 `= + - @` 前缀。

## 7. 测试策略

采用 TDD，测试先行。分层覆盖：

| 层 | 测试文件 | 关键用例 |
|----|---------|---------|
| CSV 解析 | csv-parser.test.ts | 正确表头解析、表头缺列/多列/乱序、空文件、UTF-8 中英文、带引号逗号字段、>1000 行拒绝 |
| 校验器 | validator.test.ts | 必填缺失、Price/OriginalPrice 负数、Stock 非整数/负数、Rating 越界、LaunchDate 非法、文件内 ProductID 重复、多错误合并、合法行通过 |
| 仓储 | product.repository.test.ts | 新增、更新（Upsert）、混合批量计数、事务回滚、findByProductId |
| API 集成 | import.api.test.ts | preview 成功/表头错误/非 CSV；confirm 新增+更新混合、二次校验拦截、汇总数字正确 |

覆盖率目标：domain 层（parser/validator）语句覆盖 ≥ 90%。

## 8. 错误处理策略

**部分成功模型**（需求核心）：

1. **整文件级错误**（阻断，返回 400）：非 CSV、表头不匹配、空文件、超行数上限、解析崩溃。此类不进入逐行校验，整体拒绝并提示。
2. **行级错误**（不阻断）：预览阶段收集所有非法行（含行号 + 错误原因数组），合法行照常返回。用户可见全部问题。
3. **入库阶段**：仅 Upsert 合法行；确认接口二次校验失败的行归入 `skipped`，返回汇总。
4. **错误格式统一**：`InvalidRow = { rowNumber, raw, errors: string[] }`，中文可读错误信息（如 `"Price 不得为负数"`、`"ProductID 必填"`）。
5. **HTTP 语义**：整文件错误 400 + error code；行级错误仍 200（预览成功，内容含非法行）。
6. 全局错误中间件捕获未预期异常，返回 500 + 通用消息，避免泄漏堆栈。

## 9. 前端两阶段交互设计

### 9.1 交互流程（三段式）

```
阶段一（上传+预览）                    阶段二（确认+结果）
──────────────────                    ──────────────────
[选择 .csv 文件]                       [点击"确认导入"]
      │                                      │
      ▼ POST /api/import/preview             ▼ POST /api/import/confirm
[展示预览表格]                         [展示导入汇总卡片]
  ├─ 汇总条（总数/合法/非法）            ├─ 总数 / 新增 / 更新 / 跳过
  ├─ 合法行列表（可折叠）                └─ [导入另一个文件] 重置
  └─ 非法行列表（行号 + 错误原因）
      │
      ▼ 若无合法行则禁用"确认导入"
```

### 9.2 关键组件列表

| 组件 | 职责 | 说明 |
|------|------|------|
| `FileUploader` | 文件选择 + 类型/大小前端预校验 + 触发 preview | 仅接受 `.csv`，>5MB 前端拦截 |
| `PreviewPanel` | 渲染预览结果：汇总条 + 合法/非法两个分区 | 非法行高亮，展示 rowNumber + errors |
| `InvalidRowTable` | 非法行明细表（行号、原始字段片段、错误原因列表） | 错误按行聚合 |
| `ConfirmBar` | "确认导入"按钮 + 加载态 + 二次确认提示 | 无合法行时禁用 |
| `ResultSummary` | 导入完成汇总卡片（total/inserted/updated/skipped） | 提供"再次导入"重置入口 |
| `AppStore` | 前端状态管理（单一状态对象 + render 函数） | 原生实现，无框架 |

### 9.3 前端状态机

```
        ┌──────┐  selectFile+valid   ┌───────────┐
  ─────▶│ IDLE │────────────────────▶│ UPLOADING │
        └──────┘                     └─────┬─────┘
           ▲                               │ preview 200
           │ reset                         ▼
           │                         ┌───────────┐  confirm click   ┌────────────┐
           │                         │ PREVIEW   │─────────────────▶│ CONFIRMING │
           │                         └─────┬─────┘                  └─────┬──────┘
           │                               │ preview 400/网络错误           │ confirm 200
           │                               ▼                               ▼
           │                         ┌───────────┐                  ┌───────────┐
           └─────────────────────────│  ERROR    │◀─────────────────│   DONE    │
                          reset       └───────────┘   confirm 4xx/5xx└───────────┘
                                                                      reset ▲
```

| 状态 | 含义 | 允许操作 |
|------|------|---------|
| `IDLE` | 初始，等待选择文件 | 选择文件 |
| `UPLOADING` | 已上传，等待 preview 响应 | 取消（可选） |
| `PREVIEW` | 预览结果已展示 | 确认导入 / 重新选择 |
| `CONFIRMING` | 已提交确认，等待 confirm 响应 | 无（loading） |
| `DONE` | 导入完成，展示汇总 | 再次导入（reset → IDLE） |
| `ERROR` | 任一阶段出错（含表头/格式/网络） | 重试 / 重置 |

### 9.4 状态转换与 API 映射

- `IDLE → UPLOADING`：用户选中合法 `.csv` 并触发上传。
- `UPLOADING → PREVIEW`：`preview` 返回 200，渲染 summary + validRows + invalidRows。
- `UPLOADING → ERROR`：`preview` 返回 400（表头/格式/超限）或网络异常，展示 error message + detail。
- `PREVIEW → CONFIRMING`：用户点击"确认导入"（validRows 非空）。
- `CONFIRMING → DONE`：`confirm` 返回 200，渲染 ResultSummary。
- `CONFIRMING → ERROR`：`confirm` 返回 4xx/5xx。
- 任一状态 `→ IDLE`：用户点击"重置/再次导入"。
