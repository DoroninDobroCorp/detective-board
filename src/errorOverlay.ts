// Lightweight runtime error overlay to surface browser errors in the UI
(function(){
  const ID = '__runtime_error_overlay__';
  function ensureEl() {
    let el = document.getElementById(ID);
    if (!el) {
      el = document.createElement('div');
      el.id = ID;
      Object.assign(el.style, {
        position: 'fixed',
        left: '0',
        right: '0',
        bottom: '0',
        background: 'rgba(180,0,0,0.9)',
        color: '#fff',
        padding: '8px 12px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: '12px',
        zIndex: '999999',
        maxHeight: '50vh',
        overflow: 'auto',
        display: 'none',
        whiteSpace: 'pre-wrap',
      } as CSSStyleDeclaration);
      const close = document.createElement('button');
      close.textContent = '×';
      Object.assign(close.style, {
        position: 'absolute',
        top: '6px',
        right: '8px',
        background: 'transparent',
        border: 'none',
        color: '#fff',
        fontSize: '16px',
        cursor: 'pointer',
      } as CSSStyleDeclaration);
      close.addEventListener('click', () => { if (el) el.style.display = 'none'; });
      el.appendChild(close);
      const pre = document.createElement('div');
      pre.id = ID + '_content';
      el.appendChild(pre);
      document.body.appendChild(el);
    }
    return el as HTMLDivElement;
  }
  function append(msg: string) {
    const el = ensureEl();
    const content = el.querySelector('#' + ID + '_content') as HTMLDivElement;
    const line = document.createElement('div');
    line.textContent = msg;
    content.appendChild(line);
    el.style.display = 'block';
  }
  window.addEventListener('error', (e) => {
    append('Error: ' + (e.error?.stack || e.message));
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const r: unknown = e.reason;
    type WithStack = { stack?: unknown };
    const hasStack = (obj: unknown): obj is WithStack => {
      return typeof obj === 'object' && obj !== null && 'stack' in (obj as Record<string, unknown>);
    };
    const msg = hasStack(r) && typeof r.stack === 'string' ? r.stack : String(r);
    append('UnhandledRejection: ' + msg);
  });
})();
