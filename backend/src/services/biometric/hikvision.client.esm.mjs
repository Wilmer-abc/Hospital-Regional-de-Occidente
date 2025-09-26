import DigestFetch from 'digest-fetch';

export function makeClient() {
  const { HIK_PROTOCOL='http', HIK_HOST, HIK_PORT='80', HIK_USER, HIK_PASS, HIK_TIMEOUT_MS='5000' } = process.env;
  const base = `${HIK_PROTOCOL}://${HIK_HOST}:${HIK_PORT}`;
  const client = new DigestFetch(HIK_USER, HIK_PASS, { algorithm: 'MD5', basic: false });

  async function isapi(path, opts = {}) {
    const url = `${base}${path}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), Number(HIK_TIMEOUT_MS));
    try {
      const res = await client.fetch(url, {
        ...opts,
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }
      });
      return res;
    } finally { clearTimeout(t); }
  }

  return {
    async getJson(path) {
      const res = await isapi(path, { method: 'GET' });
      if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
      return res.json();
    },
    async postJson(path, body) {
      const res = await isapi(path, { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`POST ${path} -> ${res.status}`);
      return res.json();
    },
    base
  };
}
