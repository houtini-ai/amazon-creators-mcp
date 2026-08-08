/**
 * Shared types for formatter output.
 */
export type OutputFormat = 'json' | 'markdown' | 'html-card' | 'html-grid' | 'html-deals';

/** Formats that render HTML and should be wrapped as an MCP UI resource. */
export const HTML_FORMATS: ReadonlyArray<OutputFormat> = ['html-card', 'html-grid', 'html-deals'];

export interface FormatterInput<TResponse> {
  response: TResponse;
  partnerTag: string;
  marketplace: string;
  /** User-supplied CSS appended to the template's <style> block. Ignored by non-HTML formats. */
  customStyles?: string;
  /**
   * ISO-8601 timestamp marking when the response was retrieved from Amazon.
   * Rendered next to any displayed price as "as of <ts>" — required by the Amazon
   * Associates Operating Agreement when prices are shown on affiliate pages.
   * Tool runners fill this in at call time; `format_items` lets the caller
   * override so re-renders reflect the *original* fetch time, not "now".
   */
  retrievedAt?: string;
  /**
   * Maximum rendered title length for HTML card/grid output. Amazon titles
   * are frequently 120-200 chars of SEO keyword stuffing; clamping to ~80
   * keeps cards one-line per title on typical widths. Ignored by markdown /
   * json formats (they get the full untruncated title). `0` / unset = no cap.
   */
  titleMaxChars?: number;
  /**
   * When true, the grid formatter drops items that have no price. Defaults to
   * `true` because cards without a price are low-quality embeds for creator
   * blog posts (they can't show a deal and have no CTA-justifying hook).
   * Card / markdown / json formats ignore this flag.
   */
  hideItemsWithoutPrice?: boolean;
}

export interface FormatterOutput<TStructured = unknown> {
  /** Human-readable text (JSON, markdown, or HTML). */
  text: string;
  /** Parsed / normalised object echoed as `structuredContent`. */
  structured: TStructured;
}
