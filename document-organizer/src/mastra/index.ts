import { Mastra, Agent } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { anthropic } from '@ai-sdk/anthropic';

// Test agent to verify Mastra Studio works
const testAgent = new Agent({
  name: 'test-agent',
  instructions: 'You are a test agent to verify Mastra Studio is working.',
  model: anthropic('claude-3-5-sonnet-20241022'),
});

// Configure Mastra instance
export const mastra = new Mastra({
  agents: { testAgent },
  logger: new PinoLogger({
    name: 'document-organizer',
    level: 'info',
  }),
});
