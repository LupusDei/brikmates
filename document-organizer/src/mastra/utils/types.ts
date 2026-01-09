import { z } from 'zod';
import type { ClassificationResult } from '../agents/classifier.js';
import type { ExtractionResult } from '../agents/extractor.js';

// Lease file structure containing base lease and related documents
export interface LeaseFile {
  baseLease: string | null;
  amendments: string[];
  commencements: string[];
  deliveries: string[];
  others: string[];
}

// Zod schema for LeaseFile (used by tools)
export const leaseFileSchema = z.object({
  baseLease: z.string().nullable(),
  amendments: z.array(z.string()),
  commencements: z.array(z.string()),
  deliveries: z.array(z.string()),
  others: z.array(z.string()),
});

// Processed document with classification and extraction results
export interface ProcessedDocument {
  id: string;
  filename: string;
  classification: ClassificationResult;
  extraction: ExtractionResult;
  content: string;
}

// Hierarchical output structure: lessor -> address -> leaseFile
export interface GroupedOutput {
  [lessor: string]: {
    [address: string]: {
      leaseFile: LeaseFile;
      documents: ProcessedDocument[];
    };
  };
}

// Result of the grouping workflow
export interface GroupingResult {
  grouped: GroupedOutput;
  ungrouped: ProcessedDocument[];
  stats: {
    totalDocuments: number;
    groupedDocuments: number;
    ungroupedDocuments: number;
    lessors: number;
    addresses: number;
  };
}

// Simplified output (without full document content)
export interface SimplifiedOutput {
  hierarchy: { [lessor: string]: { [address: string]: LeaseFile } };
  ungrouped: string[];
  stats: GroupingResult['stats'];
}

// Zod schema for stats
export const statsSchema = z.object({
  totalDocuments: z.number(),
  groupedDocuments: z.number(),
  ungroupedDocuments: z.number(),
  lessors: z.number(),
  addresses: z.number(),
});

// Zod schema for simplified hierarchy
export const hierarchySchema = z.record(z.string(), z.record(z.string(), leaseFileSchema));
