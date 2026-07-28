import { Router, Request, Response, NextFunction } from 'express';
import { findAll } from '../../db/product.repository';
import { computeReviewCountReport } from '../../domain/report';
import { getDb as defaultGetDb } from '../../db/connection';
import type { ReviewCountReportResponse } from '../../shared/types';
import type { DatabaseSync } from 'node:sqlite';

export type GetDbFn = () => DatabaseSync;

export function createReportRouter(getDbFn: GetDbFn = defaultGetDb): Router {
  const router = Router();

  // GET /review-count - product counts bucketed by review count
  router.get('/review-count', (_req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDbFn();
      const products = findAll(db);
      const report = computeReviewCountReport(products);
      return res.status(200).json({
        success: true,
        report,
      } as ReviewCountReportResponse);
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

// Default export using production DB
export const reportRouter = createReportRouter();
