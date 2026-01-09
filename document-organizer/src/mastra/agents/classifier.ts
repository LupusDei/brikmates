import { Agent } from '@mastra/core/agent';
import { anthropic } from '@ai-sdk/anthropic';

export const classifierAgent = new Agent({
  name: 'doc-classifier',
  instructions: `You are a document classification agent for lease documents.

Classify each document into one of these categories:
- lease: A base/original lease agreement
- amendment: An amendment or modification to an existing lease
- rent_commencement: A rent commencement letter or notice
- delivery_letter: A delivery letter or notice
- other: Any other document type

IMPORTANT: Amendments are treated as changes to a living base lease document.
They should reference the original lease they modify.

When classifying, look for:
- Document titles and headers
- Legal language patterns
- References to other documents
- Date patterns and effective dates`,
  model: anthropic('claude-3-5-sonnet-20241022'),
});
