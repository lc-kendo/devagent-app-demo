import { parse } from 'csv-parse/sync';
import { EXPECTED_HEADERS, ColumnName, RawRow } from './schema';

// Custom error types
export class HeaderMismatchError extends Error {
  constructor(
    public readonly missing: string[],
    public readonly unexpected: string[],
    public readonly orderMismatch: boolean,
  ) {
    super('CSV 表头与预定义不一致');
    this.name = 'HeaderMismatchError';
  }
}

export class EmptyFileError extends Error {
  constructor() {
    super('CSV 文件无数据行');
    this.name = 'EmptyFileError';
  }
}

export class RowLimitError extends Error {
  constructor(public readonly count: number) {
    super(`CSV 数据行数 ${count} 超过最大限制 1000`);
    this.name = 'RowLimitError';
  }
}

const MAX_ROWS = 1000;

// Strip UTF-8 BOM if present
function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

/**
 * Parse a CSV Buffer into RawRow[].
 * Throws HeaderMismatchError, EmptyFileError, or RowLimitError on invalid input.
 */
export function parseCsv(buffer: Buffer): RawRow[] {
  const text = stripBom(buffer.toString('utf-8'));

  if (!text.trim()) {
    throw new EmptyFileError();
  }

  // Parse raw with csv-parse — produces string[][] with header row included
  const records: string[][] = parse(text, {
    relax_column_count: true,
    skip_empty_lines: true,
    trim: false,
  });

  if (records.length === 0) {
    throw new EmptyFileError();
  }

  const headerRow = records[0];
  const dataRows = records.slice(1);

  // Validate headers
  validateHeaders(headerRow);

  if (dataRows.length === 0) {
    throw new EmptyFileError();
  }

  if (dataRows.length > MAX_ROWS) {
    throw new RowLimitError(dataRows.length);
  }

  return dataRows.map((row, idx): RawRow => {
    const fields: Partial<Record<ColumnName, string>> = {};
    EXPECTED_HEADERS.forEach((col, colIdx) => {
      fields[col] = (row[colIdx] ?? '').trim();
    });
    return {
      rowNumber: idx + 2, // header is row 1, first data row is 2
      fields: fields as Record<ColumnName, string>,
    };
  });
}

function validateHeaders(headerRow: string[]): void {
  const expected = EXPECTED_HEADERS as readonly string[];
  const actual = headerRow.map(h => h.trim());

  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);

  const missing = expected.filter(h => !actualSet.has(h));
  const unexpected = actual.filter(h => !expectedSet.has(h));

  if (missing.length > 0 || unexpected.length > 0) {
    throw new HeaderMismatchError(missing, unexpected, false);
  }

  // Check order
  const orderMismatch = !expected.every((h, i) => actual[i] === h);
  if (orderMismatch) {
    throw new HeaderMismatchError([], [], true);
  }
}
