// Lightweight polyfills for environments where secure-context Web Crypto is unavailable
// Ensures `crypto.randomUUID` exists, falling back to `getRandomValues` or Math.random.
// Keep it minimal and side‑effectful by design.
(() => {
  try {
    const g: any = globalThis as any;
    if (!g.crypto) {
      g.crypto = {};
    }
    if (typeof g.crypto.getRandomValues !== 'function') {
      g.crypto.getRandomValues = (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      };
    }
    if (typeof g.crypto.randomUUID !== 'function') {
      const tmpl = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
      g.crypto.randomUUID = () => {
        const rnds = new Uint8Array(16);
        g.crypto.getRandomValues(rnds);
        let i = 0;
        return tmpl.replace(/[xy]/g, (c: 'x' | 'y') => {
          const r = rnds[i++] & 15;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      };
    }
  } catch {
    // Ignore polyfill errors
  }
})();

