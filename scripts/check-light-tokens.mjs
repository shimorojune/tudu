// Guard: the `.light` block in tokens-extra.css must equal paper-theme.css's :root light block.
import { readFileSync } from 'node:fs';
const theme = readFileSync(new URL('../packages/ui/src/styles/paper-theme.css', import.meta.url), 'utf8');
const extra = readFileSync(new URL('../packages/ui/src/styles/tokens-extra.css', import.meta.url), 'utf8');
const root = /^:root \{\n(.*?)\n\}/ms.exec(theme)?.[1];
const light = /^\.light \{\n(.*?)\n\}/ms.exec(extra)?.[1];
if (!root || root !== light) {
  console.error('tokens-extra.css .light block is out of date: copy paper-theme.css :root into it');
  process.exit(1);
}
console.log('light tokens: ok');
