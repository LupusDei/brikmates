import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'node:fs';
import {
  saveGroupingResult,
  loadGroupingResult,
  LeaseQuery,
} from './leaseQuery.js';
import type { GroupingResult, ProcessedDocument } from '../workflows/groupDocuments.js';

const TEST_GROUPING_FILE = '.test-document-grouping.json';

// Clean up test file before/after tests
function cleanupTestFile() {
  if (existsSync(TEST_GROUPING_FILE)) {
    unlinkSync(TEST_GROUPING_FILE);
  }
}

// Create a mock processed document
function createMockDocument(
  id: string,
  type: 'lease' | 'amendment' | 'rent_commencement' | 'delivery_letter' | 'other',
  lessor: string,
  address: string
): ProcessedDocument {
  return {
    id,
    filename: `${id}.json`,
    classification: {
      documentType: type,
      confidence: 'high',
      reasoning: `Mock ${type} document`,
    },
    extraction: {
      lessor,
      address,
      tenant: 'Test Tenant',
    },
    content: `Content of ${id}`,
  };
}

// Create sample grouping result for tests
function createSampleGroupingResult(): GroupingResult {
  const doc1 = createMockDocument('lease-001', 'lease', 'ABC Properties', '123 main street');
  const doc2 = createMockDocument('amend-001', 'amendment', 'ABC Properties', '123 main street');
  const doc3 = createMockDocument('amend-002', 'amendment', 'ABC Properties', '123 main street');
  const doc4 = createMockDocument('commence-001', 'rent_commencement', 'ABC Properties', '123 main street');
  const doc5 = createMockDocument('lease-002', 'lease', 'XYZ Holdings', '456 oak avenue');
  const doc6 = createMockDocument('delivery-001', 'delivery_letter', 'XYZ Holdings', '456 oak avenue');
  const ungroupedDoc = createMockDocument('unknown-001', 'other', 'unknown', 'unknown');

  return {
    grouped: {
      'ABC Properties': {
        '123 main street': {
          leaseFile: {
            baseLease: 'lease-001',
            amendments: ['amend-001', 'amend-002'],
            commencements: ['commence-001'],
            deliveries: [],
            others: [],
          },
          documents: [doc1, doc2, doc3, doc4],
        },
      },
      'XYZ Holdings': {
        '456 oak avenue': {
          leaseFile: {
            baseLease: 'lease-002',
            amendments: [],
            commencements: [],
            deliveries: ['delivery-001'],
            others: [],
          },
          documents: [doc5, doc6],
        },
      },
    },
    ungrouped: [ungroupedDoc],
    stats: {
      totalDocuments: 7,
      groupedDocuments: 6,
      ungroupedDocuments: 1,
      lessors: 2,
      addresses: 2,
    },
  };
}

describe('saveGroupingResult / loadGroupingResult', () => {
  beforeEach(cleanupTestFile);
  afterEach(cleanupTestFile);

  it('returns null when file does not exist', () => {
    const result = loadGroupingResult(TEST_GROUPING_FILE);
    expect(result).toBeNull();
  });

  it('saves and loads grouping result correctly', () => {
    const original = createSampleGroupingResult();

    saveGroupingResult(original, TEST_GROUPING_FILE);
    const loaded = loadGroupingResult(TEST_GROUPING_FILE);

    expect(loaded).not.toBeNull();
    expect(loaded!.stats).toEqual(original.stats);
    expect(Object.keys(loaded!.grouped)).toEqual(['ABC Properties', 'XYZ Holdings']);
  });
});

describe('LeaseQuery', () => {
  beforeEach(() => {
    cleanupTestFile();
    // Save sample data for tests
    saveGroupingResult(createSampleGroupingResult(), TEST_GROUPING_FILE);
  });
  afterEach(cleanupTestFile);

  it('throws error when grouping file does not exist', () => {
    cleanupTestFile();
    expect(() => new LeaseQuery(TEST_GROUPING_FILE)).toThrow(
      /No grouping data found/
    );
  });

  describe('getAllLeases', () => {
    it('returns all lease summaries', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const leases = query.getAllLeases();

      expect(leases).toHaveLength(2);

      const abcLease = leases.find((l) => l.lessor === 'ABC Properties');
      expect(abcLease).toBeDefined();
      expect(abcLease!.address).toBe('123 main street');
      expect(abcLease!.baseLease).toBe('lease-001');
      expect(abcLease!.amendmentCount).toBe(2);
      expect(abcLease!.commencementCount).toBe(1);
      expect(abcLease!.totalDocuments).toBe(4);

      const xyzLease = leases.find((l) => l.lessor === 'XYZ Holdings');
      expect(xyzLease).toBeDefined();
      expect(xyzLease!.deliveryCount).toBe(1);
    });
  });

  describe('getLessors', () => {
    it('returns all unique lessors', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const lessors = query.getLessors();

      expect(lessors).toEqual(['ABC Properties', 'XYZ Holdings']);
    });
  });

  describe('getAddresses', () => {
    it('returns addresses for a specific lessor', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const addresses = query.getAddresses('ABC Properties');

      expect(addresses).toEqual(['123 main street']);
    });

    it('returns empty array for unknown lessor', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const addresses = query.getAddresses('Unknown Lessor');

      expect(addresses).toEqual([]);
    });
  });

  describe('getLeaseDetails', () => {
    it('returns full lease details for lessor and address', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const details = query.getLeaseDetails('ABC Properties', '123 main street');

      expect(details).not.toBeNull();
      expect(details!.lessor).toBe('ABC Properties');
      expect(details!.address).toBe('123 main street');
      expect(details!.leaseFile.baseLease).toBe('lease-001');
      expect(details!.documents).toHaveLength(4);
    });

    it('returns null for unknown lessor', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const details = query.getLeaseDetails('Unknown', '123 main street');

      expect(details).toBeNull();
    });

    it('returns null for unknown address', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const details = query.getLeaseDetails('ABC Properties', 'unknown address');

      expect(details).toBeNull();
    });
  });

  describe('getAmendments', () => {
    it('returns amendment documents for a lease', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const amendments = query.getAmendments('ABC Properties', '123 main street');

      expect(amendments).toHaveLength(2);
      expect(amendments.map((d) => d.id)).toEqual(['amend-001', 'amend-002']);
    });

    it('returns empty array when no amendments', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const amendments = query.getAmendments('XYZ Holdings', '456 oak avenue');

      expect(amendments).toHaveLength(0);
    });
  });

  describe('getCommencements', () => {
    it('returns rent commencement documents', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const commencements = query.getCommencements('ABC Properties', '123 main street');

      expect(commencements).toHaveLength(1);
      expect(commencements[0].id).toBe('commence-001');
    });
  });

  describe('getDeliveries', () => {
    it('returns delivery letter documents', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const deliveries = query.getDeliveries('XYZ Holdings', '456 oak avenue');

      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].id).toBe('delivery-001');
    });
  });

  describe('getBaseLease', () => {
    it('returns the base lease document', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const baseLease = query.getBaseLease('ABC Properties', '123 main street');

      expect(baseLease).not.toBeNull();
      expect(baseLease!.id).toBe('lease-001');
      expect(baseLease!.classification.documentType).toBe('lease');
    });

    it('returns null for unknown lease', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const baseLease = query.getBaseLease('Unknown', 'unknown');

      expect(baseLease).toBeNull();
    });
  });

  describe('getRelatedDocuments', () => {
    it('returns all related documents grouped by type', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const related = query.getRelatedDocuments('ABC Properties', '123 main street');

      expect(related).not.toBeNull();
      expect(related!.baseLease?.id).toBe('lease-001');
      expect(related!.amendments).toHaveLength(2);
      expect(related!.commencements).toHaveLength(1);
      expect(related!.deliveries).toHaveLength(0);
      expect(related!.others).toHaveLength(0);
    });

    it('returns null for unknown lease', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const related = query.getRelatedDocuments('Unknown', 'unknown');

      expect(related).toBeNull();
    });
  });

  describe('searchByLessor', () => {
    it('finds leases by partial lessor name', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const results = query.searchByLessor('ABC');

      expect(results).toHaveLength(1);
      expect(results[0].lessor).toBe('ABC Properties');
    });

    it('is case-insensitive', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const results = query.searchByLessor('xyz');

      expect(results).toHaveLength(1);
      expect(results[0].lessor).toBe('XYZ Holdings');
    });

    it('returns empty array for no matches', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const results = query.searchByLessor('Nonexistent');

      expect(results).toHaveLength(0);
    });
  });

  describe('searchByAddress', () => {
    it('finds leases by partial address', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const results = query.searchByAddress('main');

      expect(results).toHaveLength(1);
      expect(results[0].address).toBe('123 main street');
    });

    it('is case-insensitive', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const results = query.searchByAddress('OAK');

      expect(results).toHaveLength(1);
      expect(results[0].address).toBe('456 oak avenue');
    });
  });

  describe('getUngroupedDocuments', () => {
    it('returns documents that could not be grouped', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const ungrouped = query.getUngroupedDocuments();

      expect(ungrouped).toHaveLength(1);
      expect(ungrouped[0].id).toBe('unknown-001');
    });
  });

  describe('getStats', () => {
    it('returns overall statistics', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const stats = query.getStats();

      expect(stats.totalDocuments).toBe(7);
      expect(stats.groupedDocuments).toBe(6);
      expect(stats.ungroupedDocuments).toBe(1);
      expect(stats.lessors).toBe(2);
      expect(stats.addresses).toBe(2);
    });
  });

  describe('findDocumentById', () => {
    it('finds document in grouped data', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const result = query.findDocumentById('amend-001');

      expect(result).not.toBeNull();
      expect(result!.document.id).toBe('amend-001');
      expect(result!.lessor).toBe('ABC Properties');
      expect(result!.address).toBe('123 main street');
    });

    it('finds document in ungrouped data', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const result = query.findDocumentById('unknown-001');

      expect(result).not.toBeNull();
      expect(result!.document.id).toBe('unknown-001');
      expect(result!.lessor).toBe('unknown');
      expect(result!.address).toBe('unknown');
    });

    it('returns null for unknown document ID', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);
      const result = query.findDocumentById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('reload', () => {
    it('reloads data from disk', () => {
      const query = new LeaseQuery(TEST_GROUPING_FILE);

      // Verify initial state
      expect(query.getAllLeases()).toHaveLength(2);

      // Save new data
      const newResult: GroupingResult = {
        grouped: {
          'New Lessor': {
            '999 new street': {
              leaseFile: {
                baseLease: 'new-lease',
                amendments: [],
                commencements: [],
                deliveries: [],
                others: [],
              },
              documents: [createMockDocument('new-lease', 'lease', 'New Lessor', '999 new street')],
            },
          },
        },
        ungrouped: [],
        stats: {
          totalDocuments: 1,
          groupedDocuments: 1,
          ungroupedDocuments: 0,
          lessors: 1,
          addresses: 1,
        },
      };
      saveGroupingResult(newResult, TEST_GROUPING_FILE);

      // Reload and verify
      query.reload();
      expect(query.getAllLeases()).toHaveLength(1);
      expect(query.getLessors()).toEqual(['New Lessor']);
    });
  });
});
