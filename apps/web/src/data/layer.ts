import { Layer } from 'effect';
import { DbClientService } from './db-client-service';
import { WebBibleService } from './bible/effect-service';
import { AppStateService } from './state/effect-service';
import { WebStudyDataService } from './study/effect-service';
import { WebSyncService } from './sync/effect-service';
import { WebReadingPlanService } from './plans/effect-service';
import { WebMemoryVerseService } from './practice/effect-service';
import { WebTopicService } from './topics/effect-service';

export const AppLive = Layer.mergeAll(
  WebBibleService.Live,
  AppStateService.Live,
  WebStudyDataService.Live,
  WebSyncService.Live,
  WebReadingPlanService.Live,
  WebMemoryVerseService.Live,
  WebTopicService.Live,
).pipe(Layer.provide(DbClientService.Live));
