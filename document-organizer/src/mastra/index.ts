// Polyfill crypto for Node.js compatibility
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as Crypto;
}

import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';

// Import agents
import { classifierAgent } from './agents/classifier.js';
import { extractorAgent } from './agents/extractor.js';
import { documentOrganizerAgent } from './agents/documentOrganizer.js';

// Import tools (exported for use in workflows)
export { readDocsTool } from './tools/readFiles.js';
export { leaseQueryTool } from './tools/leaseQueryTool.js';

// Import workflows
import { organizeDocumentsWorkflow } from './workflows/organizeDocuments.js';

// Re-export workflow and types
export { organizeDocumentsWorkflow } from './workflows/organizeDocuments.js';
export type { OrganizeDocumentsInput, OrganizeDocumentsOutput } from './workflows/organizeDocuments.js';

// Also export the legacy function-based workflow for CLI usage
export {
  organizeDocuments,
  getSimplifiedOutput,
  type GroupingResult,
  type GroupedOutput,
  type LeaseFile,
  type ProcessedDocument,
} from './workflows/groupDocuments.js';

// Export lease query API for direct usage
export {
  LeaseQuery,
  saveGroupingResult,
  loadGroupingResult,
  type LeaseSummary,
  type LeaseDetails,
} from './utils/leaseQuery.js';

// Export the document organizer agent for direct usage
export { documentOrganizerAgent } from './agents/documentOrganizer.js';

// Configure Mastra instance with observability
export const mastra = new Mastra({
  agents: {
    classifierAgent,
    extractorAgent,
    documentOrganizerAgent,
  },
  workflows: {
    organizeDocumentsWorkflow,
  },
  logger: new PinoLogger({
    name: 'document-organizer',
    level: 'info',
  }),
  storage: new LibSQLStore({
    url: 'file:./mastra.db',
  }),
  observability: {
    default: { enabled: true },
  },
});
