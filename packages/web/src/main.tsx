import { render } from 'preact';
import { App } from 'stream-core';

const root = document.getElementById('app');

if (!root) {
  throw new Error('Mount element #app not found.');
}

render(<App />, root);
