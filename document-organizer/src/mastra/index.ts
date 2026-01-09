import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';

// Configure Mastra instance
export const mastra = new Mastra({
  logger: new PinoLogger({
    name: 'document-organizer',
    level: 'info',
  }),
});
