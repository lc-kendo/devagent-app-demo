import { describe, it, expect } from 'vitest';
import { validateRows } from '../src/domain/validator';
import { RawRow, ColumnName, EXPECTED_HEADERS } from '../src/domain/schema';

function makeRow(overrides: Partial<Record<ColumnName, string>> = {}, rowNumber = 2): RawRow {
  const defaults: Record<ColumnName, string> = {
    ProductID: 'P001',
    ProductName: 'Test Product',
    Category: 'Electronics',
    Brand: 'TestBrand',
    Price: '99.9',
    OriginalPrice: '129.0',
    Stock: '50',
    Rating: '4.5',
    ReviewCount: '100',
    SalesVolume: '200',
    LaunchDate: '2024-01-15',
    Description: 'A test product',
  };
  return { rowNumber, fields: { ...defaults, ...overrides } };
}

describe('validateRows', () => {
  it('passes a fully valid row', () => {
    const result = validateRows([makeRow()]);
    expect(result.validRows).toHaveLength(1);
    expect(result.invalidRows).toHaveLength(0);
    expect(result.summary).toEqual({ total: 1, valid: 1, invalid: 0 });
  });

  it('converts Price to number on valid rows', () => {
    const result = validateRows([makeRow({ Price: '99.9' })]);
    expect(result.validRows[0].product.Price).toBe(99.9);
  });

  it('rejects row with empty ProductID (required)', () => {
    const result = validateRows([makeRow({ ProductID: '' })]);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.invalidRows[0].errors).toContain('ProductID 必填');
  });

  it('rejects row with empty ProductName', () => {
    const result = validateRows([makeRow({ ProductName: '' })]);
    expect(result.invalidRows[0].errors).toContain('ProductName 必填');
  });

  it('rejects row with empty Category', () => {
    const result = validateRows([makeRow({ Category: '' })]);
    expect(result.invalidRows[0].errors).toContain('Category 必填');
  });

  it('rejects row with empty Brand', () => {
    const result = validateRows([makeRow({ Brand: '' })]);
    expect(result.invalidRows[0].errors).toContain('Brand 必填');
  });

  it('rejects row with empty Price', () => {
    const result = validateRows([makeRow({ Price: '' })]);
    expect(result.invalidRows[0].errors).toContain('Price 必填');
  });

  it('rejects Price = -1 (negative)', () => {
    const result = validateRows([makeRow({ Price: '-1' })]);
    expect(result.invalidRows[0].errors).toContain('Price 不得为负数');
  });

  it('accepts Price = 0 (boundary)', () => {
    const result = validateRows([makeRow({ Price: '0' })]);
    expect(result.validRows).toHaveLength(1);
  });

  it('rejects OriginalPrice = -0.01', () => {
    const result = validateRows([makeRow({ OriginalPrice: '-0.01' })]);
    expect(result.invalidRows[0].errors).toContain('OriginalPrice 不得为负数');
  });

  it('accepts empty OriginalPrice (optional)', () => {
    const result = validateRows([makeRow({ OriginalPrice: '' })]);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0].product.OriginalPrice).toBeNull();
  });

  it('rejects Stock = 1.5 (non-integer)', () => {
    const result = validateRows([makeRow({ Stock: '1.5' })]);
    expect(result.invalidRows[0].errors).toContain('Stock 须为非负整数');
  });

  it('rejects Stock = -1 (negative)', () => {
    const result = validateRows([makeRow({ Stock: '-1' })]);
    expect(result.invalidRows[0].errors).toContain('Stock 须为非负整数');
  });

  it('accepts Stock = 0 (boundary)', () => {
    const result = validateRows([makeRow({ Stock: '0' })]);
    expect(result.validRows).toHaveLength(1);
  });

  it('accepts empty Stock (optional)', () => {
    const result = validateRows([makeRow({ Stock: '' })]);
    expect(result.validRows[0].product.Stock).toBeNull();
  });

  it('rejects Rating = 5.1 (above max)', () => {
    const result = validateRows([makeRow({ Rating: '5.1' })]);
    expect(result.invalidRows[0].errors).toContain('Rating 须在 0 至 5 之间');
  });

  it('rejects Rating = -0.1 (below min)', () => {
    const result = validateRows([makeRow({ Rating: '-0.1' })]);
    expect(result.invalidRows[0].errors).toContain('Rating 须在 0 至 5 之间');
  });

  it('accepts Rating = 0 (boundary min)', () => {
    const result = validateRows([makeRow({ Rating: '0' })]);
    expect(result.validRows).toHaveLength(1);
  });

  it('accepts Rating = 5 (boundary max)', () => {
    const result = validateRows([makeRow({ Rating: '5' })]);
    expect(result.validRows).toHaveLength(1);
  });

  it('rejects LaunchDate "2025-13-01" (invalid date)', () => {
    const result = validateRows([makeRow({ LaunchDate: '2025-13-01' })]);
    expect(result.invalidRows[0].errors).toContain('LaunchDate 非合法 YYYY-MM-DD 日期');
  });

  it('rejects LaunchDate with wrong format "2024/01/15"', () => {
    const result = validateRows([makeRow({ LaunchDate: '2024/01/15' })]);
    expect(result.invalidRows[0].errors).toContain('LaunchDate 非合法 YYYY-MM-DD 日期');
  });

  it('accepts LaunchDate "2024-03-15" (valid)', () => {
    const result = validateRows([makeRow({ LaunchDate: '2024-03-15' })]);
    expect(result.validRows).toHaveLength(1);
  });

  it('accepts empty LaunchDate (optional)', () => {
    const result = validateRows([makeRow({ LaunchDate: '' })]);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0].product.LaunchDate).toBeNull();
  });

  it('detects duplicate ProductID in same file (second occurrence fails)', () => {
    const rows = [
      makeRow({ ProductID: 'P001' }, 2),
      makeRow({ ProductID: 'P002' }, 3),
      makeRow({ ProductID: 'P001' }, 4),
    ];
    const result = validateRows(rows);
    expect(result.validRows).toHaveLength(2);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.invalidRows[0].rowNumber).toBe(4);
    expect(result.invalidRows[0].errors).toContain('ProductID 在文件中重复');
  });

  it('marks all repeated occurrences of duplicate ProductID (3 occurrences)', () => {
    const rows = [
      makeRow({ ProductID: 'P001' }, 2),
      makeRow({ ProductID: 'P001' }, 3),
      makeRow({ ProductID: 'P001' }, 4),
    ];
    const result = validateRows(rows);
    expect(result.invalidRows).toHaveLength(2);
    expect(result.invalidRows.map(r => r.rowNumber)).toEqual([3, 4]);
  });

  it('collects multiple errors on a single row', () => {
    const result = validateRows([makeRow({ Price: '-1', ProductName: '' })]);
    expect(result.invalidRows[0].errors).toContain('Price 不得为负数');
    expect(result.invalidRows[0].errors).toContain('ProductName 必填');
    expect(result.invalidRows[0].errors.length).toBeGreaterThanOrEqual(2);
  });

  it('returns correct summary when all rows are invalid', () => {
    const rows = [
      makeRow({ ProductID: '' }, 2),
      makeRow({ Price: '-5' }, 3),
    ];
    const result = validateRows(rows);
    expect(result.validRows).toHaveLength(0);
    expect(result.summary).toEqual({ total: 2, valid: 0, invalid: 2 });
  });

  it('stores raw fields on invalid rows', () => {
    const result = validateRows([makeRow({ ProductID: '' })]);
    expect(result.invalidRows[0].raw).toBeDefined();
    expect(result.invalidRows[0].raw['ProductID']).toBe('');
  });
});
