import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Task, Project, TaskManagerFile } from "../../src/types/index.js";
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import process from 'node:process';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export interface TestContext {
  client: Client;
  transport: StdioClientTransport;
  tempDir: string;
  testFilePath: string;
  taskCounter: number;
}

/**
 * Sets up a test context with MCP client, transport, and temp directory
 */
export async function setupTestContext(): Promise<TestContext> {
  // Create a unique temp directory for test
  const tempDir = path.join(os.tmpdir(), `mcp-client-integration-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`);
  await fs.mkdir(tempDir, { recursive: true });
  const testFilePath = path.join(tempDir, 'test-tasks.json');

  // Initialize empty task manager file
  await writeTaskManagerFile(testFilePath, { projects: [] });

  // Set up the transport with environment variable for test file
  const transport = new StdioClientTransport({
    command: process.execPath,  // Use full path to current Node.js executable
    args: ["dist/src/server/index.js"],
    env: {
      TASK_MANAGER_FILE_PATH: testFilePath,
      NODE_ENV: "test",
      DEBUG: "mcp:*",  // Enable MCP debug logging
      // Pass API keys from the test runner's env to the child process env
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? ''
    }
  });

  // Set up the client
  const client = new Client(
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
    // Connect to the server with a timeout
    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    await Promise.race([connectPromise, timeoutPromise]);

    // Small delay to ensure server is ready
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    throw error;
  }

  return { client, transport, tempDir, testFilePath, taskCounter: 0 };
}

/**
 * Cleans up test context by closing transport and removing temp directory
 */
export async function teardownTestContext(context: TestContext) {
  try {
    // Ensure transport is properly closed
    if (context.transport) {
      context.transport.close();
    }
  } catch (err) {
    console.error('Error closing transport:', err);
  }

  // Clean up temp files
  try {
    await fs.rm(context.tempDir, { recursive: true, force: true });
  } catch (err) {
    console.error('Error cleaning up temp directory:', err);
  }
}

/**
 * Verifies that a tool response matches the MCP spec format
 */
export function verifyCallToolResult(response: CallToolResult) {
  expect(response).toBeDefined();
  expect(response).toHaveProperty('content');
  expect(Array.isArray(response.content)).toBe(true);
  expect(response.content.length).toBeGreaterThan(0);
  
  // Verify each content item matches MCP spec
  response.content.forEach(item => {
    expect(item).toHaveProperty('type');
    expect(item).toHaveProperty('text');
    expect(typeof item.type).toBe('string');
    expect(typeof item.text).toBe('string');
  });

  // If it's an error response, verify error format
  if (response.isError) {
    expect(response.content[0].text).toMatch(/^(Error|Failed|Invalid)/);
  }
}

/**
 * Verifies that a protocol error matches the MCP spec format
 */
export function verifyProtocolError(error: any, expectedCode: number, expectedMessagePattern: string) {
  expect(error).toBeDefined();
  expect(error.code).toBe(expectedCode);
  expect(error.message).toMatch(expectedMessagePattern);
}

/**
 * Verifies that a tool execution error matches the expected format
 */
export function verifyToolExecutionError(response: CallToolResult, expectedMessagePattern: string | RegExp) {
  verifyCallToolResult(response);  // Verify basic CallToolResult format
  expect(response.isError).toBe(true);
  const errorMessage = response.content[0]?.text;
  expect(typeof errorMessage).toBe('string');
  expect(errorMessage).toMatch(expectedMessagePattern);
}

/**
 * Verifies that a successful tool response contains valid JSON data
 */
export function verifyToolSuccessResponse<T = unknown>(response: CallToolResult): { data: T } {
  verifyCallToolResult(response);
  expect(response.isError).toBeFalsy();
  const jsonText = response.content[0]?.text;
  expect(typeof jsonText).toBe('string');
  return JSON.parse(jsonText as string);
}

/**
 * Creates a test project and returns its ID
 */
export async function createTestProject(client: Client, options: {
  initialPrompt?: string;
  tasks?: Array<{ title: string; description: string }>;
  autoApprove?: boolean;
} = {}): Promise<string> {
  const createResult = await client.callTool({
    name: "create_project",
    arguments: {
      initialPrompt: options.initialPrompt || "Test Project",
      tasks: options.tasks || [
        { title: "Task 1", description: "First test task" }
      ],
      autoApprove: options.autoApprove
    }
  }) as CallToolResult;

  verifyCallToolResult(createResult);
  expect(createResult.isError).toBeFalsy();
  
  const responseData = JSON.parse((createResult.content[0] as { text: string }).text);
  return responseData.data.projectId;
}

/**
 * Gets the first task ID from a project
 */
export async function getFirstTaskId(client: Client, projectId: string): Promise<string> {
  const nextTaskResult = await client.callTool({
    name: "get_next_task",
    arguments: { projectId }
  }) as CallToolResult;

  verifyCallToolResult(nextTaskResult);
  expect(nextTaskResult.isError).toBeFalsy();
  
  const nextTask = JSON.parse((nextTaskResult.content[0] as { text: string }).text);
  return nextTask.data.task.id;
}

/**
 * Reads and parses the task manager file
 */
export async function readTaskManagerFile(filePath: string): Promise<TaskManagerFile> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      return { projects: [] };
    }
    throw error;
  }
}

/**
 * Writes data to the task manager file
 */
export async function writeTaskManagerFile(filePath: string, data: TaskManagerFile): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Verifies a project exists in the task manager file and matches expected data
 */
export async function verifyProjectInFile(filePath: string, projectId: string, expectedData: Partial<Project>): Promise<void> {
  const data = await readTaskManagerFile(filePath);
  const project = data.projects.find(p => p.projectId === projectId);
  
  expect(project).toBeDefined();
  Object.entries(expectedData).forEach(([key, value]) => {
    expect(project).toHaveProperty(key, value);
  });
}

/**
 * Verifies a task exists in a project and matches expected data
 */
export async function verifyTaskInFile(filePath: string, projectId: string, taskId: string, expectedData: Partial<Task>): Promise<void> {
  const data = await readTaskManagerFile(filePath);
  const project = data.projects.find(p => p.projectId === projectId);
  expect(project).toBeDefined();
  
  const task = project?.tasks.find(t => t.id === taskId);
  expect(task).toBeDefined();
  Object.entries(expectedData).forEach(([key, value]) => {
    expect(task).toHaveProperty(key, value);
  });
}

/**
 * Creates a test project directly in the file (bypassing the tool)
 */
export async function createTestProjectInFile(filePath: string, project: Partial<Project>): Promise<Project> {
  const data = await readTaskManagerFile(filePath);
  const newProject: Project = {
    projectId: `proj-${Date.now()}`,
    initialPrompt: "Test Project",
    projectPlan: "",
    completed: false,
    tasks: [],
    ...project
  };
  
  data.projects.push(newProject);
  await writeTaskManagerFile(filePath, data);
  return newProject;
}

/**
 * Creates a test task directly in the file (bypassing the tool)
 */
export async function createTestTaskInFile(filePath: string, projectId: string, task: Partial<Task>): Promise<Task> {
  const data = await readTaskManagerFile(filePath);
  const project = data.projects.find(p => p.projectId === projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  // Find the highest task ID number in the file to ensure unique IDs
  const maxTaskId = data.projects
    .flatMap(p => p.tasks)
    .map(t => parseInt(t.id.replace('task-', '')))
    .reduce((max, curr) => Math.max(max, curr), 0);

  const newTask: Task = {
    id: `task-${maxTaskId + 1}`,  // Use incrementing number instead of timestamp
    title: "Test Task",
    description: "Test Description",
    status: "not started",
    approved: false,
    completedDetails: "",
    toolRecommendations: "",
    ruleRecommendations: "",
    ...task
  };

  project.tasks.push(newTask);
  await writeTaskManagerFile(filePath, data);
  return newTask;
} 