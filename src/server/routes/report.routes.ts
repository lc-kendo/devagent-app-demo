import { Router, Request, Response } from 'express';
import { getDb as defaultGetDb } from '../../db/connection';
import {
  getSalesDistribution,
  findProductsBySalesBucket,
  getDefaultBucketIndex,
} from '../../db/report.repository';
import { SALES_BUCKETS, isValidBucketIndex } from '../../domain/sales-report';
import type {
  SalesDistributionResponse,
  SalesProductsResponse,
  ReportErrorResponse,
} from '../../shared/types';
import type { DatabaseSync } from 'node:sqlite';

export type GetDbFn = () => DatabaseSync;

export function createReportRouter(getDbFn: GetDbFn = defaultGetDb): Router {
  const router = Router();

  // GET /sales/distribution - per-bucket counts + default bucket to display
  router.get('/sales/distribution', (_req: Request, res: Response) => {
    const db = getDbFn();
    const buckets = getSalesDistribution(db);
    const total = buckets.reduce((sum, b) => sum + b.count, 0);
    const defaultBucket = getDefaultBucketIndex(buckets);
    return res.status(200).json({
      success: true,
      buckets,
      total,
      defaultBucket,
    } as SalesDistributionResponse);
  });

  // GET /sales/products?bucket=N - products within a single bucket
  router.get('/sales/products', (req: Request, res: Response) => {
    const raw = req.query.bucket;
    const bucketIndex = Number(raw);

    if (raw === undefined || raw === '' || !Number.isInteger(bucketIndex) || !isValidBucketIndex(bucketIndex)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_BUCKET',
        message: `bucket 参数无效，应为 0-${SALES_BUCKETS.length - 1} 的整数`,
      } as ReportErrorResponse);
    }

    const db = getDbFn();
    const products = findProductsBySalesBucket(db, bucketIndex);
    const label = SALES_BUCKETS[bucketIndex].label;

    return res.status(200).json({
      success: true,
      bucket: bucketIndex,
      label,
      products,
    } as SalesProductsResponse);
  });

  return router;
}

// Default export using production DB
export const reportRouter = createReportRouter();
