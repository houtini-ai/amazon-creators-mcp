/**
 * JSON formatter — pretty-prints the (normalised) structured content.
 * Structured content is the same object we'd return in `structuredContent`.
 */
import type { FormatterInput, FormatterOutput } from './types.js';

export function formatJson<T>(input: FormatterInput<T>): FormatterOutput<T> {
  return {
    text: JSON.stringify(input.response, null, 2),
    structured: input.response,
  };
}
