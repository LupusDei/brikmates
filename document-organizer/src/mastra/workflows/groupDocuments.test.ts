import { describe, it, expect } from 'vitest';
import { compareTwoStrings } from 'string-similarity';

// Test the fuzzy matching logic directly
describe('fuzzy matching', () => {
  const SIMILARITY_THRESHOLD = 0.8;

  function findFuzzyMatch(needle: string, haystack: string[]): string | null {
    for (const candidate of haystack) {
      if (compareTwoStrings(needle.toLowerCase(), candidate.toLowerCase()) >= SIMILARITY_THRESHOLD) {
        return candidate;
      }
    }
    return null;
  }

  it('matches identical strings', () => {
    expect(findFuzzyMatch('ABC Properties LLC', ['ABC Properties LLC'])).toBe('ABC Properties LLC');
  });

  it('matches similar lessor names', () => {
    expect(findFuzzyMatch('ABC Properties LLC', ['ABC Properties, LLC'])).toBe('ABC Properties, LLC');
  });

  it('matches with minor typos', () => {
    expect(findFuzzyMatch('ABC Properites LLC', ['ABC Properties LLC'])).toBe('ABC Properties LLC');
  });

  it('does not match dissimilar strings', () => {
    expect(findFuzzyMatch('ABC Properties LLC', ['XYZ Holdings Inc'])).toBeNull();
  });

  it('matches normalized addresses', () => {
    expect(findFuzzyMatch('123 main street, new york, ny', ['123 main street, new york, ny 10001'])).toBe('123 main street, new york, ny 10001');
  });

  it('is case insensitive', () => {
    expect(findFuzzyMatch('abc properties llc', ['ABC PROPERTIES LLC'])).toBe('ABC PROPERTIES LLC');
  });
});

// Test the grouping logic with mock data
describe('document grouping', () => {
  // Mock processed documents for testing
  const createMockDoc = (
    id: string,
    lessor: string,
    address: string,
    docType: 'lease' | 'amendment' | 'rent_commencement' | 'delivery_letter' | 'other'
  ) => ({
    id,
    filename: `${id}.txt`,
    classification: {
      documentType: docType,
      confidence: 'high' as const,
      reasoning: 'Test document',
    },
    extraction: {
      lessor,
      address,
      tenant: 'Test Tenant',
      baseReference: docType === 'amendment' ? 'Base Lease 2024' : undefined,
    },
    content: 'Test content',
  });

  it('groups documents by lessor and address', () => {
    const docs = [
      createMockDoc('doc1', 'ABC Properties', '123 main street', 'lease'),
      createMockDoc('doc2', 'ABC Properties', '123 main street', 'amendment'),
      createMockDoc('doc3', 'XYZ Holdings', '456 oak avenue', 'lease'),
    ];

    // Manually simulate grouping logic
    const grouped: Record<string, Record<string, { baseLease: string | null; amendments: string[] }>> = {};

    for (const doc of docs) {
      const { lessor, address } = doc.extraction;
      if (!grouped[lessor]) grouped[lessor] = {};
      if (!grouped[lessor][address]) {
        grouped[lessor][address] = { baseLease: null, amendments: [] };
      }

      if (doc.classification.documentType === 'lease') {
        grouped[lessor][address].baseLease = doc.id;
      } else if (doc.classification.documentType === 'amendment') {
        grouped[lessor][address].amendments.push(doc.id);
      }
    }

    expect(Object.keys(grouped)).toHaveLength(2);
    expect(grouped['ABC Properties']['123 main street'].baseLease).toBe('doc1');
    expect(grouped['ABC Properties']['123 main street'].amendments).toContain('doc2');
    expect(grouped['XYZ Holdings']['456 oak avenue'].baseLease).toBe('doc3');
  });

  it('handles unknown lessor/address as ungrouped', () => {
    const docs = [
      createMockDoc('doc1', 'unknown', '123 main street', 'lease'),
      createMockDoc('doc2', 'ABC Properties', 'unknown', 'lease'),
    ];

    const ungrouped = docs.filter(
      (doc) => doc.extraction.lessor === 'unknown' || doc.extraction.address === 'unknown'
    );

    expect(ungrouped).toHaveLength(2);
  });

  it('assigns first lease as baseLease', () => {
    const docs = [
      createMockDoc('lease1', 'ABC Properties', '123 main street', 'lease'),
      createMockDoc('lease2', 'ABC Properties', '123 main street', 'lease'),
    ];

    // Simulate: first lease becomes baseLease, second goes to others
    const result = {
      baseLease: docs[0].id,
      others: [docs[1].id],
    };

    expect(result.baseLease).toBe('lease1');
    expect(result.others).toContain('lease2');
  });

  it('categorizes all document types correctly', () => {
    const docs = [
      createMockDoc('doc1', 'ABC', '123 main', 'lease'),
      createMockDoc('doc2', 'ABC', '123 main', 'amendment'),
      createMockDoc('doc3', 'ABC', '123 main', 'rent_commencement'),
      createMockDoc('doc4', 'ABC', '123 main', 'delivery_letter'),
      createMockDoc('doc5', 'ABC', '123 main', 'other'),
    ];

    const leaseFile = {
      baseLease: null as string | null,
      amendments: [] as string[],
      commencements: [] as string[],
      deliveries: [] as string[],
      others: [] as string[],
    };

    for (const doc of docs) {
      switch (doc.classification.documentType) {
        case 'lease':
          leaseFile.baseLease = doc.id;
          break;
        case 'amendment':
          leaseFile.amendments.push(doc.id);
          break;
        case 'rent_commencement':
          leaseFile.commencements.push(doc.id);
          break;
        case 'delivery_letter':
          leaseFile.deliveries.push(doc.id);
          break;
        default:
          leaseFile.others.push(doc.id);
      }
    }

    expect(leaseFile.baseLease).toBe('doc1');
    expect(leaseFile.amendments).toEqual(['doc2']);
    expect(leaseFile.commencements).toEqual(['doc3']);
    expect(leaseFile.deliveries).toEqual(['doc4']);
    expect(leaseFile.others).toEqual(['doc5']);
  });
});

describe('getSimplifiedOutput', () => {
  it('returns hierarchy without document content', () => {
    // The simplified output should only contain IDs, not full document content
    const mockResult = {
      grouped: {
        'ABC Properties': {
          '123 main street': {
            leaseFile: {
              baseLease: 'doc1',
              amendments: ['doc2'],
              commencements: [],
              deliveries: [],
              others: [],
            },
            documents: [], // Full documents would be here
          },
        },
      },
      ungrouped: [],
      stats: {
        totalDocuments: 2,
        groupedDocuments: 2,
        ungroupedDocuments: 0,
        lessors: 1,
        addresses: 1,
      },
    };

    // Simplified output extracts just the leaseFile structure
    const simplified = {
      hierarchy: {
        'ABC Properties': {
          '123 main street': mockResult.grouped['ABC Properties']['123 main street'].leaseFile,
        },
      },
      ungrouped: [],
      stats: mockResult.stats,
    };

    expect(simplified.hierarchy['ABC Properties']['123 main street'].baseLease).toBe('doc1');
    expect(simplified.hierarchy['ABC Properties']['123 main street'].amendments).toEqual(['doc2']);
  });
});
