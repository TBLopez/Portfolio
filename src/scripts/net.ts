/**
 * Real network recon for the terminal — no API keys, no backend.
 *
 *   dig   → DNS-over-HTTPS (Cloudflare, falling back to Google). JSON API,
 *           CORS-enabled, answers come from a real resolver.
 *   whois → RDAP (rdap.org bootstrap), which is the modern whois. Domains and
 *           IP/CIDR allocations.
 *   nmap  → resolves the target for real, then prints a *simulated* port
 *           table derived from the resolved address.
 *
 * Requests go straight from the visitor's browser to those public services.
 * Nothing is proxied through the site, and nothing is logged.
 */

export type DohAnswer = { name: string; type: number; TTL: number; data: string };

export type DohResult = {
  status: number;
  answers: DohAnswer[];
  authority: DohAnswer[];
  resolver: string;
  ms: number;
};

export type RdapSummary = {
  kind: 'domain' | 'ip';
  name: string;
  handle?: string;
  registrar?: string;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  status: string[];
  nameservers: string[];
  dnssec?: string;
  network?: string;
  country?: string;
  ms: number;
};

const DNS_TYPES: Record<string, number> = {
  A: 1,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  PTR: 12,
  MX: 15,
  TXT: 16,
  AAAA: 28,
  SRV: 33,
  DS: 43,
  HTTPS: 65,
  CAA: 257,
};

const TYPE_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(DNS_TYPES).map(([name, code]) => [code, name]),
);

const DNS_STATUS: Record<number, string> = {
  0: 'NOERROR',
  1: 'FORMERR',
  2: 'SERVFAIL',
  3: 'NXDOMAIN',
  4: 'NOTIMP',
  5: 'REFUSED',
};

export function dnsTypeName(code: number): string {
  return TYPE_NAMES[code] ?? `TYPE${code}`;
}

export function dnsTypeCode(name: string): number | undefined {
  return DNS_TYPES[name.toUpperCase()];
}

export function dnsStatusName(code: number): string {
  return DNS_STATUS[code] ?? `RCODE${code}`;
}

export const DNS_TYPE_LIST = Object.keys(DNS_TYPES).join(' ');

/** AbortSignal that also honours an outer abort. */
function withTimeout(ms: number, outer?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('query timed out')), ms);
  const relay = () => controller.abort(outer?.reason);
  if (outer) {
    if (outer.aborted) relay();
    else outer.addEventListener('abort', relay, { once: true });
  }
  return {
    signal: controller.signal,
    release: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', relay);
    },
  };
}

const DOH_ENDPOINTS = [
  { url: 'https://cloudflare-dns.com/dns-query', resolver: 'cloudflare-dns.com (DoH)' },
  { url: 'https://dns.google/resolve', resolver: 'dns.google (DoH)' },
];

/** One DNS question against the first resolver that answers. */
export async function dohQuery(
  name: string,
  type: string,
  outer?: AbortSignal,
): Promise<DohResult> {
  let lastError: unknown = null;
  for (const endpoint of DOH_ENDPOINTS) {
    const { signal, release } = withTimeout(8000, outer);
    const started = performance.now();
    try {
      const url = `${endpoint.url}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}&cd=0`;
      const res = await fetch(url, { headers: { accept: 'application/dns-json' }, signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        Status?: number;
        Answer?: DohAnswer[];
        Authority?: DohAnswer[];
      };
      return {
        status: json.Status ?? 0,
        answers: json.Answer ?? [],
        authority: json.Authority ?? [],
        resolver: endpoint.resolver,
        ms: Math.round(performance.now() - started),
      };
    } catch (error) {
      lastError = error;
    } finally {
      release();
    }
  }
  throw lastError instanceof Error ? lastError : new Error('resolver unreachable');
}

/** Resolve a hostname to its first A record, or null. */
export async function resolveA(
  host: string,
  outer?: AbortSignal,
): Promise<string | null> {
  try {
    const result = await dohQuery(host, 'A', outer);
    const a = result.answers.find((r) => r.type === 1);
    return a ? a.data : null;
  } catch {
    return null;
  }
}

export function isIpLiteral(value: string): boolean {
  return (
    /^\d{1,3}(\.\d{1,3}){3}$/.test(value) || /^[0-9a-f:]{3,}$/i.test(value) && value.includes(':')
  );
}

const EVENT_LABELS: Record<string, 'createdAt' | 'updatedAt' | 'expiresAt'> = {
  registration: 'createdAt',
  'last changed': 'updatedAt',
  expiration: 'expiresAt',
};

function pickVcardName(entity: any): string | undefined {
  const vcard = entity?.vcardArray?.[1];
  if (!Array.isArray(vcard)) return undefined;
  const fn = vcard.find((row: unknown) => Array.isArray(row) && row[0] === 'fn');
  return Array.isArray(fn) && typeof fn[3] === 'string' ? fn[3] : undefined;
}

/** RDAP: the modern whois. Handles domains and IP allocations. */
export async function rdapLookup(query: string, outer?: AbortSignal): Promise<RdapSummary> {
  const ip = isIpLiteral(query);
  const path = ip ? `ip/${encodeURIComponent(query)}` : `domain/${encodeURIComponent(query)}`;
  const { signal, release } = withTimeout(9000, outer);
  const started = performance.now();
  try {
    const res = await fetch(`https://rdap.org/${path}`, {
      headers: { accept: 'application/rdap+json' },
      signal,
    });
    if (res.status === 404) throw new Error('not found in any RDAP registry');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();

    const summary: RdapSummary = {
      kind: ip ? 'ip' : 'domain',
      name: json.ldhName ?? json.unicodeName ?? json.handle ?? query,
      handle: json.handle,
      status: Array.isArray(json.status) ? json.status : [],
      nameservers: Array.isArray(json.nameservers)
        ? json.nameservers.map((ns: any) => ns.ldhName ?? ns.unicodeName).filter(Boolean)
        : [],
      dnssec: json.secureDNS?.delegationSigned ? 'signedDelegation' : 'unsigned',
      ms: Math.round(performance.now() - started),
    };

    for (const event of json.events ?? []) {
      const key = EVENT_LABELS[String(event.eventAction)];
      if (key && !summary[key]) summary[key] = String(event.eventDate).slice(0, 10);
    }

    for (const entity of json.entities ?? []) {
      const roles: string[] = entity.roles ?? [];
      if (roles.includes('registrar')) {
        summary.registrar = pickVcardName(entity) ?? entity.handle;
      }
    }

    if (ip) {
      const cidr = json.cidr0_cidrs?.[0];
      summary.network = cidr ? `${cidr.v4prefix ?? cidr.v6prefix}/${cidr.length}` : json.handle;
      summary.name = json.name ?? json.handle ?? query;
      summary.country = json.country;
      summary.registrar = json.entities?.length ? 'regional internet registry' : undefined;
    }

    return summary;
  } finally {
    release();
  }
}

/**
 * Deterministic pseudo port state so the same host always reports the same
 * "scan" — random results on every run read as fake immediately.
 */
export function portState(ip: string, port: number): 'open' | 'filtered' | 'closed' {
  let hash = 2166136261;
  const seed = `${ip}:${port}`;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const bucket = (hash >>> 0) % 100;
  if (bucket < 14) return 'open';
  if (bucket < 46) return 'filtered';
  return 'closed';
}
