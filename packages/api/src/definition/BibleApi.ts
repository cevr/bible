/**
 * Bible Tools API - Main API Composition
 *
 * Combines BibleGroup and EGWGroup into a single typed API.
 * Use HttpApiClient to generate type-safe clients from this definition.
 */
import { HttpApi } from 'effect/unstable/httpapi';

import { BibleGroup } from './groups/BibleGroup.js';
import { EGWGroup } from './groups/EGWGroup.js';

export class BibleToolsApi extends HttpApi.make('BibleToolsApi')
  .add(BibleGroup)
  .add(EGWGroup)
  .prefix('/api') {}
