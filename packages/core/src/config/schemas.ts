/**
 * Configuration Schemas
 *
 * Schema definitions for application configuration with validation and defaults.
 */

import { Config, Redacted, Schema } from 'effect';

// ============================================================================
// EGW Configuration
// ============================================================================

/**
 * EGW API configuration schema.
 */
export const EGWApiConfigSchema = Schema.Struct({
  /** Base URL for EGW API */
  baseUrl: Schema.String.annotate({
    description: 'Base URL for EGW API',
    default: 'https://a.egwwritings.org',
  }),
  /** User agent for API requests */
  userAgent: Schema.String.annotate({
    description: 'User agent for API requests',
    default: 'EGW-Effect-Client/1.0',
  }),
});

export type EGWApiConfig = typeof EGWApiConfigSchema.Type;

/**
 * EGW Auth configuration schema.
 */
export const EGWAuthConfigSchema = Schema.Struct({
  /** Base URL for EGW authentication */
  authBaseUrl: Schema.String.annotate({
    description: 'Base URL for EGW authentication',
    default: 'https://cpanel.egwwritings.org',
  }),
  /** OAuth client ID */
  clientId: Schema.String.annotate({ description: 'OAuth client ID' }),
  /** OAuth client secret (redacted) */
  clientSecret: Schema.String.annotate({
    description: 'OAuth client secret',
  }),
  /** OAuth scope */
  scope: Schema.String.annotate({
    description: 'OAuth scope',
    default: 'writings search studycenter subscriptions user_info',
  }),
  /** Path to token file */
  tokenFile: Schema.String.annotate({
    description: 'Path to token file',
    default: 'data/tokens.json',
  }),
});

export type EGWAuthConfig = typeof EGWAuthConfigSchema.Type;

// ============================================================================
// Database Configuration
// ============================================================================

/**
 * Database paths configuration schema.
 */
export const DatabaseConfigSchema = Schema.Struct({
  /** Path to Bible database */
  bibleDbPath: Schema.optional(Schema.String).annotate({
    description: 'Path to Bible database file',
  }),
  /** Path to EGW paragraph database */
  egwParagraphDbPath: Schema.optional(Schema.String).annotate({
    description: 'Path to EGW paragraph database file',
  }),
  /** Path to EGW upload status database */
  egwUploadStatusDbPath: Schema.optional(Schema.String).annotate({
    description: 'Path to EGW upload status database file',
    default: 'data/egw-upload-status.db',
  }),
});

export type DatabaseConfig = typeof DatabaseConfigSchema.Type;

// ============================================================================
// Gemini Configuration
// ============================================================================

/**
 * Gemini API configuration schema.
 */
export const GeminiConfigSchema = Schema.Struct({
  /** Google AI API key (redacted) */
  apiKey: Schema.String.annotate({ description: 'Google AI API key' }),
});

export type GeminiConfig = typeof GeminiConfigSchema.Type;

// ============================================================================
// Config Loading Helpers
// ============================================================================

/**
 * Load EGW API config from environment.
 */
export const loadEGWApiConfig = Config.all({
  baseUrl: Config.string('EGW_API_BASE_URL').pipe(Config.withDefault('https://a.egwwritings.org')),
  userAgent: Config.string('EGW_USER_AGENT').pipe(Config.withDefault('EGW-Effect-Client/1.0')),
});

/**
 * Load EGW Auth config from environment.
 */
export const loadEGWAuthConfig = Config.all({
  authBaseUrl: Config.string('EGW_AUTH_BASE_URL').pipe(
    Config.withDefault('https://cpanel.egwwritings.org'),
  ),
  clientId: Config.string('EGW_CLIENT_ID'),
  clientSecret: Config.redacted('EGW_CLIENT_SECRET'),
  scope: Config.string('EGW_SCOPE').pipe(
    Config.withDefault('writings search studycenter subscriptions user_info'),
  ),
  tokenFile: Config.string('EGW_TOKEN_FILE').pipe(Config.withDefault('data/tokens.json')),
});

/**
 * Load database config from environment.
 */
export const loadDatabaseConfig = Config.all({
  bibleDbPath: Config.string('BIBLE_DB_PATH').pipe(Config.option),
  egwParagraphDbPath: Config.string('EGW_PARAGRAPH_DB').pipe(Config.option),
  egwUploadStatusDbPath: Config.string('EGW_UPLOAD_STATUS_DB').pipe(
    Config.withDefault('data/egw-upload-status.db'),
  ),
});

/**
 * Load Gemini config from environment.
 */
export const loadGeminiConfig = Config.all({
  apiKey: Config.redacted('GOOGLE_AI_API_KEY').pipe(Config.withDefault(Redacted.make(''))),
});
