import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'node:fs';
import { leaseQueryTool } from './leaseQueryTool.js';
import { saveGroupingResult } from '../utils/leaseQuery.js';
import type { GroupingResult, ProcessedDocument } from '../workflows/groupDocuments.js';

const TEST_GROUPING_FILE = '.document-grouping.json';

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

// Helper to execute the tool
async function executeTool(context: Record<string, unknown>) {
  return leaseQueryTool.execute({
    context: context as any,
    runId: 'test-run',
    mastra: {} as any,
    runtimeContext: {} as any,
  });
}

describe('leaseQueryTool', () => {
  beforeEach(() => {
    cleanupTestFile();
    saveGroupingResult(createSampleGroupingResult(), TEST_GROUPING_FILE);
  });
  afterEach(cleanupTestFile);

  it('returns error when no grouping data exists', async () => {
    cleanupTestFile();
    const result = await executeTool({ operation: 'list_all_leases' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No lease data found/);
  });

  describe('list_all_leases', () => {
    it('returns all lease summaries', async () => {
      const result = await executeTool({ operation: 'list_all_leases' });

      expect(result.success).toBe(true);
      expect(result.leases).toHaveLength(2);
      expect(result.leases![0].lessor).toBeDefined();
    });
  });

  describe('list_lessors', () => {
    it('returns all unique lessors', async () => {
      const result = await executeTool({ operation: 'list_lessors' });

      expect(result.success).toBe(true);
      expect(result.lessors).toEqual(['ABC Properties', 'XYZ Holdings']);
    });
  });

  describe('list_addresses', () => {
    it('returns addresses for a lessor', async () => {
      const result = await executeTool({
        operation: 'list_addresses',
        lessor: 'ABC Properties',
      });

      expect(result.success).toBe(true);
      expect(result.addresses).toEqual(['123 main street']);
    });

    it('returns error when lessor is missing', async () => {
      const result = await executeTool({ operation: 'list_addresses' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/lessor parameter is required/);
    });
  });

  describe('get_lease_details', () => {
    it('returns lease details for lessor and address', async () => {
      const result = await executeTool({
        operation: 'get_lease_details',
        lessor: 'ABC Properties',
        address: '123 main street',
      });

      expect(result.success).toBe(true);
      expect(result.leaseDetails).toBeDefined();
      expect(result.leaseDetails!.lessor).toBe('ABC Properties');
      expect(result.leaseDetails!.leaseFile.baseLease).toBe('lease-001');
      expect(result.leaseDetails!.leaseFile.amendments).toHaveLength(2);
    });

    it('returns error when lessor/address not found', async () => {
      const result = await executeTool({
        operation: 'get_lease_details',
        lessor: 'Unknown',
        address: 'unknown',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/No lease found/);
    });

    it('returns error when parameters missing', async () => {
      const result = await executeTool({ operation: 'get_lease_details' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/lessor and address parameters are required/);
    });
  });

  describe('get_base_lease', () => {
    it('returns the base lease document', async () => {
      const result = await executeTool({
        operation: 'get_base_lease',
        lessor: 'ABC Properties',
        address: '123 main street',
      });

      expect(result.success).toBe(true);
      expect(result.document).toBeDefined();
      expect(result.document!.id).toBe('lease-001');
    });

    it('excludes content by default', async () => {
      const result = await executeTool({
        operation: 'get_base_lease',
        lessor: 'ABC Properties',
        address: '123 main street',
      });

      expect(result.document).not.toHaveProperty('content');
    });

    it('includes content when requested', async () => {
      const result = await executeTool({
        operation: 'get_base_lease',
        lessor: 'ABC Properties',
        address: '123 main street',
        includeContent: true,
      });

      expect(result.document).toHaveProperty('content');
    });
  });

  describe('get_amendments', () => {
    it('returns amendment documents', async () => {
      const result = await executeTool({
        operation: 'get_amendments',
        lessor: 'ABC Properties',
        address: '123 main street',
      });

      expect(result.success).toBe(true);
      expect(result.documents).toHaveLength(2);
      expect(result.documents![0].id).toBe('amend-001');
    });

    it('returns empty array when no amendments', async () => {
      const result = await executeTool({
        operation: 'get_amendments',
        lessor: 'XYZ Holdings',
        address: '456 oak avenue',
      });

      expect(result.success).toBe(true);
      expect(result.documents).toHaveLength(0);
    });
  });

  describe('get_commencements', () => {
    it('returns rent commencement documents', async () => {
      const result = await executeTool({
        operation: 'get_commencements',
        lessor: 'ABC Properties',
        address: '123 main street',
      });

      expect(result.success).toBe(true);
      expect(result.documents).toHaveLength(1);
      expect(result.documents![0].id).toBe('commence-001');
    });
  });

  describe('get_deliveries', () => {
    it('returns delivery letter documents', async () => {
      const result = await executeTool({
        operation: 'get_deliveries',
        lessor: 'XYZ Holdings',
        address: '456 oak avenue',
      });

      expect(result.success).toBe(true);
      expect(result.documents).toHaveLength(1);
      expect(result.documents![0].id).toBe('delivery-001');
    });
  });

  describe('get_related_documents', () => {
    it('returns all related documents grouped by type', async () => {
      const result = await executeTool({
        operation: 'get_related_documents',
        lessor: 'ABC Properties',
        address: '123 main street',
      });

      expect(result.success).toBe(true);
      expect(result.relatedDocuments).toBeDefined();
      expect(result.relatedDocuments!.baseLease?.id).toBe('lease-001');
      expect(result.relatedDocuments!.amendments).toHaveLength(2);
      expect(result.relatedDocuments!.commencements).toHaveLength(1);
    });

    it('returns error for unknown lease', async () => {
      const result = await executeTool({
        operation: 'get_related_documents',
        lessor: 'Unknown',
        address: 'unknown',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/No lease found/);
    });
  });

  describe('search_by_lessor', () => {
    it('finds leases by partial lessor name', async () => {
      const result = await executeTool({
        operation: 'search_by_lessor',
        searchQuery: 'ABC',
      });

      expect(result.success).toBe(true);
      expect(result.leases).toHaveLength(1);
      expect(result.leases![0].lessor).toBe('ABC Properties');
    });

    it('returns error when searchQuery missing', async () => {
      const result = await executeTool({ operation: 'search_by_lessor' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/searchQuery parameter is required/);
    });
  });

  describe('search_by_address', () => {
    it('finds leases by partial address', async () => {
      const result = await executeTool({
        operation: 'search_by_address',
        searchQuery: 'oak',
      });

      expect(result.success).toBe(true);
      expect(result.leases).toHaveLength(1);
      expect(result.leases![0].address).toBe('456 oak avenue');
    });
  });

  describe('find_document', () => {
    it('finds document by ID', async () => {
      const result = await executeTool({
        operation: 'find_document',
        documentId: 'amend-001',
      });

      expect(result.success).toBe(true);
      expect(result.document).toBeDefined();
      expect(result.document!.id).toBe('amend-001');
      expect(result.document!.lessor).toBe('ABC Properties');
    });

    it('returns error for unknown document', async () => {
      const result = await executeTool({
        operation: 'find_document',
        documentId: 'nonexistent',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/);
    });

    it('returns error when documentId missing', async () => {
      const result = await executeTool({ operation: 'find_document' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/documentId parameter is required/);
    });
  });

  describe('get_stats', () => {
    it('returns overall statistics', async () => {
      const result = await executeTool({ operation: 'get_stats' });

      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();
      expect(result.stats!.totalDocuments).toBe(7);
      expect(result.stats!.lessors).toBe(2);
    });
  });

  describe('get_ungrouped', () => {
    it('returns ungrouped documents', async () => {
      const result = await executeTool({ operation: 'get_ungrouped' });

      expect(result.success).toBe(true);
      expect(result.documents).toHaveLength(1);
      expect(result.documents![0].id).toBe('unknown-001');
    });
  });
});
