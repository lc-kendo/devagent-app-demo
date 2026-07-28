import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createConnection, runMigrations } from '../src/db/connection';
import { upsertMany } from '../src/db/product.repository';
import {
  getSalesDistribution,
  findProductsBySalesBucket,
  getDefaultBucketIndex,
} from '../src/db/report.repository';
import { bucketForSalesVolume } from '../src/domain/sales-report';
import type { Product } from '../src/domain/schema';
import type { DatabaseSync } from 'node:sqlite';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    ProductID: 'P001',
    ProductName: 'Test Product',
    Category: 'Electronics',
    Brand: 'TestBrand',
    Price: 99.9,
    OriginalPrice: 129.0,
    Stock: 50,
    Rating: 4.5,
    ReviewCount: 100,
    SalesVolume: 200,
    LaunchDate: '2024-01-15',
    Description: 'A test product',
    ...overrides,
  };
}

describe('bucketForSalesVolume (boundaries)', () => {
  it('classifies boundary values with [min, max) semantics', () => {
    expect(bucketForSalesVolume(0)).toBe(0);
    expect(bucketForSalesVolume(499)).toBe(0);
    expect(bucketForSalesVolume(500)).toBe(1);   // 500 -> second bucket
    expect(bucketForSalesVolume(1499)).toBe(1);
    expect(bucketForSalesVolume(1500)).toBe(2);
    expect(bucketForSalesVolume(2500)).toBe(3);
    expect(bucketForSalesVolume(3499)).toBe(3);
    expect(bucketForSalesVolume(3500)).toBe(4);  // 3500 -> last bucket
    expect(bucketForSalesVolume(999999)).toBe(4);
  });

  it('treats null/undefined sales as 0 (first bucket)', () => {
    expect(bucketForSalesVolume(null)).toBe(0);
    expect(bucketForSalesVolume(undefined)).toBe(0);
  });
});

describe('ReportRepository', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  function seed(volumes: Array<number | null>) {
    const products = volumes.map((v, i) =>
      makeProduct({ ProductID: `P${String(i + 1).padStart(3, '0')}`, SalesVolume: v }),
    );
    upsertMany(db, products);
  }

  it('getSalesDistribution returns all 5 buckets in order with zero counts when empty', () => {
    const dist = getSalesDistribution(db);
    expect(dist).toHaveLength(5);
    expect(dist.map(b => b.index)).toEqual([0, 1, 2, 3, 4]);
    expect(dist.every(b => b.count === 0)).toBe(true);
    expect(dist[0].label).toBe('500以下');
    expect(dist[4].label).toBe('3500以上');
  });

  it('counts products into the correct buckets (including boundaries and null)', () => {
    // bucket0: 0(null), 499  -> 2
    // bucket1: 500, 1499     -> 2
    // bucket2: 1500          -> 1
    // bucket3: 2500          -> 1
    // bucket4: 3500, 9000    -> 2
    seed([null, 499, 500, 1499, 1500, 2500, 3500, 9000]);
    const dist = getSalesDistribution(db);
    expect(dist[0].count).toBe(2);
    expect(dist[1].count).toBe(2);
    expect(dist[2].count).toBe(1);
    expect(dist[3].count).toBe(1);
    expect(dist[4].count).toBe(2);
    const total = dist.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(8);
  });

  it('findProductsBySalesBucket returns only that bucket ordered by sales desc', () => {
    seed([600, 1400, 800, 100]); // bucket1: 600,1400,800 ; bucket0: 100
    const bucket1 = findProductsBySalesBucket(db, 1);
    expect(bucket1.map(p => p.SalesVolume)).toEqual([1400, 800, 600]);
    const bucket0 = findProductsBySalesBucket(db, 0);
    expect(bucket0.map(p => p.SalesVolume)).toEqual([100]);
  });

  it('findProductsBySalesBucket returns empty array for empty bucket', () => {
    seed([100]);
    expect(findProductsBySalesBucket(db, 4)).toEqual([]);
  });

  it('findProductsBySalesBucket returns empty array for out-of-range index', () => {
    seed([100]);
    expect(findProductsBySalesBucket(db, 99)).toEqual([]);
  });

  it('getDefaultBucketIndex picks the highest non-empty bucket', () => {
    seed([100, 600, 2000]); // buckets 0,1,2 populated
    const dist = getSalesDistribution(db);
    expect(getDefaultBucketIndex(dist)).toBe(2);
  });

  it('getDefaultBucketIndex falls back to top bucket when all empty', () => {
    const dist = getSalesDistribution(db);
    expect(getDefaultBucketIndex(dist)).toBe(4);
  });
});
