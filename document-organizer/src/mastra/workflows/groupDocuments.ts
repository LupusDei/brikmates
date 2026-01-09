import { compareTwoStrings } from 'string-similarity';
import { classifyDocument, ClassificationResult, DocumentType } from '../agents/classifier.js';
import { extractKeys, ExtractionResult } from '../agents/extractor.js';
import { readDocsTool } from '../tools/readFiles.js';
import { DocumentCache } from '../utils/cache.js';

// Similarity threshold for fuzzy matching (80%)
const SIMILARITY_THRESHOLD = 0.8;

// Rate limit delay between documents (30 seconds)
const RATE_LIMIT_DELAY_MS = 30000;

// Helper to sleep for a given number of milliseconds
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
 * Uses cache to avoid reprocessing documents with the same content
 */
async function processDocument(
  id: string,
  filename: string,
  content: string,
  cache?: DocumentCache
): Promise<{ doc: ProcessedDocument; fromCache: boolean }> {
  // Check cache first
  if (cache) {
    const cached = cache.get(content);
    if (cached) {
      return {
        doc: {
          id,
          filename,
          classification: cached.classification,
          extraction: cached.extraction,
          content,
        },
        fromCache: true,
      };
    }
  }

  // Run classification and extraction in parallel
  const [classification, extraction] = await Promise.all([
    classifyDocument(content),
    extractKeys(content),
  ]);

  // Save to cache
  if (cache) {
    cache.set(content, classification, extraction);
  }

  return {
    doc: {
      id,
      filename,
      classification,
      extraction,
      content,
    },
    fromCache: false,
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
  // Initialize document cache
  const cache = new DocumentCache();
  const cacheStats = cache.stats();
  console.log(`Document cache loaded: ${cacheStats.entries} cached entries`);

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
  let cacheHits = 0;

  for (let i = 0; i < readResult.documents.length; i++) {
    const doc = readResult.documents[i];
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Processing (${i + 1}/${readResult.documents.length}): ${doc.filename}`);
    console.log(`${'='.repeat(50)}`);

    const { doc: processed, fromCache } = await processDocument(
      doc.id,
      doc.filename,
      typeof doc.content === 'string' ? doc.content : JSON.stringify(doc.content),
      cache
    );
    processedDocs.push(processed);

    if (fromCache) {
      cacheHits++;
      console.log(`  [CACHED] Using cached results`);
    }

    console.log(`  Type: ${processed.classification.documentType}`);
    console.log(`  Lessor: ${processed.extraction.lessor}`);
    console.log(`  Address: ${processed.extraction.address}`);

    // Skip rate limit delay for cached results or last document
    if (!fromCache && i < readResult.documents.length - 1) {
      console.log(`  Waiting ${RATE_LIMIT_DELAY_MS / 1000}s before next document...`);
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  // Save cache to disk
  cache.save();
  console.log(`\nCache stats: ${cacheHits}/${readResult.documents.length} documents from cache`);

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
