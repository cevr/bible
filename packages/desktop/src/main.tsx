/* @refresh reload */
import { render } from 'solid-js/web';
import { App } from './app.jsx';
import './styles/tailwind.css';

const root = document.getElementById('root');
if (root === null) throw new Error('#root not found');
render(() => <App />, root);
