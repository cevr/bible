// The lab's one Follow button: shown while a reader has a view's scroll box
// (`Following`, `follow.ts`), and a press gives the box back to the view. An
// action, not a toggle: it shows only while there is something to take back.
// Its look is the kit's button; where it stands is its host's to say.

import { Show } from '@solidjs/web';
import type { Following } from './follow.ts';

/** Follow, while a reader has the box `following` keeps. */
export const FollowButton = (props: { readonly following: Following }) => (
  <Show when={!props.following.on()}>
    <button
      type="button"
      class="sh-btn lab-follow"
      data-act="follow"
      title="Scroll with the playhead"
      onClick={() => props.following.resume()}
    >
      Follow
    </button>
  </Show>
);
