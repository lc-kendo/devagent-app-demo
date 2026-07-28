import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app';
import { createReportRouter } from '../src/server/routes/report.routes';
import { createConnection, runMigrations } from '../src/db/connection';
import { upsertMany } from '../src/db/product.repository';
import type { Product } from '../src/domain/schema';
import type { DatabaseSync } from 'node:sqlite';

function makeProduct(reviewCount: number | null, id: string): Product {
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
      makeProduct(100, 'P001'),   // 500以下
      makeProduct(800, 'P002'),   // 500-1500
      makeProduct(1500, 'P003'),  // 1500-2500
      makeProduct(5000, 'P004'),  // 4500以上
      makeProduct(4500, 'P005'),  // 4500以上
      makeProduct(null, 'P006'),  // missing
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
});
