/**
 * Each hymn's topic as the app carries it (`virtual:hymnal`): every one of
 * the 695 has the printed name of the compiled topic that holds it.
 */

import { describe, expect, it } from 'bun:test';
import { topicOf } from '@bible/hymnal/hymn';
import { Option } from 'effect';

import { readTopics } from '../../vite/words';
import { hymns } from './hymns';

const topics = readTopics();

describe("the hymns' topics", () => {
  it('give each of the 695 hymns its compiled topic, a trimmed name with no control character', () => {
    expect(hymns.length).toBe(695);
    const wrong = hymns.filter(
      (hymn) =>
        hymn.topic.length === 0 ||
        hymn.topic !== hymn.topic.trim() ||
        // oxlint-disable-next-line no-control-regex -- the rule is "no control character".
        /[\u0000-\u001f\u007f]/.test(hymn.topic) ||
        hymn.topic !==
          Option.getOrUndefined(Option.map(topicOf(topics, hymn.number), (topic) => topic.name)),
    );
    expect(wrong.map((hymn) => `${hymn.number}: [${hymn.topic}]`)).toEqual([]);
  });
});
