import { AppError } from "../types/errors.js";

/**
 * Formats an error message for CLI output
 */
export function formatCliError(error: Error): string {
  // Handle our custom file system errors by prefixing the error code
  if (error instanceof AppError) {
    return `${error.code}: ${error.message}`;
  }

  // For unknown errors, just return the error message
  return error.message;
}