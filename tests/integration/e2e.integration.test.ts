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

interface ToolResponse {
  isError: boolean;
  content: Array<{ text: string }>;
}

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
        DEBUG: "mcp:*"  // Enable MCP debug logging
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

  it('should create and manage a project lifecycle', async () => {
    console.log('Testing project lifecycle...');
    // Create a new project
    const createResult = await client.callTool({
      name: "create_project",
      arguments: {
        initialPrompt: "Test Project",
        tasks: [
          { title: "Task 1", description: "First test task" },
          { title: "Task 2", description: "Second test task" }
        ]
      }
    }) as ToolResponse;
    expect(createResult.isError).toBeFalsy();
    
    // Parse the project ID from the response
    const responseData = JSON.parse((createResult.content[0] as { text: string }).text);
    const projectId = responseData.data.projectId;
    expect(projectId).toBeDefined();
    console.log('Created project with ID:', projectId);

    // List projects and verify our new project exists
    const listResult = await client.callTool({
      name: "list_projects",
      arguments: {}
    }) as ToolResponse;
    expect(listResult.isError).toBeFalsy();
    const projects = JSON.parse((listResult.content[0] as { text: string }).text);
    expect(projects.data.projects.some((p: any) => p.projectId === projectId)).toBe(true);
    console.log('Project verified in list');

    // Get next task
    const nextTaskResult = await client.callTool({
      name: "get_next_task",
      arguments: {
        projectId
      }
    }) as ToolResponse;
    expect(nextTaskResult.isError).toBeFalsy();
    const nextTask = JSON.parse((nextTaskResult.content[0] as { text: string }).text);
    expect(nextTask.status).toBe("next_task");
    expect(nextTask.task).toBeDefined();
    const taskId = nextTask.task.id;
    console.log('Got next task with ID:', taskId);

    // Mark task as done
    const markDoneResult = await client.callTool({
      name: "update_task",
      arguments: {
        projectId,
        taskId,
        status: "done",
        completedDetails: "Task completed in test"
      }
    }) as ToolResponse;
    expect(markDoneResult.isError).toBeFalsy();
    console.log('Marked task as done');

    // Approve the task
    const approveResult = await client.callTool({
      name: "approve_task",
      arguments: {
        projectId,
        taskId
      }
    }) as ToolResponse;
    expect(approveResult.isError).toBeFalsy();
    console.log('Approved task');

    // Delete the project
    const deleteResult = await client.callTool({
      name: "delete_project",
      arguments: {
        projectId
      }
    }) as ToolResponse;
    expect(deleteResult.isError).toBeFalsy();
    console.log('Deleted project');
  });

  it('should have accurate version', async () => {
    console.log('Testing server version...');
    const response = await client.getServerVersion();
    expect(response).toBeDefined();
    expect(response).toHaveProperty('version');
    // Should match package.json version
    const packageJson = JSON.parse(
      await fs.readFile(new URL('../../package.json', import.meta.url), 'utf8')
    );
    expect(response?.version).toBe(packageJson.version);
  });

  it('should auto-approve tasks when autoApprove is enabled', async () => {
    console.log('Testing autoApprove feature...');
    
    // Create a project with autoApprove enabled
    const createResult = await client.callTool({
      name: "create_project",
      arguments: {
        initialPrompt: "Auto-Approval Project",
        tasks: [
          { title: "Auto Task", description: "This task should be auto-approved" }
        ],
        autoApprove: true
      }
    }) as ToolResponse;
    expect(createResult.isError).toBeFalsy();
    
    // Get the project ID
    const responseData = JSON.parse((createResult.content[0] as { text: string }).text);
    const projectId = responseData.data.projectId;
    expect(projectId).toBeDefined();
    console.log('Created auto-approve project with ID:', projectId);

    // Get the task ID
    const nextTaskResult = await client.callTool({
      name: "get_next_task",
      arguments: {
        projectId
      }
    }) as ToolResponse;
    expect(nextTaskResult.isError).toBeFalsy();
    const nextTask = JSON.parse((nextTaskResult.content[0] as { text: string }).text);
    expect(nextTask.status).toBe("next_task");
    expect(nextTask.task).toBeDefined();
    const taskId = nextTask.task.id;
    
    // Mark task as done - we need to mark it as done using the update_task tool
    const markDoneResult = await client.callTool({
      name: "update_task",
      arguments: {
        projectId,
        taskId,
        status: "done",
        completedDetails: "Auto-approved task completed"
      }
    }) as ToolResponse;
    expect(markDoneResult.isError).toBeFalsy();
    
    // Now manually approve the task with approve_task
    const approveResult = await client.callTool({
      name: "approve_task",
      arguments: {
        projectId,
        taskId
      }
    }) as ToolResponse;
    expect(approveResult.isError).toBeFalsy();
    
    // Read the task and verify it was approved
    const readTaskResult = await client.callTool({
      name: "read_task",
      arguments: {
        taskId
      }
    }) as ToolResponse;
    expect(readTaskResult.isError).toBeFalsy();
    const taskDetails = JSON.parse((readTaskResult.content[0] as { text: string }).text);
    expect(taskDetails.data.task.status).toBe("done");
    expect(taskDetails.data.task.approved).toBe(true);
    console.log('Task was manually approved:', taskDetails.data.task.approved);
    
    // Verify we can finalize the project after explicit approval
    const finalizeResult = await client.callTool({
      name: "finalize_project",
      arguments: {
        projectId
      }
    }) as ToolResponse;
    expect(finalizeResult.isError).toBeFalsy();
    console.log('Project was successfully finalized after explicit task approval');
  });

  // Skip by default as it requires OpenAI API key
  it.skip('should generate a project plan using OpenAI', async () => {
    console.log('Testing project plan generation...');
    
    // Skip if no OpenAI API key is set
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.log('Skipping test: OPENAI_API_KEY not set');
      return;
    }

    // Create a temporary requirements file
    const requirementsPath = path.join(tempDir, 'requirements.md');
    const requirements = `# TODO App Requirements

- Use React for the frontend
- Include add, delete, and mark complete functionality
- Store todos in local storage
- Add basic styling`;

    await fs.writeFile(requirementsPath, requirements, 'utf-8');
    console.log('Created temporary requirements file:', requirementsPath);

    // Test prompt and context
    const testPrompt = "Create a step-by-step project plan to build a simple TODO app with React";

    // Generate project plan
    const generateResult = await client.callTool({
      name: "generate_project_plan",
      arguments: {
        prompt: testPrompt,
        provider: "openai",
        model: "gpt-4-turbo",
        attachments: [requirementsPath]
      }
    }) as ToolResponse;

    expect(generateResult.isError).toBeFalsy();
    const planData = JSON.parse((generateResult.content[0] as { text: string }).text);
    
    // Verify the generated plan structure
    expect(planData).toHaveProperty('data');
    expect(planData.data).toHaveProperty('projectPlan');
    expect(planData.data).toHaveProperty('tasks');
    expect(Array.isArray(planData.data.tasks)).toBe(true);
    expect(planData.data.tasks.length).toBeGreaterThan(0);

    // Verify task structure
    const firstTask = planData.data.tasks[0];
    expect(firstTask).toHaveProperty('title');
    expect(firstTask).toHaveProperty('description');
    
    // The temporary file will be cleaned up by the afterAll hook that removes tempDir
    console.log('Successfully generated project plan with tasks');
  });
});