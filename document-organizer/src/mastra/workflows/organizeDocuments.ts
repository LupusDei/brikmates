import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { compareTwoStrings } from 'string-similarity';
import { classifyDocument, ClassificationResultSchema } from '../agents/classifier.js';
import { extractKeys, extractionSchema } from '../agents/extractor.js';
import { readDocsTool } from '../tools/readFiles.js';

// Similarity threshold for fuzzy matching (80%)
const SIMILARITY_THRESHOLD = 0.8;

// Rate limit delay between documents (30 seconds)
const RATE_LIMIT_DELAY_MS = 30000;

// Helper to sleep for a given number of milliseconds
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Schema for workflow input
const workflowInputSchema = z.object({
  folderPath: z.string().describe('Path to folder containing documents'),
});

// Schema for a single document
const documentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  content: z.string(),
});

// Schema for a processed document
const processedDocumentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  classification: ClassificationResultSchema,
  extraction: extractionSchema,
});

// Schema for lease file structure
const leaseFileSchema = z.object({
  baseLease: z.string().nullable(),
  amendments: z.array(z.string()),
  commencements: z.array(z.string()),
  deliveries: z.array(z.string()),
  others: z.array(z.string()),
});

// Schema for workflow output
const workflowOutputSchema = z.object({
  hierarchy: z.record(z.string(), z.record(z.string(), leaseFileSchema)),
  ungrouped: z.array(z.string()),
  stats: z.object({
    totalDocuments: z.number(),
    groupedDocuments: z.number(),
    ungroupedDocuments: z.number(),
    lessors: z.number(),
    addresses: z.number(),
  }),
});

// Workflow state schema - tracks documents queue and processed results
const workflowStateSchema = z.object({
  documents: z.array(documentSchema),
  currentIndex: z.number(),
  totalDocuments: z.number(),
  processedDocs: z.array(processedDocumentSchema),
});

type WorkflowState = z.infer<typeof workflowStateSchema>;

// Step 1: Read documents from folder and initialize state
const readDocumentsStep = createStep({
  id: 'read-documents',
  description: 'Read all documents and initialize processing queue',
  inputSchema: workflowInputSchema,
  outputSchema: z.object({
    ready: z.boolean(),
    documentCount: z.number(),
  }),
  stateSchema: workflowStateSchema,
  execute: async ({ inputData, setState }) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Reading documents from: ${inputData.folderPath}`);
    console.log(`${'='.repeat(60)}`);

    const result = await readDocsTool.execute({
      context: { folderPath: inputData.folderPath },
      runId: 'workflow-read',
      mastra: {} as any,
      runtimeContext: {} as any,
    });

    const documents = result.documents.map(doc => ({
      id: doc.id,
      filename: doc.filename,
      content: typeof doc.content === 'string' ? doc.content : JSON.stringify(doc.content),
    }));

    console.log(`Found ${documents.length} documents to process`);

    // Initialize workflow state
    setState({
      documents,
      currentIndex: 0,
      totalDocuments: documents.length,
      processedDocs: [],
    });

    return {
      ready: documents.length > 0,
      documentCount: documents.length,
    };
  },
});

// Step 2: Process a single document at currentIndex
// This step is called repeatedly via dowhile until all documents are processed
const processNextDocumentStep = createStep({
  id: 'process-document',
  description: 'Process the next document in the queue',
  inputSchema: z.object({
    ready: z.boolean(),
    documentCount: z.number(),
  }),
  outputSchema: z.object({
    processed: z.boolean(),
    currentIndex: z.number(),
    totalDocuments: z.number(),
    filename: z.string(),
  }),
  stateSchema: workflowStateSchema,
  execute: async ({ state, setState }) => {
    const { documents, currentIndex, totalDocuments, processedDocs } = state;

    // Check if we have more documents to process
    if (currentIndex >= totalDocuments) {
      return {
        processed: false,
        currentIndex,
        totalDocuments,
        filename: '',
      };
    }

    const doc = documents[currentIndex];

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing document ${currentIndex + 1}/${totalDocuments}: ${doc.filename}`);
    console.log(`${'='.repeat(60)}`);

    // Run classification and extraction in parallel for this document
    const [classification, extraction] = await Promise.all([
      classifyDocument(doc.content),
      extractKeys(doc.content),
    ]);

    console.log(`  Type: ${classification.documentType} (${classification.confidence})`);
    console.log(`  Lessor: ${extraction.lessor}`);
    console.log(`  Address: ${extraction.address}`);
    console.log(`  Tenant: ${extraction.tenant}`);
    if (extraction.baseReference) {
      console.log(`  Base Reference: ${extraction.baseReference}`);
    }

    // Add to processed docs
    const newProcessedDocs = [...processedDocs, {
      id: doc.id,
      filename: doc.filename,
      classification,
      extraction,
    }];

    // Update state: increment index and add processed doc
    const newIndex = currentIndex + 1;
    setState({
      documents,
      currentIndex: newIndex,
      totalDocuments,
      processedDocs: newProcessedDocs,
    });

    // Sleep to avoid rate limiting (only if there are more documents)
    if (newIndex < totalDocuments) {
      console.log(`  Waiting ${RATE_LIMIT_DELAY_MS / 1000}s before next document...`);
      await sleep(RATE_LIMIT_DELAY_MS);
    }

    return {
      processed: true,
      currentIndex: newIndex,
      totalDocuments,
      filename: doc.filename,
    };
  },
});

// Helper function for fuzzy matching
function findFuzzyMatch(needle: string, haystack: string[]): string | null {
  for (const candidate of haystack) {
    if (compareTwoStrings(needle.toLowerCase(), candidate.toLowerCase()) >= SIMILARITY_THRESHOLD) {
      return candidate;
    }
  }
  return null;
}

// Step 3: Group all processed documents
const groupDocumentsStep = createStep({
  id: 'group-documents',
  description: 'Group all processed documents by lessor and address',
  inputSchema: z.object({
    processed: z.boolean(),
    currentIndex: z.number(),
    totalDocuments: z.number(),
    filename: z.string(),
  }),
  outputSchema: workflowOutputSchema,
  stateSchema: workflowStateSchema,
  execute: async ({ state }) => {
    const { processedDocs } = state;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Grouping ${processedDocs.length} processed documents`);
    console.log(`${'='.repeat(60)}`);

    const hierarchy: Record<string, Record<string, z.infer<typeof leaseFileSchema>>> = {};
    const ungrouped: string[] = [];

    for (const doc of processedDocs) {
      const { lessor, address } = doc.extraction;

      // Skip documents with unknown lessor or address
      if (lessor === 'unknown' || address === 'unknown') {
        ungrouped.push(doc.id);
        continue;
      }

      // Find or create lessor group (with fuzzy matching)
      const existingLessors = Object.keys(hierarchy);
      const matchedLessor = findFuzzyMatch(lessor, existingLessors) || lessor;

      if (!hierarchy[matchedLessor]) {
        hierarchy[matchedLessor] = {};
      }

      // Find or create address group (with fuzzy matching)
      const existingAddresses = Object.keys(hierarchy[matchedLessor]);
      const matchedAddress = findFuzzyMatch(address, existingAddresses) || address;

      if (!hierarchy[matchedLessor][matchedAddress]) {
        hierarchy[matchedLessor][matchedAddress] = {
          baseLease: null,
          amendments: [],
          commencements: [],
          deliveries: [],
          others: [],
        };
      }

      const leaseFile = hierarchy[matchedLessor][matchedAddress];

      // Categorize document by type
      switch (doc.classification.documentType) {
        case 'lease':
          if (leaseFile.baseLease === null) {
            leaseFile.baseLease = doc.id;
          } else {
            leaseFile.others.push(doc.id);
          }
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

    // Calculate stats
    let groupedCount = 0;
    let addressCount = 0;
    for (const lessor of Object.keys(hierarchy)) {
      const addresses = Object.keys(hierarchy[lessor]);
      addressCount += addresses.length;
      for (const address of addresses) {
        const lf = hierarchy[lessor][address];
        groupedCount += (lf.baseLease ? 1 : 0) +
          lf.amendments.length +
          lf.commencements.length +
          lf.deliveries.length +
          lf.others.length;
      }
    }

    console.log(`Grouped into ${Object.keys(hierarchy).length} lessors, ${addressCount} addresses`);
    if (ungrouped.length > 0) {
      console.log(`${ungrouped.length} documents could not be grouped`);
    }

    return {
      hierarchy,
      ungrouped,
      stats: {
        totalDocuments: processedDocs.length,
        groupedDocuments: groupedCount,
        ungroupedDocuments: ungrouped.length,
        lessors: Object.keys(hierarchy).length,
        addresses: addressCount,
      },
    };
  },
});

// Create the workflow with state-based iteration
// Each document processing is a separate visible step via dowhile
export const organizeDocumentsWorkflow = createWorkflow({
  id: 'organize-documents',
  description: 'Read, classify, extract, and group lease documents',
  inputSchema: workflowInputSchema,
  outputSchema: workflowOutputSchema,
  stateSchema: workflowStateSchema,
})
  .then(readDocumentsStep)
  .dowhile(
    processNextDocumentStep,
    // Continue while there are more documents to process
    async ({ state }) => {
      const hasMore = state.currentIndex < state.totalDocuments;
      if (hasMore) {
        console.log(`\n→ More documents to process (${state.currentIndex}/${state.totalDocuments})`);
      }
      return hasMore;
    }
  )
  .then(groupDocumentsStep)
  .commit();

export type OrganizeDocumentsInput = z.infer<typeof workflowInputSchema>;
export type OrganizeDocumentsOutput = z.infer<typeof workflowOutputSchema>;
