import { describe, it, expect, beforeEach } from '@jest/globals';
import { setupTestContext, teardownTestContext, TestContext, createTestProject } from '../test-helpers.js';

describe('list_tasks Tool', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await setupTestContext();
  });

  afterEach(async () => {
    await teardownTestContext(context);
  });

  describe('Success Cases', () => {
    // TODO: Add success test cases
  });

  describe('Error Cases', () => {
    // TODO: Add error test cases
  });
}); 