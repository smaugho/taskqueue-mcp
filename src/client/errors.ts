import { StandardError } from "../types/index.js";
/**
 * Formats an error message for CLI output
 */
export function formatCliError(error: StandardError, includeDetails: boolean = false): string {
  const codePrefix = error.message.includes(`[${error.code}]`) ? '' : `[${error.code}] `;
  const message = `${codePrefix}${error.message}`;
  return includeDetails && error.details ? `${message}\nDetails: ${JSON.stringify(error.details, null, 2)}` : message;
}