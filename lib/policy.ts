/**
 * The verdict function. Pure — no `browser.*` access, no I/O.
 *
 * Every bypass found in real use should become a row in policy.test.ts before
 * it is fixed here.
 */

import { classify, isAlwaysAllowed, isDeepLink, isExternalReferrer } from './urls';

export type BlockReason =
  /** Homepage, listing, search — blocked no matter where you came from (policy rule 3). */
  | 'not-deep-link'
  /** Client-side route change away from the granted page (policy rule 2). */
  | 'left-granted-page'
  /** Followed a link from Reddit to Reddit. */
  | 'internal-referrer'
  /** Typed, bookmarked, or otherwise arrived with no evidence of an inbound link. */
  | 'no-referrer';

export type Verdict =
  | { allow: true; grantKey: string | null }
  | { allow: false; reason: BlockReason };

export interface NavContext {
  url: string;
  /** `document.referrer`, or null when stripped by Referrer-Policy. */
  referrer?: string | null;
  /** `transitionType` from webNavigation.onCommitted, when known. */
  transitionType?: string | null;
  /** The grant key this tab currently holds, if any. */
  grantKey?: string | null;
  /** True for onHistoryStateUpdated / onReferenceFragmentUpdated. */
  isSpaNavigation?: boolean;
}

/**
 * Transitions that prove a click happened. Chrome reports 'link'; Firefox also
 * uses 'auto_subframe' and 'form_submit' for navigations we can trust less, so
 * only 'link' counts.
 */
const CLICK_TRANSITIONS = new Set(['link']);

export function decide(ctx: NavContext): Verdict {
  const { kind, key } = classify(ctx.url);

  // Not Reddit, or a surface that was never about browsing (media, login).
  if (isAlwaysAllowed(kind)) {
    return { allow: true, grantKey: ctx.grantKey ?? null };
  }

  // Reloads, in-thread permalinks and ?context= links resolve to the same key
  // as the page the grant was issued for.
  if (ctx.grantKey && key === ctx.grantKey) {
    return { allow: true, grantKey: ctx.grantKey };
  }

  // Rule 2: a grant buys one page. Client-side routing anywhere else is the
  // bypass this extension exists to close.
  if (ctx.isSpaNavigation) {
    return { allow: false, reason: 'left-granted-page' };
  }

  // Rule 3: listings are blocked regardless of referrer, so googling the word
  // "reddit" and clicking the first result is not a way in.
  if (!isDeepLink(kind)) {
    return { allow: false, reason: 'not-deep-link' };
  }

  // Rule 1: any external origin counts.
  if (isExternalReferrer(ctx.referrer)) {
    return { allow: true, grantKey: key };
  }

  if (ctx.referrer) {
    return { allow: false, reason: 'internal-referrer' };
  }

  // No referrer at all. A 'link' transition still proves a click, which covers
  // sites sending Referrer-Policy: no-referrer. Anything else — typed,
  // generated, auto_bookmark, keyword, or unknown — is manual navigation.
  if (ctx.transitionType && CLICK_TRANSITIONS.has(ctx.transitionType)) {
    return { allow: true, grantKey: key };
  }

  return { allow: false, reason: 'no-referrer' };
}

export const BLOCK_MESSAGES: Record<BlockReason, string> = {
  'not-deep-link': 'This is a listing page rather than a specific post.',
  'left-granted-page': 'Your link opened a different page than this one.',
  'internal-referrer': 'This link came from another Reddit page.',
  'no-referrer': 'This was opened directly, not from a link somewhere else.',
};
