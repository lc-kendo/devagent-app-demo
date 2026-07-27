// Fixed CSV column headers in strict order
export const EXPECTED_HEADERS = [
  'ProductID',
  'ProductName',
  'Category',
  'Brand',
  'Price',
  'OriginalPrice',
  'Stock',
  'Rating',
  'ReviewCount',
  'SalesVolume',
  'LaunchDate',
  'Description',
] as const;

export type ColumnName = (typeof EXPECTED_HEADERS)[number];

// Field metadata for validation
export interface FieldMeta {
  required: boolean;
  type: 'string' | 'number' | 'integer' | 'date';
  min?: number;
  max?: number;
}

export const FIELD_META: Record<ColumnName, FieldMeta> = {
  ProductID:     { required: true,  type: 'string' },
  ProductName:   { required: true,  type: 'string' },
  Category:      { required: true,  type: 'string' },
  Brand:         { required: true,  type: 'string' },
  Price:         { required: true,  type: 'number', min: 0 },
  OriginalPrice: { required: false, type: 'number', min: 0 },
  Stock:         { required: false, type: 'integer', min: 0 },
  Rating:        { required: false, type: 'number', min: 0, max: 5 },
  ReviewCount:   { required: false, type: 'integer', min: 0 },
  SalesVolume:   { required: false, type: 'integer', min: 0 },
  LaunchDate:    { required: false, type: 'date' },
  Description:   { required: false, type: 'string' },
};

// Raw row: string fields from CSV plus row number (1-based, header=1, first data row=2)
export interface RawRow {
  rowNumber: number;
  fields: Record<ColumnName, string>;
}

// Fully typed product record (after validation + type conversion)
export interface Product {
  ProductID: string;
  ProductName: string;
  Category: string;
  Brand: string;
  Price: number;
  OriginalPrice: number | null;
  Stock: number | null;
  Rating: number | null;
  ReviewCount: number | null;
  SalesVolume: number | null;
  LaunchDate: string | null;
  Description: string | null;
}
