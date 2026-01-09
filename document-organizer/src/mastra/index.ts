import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';

// Import agents
import { classifierAgent } from './agents/classifier.js';
import { extractorAgent } from './agents/extractor.js';

// Import tools (exported for use in workflows)
export { readDocsTool } from './tools/readFiles.js';

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
