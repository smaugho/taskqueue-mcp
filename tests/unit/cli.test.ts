import { describe, it, expect, jest, beforeEach, beforeAll } from '@jest/globals';
import type { TaskManager as TaskManagerType } from '../../src/server/TaskManager.js';
import type { StandardResponse, ProjectCreationSuccessData } from '../../src/types/index.js';
import type { readFile as ReadFileType } from 'node:fs/promises';

// --- Mock Dependencies ---

// Mock TaskManager
const mockGenerateProjectPlan = jest.fn() as jest.MockedFunction<typeof TaskManagerType.prototype.generateProjectPlan>;
const mockReadProject = jest.fn() as jest.MockedFunction<typeof TaskManagerType.prototype.readProject>;
const mockListProjects = jest.fn() as jest.MockedFunction<typeof TaskManagerType.prototype.listProjects>;

jest.unstable_mockModule('../../src/server/TaskManager.js', () => ({
  TaskManager: jest.fn().mockImplementation(() => ({
    generateProjectPlan: mockGenerateProjectPlan,
    readProject: mockReadProject, // Include in mock
    listProjects: mockListProjects, // Include in mock
    // Add mocks for other methods used by other commands if testing them later
    approveTaskCompletion: jest.fn(),
    approveProjectCompletion: jest.fn(),
    listTasks: jest.fn(),
    // ... other methods
  })),
}));

// Mock fs/promises
const mockReadFile = jest.fn();
jest.unstable_mockModule('node:fs/promises', () => ({
  readFile: mockReadFile,
  default: { readFile: mockReadFile } // Handle default export if needed
}));

// Mock chalk - disable color codes
jest.unstable_mockModule('chalk', () => ({
  default: {
    blue: (str: string) => str,
    red: (str: string) => str,
    green: (str: string) => str,
    yellow: (str: string) => str,
    cyan: (str: string) => str,
    bold: (str: string) => str,
    gray: (str: string) => str,
  },
}));

// --- Setup & Teardown ---

let program: any; // To hold the imported commander program
let consoleLogSpy: ReturnType<typeof jest.spyOn>; // Use inferred type
let consoleErrorSpy: ReturnType<typeof jest.spyOn>; // Use inferred type
let processExitSpy: ReturnType<typeof jest.spyOn>; // Use inferred type
let TaskManager: typeof TaskManagerType;
let readFile: jest.MockedFunction<typeof ReadFileType>;

beforeAll(async () => {
  // Dynamically import the CLI module *after* mocks are set up
  const cliModule = await import('../../src/client/cli.js');
  program = cliModule.program; // Assuming program is exported

  // Import mocked types/modules
  const TmModule = await import('../../src/server/TaskManager.js');
  TaskManager = TmModule.TaskManager;
  const fsPromisesMock = await import('node:fs/promises');
  readFile = fsPromisesMock.readFile as jest.MockedFunction<typeof ReadFileType>;
});

beforeEach(() => {
  // Reset mocks and spies before each test
  jest.clearAllMocks();
  mockGenerateProjectPlan.mockReset();
  mockReadFile.mockReset();
  mockReadProject.mockReset(); // Reset new mock
  mockListProjects.mockReset(); // Reset new mock

  // Spy on console and process.exit
  consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  // Prevent tests from exiting and throw instead
  processExitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined): never => { // Correct signature
    throw new Error(`process.exit called with code ${code ?? 'undefined'}`);
  });
});

afterEach(() => {
  // Restore spies
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
  processExitSpy.mockRestore();
});

// --- Test Suites ---

describe('CLI Commands', () => {
  describe('generate-plan', () => {
    it('should call TaskManager.generateProjectPlan with correct arguments and log success', async () => {
      // Arrange: Mock TaskManager response
      const mockSuccessResponse: StandardResponse<ProjectCreationSuccessData> = {
        status: 'success',
        data: {
          projectId: 'proj-123',
          totalTasks: 2,
          tasks: [
            { id: 'task-1', title: 'Task 1', description: 'Desc 1' },
            { id: 'task-2', title: 'Task 2', description: 'Desc 2' },
          ],
          message: 'Project proj-123 created.',
        },
      };
      mockGenerateProjectPlan.mockResolvedValue(mockSuccessResponse);

      const testPrompt = 'Create a test plan';
      const testProvider = 'openai';
      const testModel = 'gpt-4o-mini';

      // Act: Simulate running the CLI command
      // Arguments: command, options...
      await program.parseAsync(
        [
          'generate-plan',
          '--prompt',
          testPrompt,
          '--provider',
          testProvider,
          '--model',
          testModel,
        ],
        { from: 'user' } // Important: indicates these are user-provided args
      );

      // Assert
      // 1. TaskManager initialization (implicitly tested by mock setup)
      // Ensure TaskManager constructor was called (likely once due to preAction hook)
      expect(TaskManager).toHaveBeenCalledTimes(1);

      // 2. generateProjectPlan call
      expect(mockGenerateProjectPlan).toHaveBeenCalledTimes(1);
      expect(mockGenerateProjectPlan).toHaveBeenCalledWith({
        prompt: testPrompt,
        provider: testProvider,
        model: testModel,
        attachments: [], // No attachments in this test
      });

      // 3. Console output
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Generating project plan from prompt...')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Project plan generated successfully!')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Project ID: proj-123')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Total Tasks: 2')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('task-1:')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Title: Task 1')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Description: Desc 1')
      );
      // Check for the TaskManager message as well
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Project proj-123 created.')
      );


      // 4. No errors or exits
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });

  // Add describe blocks for other commands (approve, finalize, list) later
});
