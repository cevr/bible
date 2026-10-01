import { scenesOf } from '@bible/film/canvas';
import { script } from '../script.ts';
import { fonts } from '../../righteousness-by-faith/palette.ts';
import { cold } from './cold.ts';
import { title } from './title.ts';
import { word } from './word.ts';
import { mirror } from './mirror.ts';
import { message } from './message.ts';
import { roof } from './roof.ts';
import { woman } from './woman.ts';
import { spoke } from './spoke.ts';
import { centurion } from './centurion.ts';
import { look } from './look.ts';
import { declared } from './declared.ts';
import { exchange } from './exchange.ts';
import { accuser } from './accuser.ts';
import { robe } from './robe.ts';
import { within } from './within.ts';
export const scenes = scenesOf(script, {
  drawings: {
    cold,
    title,
    word,
    mirror,
    message,
    roof,
    woman,
    spoke,
    centurion,
    look,
    declared,
    exchange,
    accuser,
    robe,
    within,
  },
  card: { brief: fonts.display, label: fonts.body },
});
