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

// Schema for a single document (input to foreach)
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

// Step 1: Read documents from folder and return array for foreach
const readDocumentsStep = createStep({
  id: 'read-documents',
  description: 'Read all documents from the specified folder',
  inputSchema: workflowInputSchema,
  outputSchema: z.array(documentSchema),
  execute: async ({ inputData }) => {
    console.log(`Reading documents from: ${inputData.folderPath}`);

    const result = await readDocsTool.execute({
      context: { folderPath: inputData.folderPath },
      runId: 'workflow-read',
      mastra: {} as any,
      runtimeContext: {} as any,
    });

    console.log(`Found ${result.count} documents to process`);

    return result.documents.map(doc => ({
      id: doc.id,
      filename: doc.filename,
      content: typeof doc.content === 'string' ? doc.content : JSON.stringify(doc.content),
    }));
  },
});

// Step 2: Process a SINGLE document (used with foreach)
// This step is executed once per document, with visibility in Mastra Studio
const processDocumentStep = createStep({
  id: 'process-document',
  description: 'Classify and extract keys from a single document',
  inputSchema: documentSchema,
  outputSchema: processedDocumentSchema,
  execute: async ({ inputData }) => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Processing: ${inputData.filename}`);
    console.log(`${'='.repeat(50)}`);

    // Run classification and extraction in parallel for this document
    const [classification, extraction] = await Promise.all([
      classifyDocument(inputData.content),
      extractKeys(inputData.content),
    ]);

    console.log(`  Type: ${classification.documentType} (${classification.confidence})`);
    console.log(`  Lessor: ${extraction.lessor}`);
    console.log(`  Address: ${extraction.address}`);
    console.log(`  Tenant: ${extraction.tenant}`);
    if (extraction.baseReference) {
      console.log(`  Base Reference: ${extraction.baseReference}`);
    }

    // Sleep to avoid rate limiting
    console.log(`  Waiting ${RATE_LIMIT_DELAY_MS / 1000}s before next document...`);
    await sleep(RATE_LIMIT_DELAY_MS);

    return {
      id: inputData.id,
      filename: inputData.filename,
      classification,
      extraction,
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

// Step 3: Group documents by lessor -> address -> leaseFile
const groupDocumentsStep = createStep({
  id: 'group-documents',
  description: 'Group documents by lessor, address, and document type',
  inputSchema: z.array(processedDocumentSchema),
  outputSchema: workflowOutputSchema,
  execute: async ({ inputData }) => {
    console.log(`\nGrouping ${inputData.length} processed documents...`);

    const hierarchy: Record<string, Record<string, z.infer<typeof leaseFileSchema>>> = {};
    const ungrouped: string[] = [];

    for (const doc of inputData) {
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
        totalDocuments: inputData.length,
        groupedDocuments: groupedCount,
        ungroupedDocuments: ungrouped.length,
        lessors: Object.keys(hierarchy).length,
        addresses: addressCount,
      },
    };
  },
});

// Create the workflow with foreach for per-document processing
export const organizeDocumentsWorkflow = createWorkflow({
  id: 'organize-documents',
  description: 'Read, classify, extract, and group lease documents',
  inputSchema: workflowInputSchema,
  outputSchema: workflowOutputSchema,
})
  .then(readDocumentsStep)
  .foreach(processDocumentStep, { concurrency: 1 }) // Sequential processing, one at a time
  .then(groupDocumentsStep)
  .commit();

export type OrganizeDocumentsInput = z.infer<typeof workflowInputSchema>;
export type OrganizeDocumentsOutput = z.infer<typeof workflowOutputSchema>;
