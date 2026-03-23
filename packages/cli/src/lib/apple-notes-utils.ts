/**
 * Apple Notes Utilities
 *
 * Shared utilities for Apple Notes integration, including:
 * - AppleScript string escaping
 * - Markdown title extraction
 * - HTML styling for Apple Notes
 */

import { Option } from 'effect';

/**
 * Escape string for AppleScript embedding.
 * Handles backslashes and double quotes.
 */
export function escapeAppleScriptString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Extract title from Markdown content (first H1 heading).
 * Returns Option.none() if no H1 heading is found.
 */
export function extractTitleFromMarkdown(markdownContent: string): Option.Option<string> {
  const h1Match = markdownContent.match(/^\s*#\s+(.*?)(\s+#*)?$/m);
  return Option.fromNullishOr(h1Match?.[1]?.trim());
}

/**
 * CSS styles for Apple Notes HTML content.
 * Optimized for readability in Apple Notes.
 */
export const APPLE_NOTES_STYLES = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 24px;
    line-height: 1.6;
    max-width: 800px;
    margin: 0 auto;
    padding: 40px;
  }
  h1 {
    font-size: 36px;
    margin-bottom: 48px;
    padding-bottom: 20px;
    border-bottom: 2px solid #e9ecef;
  }
  h2 {
    font-size: 32px;
    margin-top: 64px;
    margin-bottom: 40px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e9ecef;
  }
  h3 {
    font-size: 30px;
    margin-top: 56px;
    margin-bottom: 32px;
  }
  h4 {
    font-size: 28px;
    margin-top: 48px;
    margin-bottom: 28px;
  }
  p {
    font-size: 24px;
    margin-bottom: 32px;
    line-height: 1.7;
  }
  pre {
    background-color: #f8f9fa;
    padding: 28px;
    border-radius: 8px;
    overflow-x: auto;
    font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
    white-space: pre;
    font-size: 22px;
    line-height: 1.6;
    margin: 40px 0;
    border: 1px solid #e9ecef;
  }
  code {
    font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
    font-size: 22px;
    background-color: #f8f9fa;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid #e9ecef;
  }
  ul, ol {
    font-size: 24px;
    margin: 40px 0;
    padding-left: 40px;
  }
  li {
    margin-bottom: 24px;
    line-height: 1.7;
  }
  blockquote {
    font-size: 24px;
    border-left: 4px solid #e9ecef;
    margin: 48px 0;
    padding: 24px 32px;
    background-color: #f8f9fa;
    border-radius: 0 8px 8px 0;
  }
  hr {
    border: none;
    border-top: 2px solid #e9ecef;
    margin: 64px 0;
  }
  img {
    max-width: 100%;
    height: auto;
    margin: 40px 0;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 40px 0;
  }
  th, td {
    padding: 16px;
    border: 1px solid #e9ecef;
    text-align: left;
  }
  th {
    background-color: #f8f9fa;
    font-weight: 600;
  }
  tr:nth-child(even) {
    background-color: #f8f9fa;
  }
`;

/**
 * Wrap HTML content with Apple Notes styling.
 */
export function wrapWithAppleNotesStyle(htmlContent: string): string {
  return `
    <html>
    <head>
      <meta charset="utf-8">
      <style>${APPLE_NOTES_STYLES}</style>
    </head>
    <body>
      ${htmlContent}
    </body>
    </html>
  `;
}

/**
 * Process markdown content for Apple Notes:
 * - Removes H1 heading (used as note title)
 * - Adds extra line breaks between sections for better readability
 */
export function prepareMarkdownForAppleNotes(
  markdownContent: string,
  keepH1: boolean = false,
): string {
  // Remove the H1 heading from content if not keeping it
  const contentToParse = keepH1
    ? markdownContent
    : markdownContent.replace(/^\s*#\s+.*?(\s+#*)?$/m, '').trim();

  // Add extra line breaks between sections
  return contentToParse
    .replace(/(?=#{2,4}\s)/g, '\n\n\n') // Add breaks before h2-h4
    .replace(/(?<=#{2,4}.*\n)/g, '\n\n'); // Add breaks after h2-h4
}
