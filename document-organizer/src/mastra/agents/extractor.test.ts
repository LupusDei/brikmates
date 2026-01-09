import { describe, it, expect } from 'vitest';
import { normalizeAddress, extractionSchema } from './extractor.js';

describe('normalizeAddress', () => {
  it('converts to lowercase', () => {
    expect(normalizeAddress('123 MAIN STREET')).toBe('123 main street');
  });

  it('removes extra spaces', () => {
    expect(normalizeAddress('123   Main    Street')).toBe('123 main street');
  });

  it('trims whitespace', () => {
    expect(normalizeAddress('  123 Main Street  ')).toBe('123 main street');
  });

  it('normalizes St. to street', () => {
    expect(normalizeAddress('123 Main St.')).toBe('123 main street');
  });

  it('normalizes St to street (without period)', () => {
    expect(normalizeAddress('123 Main St')).toBe('123 main street');
  });

  it('normalizes Ave. to avenue', () => {
    expect(normalizeAddress('456 Park Ave.')).toBe('456 park avenue');
  });

  it('normalizes Blvd to boulevard', () => {
    expect(normalizeAddress('789 Sunset Blvd')).toBe('789 sunset boulevard');
  });

  it('normalizes Dr to drive', () => {
    expect(normalizeAddress('100 Ocean Dr')).toBe('100 ocean drive');
  });

  it('normalizes multiple abbreviations', () => {
    expect(normalizeAddress('123 Main St., Apt. 4B')).toBe('123 main street, apartment 4b');
  });

  it('handles full address with city and state', () => {
    expect(normalizeAddress('123 Main St., New York, NY 10001')).toBe(
      '123 main street, new york, ny 10001'
    );
  });

  it('removes periods after numbers', () => {
    expect(normalizeAddress('123. Main Street')).toBe('123 main street');
  });
});

describe('extractionSchema', () => {
  it('validates correct extraction result', () => {
    const result = extractionSchema.parse({
      lessor: 'ABC Properties LLC',
      address: '123 main street',
      tenant: 'John Doe',
    });
    expect(result.lessor).toBe('ABC Properties LLC');
    expect(result.address).toBe('123 main street');
    expect(result.tenant).toBe('John Doe');
    expect(result.baseReference).toBeUndefined();
  });

  it('accepts optional baseReference', () => {
    const result = extractionSchema.parse({
      lessor: 'ABC Properties LLC',
      address: '123 main street',
      tenant: 'John Doe',
      baseReference: 'Lease dated January 1, 2024',
    });
    expect(result.baseReference).toBe('Lease dated January 1, 2024');
  });

  it('rejects missing required fields', () => {
    expect(() =>
      extractionSchema.parse({
        lessor: 'ABC Properties LLC',
        tenant: 'John Doe',
      })
    ).toThrow();
  });
});
