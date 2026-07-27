import { describe, it, expect } from 'vitest';
import { parseCsv, HeaderMismatchError, EmptyFileError, RowLimitError } from '../src/domain/csv-parser';
import { EXPECTED_HEADERS } from '../src/domain/schema';

// Helper: build a valid CSV buffer
function buildCsv(rows: string[][], headers = EXPECTED_HEADERS as unknown as string[]): Buffer {
  const lines = [headers.join(','), ...rows.map(r => r.join(','))];
  return Buffer.from(lines.join('\n'), 'utf-8');
}

// Helper: quoted field
function q(v: string) { return `"${v.replace(/"/g, '""')}"`; }

const VALID_ROW: string[] = [
  'P001', 'Apple iPhone 15', 'Smartphone', 'Apple',
  '8999', '9999', '156', '4.8', '2341', '1876', '2024-09-15', '旗舰级智能手机',
];

describe('parseCsv', () => {
  it('parses a single valid row correctly', () => {
    const buf = buildCsv([VALID_ROW]);
    const rows = parseCsv(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0].rowNumber).toBe(2);
    expect(rows[0].fields.ProductID).toBe('P001');
    expect(rows[0].fields.ProductName).toBe('Apple iPhone 15');
    expect(rows[0].fields.Description).toBe('旗舰级智能手机');
  });

  it('assigns incrementing rowNumbers starting at 2', () => {
    const buf = buildCsv([VALID_ROW, VALID_ROW.map((v, i) => i === 0 ? 'P002' : v)]);
    const rows = parseCsv(buf);
    expect(rows[0].rowNumber).toBe(2);
    expect(rows[1].rowNumber).toBe(3);
  });

  it('handles quoted fields containing commas', () => {
    const row = [...VALID_ROW];
    row[1] = q('iPhone 15, Pro Max');
    row[11] = q('旗舰级智能手机，A17 Pro芯片');
    const buf = buildCsv([row]);
    const rows = parseCsv(buf);
    expect(rows[0].fields.ProductName).toBe('iPhone 15, Pro Max');
    expect(rows[0].fields.Description).toBe('旗舰级智能手机，A17 Pro芯片');
  });

  it('handles UTF-8 BOM prefix transparently', () => {
    const inner = buildCsv([VALID_ROW]).toString('utf-8');
    const withBom = Buffer.from('﻿' + inner, 'utf-8');
    const rows = parseCsv(withBom);
    expect(rows).toHaveLength(1);
    expect(rows[0].fields.ProductID).toBe('P001');
  });

  it('throws EmptyFileError for a header-only CSV (no data rows)', () => {
    const buf = buildCsv([]);
    expect(() => parseCsv(buf)).toThrow(EmptyFileError);
  });

  it('throws EmptyFileError for a completely empty buffer', () => {
    expect(() => parseCsv(Buffer.from('', 'utf-8'))).toThrow(EmptyFileError);
  });

  it('throws RowLimitError when row count exceeds 1000', () => {
    const rows = Array(1001).fill(VALID_ROW);
    const buf = buildCsv(rows);
    expect(() => parseCsv(buf)).toThrow(RowLimitError);
  });

  it('accepts exactly 1000 rows without throwing', () => {
    const rows = Array(1000).fill(VALID_ROW);
    const buf = buildCsv(rows);
    expect(() => parseCsv(buf)).not.toThrow();
    expect(parseCsv(buf)).toHaveLength(1000);
  });

  it('throws HeaderMismatchError with missing when a column is absent', () => {
    const badHeaders = EXPECTED_HEADERS.filter(h => h !== 'Rating') as unknown as string[];
    const buf = buildCsv([VALID_ROW.slice(0, -1)], badHeaders);
    const err = (() => { try { parseCsv(buf); } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(HeaderMismatchError);
    const mismatch = err as HeaderMismatchError;
    expect(mismatch.missing).toContain('Rating');
    expect(mismatch.unexpected).toHaveLength(0);
  });

  it('throws HeaderMismatchError with unexpected when extra column present', () => {
    const badHeaders = [...EXPECTED_HEADERS, 'Score'] as unknown as string[];
    const buf = buildCsv([VALID_ROW.concat(['99'])], badHeaders);
    const err = (() => { try { parseCsv(buf); } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(HeaderMismatchError);
    const mismatch = err as HeaderMismatchError;
    expect(mismatch.unexpected).toContain('Score');
    expect(mismatch.missing).toHaveLength(0);
  });

  it('throws HeaderMismatchError with orderMismatch when columns are in wrong order', () => {
    const scrambled = [...EXPECTED_HEADERS].reverse() as unknown as string[];
    const buf = buildCsv([VALID_ROW.slice().reverse()], scrambled);
    const err = (() => { try { parseCsv(buf); } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(HeaderMismatchError);
    expect((err as HeaderMismatchError).orderMismatch).toBe(true);
  });

  it('parses 100-row mixed Chinese-English file correctly', () => {
    const rows = Array.from({ length: 100 }, (_, i) => {
      const r = [...VALID_ROW];
      r[0] = `P${String(i + 1).padStart(3, '0')}`;
      r[11] = `商品描述 ${i + 1} - Product description`;
      return r;
    });
    const buf = buildCsv(rows);
    const result = parseCsv(buf);
    expect(result).toHaveLength(100);
    expect(result[99].fields.Description).toBe('商品描述 100 - Product description');
  });
});
