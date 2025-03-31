import { ErrorCode } from "../types/index.js";

/**
 * Formats an error message for CLI output
 */
export function formatCliError(error: Error & { code?: ErrorCode | number }): string {
  // Handle our custom file system errors with user-friendly messages
  if (error.name === 'ReadOnlyFileSystemError') {
    return "Cannot save tasks: The file system is read-only. Please check your permissions.";
  }
  if (error.name === 'FileWriteError') {
    return "Failed to save tasks: There was an error writing to the file.";
  }
  if (error.name === 'FileReadError') {
    return "Failed to read file: The file could not be accessed or does not exist.";
  }

  // For other errors, include the error code if available
  const codePrefix = error.code ? `[${error.code}] ` : '';
  return `${codePrefix}${error.message}`;
}