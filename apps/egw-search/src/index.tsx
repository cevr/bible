/** The browser entry: mount the page into the element `index.html` names. */

import { render } from '@solidjs/web';
import { Option } from 'effect';

import { App } from './app.js';
import './styles.css';

const root = Option.fromNullishOr(document.getElementById('root'));
if (Option.isSome(root)) render(() => <App />, root.value);
