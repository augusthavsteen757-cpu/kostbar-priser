// Kostbar foto-server: appen sender et billede af maden, serveren spørger Claude og sender svaret tilbage.
// Billeder gemmes ikke. Nøglen ligger kun i miljøvariablen ANTHROPIC_API_KEY på Render.
import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { fotoPrompt, SKEMA } from './prompt.js';

const PORT = +process.env.PORT || 10000;
const MODEL = process.env.MODEL || 'claude-sonnet-5-5';
const DAGLIG_MAX = +process.env.DAGLIG_MAX || 300;       // alle brugere tilsammen pr. døgn (UTC)
const IP_TI_MIN = +process.env.IP_TI_MIN || 10;          // pr. adresse pr. 10 minutter
const IP_DAG = +process.env.IP_DAG || 40;                // pr. adresse pr. døgn
const MAX_BYTES = 2.5 * 1024 * 1024;                     // billedet efter base64-afkodning
const ORIGINS = new Set(['capacitor://localhost', 'ionic://localhost', 'http://localhost', 'https://localhost',
  ...(process.env.EKSTRA_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)]);

const key = () => process.env.ANTHROPIC_API_KEY || '';
let client = null, klientNoegle = '';
const claude = () => { if (!client || klientNoegle !== key()) { klientNoegle = key(); client = new Anthropic({ apiKey: klientNoegle, timeout: +process.env.FOTO_TIMEOUT || 50000, maxRetries: 1, baseURL: process.env.ANTHROPIC_BASE_URL || undefined }) } return client };

// Grænser i hukommelsen: nulstilles ved genstart, hvilket er godt nok til at stoppe misbrug.
const dag = () => new Date().toISOString().slice(0, 10);
let tael = { dag: dag(), n: 0 };
const ipLog = new Map(); // ip -> [tidspunkter i ms] for i dag
setInterval(() => { const t = Date.now() - 864e5; for (const [ip, a] of ipLog) { const b = a.filter(x => x > t); if (b.length) ipLog.set(ip, b); else ipLog.delete(ip) } }, 6e5).unref();
function maa(ip) {
  if (tael.dag !== dag()) tael = { dag: dag(), n: 0 };
  if (tael.n >= DAGLIG_MAX) return 'daily_limit';
  const nu = Date.now(), a = (ipLog.get(ip) || []).filter(x => x > nu - 864e5);
  if (a.length >= IP_DAG || a.filter(x => x > nu - 6e5).length >= IP_TI_MIN) return 'rate_limited';
  a.push(nu); ipLog.set(ip, a); tael.n++;
  return '';
}

function svar(res, kode, obj, origin) {
  const h = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', vary: 'Origin' };
  if (origin && ORIGINS.has(origin)) { h['access-control-allow-origin'] = origin; h['access-control-allow-methods'] = 'GET, POST, OPTIONS'; h['access-control-allow-headers'] = 'content-type'; h['access-control-max-age'] = '86400' }
  res.writeHead(kode, h); res.end(obj == null ? '' : JSON.stringify(obj));
}

function laes(req) {
  return new Promise((ok, nej) => {
    let n = 0; const dele = [];
    req.on('data', d => { n += d.length; if (n > MAX_BYTES * 1.4 + 4096) { nej(Object.assign(new Error('stor'), { kode: 'too_big' })); req.destroy() } else dele.push(d) });
    req.on('end', () => ok(Buffer.concat(dele).toString('utf8')));
    req.on('error', nej);
  });
}

function billede(b64) {
  if (typeof b64 !== 'string' || !b64) return null;
  b64 = b64.replace(/^data:image\/[a-z]+;base64,/, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(b64)) return null;
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 100 || buf.length > MAX_BYTES) return buf.length > MAX_BYTES ? 'stor' : null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return { type: 'image/jpeg', data: b64 };
  if (buf[0] === 0x89 && buf[1] === 0x50) return { type: 'image/png', data: b64 };
  if (buf.slice(8, 12).toString() === 'WEBP') return { type: 'image/webp', data: b64 };
  return null;
}

// Afsenderens adresse til grænserne pr. adresse. Første del af x-forwarded-for kan afsenderen selv skrive og dermed
// omgå grænsen, så brug Cloudflares cf-connecting-ip (Render ligger bag Cloudflare), hvis den findes.
function ipAf(req) {
  const cf = String(req.headers['cf-connecting-ip'] || req.headers['true-client-ip'] || '').trim();
  if (cf) return cf;
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

async function foto(req, res, origin) {
  const t0 = Date.now(), ip = ipAf(req);
  const log = (kode, x) => console.log(JSON.stringify({ t: new Date().toISOString(), kode, ms: Date.now() - t0, i_dag: tael.n, ...x }));
  const fejl = (status, kode, x) => { log(kode, x); svar(res, status, { fejl: kode }, origin) };
  if (!key()) return fejl(503, 'not_ready');
  let body;
  try { body = JSON.parse(await laes(req)) } catch (e) { return fejl(e.kode === 'too_big' ? 413 : 400, e.kode || 'bad_request') }
  const img = billede(body && body.billede);
  if (img === 'stor') return fejl(413, 'too_big');
  if (!img) return fejl(400, 'image_rejected');
  const stop = maa(ip);
  if (stop) return fejl(429, stop);
  const ctl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ctl.abort() });
  try {
    const r = await claude().messages.create({
      model: MODEL,
      max_tokens: 3000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SKEMA } },
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: img.type, data: img.data } },
        { type: 'text', text: fotoPrompt(body) },
      ] }],
    }, { signal: ctl.signal });
    const u = r.usage || {}, tok = { ind: u.input_tokens, ud: u.output_tokens, model: r.model };
    if (r.stop_reason === 'refusal') return fejl(422, 'refused', tok);
    if (r.stop_reason === 'max_tokens') return fejl(502, 'upstream_error', tok);
    const tekst = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    let j; try { j = JSON.parse(tekst) } catch (e) { return fejl(502, 'invalid_json', tok) }
    log('ok', tok); svar(res, 200, { svar: j }, origin);
  } catch (e) {
    if (ctl.signal.aborted) return log('afbrudt');
    const s = e && e.status;
    if (s === 401 || s === 403) { console.error('Nøglen til Claude virker ikke (status ' + s + ').'); return fejl(503, 'not_ready') }
    if (s === 429) return fejl(429, 'rate_limited', { claude: 429 });
    if (s === 400 && /image/i.test(String(e.message))) return fejl(422, 'image_rejected');
    if (s === 400) console.error('Claude 400:', String(e.message).slice(0, 300));
    return fejl(502, 'upstream_error', { claude: s || String(e && e.name) });
  }
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const sti = (req.url || '').split('?')[0];
  try {
    if (req.method === 'OPTIONS') return svar(res, 204, null, origin);
    if (req.method === 'GET' && (sti === '/ok' || sti === '/')) return svar(res, 200, { klar: !!key(), model: MODEL }, origin);
    if (req.method === 'POST' && sti === '/foto') return await foto(req, res, origin);
    svar(res, 404, { fejl: 'not_found' }, origin);
  } catch (e) { console.error(e); if (!res.headersSent) svar(res, 500, { fejl: 'upstream_error' }, origin) }
});
server.requestTimeout = 90000;
server.listen(PORT, () => console.log(`Kostbar foto-server på port ${PORT} (${MODEL}, nøgle: ${key() ? 'ja' : 'MANGLER'})`));
