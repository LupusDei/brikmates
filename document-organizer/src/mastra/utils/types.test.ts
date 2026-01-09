import { describe, it, expect } from 'vitest';
import { leaseFileSchema, statsSchema, hierarchySchema } from './types.js';

describe('leaseFileSchema', () => {
  it('validates correct lease file structure', () => {
    const result = leaseFileSchema.safeParse({
      baseLease: 'lease-001',
      amendments: ['amend-001', 'amend-002'],
      commencements: ['comm-001'],
      deliveries: [],
      others: ['other-001'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts null baseLease', () => {
    const result = leaseFileSchema.safeParse({
      baseLease: null,
      amendments: [],
      commencements: [],
      deliveries: [],
      others: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = leaseFileSchema.safeParse({
      baseLease: 'lease-001',
      amendments: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('statsSchema', () => {
  it('validates correct stats structure', () => {
    const result = statsSchema.safeParse({
      totalDocuments: 10,
      groupedDocuments: 8,
      ungroupedDocuments: 2,
      lessors: 3,
      addresses: 5,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-numeric values', () => {
    const result = statsSchema.safeParse({
      totalDocuments: '10',
      groupedDocuments: 8,
      ungroupedDocuments: 2,
      lessors: 3,
      addresses: 5,
    });
    expect(result.success).toBe(false);
  });
});

describe('hierarchySchema', () => {
  it('validates correct hierarchy structure', () => {
    const result = hierarchySchema.safeParse({
      'ABC Corp': {
        '123 main street': {
          baseLease: 'lease-001',
          amendments: ['amend-001'],
          commencements: [],
          deliveries: [],
          others: [],
        },
      },
      'XYZ Inc': {
        '456 oak avenue': {
          baseLease: null,
          amendments: [],
          commencements: ['comm-001'],
          deliveries: ['deliv-001'],
          others: [],
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('validates empty hierarchy', () => {
    const result = hierarchySchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
