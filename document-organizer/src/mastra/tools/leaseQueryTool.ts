import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  LeaseQuery,
  loadGroupingResult,
  LeaseSummary,
  LeaseDetails,
} from '../utils/leaseQuery.js';
import type { ProcessedDocument } from '../workflows/groupDocuments.js';

// Schema for lease summary output
const leaseSummarySchema = z.object({
  lessor: z.string(),
  address: z.string(),
  baseLease: z.string().nullable(),
  amendmentCount: z.number(),
  commencementCount: z.number(),
  deliveryCount: z.number(),
  otherCount: z.number(),
  totalDocuments: z.number(),
});

// Schema for processed document output
const processedDocumentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  classification: z.object({
    documentType: z.enum(['lease', 'amendment', 'rent_commencement', 'delivery_letter', 'other']),
    confidence: z.enum(['high', 'medium', 'low']),
    reasoning: z.string(),
  }),
  extraction: z.object({
    lessor: z.string(),
    address: z.string(),
    tenant: z.string(),
    baseReference: z.string().optional(),
  }),
  content: z.string(),
});

// Query operation types
const queryOperationSchema = z.enum([
  'list_all_leases',
  'list_lessors',
  'list_addresses',
  'get_lease_details',
  'get_base_lease',
  'get_amendments',
  'get_commencements',
  'get_deliveries',
  'get_related_documents',
  'search_by_lessor',
  'search_by_address',
  'find_document',
  'get_stats',
  'get_ungrouped',
]);

export const leaseQueryTool = createTool({
  id: 'query_leases',
  description: `Query and explore organized lease documents. Supports multiple operations:
- list_all_leases: Get summaries of all lease files
- list_lessors: Get all unique lessor names
- list_addresses: Get all addresses for a specific lessor
- get_lease_details: Get full details for a specific lessor/address
- get_base_lease: Get the base lease document for a lessor/address
- get_amendments: Get all amendment documents for a lease
- get_commencements: Get all rent commencement documents for a lease
- get_deliveries: Get all delivery letters for a lease
- get_related_documents: Get all related documents grouped by type
- search_by_lessor: Search leases by partial lessor name
- search_by_address: Search leases by partial address
- find_document: Find a specific document by ID
- get_stats: Get overall statistics
- get_ungrouped: Get documents that couldn't be grouped`,
  inputSchema: z.object({
    operation: queryOperationSchema.describe('The query operation to perform'),
    lessor: z.string().optional().describe('Lessor name (required for address-specific queries)'),
    address: z.string().optional().describe('Property address (required for lease-specific queries)'),
    searchQuery: z.string().optional().describe('Search term for search operations'),
    documentId: z.string().optional().describe('Document ID for find_document operation'),
    includeContent: z.boolean().optional().default(false).describe('Whether to include full document content in results'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    operation: z.string(),
    error: z.string().optional(),
    // Different result types based on operation
    leases: z.array(leaseSummarySchema).optional(),
    lessors: z.array(z.string()).optional(),
    addresses: z.array(z.string()).optional(),
    leaseDetails: z.object({
      lessor: z.string(),
      address: z.string(),
      leaseFile: z.object({
        baseLease: z.string().nullable(),
        amendments: z.array(z.string()),
        commencements: z.array(z.string()),
        deliveries: z.array(z.string()),
        others: z.array(z.string()),
      }),
      documentCount: z.number(),
    }).optional(),
    document: z.any().optional(),
    documents: z.array(z.any()).optional(),
    relatedDocuments: z.object({
      baseLease: z.any().nullable(),
      amendments: z.array(z.any()),
      commencements: z.array(z.any()),
      deliveries: z.array(z.any()),
      others: z.array(z.any()),
    }).optional(),
    stats: z.object({
      totalDocuments: z.number(),
      groupedDocuments: z.number(),
      ungroupedDocuments: z.number(),
      lessors: z.number(),
      addresses: z.number(),
    }).optional(),
  }),
  execute: async ({ context }) => {
    const { operation, lessor, address, searchQuery, documentId, includeContent } = context;

    // Helper to strip content from document if not requested
    const formatDocument = (doc: ProcessedDocument | null) => {
      if (!doc) return null;
      if (includeContent) return doc;
      const { content, ...rest } = doc;
      return rest;
    };

    const formatDocuments = (docs: ProcessedDocument[]) => {
      return docs.map(formatDocument);
    };

    // Check if grouping data exists
    const groupingData = loadGroupingResult();
    if (!groupingData) {
      return {
        success: false,
        operation,
        error: 'No lease data found. Run organizeDocuments() first to process and organize documents.',
      };
    }

    let query: LeaseQuery;
    try {
      query = new LeaseQuery();
    } catch (error) {
      return {
        success: false,
        operation,
        error: error instanceof Error ? error.message : 'Failed to initialize lease query',
      };
    }

    try {
      switch (operation) {
        case 'list_all_leases': {
          const leases = query.getAllLeases();
          return {
            success: true,
            operation,
            leases,
          };
        }

        case 'list_lessors': {
          const lessors = query.getLessors();
          return {
            success: true,
            operation,
            lessors,
          };
        }

        case 'list_addresses': {
          if (!lessor) {
            return {
              success: false,
              operation,
              error: 'lessor parameter is required for list_addresses operation',
            };
          }
          const addresses = query.getAddresses(lessor);
          return {
            success: true,
            operation,
            addresses,
          };
        }

        case 'get_lease_details': {
          if (!lessor || !address) {
            return {
              success: false,
              operation,
              error: 'lessor and address parameters are required for get_lease_details operation',
            };
          }
          const details = query.getLeaseDetails(lessor, address);
          if (!details) {
            return {
              success: false,
              operation,
              error: `No lease found for lessor "${lessor}" at address "${address}"`,
            };
          }
          return {
            success: true,
            operation,
            leaseDetails: {
              lessor: details.lessor,
              address: details.address,
              leaseFile: details.leaseFile,
              documentCount: details.documents.length,
            },
          };
        }

        case 'get_base_lease': {
          if (!lessor || !address) {
            return {
              success: false,
              operation,
              error: 'lessor and address parameters are required for get_base_lease operation',
            };
          }
          const baseLease = query.getBaseLease(lessor, address);
          return {
            success: true,
            operation,
            document: formatDocument(baseLease),
          };
        }

        case 'get_amendments': {
          if (!lessor || !address) {
            return {
              success: false,
              operation,
              error: 'lessor and address parameters are required for get_amendments operation',
            };
          }
          const amendments = query.getAmendments(lessor, address);
          return {
            success: true,
            operation,
            documents: formatDocuments(amendments),
          };
        }

        case 'get_commencements': {
          if (!lessor || !address) {
            return {
              success: false,
              operation,
              error: 'lessor and address parameters are required for get_commencements operation',
            };
          }
          const commencements = query.getCommencements(lessor, address);
          return {
            success: true,
            operation,
            documents: formatDocuments(commencements),
          };
        }

        case 'get_deliveries': {
          if (!lessor || !address) {
            return {
              success: false,
              operation,
              error: 'lessor and address parameters are required for get_deliveries operation',
            };
          }
          const deliveries = query.getDeliveries(lessor, address);
          return {
            success: true,
            operation,
            documents: formatDocuments(deliveries),
          };
        }

        case 'get_related_documents': {
          if (!lessor || !address) {
            return {
              success: false,
              operation,
              error: 'lessor and address parameters are required for get_related_documents operation',
            };
          }
          const related = query.getRelatedDocuments(lessor, address);
          if (!related) {
            return {
              success: false,
              operation,
              error: `No lease found for lessor "${lessor}" at address "${address}"`,
            };
          }
          return {
            success: true,
            operation,
            relatedDocuments: {
              baseLease: formatDocument(related.baseLease),
              amendments: formatDocuments(related.amendments),
              commencements: formatDocuments(related.commencements),
              deliveries: formatDocuments(related.deliveries),
              others: formatDocuments(related.others),
            },
          };
        }

        case 'search_by_lessor': {
          if (!searchQuery) {
            return {
              success: false,
              operation,
              error: 'searchQuery parameter is required for search_by_lessor operation',
            };
          }
          const results = query.searchByLessor(searchQuery);
          return {
            success: true,
            operation,
            leases: results,
          };
        }

        case 'search_by_address': {
          if (!searchQuery) {
            return {
              success: false,
              operation,
              error: 'searchQuery parameter is required for search_by_address operation',
            };
          }
          const results = query.searchByAddress(searchQuery);
          return {
            success: true,
            operation,
            leases: results,
          };
        }

        case 'find_document': {
          if (!documentId) {
            return {
              success: false,
              operation,
              error: 'documentId parameter is required for find_document operation',
            };
          }
          const result = query.findDocumentById(documentId);
          if (!result) {
            return {
              success: false,
              operation,
              error: `Document with ID "${documentId}" not found`,
            };
          }
          return {
            success: true,
            operation,
            document: {
              ...formatDocument(result.document),
              lessor: result.lessor,
              address: result.address,
            },
          };
        }

        case 'get_stats': {
          const stats = query.getStats();
          return {
            success: true,
            operation,
            stats,
          };
        }

        case 'get_ungrouped': {
          const ungrouped = query.getUngroupedDocuments();
          return {
            success: true,
            operation,
            documents: formatDocuments(ungrouped),
          };
        }

        default:
          return {
            success: false,
            operation,
            error: `Unknown operation: ${operation}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        operation,
        error: error instanceof Error ? error.message : 'Unknown error executing query',
      };
    }
  },
});
