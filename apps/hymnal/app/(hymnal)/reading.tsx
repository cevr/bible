import { ReadingSheet } from '~/reader/ReadingSheet';
import { settings } from '~/store';

/** The reading sheet, over a hymn page, that the page's `Aa` button opens. */
export default function Reading() {
  return <ReadingSheet reading={settings.reading} />;
}
