import { DatabaseSync } from 'node:sqlite';
import { Product } from '../domain/schema';
import { SALES_BUCKETS, SalesBucketDef } from '../domain/sales-report';

// Count of products in a single sales bucket.
export interface SalesBucketCount extends SalesBucketDef {
  count: number;
}

// COALESCE(sales_volume, 0) treats products with no recorded sales as 0.
const SALES_EXPR = `COALESCE(sales_volume, 0)`;

const SELECT_PRODUCTS_COLUMNS = `
  product_id, product_name, category, brand, price,
  original_price, stock, rating, review_count, sales_volume,
  launch_date, description, created_at, updated_at
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

// Build the WHERE clause fragment (and params) for a bucket's [min, max) range.
function bucketRangeClause(bucket: SalesBucketDef): { clause: string; params: number[] } {
  if (bucket.max === null) {
    return { clause: `${SALES_EXPR} >= ?`, params: [bucket.min] };
  }
  return { clause: `${SALES_EXPR} >= ? AND ${SALES_EXPR} < ?`, params: [bucket.min, bucket.max] };
}

// Return per-bucket product counts, one entry per defined bucket (count 0 when empty).
export function getSalesDistribution(db: DatabaseSync): SalesBucketCount[] {
  return SALES_BUCKETS.map(bucket => {
    const { clause, params } = bucketRangeClause(bucket);
    const row = db
      .prepare(`SELECT COUNT(*) AS c FROM products WHERE ${clause}`)
      .get(...params) as { c: number };
    return { ...bucket, count: row.c };
  });
}

// Return the products belonging to a bucket, ordered by sales volume descending.
export function findProductsBySalesBucket(db: DatabaseSync, bucketIndex: number): Product[] {
  const bucket = SALES_BUCKETS.find(b => b.index === bucketIndex);
  if (!bucket) return [];
  const { clause, params } = bucketRangeClause(bucket);
  const rows = db
    .prepare(
      `SELECT ${SELECT_PRODUCTS_COLUMNS} FROM products WHERE ${clause} ORDER BY ${SALES_EXPR} DESC, product_id ASC`,
    )
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map(rowToProduct);
}

// The default bucket to show on load: the highest-sales bucket that has products.
// Falls back to the top bucket when the table is empty.
export function getDefaultBucketIndex(distribution: SalesBucketCount[]): number {
  for (let i = distribution.length - 1; i >= 0; i--) {
    if (distribution[i].count > 0) return distribution[i].index;
  }
  return SALES_BUCKETS[SALES_BUCKETS.length - 1].index;
}
