import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import process from 'node:process';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

describe('MCP Client Integration', () => {
  let client: Client;
  let transport: StdioClientTransport;
  let tempDir: string;
  let testFilePath: string;

  beforeAll(async () => {
    // Create a unique temp directory for test
    tempDir = path.join(os.tmpdir(), `mcp-client-integration-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`);
    await fs.mkdir(tempDir, { recursive: true });
    testFilePath = path.join(tempDir, 'test-tasks.json');

    console.log('Setting up test with:');
    console.log('- Temp directory:', tempDir);
    console.log('- Test file path:', testFilePath);

    // Set up the transport with environment variable for test file
    transport = new StdioClientTransport({
      command: process.execPath,  // Use full path to current Node.js executable
      args: ["dist/index.js"],
      env: {
        TASK_MANAGER_FILE_PATH: testFilePath,
        NODE_ENV: "test",
        DEBUG: "mcp:*",  // Enable MCP debug logging
        // Pass API keys from the test runner's env to the child process env
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? ''
      }
    });

    console.log('Created transport with command:', process.execPath, 'dist/index.js');

    // Set up the client
    client = new Client(
      {
        name: "test-client",
        version: "1.0.0"
      },
      {
        capabilities: {
          tools: {
            list: true,
            call: true
          }
        }
      }
    );

    try {
      console.log('Attempting to connect to server...');
      // Connect to the server with a timeout
      const connectPromise = client.connect(transport);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      await Promise.race([connectPromise, timeoutPromise]);
      console.log('Successfully connected to server');

      // Small delay to ensure server is ready
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Failed to connect to server:', error);
      throw error;
    }
  });

  afterAll(async () => {
    try {
      console.log('Cleaning up...');
      // Ensure transport is properly closed
      if (transport) {
        transport.close();
        console.log('Transport closed');
      }
    } catch (err) {
      console.error('Error closing transport:', err);
    }

    // Clean up temp files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      console.log('Temp directory cleaned up');
    } catch (err) {
      console.error('Error cleaning up temp directory:', err);
    }
  });

  it('should list available tools', async () => {
    console.log('Testing tool listing...');
    const response = await client.listTools();
    expect(response).toBeDefined();
    expect(response).toHaveProperty('tools');
    expect(Array.isArray(response.tools)).toBe(true);
    expect(response.tools.length).toBeGreaterThan(0);

    // Check for essential tools
    const toolNames = response.tools.map(tool => tool.name);
    console.log('Available tools:', toolNames);
    expect(toolNames).toContain('list_projects');
    expect(toolNames).toContain('create_project');
    expect(toolNames).toContain('read_project');
    expect(toolNames).toContain('get_next_task');
  });
});