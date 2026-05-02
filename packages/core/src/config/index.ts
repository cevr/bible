/**
 * Configuration Module
 *
 * Central configuration for the bible application.
 */

// Schema exports
export type { DatabaseConfig, EGWApiConfig, EGWAuthConfig, GeminiConfig } from './schemas.js';

export {
  DatabaseConfigSchema,
  EGWApiConfigSchema,
  EGWAuthConfigSchema,
  GeminiConfigSchema,
  loadDatabaseConfig,
  loadEGWApiConfig,
  loadEGWAuthConfig,
  loadGeminiConfig,
} from './schemas.js';
