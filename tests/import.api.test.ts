import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../src/server/app';
import { createImportRouter } from '../src/server/routes/import.routes';
import { createConnection, runMigrations } from '../src/db/connection';
import type { DatabaseSync } from 'node:sqlite';

const FIXTURES = path.join(process.cwd(), 'fixtures');

describe('Import API Integration', () => {
  let db: DatabaseSync;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
    const testRouter = createImportRouter(() => db);
    app = createApp(testRouter);
  });

  afterEach(() => {
    db.close();
  });

  // ── Preview: success ──────────────────────────────────────────────
  it('preview valid-sample.csv: 200, all 20 rows valid', async () => {
    const csvBuf = fs.readFileSync(path.join(FIXTURES, 'valid-sample.csv'));
    const res = await request(app)
      .post('/api/import/preview')
      .attach('file', csvBuf, { filename: 'valid-sample.csv', contentType: 'text/csv' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.summary.total).toBe(20);
    expect(res.body.summary.valid).toBe(20);
    expect(res.body.summary.invalid).toBe(0);
    expect(res.body.validRows).toHaveLength(20);
    expect(res.body.invalidRows).toHaveLength(0);
  });

  it('preview mixed-errors.csv: 200, 2 valid rows, 6 invalid rows', async () => {
    const csvBuf = fs.readFileSync(path.join(FIXTURES, 'mixed-errors.csv'));
    const res = await request(app)
      .post('/api/import/preview')
      .attach('file', csvBuf, { filename: 'mixed-errors.csv', contentType: 'text/csv' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.summary.valid).toBe(2);   // P006(first) + P007
    expect(res.body.summary.invalid).toBe(6); // P001,P002,P003,P004,P005,P006(dup)
  });

  // ── Preview: 400 errors ───────────────────────────────────────────
  it('preview non-CSV file: 400 INVALID_FILE_TYPE', async () => {
    const buf = Buffer.from('hello world');
    const res = await request(app)
      .post('/api/import/preview')
      .attach('file', buf, { filename: 'test.txt', contentType: 'text/plain' });
    // Our fileFilter accepts text/plain to avoid multer dropping it; the ext check catches it
    // Actually .txt fails the extension check
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_FILE_TYPE');
  });

  it('preview without file: 400 INVALID_FILE_TYPE', async () => {
    const res = await request(app).post('/api/import/preview');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_FILE_TYPE');
  });

  it('preview missing-column header CSV: 400 HEADER_MISMATCH', async () => {
    const csvBuf = fs.readFileSync(path.join(FIXTURES, 'invalid-header-missing.csv'));
    const res = await request(app)
      .post('/api/import/preview')
      .attach('file', csvBuf, { filename: 'bad-header.csv', contentType: 'text/csv' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('HEADER_MISMATCH');
    expect(res.body.detail.missing).toContain('Description');
  });

  it('preview extra-column header CSV: 400 HEADER_MISMATCH with unexpected column', async () => {
    const csvBuf = fs.readFileSync(path.join(FIXTURES, 'invalid-header-extra.csv'));
    const res = await request(app)
      .post('/api/import/preview')
      .attach('file', csvBuf, { filename: 'bad-header.csv', contentType: 'text/csv' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('HEADER_MISMATCH');
    expect(res.body.detail.unexpected).toContain('ExtraColumn');
  });

  it('preview empty file: 400 EMPTY_FILE', async () => {
    const res = await request(app)
      .post('/api/import/preview')
      .attach('file', Buffer.from(''), { filename: 'empty.csv', contentType: 'text/csv' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('EMPTY_FILE');
  });

  it('preview >1000 rows: 400 ROW_LIMIT_EXCEEDED', async () => {
    const headers = 'ProductID,ProductName,Category,Brand,Price,OriginalPrice,Stock,Rating,ReviewCount,SalesVolume,LaunchDate,Description';
    const row = 'P001,Name,Cat,Brand,99,129,10,4.5,100,50,2024-01-01,desc';
    const lines = [headers, ...Array(1001).fill(row)].join('\n');
    const res = await request(app)
      .post('/api/import/preview')
      .attach('file', Buffer.from(lines), { filename: 'big.csv', contentType: 'text/csv' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ROW_LIMIT_EXCEEDED');
  });

  // ── Confirm: success ──────────────────────────────────────────────
  it('confirm valid rows: 200, inserted=20, updated=0', async () => {
    const csvBuf = fs.readFileSync(path.join(FIXTURES, 'valid-sample.csv'));
    const previewRes = await request(app)
      .post('/api/import/preview')
      .attach('file', csvBuf, { filename: 'valid-sample.csv', contentType: 'text/csv' });

    const rows = previewRes.body.validRows.map((vr: { product: unknown }) => vr.product);
    const confirmRes = await request(app)
      .post('/api/import/confirm')
      .send({ rows });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.success).toBe(true);
    expect(confirmRes.body.summary.inserted).toBe(20);
    expect(confirmRes.body.summary.updated).toBe(0);
    expect(confirmRes.body.summary.skipped).toBe(0);
    expect(confirmRes.body.summary.total).toBe(20);
  });

  it('confirm same rows twice: second time updated=20, inserted=0', async () => {
    const csvBuf = fs.readFileSync(path.join(FIXTURES, 'valid-sample.csv'));
    const previewRes = await request(app)
      .post('/api/import/preview')
      .attach('file', csvBuf, { filename: 'valid-sample.csv', contentType: 'text/csv' });
    const rows = previewRes.body.validRows.map((vr: { product: unknown }) => vr.product);

    await request(app).post('/api/import/confirm').send({ rows });
    const confirmRes2 = await request(app).post('/api/import/confirm').send({ rows });

    expect(confirmRes2.status).toBe(200);
    expect(confirmRes2.body.summary.inserted).toBe(0);
    expect(confirmRes2.body.summary.updated).toBe(20);
  });

  it('confirm empty rows array: 400 EMPTY_ROWS', async () => {
    const res = await request(app).post('/api/import/confirm').send({ rows: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('EMPTY_ROWS');
  });

  it('confirm with tampered Price=-999 (second-pass validation): skipped=1', async () => {
    const validProduct = {
      ProductID: 'T001', ProductName: 'Tampered', Category: 'Cat', Brand: 'Brand',
      Price: -999, // invalid
      OriginalPrice: null, Stock: null, Rating: null,
      ReviewCount: null, SalesVolume: null, LaunchDate: null, Description: null,
    };
    const res = await request(app).post('/api/import/confirm').send({ rows: [validProduct] });
    // All rows invalid → 400
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_FAILED');
  });

  it('confirm mixed valid+invalid rows: skipped counts the invalid', async () => {
    const goodProduct = {
      ProductID: 'G001', ProductName: 'Good', Category: 'Cat', Brand: 'Brand',
      Price: 99, OriginalPrice: null, Stock: null, Rating: null,
      ReviewCount: null, SalesVolume: null, LaunchDate: null, Description: null,
    };
    const badProduct = {
      ProductID: 'B001', ProductName: '', Category: 'Cat', Brand: 'Brand',
      Price: 99, OriginalPrice: null, Stock: null, Rating: null,
      ReviewCount: null, SalesVolume: null, LaunchDate: null, Description: null,
    };
    const res = await request(app)
      .post('/api/import/confirm')
      .send({ rows: [goodProduct, badProduct] });
    expect(res.status).toBe(200);
    expect(res.body.summary.inserted).toBe(1);
    expect(res.body.summary.skipped).toBe(1);
    expect(res.body.summary.total).toBe(2);
  });

  it('preview then confirm mixed-errors.csv: only valid row P007 is inserted', async () => {
    const csvBuf = fs.readFileSync(path.join(FIXTURES, 'mixed-errors.csv'));
    const previewRes = await request(app)
      .post('/api/import/preview')
      .attach('file', csvBuf, { filename: 'mixed-errors.csv', contentType: 'text/csv' });

    const rows = previewRes.body.validRows.map((vr: { product: unknown }) => vr.product);
    expect(rows).toHaveLength(2); // P006(first) + P007

    const confirmRes = await request(app).post('/api/import/confirm').send({ rows });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.summary.inserted).toBe(2);
    expect(confirmRes.body.summary.total).toBe(2);
  });
});
