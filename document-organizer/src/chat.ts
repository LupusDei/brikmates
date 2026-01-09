#!/usr/bin/env node
import 'dotenv/config';
import * as readline from 'readline';
import type { CoreMessage } from 'ai';
import { leaseAgent } from './mastra/index.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Conversation history for multi-turn chat
const messages: CoreMessage[] = [];

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function chat(userMessage: string): Promise<string> {
  messages.push({ role: 'user', content: userMessage });

  const response = await leaseAgent.generate(messages);

  const assistantMessage = response.text;
  messages.push({ role: 'assistant', content: assistantMessage });

  return assistantMessage;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required');
    console.error('Set it in your .env file or export it:');
    console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  console.log('Lease Agent');
  console.log('===========');
  console.log('Chat with me about your lease documents.');
  console.log('I can import, organize, and query lease files.');
  console.log('Type "exit" or "quit" to end the conversation.\n');

  // Check for initial message from command line
  const initialMessage = process.argv.slice(2).join(' ');
  if (initialMessage) {
    console.log(`You: ${initialMessage}\n`);
    try {
      const response = await chat(initialMessage);
      console.log(`Assistant: ${response}\n`);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
    }
  }

  // Interactive loop
  while (true) {
    const input = await prompt('You: ');
    const trimmed = input.trim();

    if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
      console.log('Goodbye!');
      rl.close();
      break;
    }

    if (!trimmed) {
      continue;
    }

    try {
      console.log(''); // Add spacing
      const response = await chat(trimmed);
      console.log(`Assistant: ${response}\n`);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      console.log('');
    }
  }
}

main();
