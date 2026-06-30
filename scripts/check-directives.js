// Compile every Alpine directive expression in index.html the way Alpine does
// (AsyncFunction body inside `with(scope)`), to catch syntax errors in bindings
// without a live browser. Syntax-only: undefined references are fine.
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

function unescapeHtml(s) {
  return s.replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'")
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const re = /(?:\s)(@[\w.:-]+|:[\w.:-]+|x-[\w.:-]+)="([^"]*)"/g;
let m, total = 0, failures = [];
const skipNames = n => n === 'x-data' || n === 'x-cloak' || n.startsWith('x-transition');

while ((m = re.exec(html)) !== null) {
  const name = m[1];
  const raw = unescapeHtml(m[2]);
  if (skipNames(name)) continue;
  if (raw.trim() === '') continue;
  total++;
  try {
    if (name.startsWith('x-for')) {
      // "item in items" / "(item, i) in items" -> compile the iterable side
      const idx = raw.lastIndexOf(' in ');
      const iter = idx >= 0 ? raw.slice(idx + 4) : raw;
      new AsyncFunction(`with(this){ return (${iter}) }`);
    } else if (name.startsWith('@')) {
      new AsyncFunction('$event', `with(this){ ${raw} }`);
    } else {
      new AsyncFunction(`with(this){ return (${raw}) }`);
    }
  } catch (e) {
    failures.push({ name, raw, err: e.message });
  }
}

console.log(`Checked ${total} directive expressions.`);
if (failures.length) {
  console.log(`\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  [${f.name}] ${f.err}\n    ${f.raw}`);
  process.exit(1);
} else {
  console.log('All directive expressions compiled OK.');
}
