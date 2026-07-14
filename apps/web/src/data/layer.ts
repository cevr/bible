import { Layer } from 'effect';
import { BibleDatabase } from '@bible/core/bible-db';
import { BibleService } from '@bible/core/bible/service';
import { AnnotationService } from './annotations/effect-service';
import { BackupService } from './backup/effect-service';
import { DbClientService } from './db-client-service';
import { layerBrowserBibleSqlClient } from './bible/browser-sql-client';
import { CollectionService } from './collections/effect-service';
import { CommentaryService } from './commentary/effect-service';
import { ConcordanceService } from './concordance/effect-service';
import { CrossReferenceService } from './cross-references/effect-service';
import { AppStateService } from './state/effect-service';
import { WebSyncService } from './sync/effect-service';
import { WebReadingPlanService } from './plans/effect-service';
import { WebMemoryVerseService } from './practice/effect-service';
import { WebTopicService } from './topics/effect-service';
import { WritingsService } from './writings/effect-service';

const UserDataLive = BackupService.layer.pipe(
  Layer.provideMerge(Layer.merge(AppStateService.Live, CollectionService.layer)),
);

const BibleLive = Layer.merge(BibleService.Live, ConcordanceService.layer).pipe(
  Layer.provide(BibleDatabase.layer),
  Layer.provide(layerBrowserBibleSqlClient),
);

export const AppLive = Layer.mergeAll(
  AnnotationService.layer,
  BibleLive,
  UserDataLive,
  CommentaryService.layer,
  CrossReferenceService.layer,
  WebSyncService.Live,
  WebReadingPlanService.Live,
  WebMemoryVerseService.Live,
  WebTopicService.Live,
  WritingsService.layer,
).pipe(Layer.provide(DbClientService.Live));
