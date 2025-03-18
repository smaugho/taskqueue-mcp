// This file provides global declarations for Jest functions
// It allows TypeScript to recognize Jest globals without explicit imports

import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';

// Export the Jest globals for reuse
export {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll
}; 