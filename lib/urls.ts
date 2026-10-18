/**
 * Pure URL classification. No `browser.*` access — this file must stay testable
 * in plain Node. See CLAUDE.md for the policy these rules implement.
 */

export type UrlKind =
  /** A specific comment thread. Deep-linkable. */
  | 'thread'
  /** A `/r/{sub}/s/{id}` mobile share link, which redirects to a thread. Deep-linkable. */
  | 'share'
  /** A wiki page. Deep-linkable. */
  | 'wiki'
  /** A `redd.it/{id}` short link, which redirects to a thread. Deep-linkable. */
  | 'shortlink'
  /** Direct media on i/v/preview.redd.it. Never a browsing surface — always allowed. */
  | 'media'
  /** Login and OAuth. Always allowed; blocking it would break the browser, not browsing. */
  | 'account'
  /** Home, subreddit listings, /r/all, /popular, sort pages, profiles. Never allowed. */
  | 'listing'
  /** Search. Never allowed. */
  | 'search'
  /** Anything else on a Reddit host. Never allowed. */
  | 'other'
  /** Not a Reddit host at all. */
  | 'external';

export interface Classification {
  kind: UrlKind;
  /**
   * Identity used to compare a navigation against a tab's grant. Threads key on
   * the thread id, so in-thread permalinks and `?context=3` resolve without
   * re-blocking; everything else keys on the normalized path. Null when the URL
   * is not something a grant can be held for.
   */
  key: string | null;
  host: string;
  path: string;
}

const DEEP_KINDS: ReadonlySet<UrlKind> = new Set(['thread', 'share', 'wiki', 'shortlink']);
const ALWAYS_ALLOWED_KINDS: ReadonlySet<UrlKind> = new Set(['external', 'media', 'account']);

/** Root paths that are listings rather than content. */
const ROOT_LISTINGS = new Set([
  '', 'best', 'hot', 'new', 'top', 'rising', 'controversial',
  'popular', 'all', 'subreddits', 'users', 'explore',
]);

const SORTS = new Set(['hot', 'new', 'top', 'rising', 'best', 'controversial', 'gilded']);

export function isDeepLink(kind: UrlKind): boolean {
  return DEEP_KINDS.has(kind);
}

export function isAlwaysAllowed(kind: UrlKind): boolean {
  return ALWAYS_ALLOWED_KINDS.has(kind);
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

/** Reddit serves the same content under old./new./np./sh./amp. — collapse them. */
function baseDomain(host: string): string {
  const parts = host.split('.');
  return parts.length <= 2 ? host : parts.slice(-2).join('.');
}

function splitPath(pathname: string): string[] {
  return pathname.split('/').filter(Boolean).map((s) => s.toLowerCase());
}

function normalizedPath(segments: string[]): string {
  return '/' + segments.join('/');
}

export function classify(rawUrl: string): Classification {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: 'external', key: null, host: '', path: '' };
  }

  const host = normalizeHost(url.hostname);
  const domain = baseDomain(host);
  const segments = splitPath(url.pathname);
  const path = normalizedPath(segments);

  if (domain !== 'reddit.com' && domain !== 'redd.it') {
    return { kind: 'external', key: null, host, path };
  }

  // Media subdomains: i.redd.it, v.redd.it, preview.redd.it.
  if (domain === 'redd.it' && host !== 'redd.it') {
    return { kind: 'media', key: null, host, path };
  }

  // redd.it/{id} short links redirect to a thread.
  if (domain === 'redd.it') {
    return segments.length === 1
      ? { kind: 'shortlink', key: `shortlink:${segments[0]}`, host, path }
      : { kind: 'other', key: `path:${path}`, host, path };
  }

  const [first, second, third, fourth] = segments;

  if (first === 'login' || first === 'api' || first === 'oauth2') {
    return { kind: 'account', key: null, host, path };
  }

  if (first === 'media') {
    return { kind: 'media', key: null, host, path };
  }

  if (segments.length <= 1 && ROOT_LISTINGS.has(first ?? '')) {
    return { kind: 'listing', key: `path:${path}`, host, path };
  }

  // /comments/{id}
  if (first === 'comments' && second) {
    return { kind: 'thread', key: `thread:${second}`, host, path };
  }

  if (first === 'r' && second) {
    // /r/{sub}/comments/{id}[/{slug}[/{commentId}]]
    if (third === 'comments' && fourth) {
      return { kind: 'thread', key: `thread:${fourth}`, host, path };
    }
    // /r/{sub}/s/{shareId} — mobile share links; no thread id until it redirects.
    if (third === 's' && fourth) {
      return { kind: 'share', key: `share:${second}/${fourth}`, host, path };
    }
    if (third === 'wiki') {
      return { kind: 'wiki', key: `path:${path}`, host, path };
    }
    if (third === 'search') {
      return { kind: 'search', key: `path:${path}`, host, path };
    }
    // /r/{sub} and /r/{sub}/{sort} are listings.
    if (!third || SORTS.has(third)) {
      return { kind: 'listing', key: `path:${path}`, host, path };
    }
    return { kind: 'other', key: `path:${path}`, host, path };
  }

  if (first === 'user' || first === 'u') {
    // /user/{name}/comments/{id} is a thread; a bare profile is a listing.
    if (third === 'comments' && fourth) {
      return { kind: 'thread', key: `thread:${fourth}`, host, path };
    }
    return { kind: 'listing', key: `path:${path}`, host, path };
  }

  if (first === 'search') {
    return { kind: 'search', key: `path:${path}`, host, path };
  }

  return { kind: 'other', key: `path:${path}`, host, path };
}

/** True when the referrer is absent, unparseable, or itself a Reddit page. */
export function isExternalReferrer(referrer: string | null | undefined): boolean {
  if (!referrer) return false;
  const { kind } = classify(referrer);
  return kind === 'external';
}
