import dns from "dns/promises";
import { isIP, type LookupFunction } from "net";
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";

const DEFAULT_SAFE_FETCH_TIMEOUT_MS = 30000;
const DEFAULT_SAFE_FETCH_MAX_REDIRECTS = 5;
const PINNED_AGENT_IDLE_TTL_MS = 10000;

type SafeFetchOptions = RequestInit & {
  allowPrivate?: boolean;
  /** Private network access may be limited to exact, explicitly configured origins. */
  allowedPrivateOrigins?: readonly string[];
  timeoutMs?: number;
  /** Maximum decoded response bytes. Oversized responses are cancelled and rejected. */
  maxResponseBytes?: number;
  maxRedirects?: number;
  // Reject the initial URL and every redirect hop that isn't HTTPS. Set this
  // whenever the request carries a credential (a password, an API key) that
  // must never travel -- or be replayed by a redirect -- over plaintext.
  requireHttps?: boolean;
};

interface SafeFetchTarget {
  address: string;
  family: number;
  hostname: string;
  isHttps: boolean;
}

interface PinnedAgentEntry {
  agent: Agent;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

const pinnedAgents = new Map<string, PinnedAgentEntry>();

function getPinnedAgent(target: SafeFetchTarget): Agent {
  const key = `${target.family}:${target.address}`;
  let entry = pinnedAgents.get(key);

  if (!entry) {
    // The address is freshly validated before this lookup. Keying the dispatcher by
    // address and family allows keep-alive reuse without ever reusing a pool pinned
    // to a different DNS result.
    const pinnedLookup: LookupFunction = (_hostname, _options, callback) => {
      callback(null, [{ address: target.address, family: target.family }]);
    };
    entry = {
      agent: new Agent({ connect: { lookup: pinnedLookup } }),
      idleTimer: null,
    };
    pinnedAgents.set(key, entry);
  }

  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
  }

  entry.idleTimer = setTimeout(() => {
    if (pinnedAgents.get(key) !== entry) return;
    pinnedAgents.delete(key);
    entry.idleTimer = null;
    // close() gracefully lets active responses finish, then releases the idle
    // connection pool. The timer is only a cache eviction; it must not block fetch.
    void entry.agent.close().catch(() => undefined);
  }, PINNED_AGENT_IDLE_TTL_MS);
  entry.idleTimer.unref?.();

  return entry.agent;
}

export function normalizeHostname(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

/** Resolves a hostname after verifying that every returned address is permitted. */
export async function resolveSafeAddress(
  hostname: string,
  allowPrivate = false
): Promise<{ address: string; family: 4 | 6 }> {
  const normalizedHostname = normalizeHostname(hostname);
  const ipVersion = isIP(normalizedHostname);

  if (ipVersion !== 0) {
    if (!isSafeIp(normalizedHostname, allowPrivate)) {
      throw new Error("Invalid or unsafe URL");
    }
    return { address: normalizedHostname, family: ipVersion as 4 | 6 };
  }

  try {
    const addresses = await dns.lookup(normalizedHostname, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new Error("Invalid or unsafe URL");
    }
    for (const { address } of addresses) {
      if (!isSafeIp(address, allowPrivate)) {
        throw new Error("Invalid or unsafe URL");
      }
    }
    const [first] = addresses;
    if (!first) {
      throw new Error("Invalid or unsafe URL");
    }
    return {
      address: first.address,
      family: first.family as 4 | 6,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid or unsafe URL") {
      throw error;
    }
    throw new Error(`Failed to resolve hostname: ${normalizedHostname}`, { cause: error });
  }
}

function buildFetchSignal(
  signal: AbortSignal | null | undefined,
  timeoutMs: number | undefined
): AbortSignal | undefined {
  if (timeoutMs === undefined || timeoutMs <= 0) {
    return signal ?? undefined;
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!signal) {
    return timeoutSignal;
  }

  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([signal, timeoutSignal]);
  }

  return signal;
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function getRedirectOptions(
  fetchOptions: RequestInit,
  status: number,
  previousUrl: URL,
  nextUrl: URL
): RequestInit {
  const method = (fetchOptions.method || "GET").toUpperCase();
  // Per RFC 9110 / the Fetch spec: 301/302 only rewrite POST to GET (a PUT,
  // PATCH, or DELETE keeps its method and body on those statuses), while 303
  // rewrites anything that isn't already GET or HEAD — a 303 to a HEAD
  // request stays HEAD, it doesn't start pulling a response body.
  const shouldSwitchToGet =
    ((status === 301 || status === 302) && method === "POST") ||
    (status === 303 && method !== "GET" && method !== "HEAD");

  const headers = new Headers(fetchOptions.headers ?? {});

  // Match native fetch/undici's cross-origin redirect behavior: never replay
  // credentials against a different origin. Our custom redirect loop below
  // (needed to re-validate each hop against SSRF) bypasses that built-in
  // protection unless we replicate it here — otherwise a malicious or
  // compromised downloader daemon could redirect a request to an
  // attacker-controlled host and walk off with the configured Basic-auth
  // credentials or session cookie.
  if (previousUrl.origin !== nextUrl.origin) {
    headers.delete("authorization");
    headers.delete("cookie");
    headers.delete("proxy-authorization");
  }

  if (!shouldSwitchToGet) {
    return { ...fetchOptions, headers };
  }

  headers.delete("content-length");
  headers.delete("content-type");

  const { body: _body, ...rest } = fetchOptions;
  return {
    ...rest,
    method: "GET",
    headers,
  };
}

/** Resolves and validates the network target used for one safe-fetch request. */
async function resolveSafeFetchTarget(
  url: URL,
  allowPrivate = false,
  allowedPrivateOrigins: readonly string[] = []
): Promise<SafeFetchTarget> {
  const permitPrivate = allowPrivate || allowedPrivateOrigins.includes(url.origin);
  const hostname = normalizeHostname(url.hostname);
  const isHttps = url.protocol === "https:";
  const ipVersion = isIP(hostname);

  if (ipVersion !== 0) {
    if (!isSafeIp(hostname, permitPrivate)) {
      throw new Error("Invalid or unsafe URL");
    }

    return {
      address: hostname,
      family: ipVersion,
      hostname,
      isHttps,
    };
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true });

    if (!addresses || addresses.length === 0) {
      throw new Error("Invalid or unsafe URL");
    }

    for (const { address } of addresses) {
      if (!isSafeIp(address, permitPrivate)) {
        throw new Error("Invalid or unsafe URL");
      }
    }

    const [first] = addresses;
    if (!first) {
      throw new Error("Invalid or unsafe URL");
    }

    return {
      address: first.address,
      family: first.family,
      hostname,
      isHttps,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid or unsafe URL") {
      throw error;
    }
    throw new Error(`Failed to resolve hostname: ${hostname}`, { cause: error });
  }
}

async function fetchValidatedOnce(
  url: URL,
  fetchOptions: RequestInit,
  allowPrivate = false,
  allowedPrivateOrigins: readonly string[] = []
): Promise<Response> {
  const target = await resolveSafeFetchTarget(url, allowPrivate, allowedPrivateOrigins);

  // Keep the original hostname in the URL for virtual hosting and TLS certificate
  // verification, while the cached dispatcher pins the connection to this validated IP.
  const agent = getPinnedAgent(target);

  return undiciFetch(url.toString(), {
    ...fetchOptions,
    dispatcher: agent,
  } as UndiciRequestInit) as unknown as Response;
}

async function enforceResponseByteLimit(response: Response, limit: number): Promise<Response> {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error("maxResponseBytes must be a positive safe integer");
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > limit) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Response exceeds the ${limit}-byte limit`);
  }
  if (!response.body) return response;

  const reader = response.body.getReader();
  let received = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        received += value.byteLength;
        if (received > limit) {
          await reader.cancel();
          controller.error(new Error(`Response exceeds the ${limit}-byte limit`));
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
  const headers = new Headers(response.headers);
  // The body may be transparently decompressed by undici; do not expose the
  // origin's compressed Content-Length as the size of this wrapped stream.
  headers.delete("content-length");
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Validates if a URL is safe to connect to, preventing SSRF attacks against
 * cloud metadata services and other sensitive internal endpoints.
 * When private access is disabled, only exact origins in
 * `allowedPrivateOrigins` may resolve to private addresses.
 *
 * Always blocks (regardless of allowPrivate):
 * - 169.254.0.0/16 (IPv4 Link-Local / Cloud Metadata)
 * - fe80::/10 (IPv6 Link-Local)
 * - fd00:ec2::254 (AWS IPv6 Metadata)
 * - ::ffff:169.254.0.0/16 (IPv4-mapped IPv6 Metadata)
 * - 0.0.0.0/8 (Broadcast)
 *
 * Allowed by default (for self-hosted projects):
 * - Private networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 * - Loopback (127.0.0.0/8, ::1)
 */
export async function isSafeUrl(
  urlStr: string,
  options: { allowPrivate?: boolean; allowedPrivateOrigins?: readonly string[] } = {
    allowPrivate: true,
  }
): Promise<boolean> {
  // Magnet links are not HTTP(S) URLs and do not cause any server-side network connection.
  // They are passed directly to the download client, so they pose no SSRF risk.
  if (urlStr.startsWith("magnet:")) {
    return true;
  }

  let url: URL;
  try {
    // Ensure protocol is http or https
    if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
      // If no protocol, it might be added later by the client, but for validation we assume http to parse
      urlStr = "http://" + urlStr;
    }

    url = new URL(urlStr);
  } catch {
    return false;
  }

  const permitPrivate =
    (options.allowPrivate ?? true) || options.allowedPrivateOrigins?.includes(url.origin) === true;

  let hostname = url.hostname;

  // Handle IPv6 brackets in hostname (e.g. [::1]) which URL.hostname might preserve
  // but isIP and dns.lookup don't always handle correctly.
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    hostname = hostname.slice(1, -1);
  }

  // Check if hostname is an IP
  const ipVersion = isIP(hostname);
  if (ipVersion !== 0) {
    return isSafeIp(hostname, permitPrivate);
  }

  // Resolve hostname
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      return false;
    }
    // Check all resolved addresses to prevent DNS rebinding attacks
    for (const { address } of addresses) {
      if (!isSafeIp(address, permitPrivate)) {
        return false;
      }
    }
    return true;
  } catch {
    // Fail closed when validation cannot prove what the hostname resolves to.
    // A hostname that cannot resolve here cannot be safely fetched here either.
    return false;
  }
}

/**
 * Checks if an IP address is safe to connect to.
 *
 * Always blocks (regardless of allowPrivate):
 * - Link-Local (169.254.0.0/16, fe80::/10, etc.)
 * - Broadcast/Unspecified (0.0.0.0, ::)
 *
 * Allowed by default (allowPrivate=true for self-hosted projects):
 * - Private networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7)
 * - Loopback (127.0.0.0/8, ::1)
 */
export function isSafeIp(ip: string, allowPrivate = true): boolean {
  const normalizedIp = ip.toLowerCase();

  // Normalize every valid IPv4-mapped IPv6 spelling before applying the IPv4
  // policy. Hex groups may be abbreviated (for example ::ffff:7f00:1), and the
  // complete eight-group spelling must receive the same checks too.
  const mappedIpv4 = ipv4FromMappedIpv6(normalizedIp);
  if (mappedIpv4) {
    return isSafeIp(mappedIpv4, allowPrivate);
  }

  const lowerIp = ip.toLowerCase();

  // IPv4 Checks
  if (isIP(ip) === 4) {
    const [p0, p1] = ip.split(".").map(Number);

    // 169.254.0.0/16 (Link-Local / Metadata)
    if (p0 === 169 && p1 === 254) return false;

    // 0.0.0.0/8 (Broadcast)
    if (p0 === 0) return false;

    if (!allowPrivate && isNonPublicIpv4(p0 ?? -1, p1 ?? -1, Number(ip.split(".")[2])))
      return false;

    return true;
  }

  // IPv6 Checks
  if (isIP(ip) === 6) {
    // fe80::/10 (Link-Local)
    if (
      lowerIp.startsWith("fe8") ||
      lowerIp.startsWith("fe9") ||
      lowerIp.startsWith("fea") ||
      lowerIp.startsWith("feb")
    )
      return false;

    // AWS IPv6 Metadata
    if (lowerIp === "fd00:ec2::254") return false;

    if (!allowPrivate && !isGloballyRoutableIpv6(lowerIp)) return false;

    return true;
  }

  return false;
}

function isNonPublicIpv4(first: number, second: number, third: number): boolean {
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function ipv4FromMappedIpv6(ip: string): string | null {
  if (isIP(ip) !== 6) return null;

  let address = ip;
  if (address.includes(".")) {
    const lastColon = address.lastIndexOf(":");
    const dotted = address.slice(lastColon + 1);
    if (isIP(dotted) !== 4) return null;
    const octets = dotted.split(".").map(Number);
    const [a, b, c, d] = octets;
    if (a === undefined || b === undefined || c === undefined || d === undefined) return null;
    const high = ((a << 8) | b).toString(16);
    const low = ((c << 8) | d).toString(16);
    address = `${address.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = address.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0]!.split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1]!.split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  const groups = halves.length === 2 ? [...left, ...Array(missing).fill("0"), ...right] : left;
  if (groups.length !== 8 || groups.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) return null;
  const words = groups.map((part) => Number.parseInt(part, 16));
  if (!words.slice(0, 5).every((word) => word === 0) || words[5] !== 0xffff) return null;

  const high = words[6];
  const low = words[7];
  if (high === undefined || low === undefined) return null;
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function isGloballyRoutableIpv6(ip: string): boolean {
  const groups = parseIpv6Groups(ip);
  if (!groups) return false;

  // Only global-unicast space (2000::/3) is eligible. Reject special-purpose,
  // documentation, and transition ranges even when their first group is public.
  const first = groups[0]!;
  if ((first & 0xe000) !== 0x2000) return false;
  const second = groups[1]!;
  if (first === 0x2001 && (second < 0x0200 || second === 0x0db8)) {
    return false;
  }
  if (first === 0x2002) return false; // 6to4
  return true;
}

function parseIpv6Groups(ip: string): number[] | null {
  let address = ip.toLowerCase();
  if (address.includes(".")) {
    const lastColon = address.lastIndexOf(":");
    const dotted = address.slice(lastColon + 1);
    if (isIP(dotted) !== 4) return null;
    const octets = dotted.split(".").map(Number);
    const [a, b, c, d] = octets;
    if (a === undefined || b === undefined || c === undefined || d === undefined) return null;
    address = `${address.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const halves = address.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0]!.split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1]!.split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = halves.length === 2 ? [...left, ...Array(missing).fill("0"), ...right] : left;
  if (groups.length !== 8 || groups.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return groups.map((part) => Number.parseInt(part, 16));
}

/**
 * True when the hostname is a literal IP address that is not publicly routable:
 * loopback, RFC1918 / ULA private space, or link-local. A DNS name is not
 * classified here and returns false — resolving it is the caller's business.
 */
export function isPrivateNetworkAddress(hostname: string): boolean {
  const normalizedHostname = normalizeHostname(hostname);
  if (isIP(normalizedHostname) === 0) {
    return false;
  }
  // isSafeIp(..., false) answers "is this address reachable from the public
  // internet", so its negation is exactly the private/loopback/link-local set.
  return !isSafeIp(normalizedHostname, false);
}

/**
 * Fetches a URL while validating each request target against SSRF risks and DNS rebinding.
 *
 * Follows redirects when configured, validating every redirect target and applying redirect
 * method and header rules. When `requireHttps` is enabled, rejects the initial URL and every
 * redirect that does not use HTTPS.
 *
 * @param urlStr - The URL to fetch
 * @param options - Request, network-access, timeout, redirect, and HTTPS requirements
 * @returns The validated HTTP response
 * @throws If a target is unsafe, HTTPS is required but unavailable, or the redirect limit is exceeded
 */
export async function safeFetch(urlStr: string, options: SafeFetchOptions = {}): Promise<Response> {
  const {
    allowPrivate = false,
    allowedPrivateOrigins,
    maxRedirects = DEFAULT_SAFE_FETCH_MAX_REDIRECTS,
    maxResponseBytes,
    redirect = "follow",
    requireHttps = false,
    signal,
    timeoutMs = DEFAULT_SAFE_FETCH_TIMEOUT_MS,
    ...fetchOptions
  } = options;

  let currentUrl = new URL(urlStr);
  const builtSignal = buildFetchSignal(signal, timeoutMs);
  let currentOptions: RequestInit = {
    ...fetchOptions,
    ...(builtSignal !== undefined ? { signal: builtSignal } : {}),
  };
  let redirectCount = 0;

  while (true) {
    // Checked on every hop, not just the first: a same-host redirect (301/302/303/307/308)
    // keeps credentials in the request (a query string, an XML-RPC body) and stays within
    // this loop rather than going through a fresh safeFetch call, so the initial check alone
    // wouldn't catch a compromised or MITM'd server redirecting to a plaintext endpoint.
    if (requireHttps && currentUrl.protocol !== "https:") {
      throw new Error(
        `Refusing to send a credential-bearing request over a non-HTTPS connection: ${currentUrl.origin}`
      );
    }

    const response = await fetchValidatedOnce(
      currentUrl,
      {
        ...currentOptions,
        redirect: redirect === "follow" ? "manual" : redirect,
      },
      allowPrivate,
      allowedPrivateOrigins
    );

    if (redirect !== "follow" || !isRedirectStatus(response.status)) {
      return maxResponseBytes === undefined
        ? response
        : enforceResponseByteLimit(response, maxResponseBytes);
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    if (redirectCount >= maxRedirects) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Too many redirects (max ${maxRedirects})`);
    }

    const nextUrl = new URL(location, currentUrl);
    await response.body?.cancel().catch(() => undefined);

    // A 307/308 redirect preserves the request body verbatim, so a credential-bearing
    // request (the NZBGet XML-RPC body, SABnzbd's addfile query string) redirected to a
    // different -- but still HTTPS -- origin would hand it to a host we never validated
    // as the intended target. requireHttps therefore also pins the redirect chain to the
    // origin the caller actually asked for. A scheme downgrade is reported by the
    // protocol check at the top of the loop on the next iteration instead, so this only
    // fires for a same-scheme (HTTPS) host/port change.
    if (requireHttps && nextUrl.protocol === "https:" && nextUrl.origin !== currentUrl.origin) {
      throw new Error(
        `Refusing to redirect a credential-bearing request to a different origin: ${nextUrl.origin}`
      );
    }

    currentOptions = getRedirectOptions(currentOptions, response.status, currentUrl, nextUrl);
    currentUrl = nextUrl;
    redirectCount++;
  }
}
