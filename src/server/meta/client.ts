// Cliente mínimo de la Graph API de Meta: paginado, reintentos y control de límites.

export const META_API_VERSION = process.env.META_API_VERSION || 'v23.0';
const BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export class MetaError extends Error {
  constructor(message: string, public code?: number, public subcode?: number, public status?: number) {
    super(message);
  }
  get esLimite() {
    return [4, 17, 32, 613, 80000, 80003, 80004, 80014].includes(this.code ?? -1);
  }
  get esToken() {
    return this.code === 190 || this.code === 102;
  }
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
type Params = Record<string, string | number | boolean | object | undefined>;

export interface MetaClientOpts {
  token: string;
  fetch?: FetchLike;
  esperar?: (ms: number) => Promise<void>;
  maxReintentos?: number;
}

export class MetaClient {
  private token: string;
  private f: FetchLike;
  private esperar: (ms: number) => Promise<void>;
  private maxReintentos: number;

  constructor(o: MetaClientOpts) {
    this.token = o.token;
    this.f = o.fetch ?? ((u, i) => fetch(u, i));
    this.esperar = o.esperar ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxReintentos = o.maxReintentos ?? 4;
  }

  private url(path: string, params: Params = {}) {
    const u = new URL(path.startsWith('http') ? path : `${BASE}/${path.replace(/^\//, '')}`);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      u.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    return u;
  }

  async get<T = any>(path: string, params: Params = {}): Promise<T> {
    const u = this.url(path, params);
    for (let intento = 0; ; intento++) {
      const res = await this.f(u.toString(), { headers: { Authorization: `Bearer ${this.token}` } });
      const body: any = await res.json().catch(() => ({}));
      if (res.ok && !body.error) return body as T;
      const e = body.error || {};
      const err = new MetaError(e.message || `HTTP ${res.status}`, e.code, e.error_subcode, res.status);
      const transitorio = err.esLimite || res.status >= 500 || e.is_transient === true;
      if (!transitorio || intento >= this.maxReintentos) throw err;
      await this.esperar(Math.min(60_000, 2_000 * 2 ** intento));
    }
  }

  /** Recorre todas las páginas de una lista (`data` + `paging.next`). */
  async getAll<T = any>(path: string, params: Params = {}, maxPaginas = 50): Promise<T[]> {
    const out: T[] = [];
    let pagina: any = await this.get(path, params);
    for (let i = 0; i < maxPaginas; i++) {
      out.push(...((pagina.data as T[]) || []));
      const next = pagina.paging?.next;
      if (!next) return out;
      pagina = await this.get(next);
    }
    throw new MetaError(`Más de ${maxPaginas} páginas en ${path}; se cortó para no quedar en bucle.`);
  }
}
