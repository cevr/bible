import type { Context, ManagedRuntime } from 'effect';

import { AnnotationService } from './annotations/effect-service';
import { WebBibleService } from './bible/effect-service';
import { CollectionService } from './collections/effect-service';
import { CommentaryService } from './commentary/effect-service';
import { ConcordanceService } from './concordance/effect-service';
import { CrossReferenceService } from './cross-references/effect-service';
import { WebReadingPlanService } from './plans/effect-service';
import { WebMemoryVerseService } from './practice/effect-service';
import { makeServiceClient, type PromiseClient } from './service-client';
import { AppStateService } from './state/effect-service';
import { WebSyncService } from './sync/effect-service';
import { WebTopicService } from './topics/effect-service';
import { WritingsService } from './writings/effect-service';

export type AppServices =
  | AnnotationService
  | WebBibleService
  | CollectionService
  | CommentaryService
  | ConcordanceService
  | CrossReferenceService
  | WebReadingPlanService
  | WebMemoryVerseService
  | AppStateService
  | WebSyncService
  | WebTopicService
  | WritingsService;

export type AppRuntime = ManagedRuntime.ManagedRuntime<AppServices, never>;

type Client<Service extends Context.Service.Any> = PromiseClient<Context.Service.Shape<Service>>;

export interface AppClient {
  readonly annotations: Client<typeof AnnotationService>;
  readonly bible: Client<typeof WebBibleService>;
  readonly collections: Client<typeof CollectionService>;
  readonly commentary: Client<typeof CommentaryService>;
  readonly concordance: Client<typeof ConcordanceService>;
  readonly crossReferences: Client<typeof CrossReferenceService>;
  readonly plans: Client<typeof WebReadingPlanService>;
  readonly practice: Client<typeof WebMemoryVerseService>;
  readonly state: Client<typeof AppStateService>;
  readonly sync: Client<typeof WebSyncService>;
  readonly topics: Client<typeof WebTopicService>;
  readonly writings: Client<typeof WritingsService>;
}

export function makeAppClient(runtime: AppRuntime): AppClient {
  return {
    annotations: makeServiceClient(runtime, AnnotationService),
    bible: makeServiceClient(runtime, WebBibleService),
    collections: makeServiceClient(runtime, CollectionService),
    commentary: makeServiceClient(runtime, CommentaryService),
    concordance: makeServiceClient(runtime, ConcordanceService),
    crossReferences: makeServiceClient(runtime, CrossReferenceService),
    plans: makeServiceClient(runtime, WebReadingPlanService),
    practice: makeServiceClient(runtime, WebMemoryVerseService),
    state: makeServiceClient(runtime, AppStateService),
    sync: makeServiceClient(runtime, WebSyncService),
    topics: makeServiceClient(runtime, WebTopicService),
    writings: makeServiceClient(runtime, WritingsService),
  };
}
