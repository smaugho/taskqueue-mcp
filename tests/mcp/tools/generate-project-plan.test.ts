import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
  setupTestContext,
  teardownTestContext,
  verifyCallToolResult,
  TestContext
} from '../test-helpers.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

describe('generate_project_plan Tool', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestContext();
  });

  afterAll(async () => {
    await teardownTestContext(context);
  });

  describe('OpenAI Provider', () => {
    // Skip by default as it requires OpenAI API key
    it.skip('should generate a project plan using OpenAI', async () => {
      // Skip if no OpenAI API key is set
      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        console.error('Skipping test: OPENAI_API_KEY not set');
        return;
      }

      // Create a temporary requirements file
      const requirementsPath = path.join(context.tempDir, 'requirements.md');
      const requirements = `# Project Plan Requirements

- This is a test of whether we are correctly attaching files to our prompt
- Return a JSON project plan with one task
- Task title must be 'AmazingTask'
- Task description must be AmazingDescription
- Project plan attribute should be AmazingPlan`;

      await fs.writeFile(requirementsPath, requirements, 'utf-8');

      // Test prompt and context
      const testPrompt = "Create a step-by-step project plan to build a simple TODO app with React";

      // Generate project plan
      const result = await context.client.callTool({
        name: "generate_project_plan",
        arguments: {
          prompt: testPrompt,
          provider: "openai",
          model: "gpt-4-turbo",
          attachments: [requirementsPath]
        }
      }) as CallToolResult;

      verifyCallToolResult(result);
      expect(result.isError).toBeFalsy();

      const planData = JSON.parse((result.content[0] as { text: string }).text);

      // Verify the generated plan structure
      expect(planData).toHaveProperty('data');
      expect(planData.data).toHaveProperty('tasks');
      expect(Array.isArray(planData.data.tasks)).toBe(true);
      expect(planData.data.tasks.length).toBeGreaterThan(0);

      // Verify task structure
      const firstTask = planData.data.tasks[0];
      expect(firstTask).toHaveProperty('title');
      expect(firstTask).toHaveProperty('description');
      
      // Verify that the generated task adheres to the requirements file context
      expect(firstTask.title).toBe('AmazingTask');
      expect(firstTask.description).toBe('AmazingDescription');
    });

    it('should handle OpenAI API errors gracefully', async () => {
      const result = await context.client.callTool({
        name: "generate_project_plan",
        arguments: {
          prompt: "Test prompt",
          provider: "openai",
          model: "gpt-4-turbo",
          // Invalid/missing API key should cause an error
        }
      }) as CallToolResult;

      verifyCallToolResult(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Error: (Authentication|API key)/i);
    });
  });

  describe('Google Provider', () => {
    // Skip by default as it requires Google API key
    it.skip('should generate a project plan using Google Gemini', async () => {
      // Skip if no Google API key is set
      const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!googleApiKey) {
        console.error('Skipping test: GOOGLE_GENERATIVE_AI_API_KEY not set');
        return;
      }

      // Create a temporary requirements file
      const requirementsPath = path.join(context.tempDir, 'google-requirements.md');
      const requirements = `# Project Plan Requirements (Google Test)

- This is a test of whether we are correctly attaching files to our prompt for Google models
- Return a JSON project plan with one task
- Task title must be 'GeminiTask'
- Task description must be 'GeminiDescription'
- Project plan attribute should be 'GeminiPlan'`;

      await fs.writeFile(requirementsPath, requirements, 'utf-8');

      // Test prompt and context
      const testPrompt = "Create a step-by-step project plan to develop a cloud-native microservice using Go";

      // Generate project plan using Google Gemini
      const result = await context.client.callTool({
        name: "generate_project_plan",
        arguments: {
          prompt: testPrompt,
          provider: "google",
          model: "gemini-1.5-flash-latest",
          attachments: [requirementsPath]
        }
      }) as CallToolResult;

      verifyCallToolResult(result);
      expect(result.isError).toBeFalsy();

      const planData = JSON.parse((result.content[0] as { text: string }).text);

      // Verify the generated plan structure
      expect(planData).toHaveProperty('data');
      expect(planData.data).toHaveProperty('tasks');
      expect(Array.isArray(planData.data.tasks)).toBe(true);
      expect(planData.data.tasks.length).toBeGreaterThan(0);

      // Verify task structure
      const firstTask = planData.data.tasks[0];
      expect(firstTask).toHaveProperty('title');
      expect(firstTask).toHaveProperty('description');
      
      // Verify that the generated task adheres to the requirements file context
      expect(firstTask.title).toBe('GeminiTask');
      expect(firstTask.description).toBe('GeminiDescription');
    });

    it('should handle Google API errors gracefully', async () => {
      const result = await context.client.callTool({
        name: "generate_project_plan",
        arguments: {
          prompt: "Test prompt",
          provider: "google",
          model: "gemini-1.5-flash-latest",
          // Invalid/missing API key should cause an error
        }
      }) as CallToolResult;

      verifyCallToolResult(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Error: (Authentication|API key)/i);
    });
  });

  describe('Error Cases', () => {
    it('should return error for invalid provider', async () => {
      const result = await context.client.callTool({
        name: "generate_project_plan",
        arguments: {
          prompt: "Test prompt",
          provider: "invalid_provider",
          model: "some-model"
        }
      }) as CallToolResult;

      verifyCallToolResult(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error: Invalid provider');
    });

    it('should return error for invalid model', async () => {
      const result = await context.client.callTool({
        name: "generate_project_plan",
        arguments: {
          prompt: "Test prompt",
          provider: "openai",
          model: "invalid-model"
        }
      }) as CallToolResult;

      verifyCallToolResult(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Error: (Invalid model|Model not found)/i);
    });

    it('should return error for non-existent attachment file', async () => {
      const result = await context.client.callTool({
        name: "generate_project_plan",
        arguments: {
          prompt: "Test prompt",
          provider: "openai",
          model: "gpt-4-turbo",
          attachments: ["/non/existent/file.md"]
        }
      }) as CallToolResult;

      verifyCallToolResult(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Error: (File not found|Cannot read file)/i);
    });
  });
}); 