// `cutpaper`: the control, today's look. BibleProject-style paper people
// in a chipboard and parchment world, from Righteousness by Faith's own kit
// and court (read-only), lit by its cold open's cool room light.

import { LIGHT } from '../../../righteousness-by-faith/light.ts';
import type { Look } from '../../look.ts';
import { court } from './court.ts';
import { card, job } from './job.ts';

export const cutpaper: Look = { court, job, card, light: LIGHT.room };
