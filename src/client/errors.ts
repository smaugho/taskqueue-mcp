import { StandardError } from "../types/index.js";
/**
 * Formats an error message for CLI output, optionally including relevant details.
 */
export function formatCliError(error: StandardError, includeDetails: boolean = true): string {
  const codePrefix = error.message.includes(`[${error.code}]`) ? '' : `[${error.code}] `;
  let message = `${codePrefix}${error.message}`;

  if (includeDetails && error.details) {
    // Prioritize showing nested originalError message if it exists and is different
    const originalErrorMessage = (error.details as any)?.originalError?.message;
    if (originalErrorMessage && typeof originalErrorMessage === 'string' && originalErrorMessage !== error.message) {
      message += `\n  -> Details: ${originalErrorMessage}`;
    } 
    // Add a fallback for simpler string details or stringified objects if needed,
    // but avoid dumping large complex objects unless necessary for debugging.
    // Example: uncomment if you often have simple string details
    // else if (typeof error.details === 'string') {
    //  message += `\n  -> Details: ${error.details}`;
    // }
    // Example: uncomment ONLY if you need to see the raw JSON details often
    // else {
    //   message += `\nDetails: ${JSON.stringify(error.details, null, 2)}`;
    // }
  }

  return message;
}