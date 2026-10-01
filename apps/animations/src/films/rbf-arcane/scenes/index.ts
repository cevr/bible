import { scenesOf } from '@bible/film/canvas';
import { script } from '../script.ts';
import { fonts } from '../../righteousness-by-faith/palette.ts';
import { cold } from './cold.ts';
import { title } from './title.ts';
import { word } from './word.ts';
import { mirror } from './mirror.ts';
import { message } from './message.ts';
export const scenes = scenesOf(script, {
  drawings: { cold, title, word, mirror, message },
  card: { brief: fonts.display, label: fonts.body },
});
