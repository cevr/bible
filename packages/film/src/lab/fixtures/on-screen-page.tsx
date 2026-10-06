// The "on screen first" order's browser test page (`useOnScreenFirst`,
// `review/options/stills.tsx`; the Scenes tape's lines and the Project's
// cards both ask through it): a column of forty rows, each 100 px tall,
// watched for the still at its index. Every ask the order makes is kept on
// the window as `window.wanted`, newest last, for the test to read.

import { render } from '@solidjs/web';
import { useOnScreenFirst } from '../review/options/stills.tsx';

declare global {
  interface Window {
    wanted: Array<ReadonlyArray<number>>;
  }
}

/** The rows' indices: the stills' times. */
const ROWS = Array.from({ length: 40 }, (_, i) => i);

const Column = () => {
  const onScreen = useOnScreenFirst((times) => {
    window.wanted.push(times);
  });
  return ROWS.map((row) => (
    <div
      class="row"
      data-row={row}
      style={{ height: '100px' }}
      ref={(el) => {
        onScreen.watch(el, () => [row]);
      }}
    >
      {row}
    </div>
  ));
};

window.wanted = [];
render(() => <Column />, document.body);
