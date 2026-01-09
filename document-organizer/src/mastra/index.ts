import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';

// Import agents
import { classifierAgent } from './agents/classifier.js';
import { extractorAgent } from './agents/extractor.js';

// Import tools (exported for use in workflows)
export { readDocsTool } from './tools/readFiles.js';

// Configure Mastra instance with observability
export const mastra = new Mastra({
  agents: {
    classifierAgent,
    extractorAgent,
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
