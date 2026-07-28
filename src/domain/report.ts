import type { Product } from './schema';

/**
 * Review-count statistics report.
 *
 * Buckets products by their `ReviewCount` into fixed intervals:
 *   - 500以下      : [0, 500)
 *   - 500-1500     : [500, 1500)
 *   - 1500-2500    : [1500, 2500)
 *   - 2500-3500    : [2500, 3500)
 *   - 3500-4500    : [3500, 4500)
 *   - 4500以上     : [4500, +∞)
 *
 * `min` is inclusive, `max` is exclusive; `max === null` means no upper bound.
 * Products whose `ReviewCount` is null/undefined carry no review data and are
 * excluded from the buckets, but reported separately via `missingReviewCount`.
 */

export interface ReviewCountBucket {
  label: string;
  min: number;
  max: number | null;
  count: number;
}

export interface ReviewCountReport {
  buckets: ReviewCountBucket[];
  totalProducts: number;      // all products considered
  counted: number;            // products placed into a bucket
  missingReviewCount: number; // products with null ReviewCount (excluded)
}

// Bucket definitions in display order. Boundaries: [min, max) with max=null → open-ended.
const BUCKET_DEFS: ReadonlyArray<{ label: string; min: number; max: number | null }> = [
  { label: '500以下',    min: 0,    max: 500 },
  { label: '500-1500',   min: 500,  max: 1500 },
  { label: '1500-2500',  min: 1500, max: 2500 },
  { label: '2500-3500',  min: 2500, max: 3500 },
  { label: '3500-4500',  min: 3500, max: 4500 },
  { label: '4500以上',   min: 4500, max: null },
];

/**
 * Find the index of the bucket a given review count falls into.
 * Returns -1 if the value is negative (should not happen after validation).
 */
function bucketIndexFor(reviewCount: number): number {
  for (let i = 0; i < BUCKET_DEFS.length; i++) {
    const { min, max } = BUCKET_DEFS[i];
    if (reviewCount >= min && (max === null || reviewCount < max)) {
      return i;
    }
  }
  return -1;
}

export function computeReviewCountReport(products: Product[]): ReviewCountReport {
  const buckets: ReviewCountBucket[] = BUCKET_DEFS.map(def => ({ ...def, count: 0 }));

  let counted = 0;
  let missingReviewCount = 0;

  for (const p of products) {
    const rc = p.ReviewCount;
    if (rc == null || Number.isNaN(rc)) {
      missingReviewCount++;
      continue;
    }
    const idx = bucketIndexFor(rc);
    if (idx >= 0) {
      buckets[idx].count++;
      counted++;
    } else {
      // Negative / unexpected value — treat as missing rather than silently dropping.
      missingReviewCount++;
    }
  }

  return {
    buckets,
    totalProducts: products.length,
    counted,
    missingReviewCount,
  };
}
