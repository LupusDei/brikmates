// Polyfill crypto for Node.js compatibility
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as Crypto;
}

import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';

// Import agents
import { classifierAgent } from './agents/classifier.js';
import { extractorAgent } from './agents/extractor.js';

// Import tools (exported for use in workflows)
export { readDocsTool } from './tools/readFiles.js';

// Import and export workflow
export {
  organizeDocuments,
  getSimplifiedOutput,
  type GroupingResult,
  type GroupedOutput,
  type LeaseFile,
  type ProcessedDocument,
} from './workflows/groupDocuments.js';

// Configure Mastra instance
export const mastra = new Mastra({
  agents: {
    classifierAgent,
    extractorAgent,
  },
  logger: new PinoLogger({
    name: 'document-organizer',
    level: 'info',
  }),
});
