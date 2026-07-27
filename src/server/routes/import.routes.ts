import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { parseCsv, HeaderMismatchError, EmptyFileError, RowLimitError } from '../../domain/csv-parser';
import { validateRows } from '../../domain/validator';
import { upsertMany } from '../../db/product.repository';
import { getDb as defaultGetDb } from '../../db/connection';
import type { Product } from '../../domain/schema';
import type { ColumnName } from '../../domain/schema';
import type { RawRow } from '../../domain/schema';
import type { PreviewResponse, PreviewErrorResponse, ConfirmRequest, ConfirmResponse, ConfirmErrorResponse } from '../../shared/types';
import type { DatabaseSync } from 'node:sqlite';

export type GetDbFn = () => DatabaseSync;

export function createImportRouter(getDbFn: GetDbFn = defaultGetDb): Router {
  const router = Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const mime = file.mimetype.toLowerCase();
      if (ext === '.csv' || mime.includes('csv') || mime === 'text/plain') {
        cb(null, true);
      } else {
        cb(null, false); // will be caught in handler
      }
    },
  });

  // POST /preview
  router.post(
    '/preview',
    upload.single('file'),
    (req: Request, res: Response, _next: NextFunction) => {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_FILE_TYPE',
          message: '请上传 .csv 格式文件',
        } as PreviewErrorResponse);
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      if (ext !== '.csv') {
        return res.status(400).json({
          success: false,
          error: 'INVALID_FILE_TYPE',
          message: '仅支持 .csv 格式文件',
        } as PreviewErrorResponse);
      }

      try {
        const rows = parseCsv(req.file.buffer);
        const result = validateRows(rows);
        return res.status(200).json({
          success: true,
          summary: result.summary,
          validRows: result.validRows,
          invalidRows: result.invalidRows,
        } as PreviewResponse);
      } catch (err) {
        if (err instanceof HeaderMismatchError) {
          return res.status(400).json({
            success: false,
            error: 'HEADER_MISMATCH',
            message: 'CSV 表头与预定义不一致',
            detail: {
              missing: err.missing,
              unexpected: err.unexpected,
              orderMismatch: err.orderMismatch,
            },
          } as PreviewErrorResponse);
        }
        if (err instanceof EmptyFileError) {
          return res.status(400).json({
            success: false,
            error: 'EMPTY_FILE',
            message: 'CSV 文件无数据行',
          } as PreviewErrorResponse);
        }
        if (err instanceof RowLimitError) {
          return res.status(400).json({
            success: false,
            error: 'ROW_LIMIT_EXCEEDED',
            message: `CSV 文件行数超过最大限制 1000（当前 ${err.count} 行）`,
          } as PreviewErrorResponse);
        }
        throw err;
      }
    },
  );

  // POST /confirm
  router.post('/confirm', (req: Request, res: Response, _next: NextFunction) => {
    const body = req.body as ConfirmRequest;

    if (!body.rows || !Array.isArray(body.rows)) {
      return res.status(400).json({
        success: false,
        error: 'EMPTY_ROWS',
        message: '请提供要导入的行数据',
      } as ConfirmErrorResponse);
    }

    if (body.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'EMPTY_ROWS',
        message: '导入行数不能为空',
      } as ConfirmErrorResponse);
    }

    // Re-validate (second-pass, don't trust frontend)
    const rawRows: RawRow[] = (body.rows as Product[]).map((p: Product, idx: number) => ({
      rowNumber: idx + 2,
      fields: {
        ProductID:     String(p.ProductID ?? ''),
        ProductName:   String(p.ProductName ?? ''),
        Category:      String(p.Category ?? ''),
        Brand:         String(p.Brand ?? ''),
        Price:         String(p.Price ?? ''),
        OriginalPrice: p.OriginalPrice != null ? String(p.OriginalPrice) : '',
        Stock:         p.Stock != null ? String(p.Stock) : '',
        Rating:        p.Rating != null ? String(p.Rating) : '',
        ReviewCount:   p.ReviewCount != null ? String(p.ReviewCount) : '',
        SalesVolume:   p.SalesVolume != null ? String(p.SalesVolume) : '',
        LaunchDate:    p.LaunchDate != null ? String(p.LaunchDate) : '',
        Description:   p.Description != null ? String(p.Description) : '',
      } as Record<ColumnName, string>,
    }));

    const validation = validateRows(rawRows);
    const skipped = validation.invalidRows.length;

    if (validation.validRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_FAILED',
        message: '所有行均未通过校验',
        invalidRows: validation.invalidRows,
      } as ConfirmErrorResponse);
    }

    const db = getDbFn();
    const products = validation.validRows.map((vr: { product: Product }) => vr.product);
    const { inserted, updated } = upsertMany(db, products);

    return res.status(200).json({
      success: true,
      summary: {
        total: body.rows.length,
        inserted,
        updated,
        skipped,
      },
    } as ConfirmResponse);
  });

  return router;
}

// Default export using production DB
export const importRouter = createImportRouter();
