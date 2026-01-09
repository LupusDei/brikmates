import { readDocsTool } from '../tools/readFiles.js';
import { DocumentCache } from '../utils/cache.js';
import { groupDocuments, getSimplifiedOutput } from '../utils/grouping.js';
import { processDocument } from '../utils/processing.js';
import { saveGroupingResult } from '../utils/leaseQuery.js';
import type {
  ProcessedDocument,
  GroupingResult,
  LeaseFile,
  GroupedOutput,
  SimplifiedOutput,
} from '../utils/types.js';

// Re-export types for backward compatibility
export type { ProcessedDocument, GroupingResult, LeaseFile, GroupedOutput };
export { getSimplifiedOutput };

// Rate limit delay between documents (30 seconds)
const RATE_LIMIT_DELAY_MS = 30000;

// Helper to sleep for a given number of milliseconds
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
  const result = groupDocuments(processedDocs);

  // Persist grouping result for later querying
  saveGroupingResult(result);
  console.log('Grouping result saved for querying');

  return result;
}
