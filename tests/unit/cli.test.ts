import { exec } from "child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "util";

const execAsync = promisify(exec);
const CLI_PATH = path.resolve(process.cwd(), "src/client/cli.ts");
const TASK_MANAGER_FILE_PATH = path.resolve(process.cwd(), "tests/unit/test-tasks.json");
const TEMP_DIR = path.resolve(process.cwd(), "tests/unit/temp");

describe("CLI Unit Tests", () => {
  beforeEach(async () => {
    // Create a test file
    const testFile = path.join(TEMP_DIR, "test-spec.txt");
    await fs.writeFile(testFile, "Test specification content");
  });

  afterEach(async () => {
    await fs.rm(TEMP_DIR, { recursive: true, force: true });
  });
  
  // TODO: Rewrite these as unit tests
  it.skip("should generate a project plan with default options", async () => {
    const { stdout } = await execAsync(
      `TASK_MANAGER_FILE_PATH=${TASK_MANAGER_FILE_PATH} tsx ${CLI_PATH} generate-plan --prompt "Create a simple todo app"`
    );
    
    expect(stdout).toContain("Project plan generated successfully!");
    expect(stdout).toContain("Project ID:");
    expect(stdout).toContain("Total Tasks:");
    expect(stdout).toContain("Tasks:");
  }, 10000);
  
  it.skip("should generate a plan with custom provider and model", async () => {
    const { stdout } = await execAsync(
      `TASK_MANAGER_FILE_PATH=${TASK_MANAGER_FILE_PATH} tsx ${CLI_PATH} generate-plan --prompt "Create a todo app" --provider google --model gemini-1.5-pro`
    );
    
    expect(stdout).toContain("Project plan generated successfully!");
  }, 10000);
  
  it.skip("should handle file attachments", async () => {
    // Create a test file
    const testFile = path.join(TEMP_DIR, "test-spec.txt");
    await fs.writeFile(testFile, "Test specification content");
    
    const { stdout } = await execAsync(
      `TASK_MANAGER_FILE_PATH=${TASK_MANAGER_FILE_PATH} tsx ${CLI_PATH} generate-plan --prompt "Create based on spec" --attachment ${testFile}`
    );
    
    expect(stdout).toContain("Project plan generated successfully!");
  }, 10000);
});