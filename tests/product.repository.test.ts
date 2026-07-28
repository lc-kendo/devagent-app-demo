import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createConnection, runMigrations } from '../src/db/connection';
import { upsertMany, findByProductId, findAll } from '../src/db/product.repository';
import type { Product } from '../src/domain/schema';
import type { DatabaseSync } from 'node:sqlite';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    ProductID: 'P001',
    ProductName: 'Test Product',
    Category: 'Electronics',
    Brand: 'TestBrand',
    Price: 99.9,
    OriginalPrice: 129.0,
    Stock: 50,
    Rating: 4.5,
    ReviewCount: 100,
    SalesVolume: 200,
    LaunchDate: '2024-01-15',
    Description: 'A test product',
    ...overrides,
  };
}

describe('ProductRepository', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('upserts 10 new products: inserted=10, updated=0', () => {
    const products = Array.from({ length: 10 }, (_, i) =>
      makeProduct({ ProductID: `P${String(i + 1).padStart(3, '0')}` }),
    );
    const result = upsertMany(db, products);
    expect(result.inserted).toBe(10);
    expect(result.updated).toBe(0);
  });

  it('updates 10 existing products: inserted=0, updated=10', () => {
    const products = Array.from({ length: 10 }, (_, i) =>
      makeProduct({ ProductID: `P${String(i + 1).padStart(3, '0')}` }),
    );
    upsertMany(db, products);
    // Upsert same IDs again with changed name
    const updated = products.map(p => ({ ...p, ProductName: 'Updated Name' }));
    const result = upsertMany(db, updated);
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(10);
  });

  it('handles mixed insert+update: 5 new + 5 existing', () => {
    const existing = Array.from({ length: 5 }, (_, i) =>
      makeProduct({ ProductID: `P${String(i + 1).padStart(3, '0')}` }),
    );
    upsertMany(db, existing);
    const mixed = [
      ...existing,
      ...Array.from({ length: 5 }, (_, i) =>
        makeProduct({ ProductID: `P${String(i + 6).padStart(3, '0')}` }),
      ),
    ];
    const result = upsertMany(db, mixed);
    expect(result.inserted).toBe(5);
    expect(result.updated).toBe(5);
  });

  it('findByProductId returns the correct product', () => {
    upsertMany(db, [makeProduct({ ProductID: 'P001', ProductName: 'Find Me' })]);
    const found = findByProductId(db, 'P001');
    expect(found).not.toBeNull();
    expect(found!.ProductName).toBe('Find Me');
  });

  it('findByProductId returns null for non-existent ID', () => {
    const found = findByProductId(db, 'NOTEXIST');
    expect(found).toBeNull();
  });

  it('upsertMany with empty array returns {inserted:0, updated:0}', () => {
    const result = upsertMany(db, []);
    expect(result).toEqual({ inserted: 0, updated: 0 });
  });

  it('migration is idempotent (running twice does not throw)', () => {
    expect(() => runMigrations(db)).not.toThrow();
  });

  it('inserted + updated equals total products passed', () => {
    const existing = [makeProduct({ ProductID: 'P001' })];
    upsertMany(db, existing);
    const batch = [
      makeProduct({ ProductID: 'P001' }), // update
      makeProduct({ ProductID: 'P002' }), // insert
      makeProduct({ ProductID: 'P003' }), // insert
    ];
    const result = upsertMany(db, batch);
    expect(result.inserted + result.updated).toBe(3);
  });

  it('updated product has changed fields', () => {
    upsertMany(db, [makeProduct({ ProductID: 'P001', Price: 99.9 })]);
    upsertMany(db, [makeProduct({ ProductID: 'P001', Price: 199.9 })]);
    const found = findByProductId(db, 'P001');
    expect(found!.Price).toBe(199.9);
  });

  it('stores and retrieves null optional fields correctly', () => {
    const p = makeProduct({ ProductID: 'P001', OriginalPrice: null, Stock: null, LaunchDate: null });
    upsertMany(db, [p]);
    const found = findByProductId(db, 'P001');
    expect(found!.OriginalPrice).toBeNull();
    expect(found!.Stock).toBeNull();
    expect(found!.LaunchDate).toBeNull();
  });
});
