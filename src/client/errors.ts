import { StandardError } from "../types/index.js";
/**
 * Formats an error message for CLI output
 */
export function formatCliError(error: StandardError): string {
    const details = error.details ? `: ${JSON.stringify(error.details)}` : '';
    return `[${error.code}] ${error.message}${details}`;
  }