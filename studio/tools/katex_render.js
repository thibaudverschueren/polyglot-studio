// Batch KaTeX renderer: stdin = JSON [[tex, display], ...] → stdout = JSON [{html} | {error}]
const katex = require('./vendor/katex.min.js');
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (buf += c));
process.stdin.on('end', () => {
  const items = JSON.parse(buf || '[]');
  const out = items.map(([tex, display]) => {
    try {
      return { html: katex.renderToString(tex, { displayMode: !!display, throwOnError: true, strict: 'ignore', output: 'html', trust: false }) };
    } catch (e) {
      return { error: String(e.message || e) };
    }
  });
  process.stdout.write(JSON.stringify(out));
});
