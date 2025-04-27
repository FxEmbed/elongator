import { load, CheerioAPI } from 'cheerio';
import { Cubic } from './cubic';
import { isOdd, interpolate, convertRotationToMatrix, floatToHex } from './utils';

// Cached fetch helper that uses Cloudflare Worker cache
async function cachedFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const cache = caches.default;
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse.clone();
  }
  const response = await fetch(request);
  if (request.method === 'GET' && response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

/**
 * Handle X.com migration (refresh meta and form-based redirect)
 */
export async function handleXMigration(): Promise<CheerioAPI> {
  const homeUrl = 'https://x.com';
  let resp = await cachedFetch(homeUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
    }
  });
  let html = await resp.text();
  let $ = load(html);

  const migrationRegex = /(https?:\/\/(?:www\.)?(?:twitter|x)\.com(?:\/x)?\/migrate[\/?]tok=[A-Za-z0-9%\-_]+)/;

  // Check meta refresh tag
  const metaRefresh = $('meta[http-equiv="refresh"]').get(0);
  let migMatch: RegExpMatchArray | null = null;
  if (metaRefresh) {
    migMatch = $(metaRefresh).toString().match(migrationRegex);
  }
  if (!migMatch) {
    migMatch = html.match(migrationRegex);
  }
  if (migMatch) {
    resp = await cachedFetch(migMatch[1]);
    html = await resp.text();
    $ = load(html);
  }

  // Check for form-based migration
  const form = $('form[name="f"]').length ? $('form[name="f"]') : $('form[action="https://x.com/x/migrate"]');
  if (form.length) {
    const actionUrl = form.attr('action') || 'https://x.com/x/migrate';
    const method = (form.attr('method') || 'POST').toUpperCase();
    const inputs = form.find('input').toArray();
    const data: Record<string, string> = {};
    inputs.forEach(input => {
      const name = $(input).attr('name');
      const val = $(input).attr('value') || '';
      if (name) data[name] = val;
    });
    if (method === 'GET') {
      const url = actionUrl + '?' + new URLSearchParams(data).toString();
      resp = await cachedFetch(url);
    } else {
      const body = new URLSearchParams(data).toString();
      resp = await cachedFetch(actionUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    }
    html = await resp.text();
    $ = load(html);
  }

  return $;
}

// Regex to extract on-demand file hash and key byte indices
const ON_DEMAND_FILE_REGEX = /['"]ondemand\.s['"]:\s*['"]([\w]+)['"]/;
const INDICES_REGEX = /\(\w\[(\d{1,2})\],\s*16\)/g;

export class ClientTransaction {
  private homePage: CheerioAPI;
  private defaultRowIndex!: number;
  private defaultKeyBytesIndices!: number[];
  private key!: string;
  private keyBytes!: number[];
  private animationKey!: string;

  static ADDITIONAL_RANDOM_NUMBER = 3;
  // I legit have no idea why this string works and others don't
  static DEFAULT_KEYWORD = 'obfiowerehiring';

  private constructor(homePage: CheerioAPI) {
    this.homePage = homePage;
  }

  /**
   * Factory method to init class (handles migration + precomputations)
   */
  static async create(): Promise<ClientTransaction> {
    const page = await handleXMigration();
    const tx = new ClientTransaction(page);
    await tx.init();
    return tx;
  }

  /** Initialize internal state */
  private async init(): Promise<void> {
    const [rowIndex, keyIndices] = await this.getIndices();
    this.defaultRowIndex = rowIndex;
    this.defaultKeyBytesIndices = keyIndices;
    this.key = this.getKey();
    this.keyBytes = this.getKeyBytes(this.key);
    this.animationKey = this.getAnimationKey();
  }

  /** Fetch and parse the ondemand JS to get key byte indices */
  private async getIndices(): Promise<[number, number[]]> {
    const html = this.homePage.html() || '';
    const m = ON_DEMAND_FILE_REGEX.exec(html);
    if (!m || !m[1]) {
      throw new Error("Couldn't get on-demand file hash");
    }
    const hash = m[1];
    const url = `https://abs.twimg.com/responsive-web/client-web/ondemand.s.${hash}a.js`;
    const resp = await cachedFetch(url);
    const text = await resp.text();
    const indices: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = INDICES_REGEX.exec(text)) !== null) {
      indices.push(parseInt(match[1], 10));
    }
    if (indices.length < 2) {
      throw new Error("Couldn't get KEY_BYTE indices");
    }
    return [indices[0], indices.slice(1)];
  }

  /** Extract the key from the page source */
  private getKey(): string {
    const elem = this.homePage('[name="twitter-site-verification"]').first();
    const content = elem.attr('content');
    if (!content) {
      throw new Error("Couldn't get key from the page source");
    }
    return content;
  }

  /** Decode base64 key to bytes using browser atob */
  private getKeyBytes(key: string): number[] {
    const binary = atob(key);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return Array.from(bytes);
  }

  /** Select loading-x-anim elements */
  private getFrames(): any[] {
    return this.homePage('[id^="loading-x-anim"]').toArray();
  }

  /** Build a 2D number array from the SVG path data */
  private get2dArray(): number[][] {
    const frames = this.getFrames();
    const idx = this.keyBytes[5] % 4;
    const el = frames[idx];
    const $el = this.homePage(el);
    const g = $el.children().first();
    const pathEl = g.children().eq(1);
    const d = pathEl.attr('d');
    if (!d) {
      throw new Error("Couldn't find path 'd' attribute");
    }
    return d
      .slice(9)
      .split('C')
      .map(item =>
        item
          .replace(/[^\d]+/g, ' ')
          .trim()
          .split(/\s+/)
          .map(n => parseInt(n, 10))
      );
  }

  /** Simple linear interpolation solver */
  private solve(value: number, minVal: number, maxVal: number, rounding: boolean): number {
    const res = value * (maxVal - minVal) / 255 + minVal;
    return rounding ? Math.floor(res) : parseFloat(res.toFixed(2));
  }

  /** Perform the animation key transformation */
  private animate(frames: number[], targetTime: number): string {
    const fromColor = [...frames.slice(0,3).map(v => v), 1];
    const toColor = [...frames.slice(3,6).map(v => v), 1];
    const toRot = [this.solve(frames[6], 60, 360, true)];
    const curves = frames.slice(7).map((v, i) => this.solve(v, isOdd(i), 1, false));
    const cubic = new Cubic(curves);
    const f = cubic.getValue(targetTime);
    const color = interpolate(fromColor, toColor, f).map(v => (v>0 ? v : 0));
    const rot = interpolate([0], toRot, f);
    const matrix = convertRotationToMatrix(rot[0]);

    const hexArr: string[] = [];
    // colors
    color.slice(0,-1).forEach(v => hexArr.push(Math.round(v).toString(16)));
    // matrix floats
    matrix.forEach(val => {
      let rv = parseFloat(val.toFixed(2));
      if (rv < 0) rv = -rv;
      const hx = floatToHex(rv);
      if (hx.startsWith('.')) {
        hexArr.push(('0'+hx).toLowerCase());
      } else if (hx) {
        hexArr.push(hx.toLowerCase());
      } else {
        hexArr.push('0');
      }
    });
    // trailing zeros
    hexArr.push('0','0');
    return hexArr.join('').replace(/[.-]/g, '');
  }

  /** Compute the animation key */
  private getAnimationKey(): string {
    const total = 4096;
    const rowIndex = this.keyBytes[this.defaultRowIndex] % 16;
    const frameTime = this.defaultKeyBytesIndices
      .map(i => this.keyBytes[i] % 16)
      .reduce((a,b) => a*b, 1);
    const grid = this.get2dArray();
    const row = grid[rowIndex];
    const t = frameTime / total;
    return this.animate(row, t);
  }

  /**
   * Generate the X-Client-Transaction-Id header value.
   */
  async generateTransactionId(method: string, path: string): Promise<string> {
    const now = Math.floor(Date.now()/1000 - 1682924400);
    const timeBytes = [0,1,2,3].map(i => (now >> (i*8)) & 0xff);
    const hashInput = `${method}!${path}!${now}${ClientTransaction.DEFAULT_KEYWORD}${this.animationKey}`;
    
    const encoder = new TextEncoder();
    const data = encoder.encode(hashInput);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const fullHash = new Uint8Array(hashBuffer);
    const hashBytes = Array.from(fullHash.slice(0, 16));
    const rnd = Math.floor(Math.random() * 256);
    const arr = [
      ...this.keyBytes,
      ...timeBytes,
      ...hashBytes.slice(0,16),
      ClientTransaction.ADDITIONAL_RANDOM_NUMBER
    ];
    const xored = arr.map(x => x ^ rnd);
    const outBytes = new Uint8Array([rnd, ...xored]);
    // Convert bytes to base64 string
    let binary = '';
    outBytes.forEach(b => binary += String.fromCharCode(b));
    const base64 = btoa(binary);
    return base64.replace(/=+$/,'');
  }
}