import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app';
import { createReportRouter } from '../src/server/routes/report.routes';
import { createConnection, runMigrations } from '../src/db/connection';
import { upsertMany } from '../src/db/product.repository';
import type { Product } from '../src/domain/schema';
import type { DatabaseSync } from 'node:sqlite';

function makeReviewProduct(reviewCount: number | null, id: string): Product {
  return {
    ProductID: id,
    ProductName: 'Test',
    Category: 'Cat',
    Brand: 'Brand',
    Price: 99,
    OriginalPrice: null,
    Stock: null,
    Rating: null,
    ReviewCount: reviewCount,
    SalesVolume: null,
    LaunchDate: null,
    Description: null,
  };
}

function makeSalesProduct(id: string, salesVolume: number | null): Product {
  return {
    ProductID: id,
    ProductName: `Name ${id}`,
    Category: 'Cat',
    Brand: 'Brand',
    Price: 10,
    OriginalPrice: null,
    Stock: null,
    Rating: null,
    ReviewCount: null,
    SalesVolume: salesVolume,
    LaunchDate: null,
    Description: null,
  };
}

describe('Report API Integration', () => {
  let db: DatabaseSync;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
    const reportRouter = createReportRouter(() => db);
    app = createApp(undefined, reportRouter);
  });

  afterEach(() => {
    db.close();
  });

  function seed(volumes: Array<number | null>) {
    upsertMany(
      db,
      volumes.map((v, i) => makeSalesProduct(`P${String(i + 1).padStart(3, '0')}`, v)),
    );
  }

  // ── review-count ──────────────────────────────────────────────────
  it('GET /api/report/review-count with no products: 200, all buckets zero', async () => {
    const res = await request(app).get('/api/report/review-count');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.report.buckets).toHaveLength(6);
    expect(res.body.report.buckets.every((b: { count: number }) => b.count === 0)).toBe(true);
    expect(res.body.report.totalProducts).toBe(0);
  });

  it('GET /api/report/review-count buckets products correctly', async () => {
    upsertMany(db, [
      makeReviewProduct(100, 'P001'),   // 500以下
      makeReviewProduct(800, 'P002'),   // 500-1500
      makeReviewProduct(1500, 'P003'),  // 1500-2500
      makeReviewProduct(5000, 'P004'),  // 4500以上
      makeReviewProduct(4500, 'P005'),  // 4500以上
      makeReviewProduct(null, 'P006'),  // missing
    ]);

    const res = await request(app).get('/api/report/review-count');
    expect(res.status).toBe(200);
    const counts = res.body.report.buckets.map((b: { count: number }) => b.count);
    expect(counts).toEqual([1, 1, 1, 0, 0, 2]);
    expect(res.body.report.totalProducts).toBe(6);
    expect(res.body.report.counted).toBe(5);
    expect(res.body.report.missingReviewCount).toBe(1);
  });

  it('bucket labels are returned in display order', async () => {
    const res = await request(app).get('/api/report/review-count');
    expect(res.body.report.buckets.map((b: { label: string }) => b.label)).toEqual([
      '500以下', '500-1500', '1500-2500', '2500-3500', '3500-4500', '4500以上',
    ]);
  });

  // ── sales distribution ────────────────────────────────────────────
  it('GET /sales/distribution on empty DB: all zero, defaultBucket=4', async () => {
    const res = await request(app).get('/api/report/sales/distribution');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.buckets).toHaveLength(5);
    expect(res.body.total).toBe(0);
    expect(res.body.defaultBucket).toBe(4);
  });

  it('GET /sales/distribution returns correct counts and total', async () => {
    seed([100, 600, 1500, 2500, 3500, 4000]);
    const res = await request(app).get('/api/report/sales/distribution');
    expect(res.status).toBe(200);
    expect(res.body.buckets.map((b: { count: number }) => b.count)).toEqual([1, 1, 1, 1, 2]);
    expect(res.body.total).toBe(6);
    expect(res.body.defaultBucket).toBe(4);
  });

  it('GET /sales/distribution defaultBucket is highest non-empty bucket', async () => {
    seed([100, 600]); // only buckets 0 and 1
    const res = await request(app).get('/api/report/sales/distribution');
    expect(res.body.defaultBucket).toBe(1);
  });

  // ── sales products ────────────────────────────────────────────────
  it('GET /sales/products?bucket=1 returns products sorted by sales desc', async () => {
    seed([600, 1400, 800]);
    const res = await request(app).get('/api/report/sales/products?bucket=1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.bucket).toBe(1);
    expect(res.body.label).toBe('500-1500');
    expect(res.body.products.map((p: Product) => p.SalesVolume)).toEqual([1400, 800, 600]);
  });

  it('GET /sales/products for empty bucket returns empty array', async () => {
    seed([100]);
    const res = await request(app).get('/api/report/sales/products?bucket=4');
    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([]);
  });

  it('GET /sales/products without bucket param: 400 INVALID_BUCKET', async () => {
    const res = await request(app).get('/api/report/sales/products');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_BUCKET');
  });

  it('GET /sales/products with out-of-range bucket: 400 INVALID_BUCKET', async () => {
    const res = await request(app).get('/api/report/sales/products?bucket=9');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_BUCKET');
  });

  it('GET /sales/products with non-integer bucket: 400 INVALID_BUCKET', async () => {
    const res = await request(app).get('/api/report/sales/products?bucket=abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_BUCKET');
  });

  it('GET /sales/products with negative bucket: 400 INVALID_BUCKET', async () => {
    const res = await request(app).get('/api/report/sales/products?bucket=-1');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_BUCKET');
  });
});
