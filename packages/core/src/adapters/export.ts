import { Context, Effect, Layer, Schema } from 'effect';

/**
 * Error thrown when an export operation fails.
 */
export class ExportError extends Schema.TaggedErrorClass<ExportError>()('ExportError', {
  title: Schema.String,
  cause: Schema.Defect,
}) {}

/**
 * Options for exporting content.
 */
export interface ExportOptions {
  /** Optional folder/category for organizing the exported content */
  folder?: string;
}

// ============================================================================
// Service Interface
// ============================================================================

/**
 * Export adapter service interface.
 * CLI implements this with Apple Notes export.
 * Web could implement with download or cloud storage.
 */
export interface ExportAdapterService {
  /**
   * Export content with the given title.
   * @param content - The content to export (typically markdown or HTML)
   * @param title - The title for the exported content
   * @param options - Optional export options (folder, etc.)
   */
  readonly export: (
    content: string,
    title: string,
    options?: ExportOptions,
  ) => Effect.Effect<void, ExportError>;
}

// ============================================================================
// Service Definition
// ============================================================================

/**
 * Adapter for exporting content to various destinations.
 */
export class ExportAdapter extends Context.Service<ExportAdapter, ExportAdapterService>()(
  '@bible/core/adapters/export/ExportAdapter',
) {
  /**
   * Test implementation that captures exports.
   */
  static layerTest = (
    onExport?: (content: string, title: string, options?: ExportOptions) => void,
  ): Layer.Layer<ExportAdapter> =>
    Layer.succeed(ExportAdapter, {
      export: (content, title, options) =>
        Effect.sync(() => {
          onExport?.(content, title, options);
        }),
    });
}
