/* Polyglot Studio — Solidity compiler worker (loads the official soljson WebAssembly build once). */
let compile = null;
let version = '';
function waitRuntime() {
  return new Promise((resolve) => {
    const ok = () => typeof self.Module !== 'undefined' && typeof Module.cwrap === 'function' && (Module.calledRun || Module.runtimeInitialized || Module.asm || Module.wasmExports);
    if (ok()) return resolve();
    const prev = self.Module && Module.onRuntimeInitialized;
    if (self.Module) Module.onRuntimeInitialized = () => { if (prev) prev(); resolve(); };
    const t = setInterval(() => { if (ok()) { clearInterval(t); resolve(); } }, 50);
    setTimeout(() => { clearInterval(t); resolve(); }, 60000);
  });
}
self.onmessage = async (e) => {
  const m = e.data || {};
  try {
    if (m.cmd === 'load') {
      if (!compile) {
        importScripts(m.url);
        await waitRuntime();
        compile = Module.cwrap('solidity_compile', 'string', ['string', 'number', 'number']);
        try { version = Module.cwrap('solidity_version', 'string', [])(); } catch (err) { version = ''; }
      }
      self.postMessage({ type: 'loaded', version });
    } else if (m.cmd === 'compile') {
      if (!compile) throw new Error('compiler niet geladen');
      self.postMessage({ id: m.id, output: compile(m.input, 0, 0) });
    }
  } catch (err) {
    if (m.cmd === 'load') self.postMessage({ type: 'load-error', error: String(err && err.message || err) });
    else self.postMessage({ id: m.id, error: String(err && err.message || err) });
  }
};
