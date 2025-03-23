import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

// Get the directory name equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Package Version Consistency', () => {
  test('package.json and package-lock.json versions match', async () => {
    try {
      // Read files from the project root
      const packageJson = JSON.parse(
        await readFile(path.resolve(__dirname, '../package.json'), 'utf8')
      );
      
      const packageLockJson = JSON.parse(
        await readFile(path.resolve(__dirname, '../package-lock.json'), 'utf8')
      );
      
      // Get the package version from both files
      const packageVersion = packageJson.version;
      const packageLockVersion = packageLockJson.version;
      
      // Assert that both versions match
      expect(packageLockVersion).toBe(packageVersion);
    } catch (error) {
      // Ensure errors are properly caught and reported
      console.error('Error during version comparison:', error);
      throw error;
    }
  });
}); 