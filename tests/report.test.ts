import { describe, it, expect } from 'vitest';
import { computeReviewCountReport } from '../src/domain/report';
import type { Product } from '../src/domain/schema';

function makeProduct(reviewCount: number | null, id = 'P001'): Product {
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

describe('computeReviewCountReport', () => {
  it('returns six buckets with correct labels and ranges', () => {
    const report = computeReviewCountReport([]);
    expect(report.buckets).toHaveLength(6);
    expect(report.buckets.map(b => b.label)).toEqual([
      '500以下', '500-1500', '1500-2500', '2500-3500', '3500-4500', '4500以上',
    ]);
    expect(report.buckets.map(b => [b.min, b.max])).toEqual([
      [0, 500], [500, 1500], [1500, 2500], [2500, 3500], [3500, 4500], [4500, null],
    ]);
  });

  it('empty input → all counts zero', () => {
    const report = computeReviewCountReport([]);
    expect(report.buckets.every(b => b.count === 0)).toBe(true);
    expect(report.totalProducts).toBe(0);
    expect(report.counted).toBe(0);
    expect(report.missingReviewCount).toBe(0);
  });

  it('places values into the correct bucket', () => {
    const products = [
      makeProduct(0),      // 500以下
      makeProduct(499),    // 500以下
      makeProduct(500),    // 500-1500
      makeProduct(1499),   // 500-1500
      makeProduct(1500),   // 1500-2500
      makeProduct(2500),   // 2500-3500
      makeProduct(3500),   // 3500-4500
      makeProduct(4499),   // 3500-4500
      makeProduct(4500),   // 4500以上
      makeProduct(100000), // 4500以上
    ];
    const report = computeReviewCountReport(products);
    const counts = report.buckets.map(b => b.count);
    expect(counts).toEqual([2, 2, 1, 1, 2, 2]);
    expect(report.counted).toBe(10);
    expect(report.totalProducts).toBe(10);
    expect(report.missingReviewCount).toBe(0);
  });

  it('boundary values are inclusive on the lower bound (500 → 500-1500)', () => {
    const report = computeReviewCountReport([makeProduct(500)]);
    expect(report.buckets[0].count).toBe(0); // not in 500以下
    expect(report.buckets[1].count).toBe(1); // in 500-1500
  });

  it('boundary 4500 falls into 4500以上', () => {
    const report = computeReviewCountReport([makeProduct(4500)]);
    expect(report.buckets[5].count).toBe(1);
  });

  it('null ReviewCount is excluded and counted as missing', () => {
    const report = computeReviewCountReport([
      makeProduct(null),
      makeProduct(100),
    ]);
    expect(report.missingReviewCount).toBe(1);
    expect(report.counted).toBe(1);
    expect(report.totalProducts).toBe(2);
    expect(report.buckets[0].count).toBe(1);
  });

  it('negative values are treated as missing (defensive)', () => {
    const report = computeReviewCountReport([makeProduct(-5)]);
    expect(report.missingReviewCount).toBe(1);
    expect(report.counted).toBe(0);
  });

  it('counted + missing equals total', () => {
    const products = [
      makeProduct(10), makeProduct(null), makeProduct(600),
      makeProduct(5000), makeProduct(null),
    ];
    const report = computeReviewCountReport(products);
    expect(report.counted + report.missingReviewCount).toBe(report.totalProducts);
  });
});
