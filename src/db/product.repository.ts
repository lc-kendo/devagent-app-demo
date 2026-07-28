import { DatabaseSync } from 'node:sqlite';
import { Product } from '../domain/schema';

const UPSERT_SQL = `
  INSERT INTO products (
    product_id, product_name, category, brand, price,
    original_price, stock, rating, review_count, sales_volume,
    launch_date, description, updated_at
  ) VALUES (
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, datetime('now')
  )
  ON CONFLICT(product_id) DO UPDATE SET
    product_name   = excluded.product_name,
    category       = excluded.category,
    brand          = excluded.brand,
    price          = excluded.price,
    original_price = excluded.original_price,
    stock          = excluded.stock,
    rating         = excluded.rating,
    review_count   = excluded.review_count,
    sales_volume   = excluded.sales_volume,
    launch_date    = excluded.launch_date,
    description    = excluded.description,
    updated_at     = excluded.updated_at
`;

const SELECT_IDS_SQL = `SELECT product_id FROM products WHERE product_id IN (`;

const SELECT_BY_ID_SQL = `
  SELECT product_id, product_name, category, brand, price,
         original_price, stock, rating, review_count, sales_volume,
         launch_date, description, created_at, updated_at
  FROM products WHERE product_id = ?
`;

const SELECT_ALL_SQL = `
  SELECT product_id, product_name, category, brand, price,
         original_price, stock, rating, review_count, sales_volume,
         launch_date, description, created_at, updated_at
  FROM products
`;

function rowToProduct(row: Record<string, unknown>): Product {
  return {
    ProductID:     row.product_id as string,
    ProductName:   row.product_name as string,
    Category:      row.category as string,
    Brand:         row.brand as string,
    Price:         row.price as number,
    OriginalPrice: row.original_price != null ? (row.original_price as number) : null,
    Stock:         row.stock != null ? (row.stock as number) : null,
    Rating:        row.rating != null ? (row.rating as number) : null,
    ReviewCount:   row.review_count != null ? (row.review_count as number) : null,
    SalesVolume:   row.sales_volume != null ? (row.sales_volume as number) : null,
    LaunchDate:    row.launch_date != null ? (row.launch_date as string) : null,
    Description:   row.description != null ? (row.description as string) : null,
  };
}

export function upsertMany(
  db: DatabaseSync,
  products: Product[],
): { inserted: number; updated: number } {
  if (products.length === 0) return { inserted: 0, updated: 0 };

  // Pre-query existing IDs to determine insert vs update count
  const ids = products.map(p => p.ProductID);
  const placeholders = ids.map(() => '?').join(',');
  const existingRows = db.prepare(`${SELECT_IDS_SQL}${placeholders})`).all(...ids) as Array<{ product_id: string }>;
  const existingSet = new Set(existingRows.map(r => r.product_id));

  let inserted = 0;
  let updated = 0;
  for (const p of products) {
    if (existingSet.has(p.ProductID)) updated++;
    else inserted++;
  }

  // Execute all upserts in a single transaction
  const stmt = db.prepare(UPSERT_SQL);
  db.exec('BEGIN');
  try {
    for (const p of products) {
      stmt.run(
        p.ProductID, p.ProductName, p.Category, p.Brand, p.Price,
        p.OriginalPrice, p.Stock, p.Rating, p.ReviewCount, p.SalesVolume,
        p.LaunchDate, p.Description,
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { inserted, updated };
}

export function findByProductId(db: DatabaseSync, id: string): Product | null {
  const row = db.prepare(SELECT_BY_ID_SQL).get(id) as Record<string, unknown> | undefined;
  return row ? rowToProduct(row) : null;
}

export function findAll(db: DatabaseSync): Product[] {
  const rows = db.prepare(SELECT_ALL_SQL).all() as Array<Record<string, unknown>>;
  return rows.map(rowToProduct);
}
