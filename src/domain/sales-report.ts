// Sales-volume bucket definitions for the sales distribution report.
// Boundaries are [min, max): min inclusive, max exclusive. A null max means "no upper bound".
// Products with a null SalesVolume are treated as 0 (they fall into the first bucket).

export interface SalesBucketDef {
  index: number;
  label: string;
  min: number;
  max: number | null;
}

export const SALES_BUCKETS: readonly SalesBucketDef[] = [
  { index: 0, label: '500以下',     min: 0,    max: 500 },
  { index: 1, label: '500-1500',   min: 500,  max: 1500 },
  { index: 2, label: '1500-2500',  min: 1500, max: 2500 },
  { index: 3, label: '2500-3500',  min: 2500, max: 3500 },
  { index: 4, label: '3500以上',    min: 3500, max: null },
] as const;

// Whether a given index maps to a defined bucket.
export function isValidBucketIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < SALES_BUCKETS.length;
}

// Classify a sales volume into a bucket index. Null/undefined counts as 0.
export function bucketForSalesVolume(salesVolume: number | null | undefined): number {
  const value = salesVolume ?? 0;
  for (const bucket of SALES_BUCKETS) {
    const aboveMin = value >= bucket.min;
    const belowMax = bucket.max === null || value < bucket.max;
    if (aboveMin && belowMax) return bucket.index;
  }
  // Should be unreachable given the last bucket has no upper bound.
  return SALES_BUCKETS.length - 1;
}
