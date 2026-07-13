import { Layer } from 'effect';
import { AnnotationService } from './annotations/effect-service';
import { BackupService } from './backup/effect-service';
import { DbClientService } from './db-client-service';
import { WebBibleService } from './bible/effect-service';
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

export const AppLive = Layer.mergeAll(
  AnnotationService.layer,
  WebBibleService.Live,
  UserDataLive,
  CommentaryService.layer,
  ConcordanceService.layer,
  CrossReferenceService.layer,
  WebSyncService.Live,
  WebReadingPlanService.Live,
  WebMemoryVerseService.Live,
  WebTopicService.Live,
  WritingsService.layer,
).pipe(Layer.provide(DbClientService.Live));
