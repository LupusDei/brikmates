import { describe, it, expect } from 'vitest';
import { findFuzzyMatch, groupDocuments, getSimplifiedOutput } from './grouping.js';
import type { ProcessedDocument } from './types.js';

describe('findFuzzyMatch', () => {
  it('returns exact match', () => {
    const result = findFuzzyMatch('ABC Corp', ['ABC Corp', 'XYZ Inc']);
    expect(result).toBe('ABC Corp');
  });

  it('returns fuzzy match above threshold', () => {
    // "ABC Properties LLC" vs "ABC Properties LLC." has ~97% similarity
    const result = findFuzzyMatch('ABC Properties LLC', ['ABC Properties LLC.', 'XYZ Inc']);
    expect(result).toBe('ABC Properties LLC.');
  });

  it('returns null when no match', () => {
    const result = findFuzzyMatch('Totally Different', ['ABC Corp', 'XYZ Inc']);
    expect(result).toBeNull();
  });

  it('is case insensitive', () => {
    const result = findFuzzyMatch('abc corp', ['ABC Corp', 'XYZ Inc']);
    expect(result).toBe('ABC Corp');
  });
});

describe('groupDocuments', () => {
  const createDoc = (
    id: string,
    lessor: string,
    address: string,
    docType: 'lease' | 'amendment' | 'rent_commencement' | 'delivery_letter' | 'other'
  ): ProcessedDocument => ({
    id,
    filename: `${id}.txt`,
    classification: { documentType: docType, confidence: 'high', reasoning: 'test' },
    extraction: { lessor, address, tenant: 'Test Tenant' },
    content: 'test content',
  });

  it('groups documents by lessor and address', () => {
    const docs = [
      createDoc('lease-1', 'ABC Corp', '123 main street', 'lease'),
      createDoc('amend-1', 'ABC Corp', '123 main street', 'amendment'),
    ];

    const result = groupDocuments(docs);

    expect(result.stats.lessors).toBe(1);
    expect(result.stats.addresses).toBe(1);
    expect(result.grouped['ABC Corp']['123 main street'].leaseFile.baseLease).toBe('lease-1');
    expect(result.grouped['ABC Corp']['123 main street'].leaseFile.amendments).toContain('amend-1');
  });

  it('puts documents with unknown lessor/address in ungrouped', () => {
    const docs = [
      createDoc('doc-1', 'unknown', '123 main street', 'lease'),
      createDoc('doc-2', 'ABC Corp', 'unknown', 'lease'),
    ];

    const result = groupDocuments(docs);

    expect(result.ungrouped).toHaveLength(2);
    expect(result.stats.ungroupedDocuments).toBe(2);
  });

  it('uses fuzzy matching for similar lessors', () => {
    // Use names with high similarity (>80%)
    const docs = [
      createDoc('lease-1', 'ABC Properties LLC', '123 main street', 'lease'),
      createDoc('amend-1', 'ABC Properties LLC.', '123 main street', 'amendment'),
    ];

    const result = groupDocuments(docs);

    expect(result.stats.lessors).toBe(1);
    expect(Object.keys(result.grouped)).toHaveLength(1);
  });

  it('categorizes document types correctly', () => {
    const docs = [
      createDoc('lease-1', 'ABC', '123 main', 'lease'),
      createDoc('amend-1', 'ABC', '123 main', 'amendment'),
      createDoc('comm-1', 'ABC', '123 main', 'rent_commencement'),
      createDoc('deliv-1', 'ABC', '123 main', 'delivery_letter'),
      createDoc('other-1', 'ABC', '123 main', 'other'),
    ];

    const result = groupDocuments(docs);
    const leaseFile = result.grouped['ABC']['123 main'].leaseFile;

    expect(leaseFile.baseLease).toBe('lease-1');
    expect(leaseFile.amendments).toEqual(['amend-1']);
    expect(leaseFile.commencements).toEqual(['comm-1']);
    expect(leaseFile.deliveries).toEqual(['deliv-1']);
    expect(leaseFile.others).toEqual(['other-1']);
  });

  it('puts extra leases in others', () => {
    const docs = [
      createDoc('lease-1', 'ABC', '123 main', 'lease'),
      createDoc('lease-2', 'ABC', '123 main', 'lease'),
    ];

    const result = groupDocuments(docs);
    const leaseFile = result.grouped['ABC']['123 main'].leaseFile;

    expect(leaseFile.baseLease).toBe('lease-1');
    expect(leaseFile.others).toContain('lease-2');
  });
});

describe('getSimplifiedOutput', () => {
  it('converts GroupingResult to simplified format', () => {
    const docs: ProcessedDocument[] = [
      {
        id: 'lease-1',
        filename: 'lease-1.txt',
        classification: { documentType: 'lease', confidence: 'high', reasoning: 'test' },
        extraction: { lessor: 'ABC Corp', address: '123 main', tenant: 'Test' },
        content: 'test',
      },
    ];

    const groupingResult = groupDocuments(docs);
    const simplified = getSimplifiedOutput(groupingResult);

    expect(simplified.hierarchy['ABC Corp']['123 main'].baseLease).toBe('lease-1');
    expect(simplified.ungrouped).toEqual([]);
    expect(simplified.stats.totalDocuments).toBe(1);
  });

  it('includes ungrouped document ids', () => {
    const docs: ProcessedDocument[] = [
      {
        id: 'unknown-doc',
        filename: 'unknown.txt',
        classification: { documentType: 'other', confidence: 'low', reasoning: 'test' },
        extraction: { lessor: 'unknown', address: 'unknown', tenant: 'unknown' },
        content: 'test',
      },
    ];

    const groupingResult = groupDocuments(docs);
    const simplified = getSimplifiedOutput(groupingResult);

    expect(simplified.ungrouped).toContain('unknown-doc');
  });
});
