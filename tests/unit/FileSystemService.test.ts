// tests/unit/FileSystemService.test.ts

import { describe, it, expect, jest, beforeEach, beforeAll } from '@jest/globals';
import * as path from 'node:path';
import * as os from 'node:os';
import { TaskManagerFile } from '../../src/types/index.js';
import type { FileSystemService as FileSystemServiceType } from '../../src/server/FileSystemService.js'; // Import type only
import type * as FSPromises from 'node:fs/promises'; // Import type only

// Set up mocks before importing fs/promises
jest.unstable_mockModule('node:fs/promises', () => ({
  __esModule: true,
  // Use jest.fn() directly, specific implementations will be set in tests or beforeEach
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
}));

// Declare variables for dynamically imported modules and mocks
let FileSystemService: typeof FileSystemServiceType;
let readFile: jest.MockedFunction<typeof FSPromises.readFile>;
let writeFile: jest.MockedFunction<typeof FSPromises.writeFile>;
let mkdir: jest.MockedFunction<typeof FSPromises.mkdir>;

describe('FileSystemService', () => {
  let fileSystemService: FileSystemServiceType;
  let tempDir: string;
  let tasksFilePath: string;

  // Use beforeAll for dynamic imports
  beforeAll(async () => {
    // Dynamically import the mocked functions
    const fsPromisesMock = await import('node:fs/promises');
    readFile = fsPromisesMock.readFile as jest.MockedFunction<typeof FSPromises.readFile>;
    writeFile = fsPromisesMock.writeFile as jest.MockedFunction<typeof FSPromises.writeFile>;
    mkdir = fsPromisesMock.mkdir as jest.MockedFunction<typeof FSPromises.mkdir>;

    // Dynamically import the class under test AFTER mocks are set up
    const serviceModule = await import('../../src/server/FileSystemService.js');
    FileSystemService = serviceModule.FileSystemService;
  });


  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Set default mock implementations (can be overridden in tests)
    // Default to empty file for readFile unless specified otherwise
    readFile.mockResolvedValue('');
    writeFile.mockResolvedValue(undefined); // Default successful write
    mkdir.mockResolvedValue(undefined);   // Default successful mkdir

    // Keep temp path generation logic
    tempDir = path.join(os.tmpdir(), `file-system-service-test-${Date.now()}`);
    tasksFilePath = path.join(tempDir, "test-tasks.json");

    // Instantiate the service for each test using the dynamically imported class
    fileSystemService = new FileSystemService(tasksFilePath);
  });

  describe('loadAndInitializeTasks', () => {
    it('should initialize with empty data when file does not exist', async () => {
      // Simulate "file not found" by rejecting
      jest.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'));

      const result = await fileSystemService.loadAndInitializeTasks();
      expect(result.data).toEqual({ projects: [] });
      expect(result.maxProjectId).toBe(0);
      expect(result.maxTaskId).toBe(0);
    });

    it('should load existing data and calculate correct max IDs', async () => {
      const mockData: TaskManagerFile = {
        projects: [
          {
            projectId: 'proj-2',
            initialPrompt: 'test',
            projectPlan: 'test',
            tasks: [
              { id: 'task-3', title: 'Task 1', description: 'Test', status: 'not started', approved: false, completedDetails: '' },
              { id: 'task-1', title: 'Task 2', description: 'Test', status: 'not started', approved: false, completedDetails: '' }
            ],
            completed: false,
            autoApprove: false
          },
          {
            projectId: 'proj-1',
            initialPrompt: 'test',
            projectPlan: 'test',
            tasks: [
              { id: 'task-2', title: 'Task 3', description: 'Test', status: 'not started', approved: false, completedDetails: '' }
            ],
            completed: false,
            autoApprove: false
          }
        ]
      };
      jest.mocked(readFile).mockResolvedValueOnce(JSON.stringify(mockData));

      const result = await fileSystemService.loadAndInitializeTasks();
      expect(result.data).toEqual(mockData);
      expect(result.maxProjectId).toBe(2);
      expect(result.maxTaskId).toBe(3);
    });

    it('should handle invalid project and task IDs', async () => {
      const mockData: TaskManagerFile = {
        projects: [
          {
            projectId: 'proj-invalid',
            initialPrompt: 'test',
            projectPlan: 'test',
            tasks: [
              { id: 'task-invalid', title: 'Task 1', description: 'Test', status: 'not started', approved: false, completedDetails: '' }
            ],
            completed: false,
            autoApprove: false
          }
        ]
      };

      jest.mocked(readFile).mockResolvedValueOnce(JSON.stringify(mockData));
      
      const result = await fileSystemService.loadAndInitializeTasks();
      
      expect(result.data).toEqual(mockData);
      expect(result.maxProjectId).toBe(0);
      expect(result.maxTaskId).toBe(0);
    });
  });

  describe('saveTasks', () => {
    it('should create directory and save tasks', async () => {
      const mockData: TaskManagerFile = {
        projects: []
      };
      await fileSystemService.saveTasks(mockData);

      // Now we can check our mock calls
      expect(mkdir).toHaveBeenCalledWith(path.dirname(tasksFilePath), { recursive: true });
      expect(writeFile).toHaveBeenCalledWith(
        tasksFilePath,
        JSON.stringify(mockData, null, 2),
        'utf-8'
      );
    });

    it('should handle read-only filesystem error', async () => {
      jest.mocked(writeFile).mockRejectedValueOnce(new Error('EROFS: read-only file system'));
      await expect(fileSystemService.saveTasks({ projects: [] })).rejects.toMatchObject({
        code: 'ERR_4003',
        message: 'Cannot save tasks: read-only file system'
      });
    });

    it('should handle general file write error', async () => {
      jest.mocked(writeFile).mockRejectedValueOnce(new Error('Some other error'));
      await expect(fileSystemService.saveTasks({ projects: [] })).rejects.toMatchObject({
        code: 'ERR_4001',
        message: 'Failed to save tasks file'
      });
    });
  });
});