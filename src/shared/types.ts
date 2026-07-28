import type { Product, RawRow } from '../domain/schema';
import type { ReviewCountReport } from '../domain/report';

// GET /api/report/review-count - Response 200
export interface ReviewCountReportResponse {
  success: true;
  report: ReviewCountReport;
}

// GET /api/report/review-count - Response 500
export interface ReportErrorResponse {
  success: false;
  error: ErrorCode;
  message: string;
}

// Error codes for file-level errors (400 responses)
export type ErrorCode =
  | 'INVALID_FILE_TYPE'
  | 'EMPTY_FILE'
  | 'HEADER_MISMATCH'
  | 'ROW_LIMIT_EXCEEDED'
  | 'PARSE_ERROR'
  | 'VALIDATION_FAILED'
  | 'EMPTY_ROWS'
  | 'INTERNAL_ERROR';

// A row that failed validation
export interface InvalidRow {
  rowNumber: number;
  raw: Record<string, string>;
  errors: string[];
}

// A row that passed validation
export interface ValidRow {
  rowNumber: number;
  product: Product;
}

// Summary counts
export interface ImportSummary {
  total: number;
  valid: number;
  invalid: number;
}

export interface ConfirmSummary {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
}

// POST /api/import/preview - Response 200
export interface PreviewResponse {
  success: true;
  summary: ImportSummary;
  validRows: ValidRow[];
  invalidRows: InvalidRow[];
}

// POST /api/import/preview - Response 400
export interface PreviewErrorResponse {
  success: false;
  error: ErrorCode;
  message: string;
  detail?: {
    missing?: string[];
    unexpected?: string[];
    orderMismatch?: boolean;
  };
}

// POST /api/import/confirm - Request body
export interface ConfirmRequest {
  rows: Product[];
}

// POST /api/import/confirm - Response 200
export interface ConfirmResponse {
  success: true;
  summary: ConfirmSummary;
}

// POST /api/import/confirm - Response 400
export interface ConfirmErrorResponse {
  success: false;
  error: ErrorCode;
  message: string;
  invalidRows?: InvalidRow[];
}

// Validation result (internal)
export interface ValidationResult {
  validRows: ValidRow[];
  invalidRows: InvalidRow[];
  summary: ImportSummary;
}
