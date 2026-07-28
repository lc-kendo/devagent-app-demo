import { RawRow, Product, ColumnName } from './schema';
import { ValidationResult, ValidRow, InvalidRow } from '../shared/types';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(str: string): boolean {
  if (!DATE_REGEX.test(str)) return false;
  const d = new Date(str);
  // Check that the parsed date round-trips to the same string
  if (isNaN(d.getTime())) return false;
  const [year, month, day] = str.split('-').map(Number);
  return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day;
}

function isInteger(val: number): boolean {
  return Number.isFinite(val) && Math.floor(val) === val;
}

function toNullableNumber(str: string): number | null {
  if (str.trim() === '') return null;
  return parseFloat(str);
}

function toNullableInteger(str: string): number | null {
  if (str.trim() === '') return null;
  return parseFloat(str);
}

/**
 * Validate an array of RawRows against all business rules.
 * Returns valid rows (converted to Product), invalid rows (with error messages), and summary.
 */
export function validateRows(rows: RawRow[]): ValidationResult {
  // First pass: collect all ProductIDs to find duplicates
  const idCount = new Map<string, number[]>();
  for (const row of rows) {
    const id = row.fields.ProductID.trim();
    if (id) {
      if (!idCount.has(id)) idCount.set(id, []);
      idCount.get(id)!.push(row.rowNumber);
    }
  }
  // ProductIDs that appear more than once: rows at index 1+ are duplicates
  const duplicateRows = new Set<number>();
  for (const [, rowNums] of idCount) {
    if (rowNums.length > 1) {
      for (const rn of rowNums.slice(1)) {
        duplicateRows.add(rn);
      }
    }
  }

  const validRows: ValidRow[] = [];
  const invalidRows: InvalidRow[] = [];

  for (const row of rows) {
    const errors: string[] = [];
    const f = row.fields;

    // Required fields
    if (!f.ProductID.trim())   errors.push('ProductID 必填');
    if (!f.ProductName.trim()) errors.push('ProductName 必填');
    if (!f.Category.trim())    errors.push('Category 必填');
    if (!f.Brand.trim())       errors.push('Brand 必填');
    if (!f.Price.trim())       errors.push('Price 必填');

    // Price range (only if not empty)
    if (f.Price.trim()) {
      const price = parseFloat(f.Price);
      if (isNaN(price) || price < 0) errors.push('Price 不得为负数');
    }

    // OriginalPrice range (optional)
    if (f.OriginalPrice.trim()) {
      const op = parseFloat(f.OriginalPrice);
      if (isNaN(op) || op < 0) errors.push('OriginalPrice 不得为负数');
    }

    // Stock (optional, must be non-negative integer)
    if (f.Stock.trim()) {
      const stock = parseFloat(f.Stock);
      if (isNaN(stock) || stock < 0 || !isInteger(stock)) {
        errors.push('Stock 须为非负整数');
      }
    }

    // Rating (optional, must be [0, 5])
    if (f.Rating.trim()) {
      const rating = parseFloat(f.Rating);
      if (isNaN(rating) || rating < 0 || rating > 5) {
        errors.push('Rating 须在 0 至 5 之间');
      }
    }

    // LaunchDate (optional, must be valid YYYY-MM-DD)
    if (f.LaunchDate.trim()) {
      if (!isValidDate(f.LaunchDate.trim())) {
        errors.push('LaunchDate 非合法 YYYY-MM-DD 日期');
      }
    }

    // File-level uniqueness
    if (duplicateRows.has(row.rowNumber)) {
      errors.push('ProductID 在文件中重复');
    }

    if (errors.length > 0) {
      invalidRows.push({
        rowNumber: row.rowNumber,
        raw: f as Record<string, string>,
        errors,
      });
    } else {
      // Convert to typed Product
      const price = parseFloat(f.Price);
      const product: Product = {
        ProductID:     f.ProductID.trim(),
        ProductName:   f.ProductName.trim(),
        Category:      f.Category.trim(),
        Brand:         f.Brand.trim(),
        Price:         price,
        OriginalPrice: f.OriginalPrice.trim() ? parseFloat(f.OriginalPrice) : null,
        Stock:         f.Stock.trim() ? parseInt(f.Stock, 10) : null,
        Rating:        f.Rating.trim() ? parseFloat(f.Rating) : null,
        ReviewCount:   f.ReviewCount.trim() ? parseInt(f.ReviewCount, 10) : null,
        SalesVolume:   f.SalesVolume.trim() ? parseInt(f.SalesVolume, 10) : null,
        LaunchDate:    f.LaunchDate.trim() || null,
        Description:   f.Description.trim() || null,
      };
      validRows.push({ rowNumber: row.rowNumber, product });
    }
  }

  return {
    validRows,
    invalidRows,
    summary: {
      total: rows.length,
      valid: validRows.length,
      invalid: invalidRows.length,
    },
  };
}
