// SheetJS ships a few raw control characters (\x01, \x05) inside string literals.
// Some viewers treat a page containing them as a binary/text file and show source instead of the app.
// They only occur inside JS strings, so writing each as a \xNN escape keeps the code identical.
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
const src = readFileSync(file, 'utf8');
let count = 0;
const out = src.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (c) => {
  count++;
  return '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0');
});
writeFileSync(file, out);
console.log(`escape-control: ${count} control characters escaped in ${file}`);
