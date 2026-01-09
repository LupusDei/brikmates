import { compareTwoStrings } from 'string-similarity';
import { classifyDocument, ClassificationResult, DocumentType } from '../agents/classifier.js';
import { extractKeys, ExtractionResult } from '../agents/extractor.js';
import { readDocsTool } from '../tools/readFiles.js';

// Similarity threshold for fuzzy matching (80%)
const SIMILARITY_THRESHOLD = 0.8;

// Processed document with classification and extraction results
export interface ProcessedDocument {
  id: string;
  filename: string;
  classification: ClassificationResult;
  extraction: ExtractionResult;
  content: string;
}

// Lease file structure containing base lease and related documents
export interface LeaseFile {
  baseLease: string | null;
  amendments: string[];
  commencements: string[];
  deliveries: string[];
  others: string[];
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

/**
 * Find a matching key using fuzzy string comparison
 */
function findFuzzyMatch(needle: string, haystack: string[]): string | null {
  for (const candidate of haystack) {
    if (compareTwoStrings(needle.toLowerCase(), candidate.toLowerCase()) >= SIMILARITY_THRESHOLD) {
      return candidate;
    }
  }
  return null;
}

/**
 * Process a single document: classify and extract keys in parallel
 */
async function processDocument(
  id: string,
  filename: string,
  content: string
): Promise<ProcessedDocument> {
  // Run classification and extraction in parallel
  const [classification, extraction] = await Promise.all([
    classifyDocument(content),
    extractKeys(content),
  ]);

  return {
    id,
    filename,
    classification,
    extraction,
    content,
  };
}

/**
 * Group processed documents by lessor -> address -> leaseFile
 */
function groupDocuments(documents: ProcessedDocument[]): GroupingResult {
  const grouped: GroupedOutput = {};
  const ungrouped: ProcessedDocument[] = [];

  for (const doc of documents) {
    const { lessor, address } = doc.extraction;

    // Skip documents with unknown lessor or address
    if (lessor === 'unknown' || address === 'unknown') {
      ungrouped.push(doc);
      continue;
    }

    // Find or create lessor group (with fuzzy matching)
    const existingLessors = Object.keys(grouped);
    const matchedLessor = findFuzzyMatch(lessor, existingLessors) || lessor;

    if (!grouped[matchedLessor]) {
      grouped[matchedLessor] = {};
    }

    // Find or create address group (with fuzzy matching)
    const existingAddresses = Object.keys(grouped[matchedLessor]);
    const matchedAddress = findFuzzyMatch(address, existingAddresses) || address;

    if (!grouped[matchedLessor][matchedAddress]) {
      grouped[matchedLessor][matchedAddress] = {
        leaseFile: {
          baseLease: null,
          amendments: [],
          commencements: [],
          deliveries: [],
          others: [],
        },
        documents: [],
      };
    }

    const group = grouped[matchedLessor][matchedAddress];
    group.documents.push(doc);

    // Categorize document by type
    const docType = doc.classification.documentType;
    switch (docType) {
      case 'lease':
        // If there's already a base lease, keep the first one and add this to others
        if (group.leaseFile.baseLease === null) {
          group.leaseFile.baseLease = doc.id;
        } else {
          group.leaseFile.others.push(doc.id);
        }
        break;
      case 'amendment':
        group.leaseFile.amendments.push(doc.id);
        break;
      case 'rent_commencement':
        group.leaseFile.commencements.push(doc.id);
        break;
      case 'delivery_letter':
        group.leaseFile.deliveries.push(doc.id);
        break;
      default:
        group.leaseFile.others.push(doc.id);
    }
  }

  // Calculate stats
  let groupedCount = 0;
  let addressCount = 0;
  for (const lessor of Object.keys(grouped)) {
    const addresses = Object.keys(grouped[lessor]);
    addressCount += addresses.length;
    for (const address of addresses) {
      groupedCount += grouped[lessor][address].documents.length;
    }
  }

  return {
    grouped,
    ungrouped,
    stats: {
      totalDocuments: documents.length,
      groupedDocuments: groupedCount,
      ungroupedDocuments: ungrouped.length,
      lessors: Object.keys(grouped).length,
      addresses: addressCount,
    },
  };
}

/**
 * Main workflow: Read documents from folder, process, and group
 */
export async function organizeDocuments(folderPath: string): Promise<GroupingResult> {
  // Read all documents from the folder
  const readResult = await readDocsTool.execute({
    context: { folderPath },
    runId: 'organize-docs',
    mastra: {} as any,
    runtimeContext: {} as any,
  });

  if (readResult.errors?.length) {
    console.warn('Errors reading documents:', readResult.errors);
  }

  if (readResult.count === 0) {
    return {
      grouped: {},
      ungrouped: [],
      stats: {
        totalDocuments: 0,
        groupedDocuments: 0,
        ungroupedDocuments: 0,
        lessors: 0,
        addresses: 0,
      },
    };
  }

  // Process documents sequentially to avoid rate limits
  const processedDocs: ProcessedDocument[] = [];
  for (const doc of readResult.documents) {
    console.log(`Processing document: ${doc.filename}`);
    const processed = await processDocument(
      doc.id,
      doc.filename,
      typeof doc.content === 'string' ? doc.content : JSON.stringify(doc.content)
    );
    processedDocs.push(processed);
    console.log(`  -> Type: ${processed.classification.documentType}, Lessor: ${processed.extraction.lessor}`);
  }

  // Group the processed documents
  return groupDocuments(processedDocs);
}

/**
 * Get a simplified output structure (without full document content)
 */
export function getSimplifiedOutput(result: GroupingResult): {
  hierarchy: { [lessor: string]: { [address: string]: LeaseFile } };
  ungrouped: string[];
  stats: GroupingResult['stats'];
} {
  const hierarchy: { [lessor: string]: { [address: string]: LeaseFile } } = {};

  for (const [lessor, addresses] of Object.entries(result.grouped)) {
    hierarchy[lessor] = {};
    for (const [address, data] of Object.entries(addresses)) {
      hierarchy[lessor][address] = data.leaseFile;
    }
  }

  return {
    hierarchy,
    ungrouped: result.ungrouped.map((doc) => doc.id),
    stats: result.stats,
  };
}
