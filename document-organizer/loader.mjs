import { webcrypto } from 'node:crypto';

// Make crypto available globally for compatibility
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

// Export for ES module compatibility
export { webcrypto as crypto };