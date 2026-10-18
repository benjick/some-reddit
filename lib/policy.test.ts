import { describe, expect, it } from 'vitest';
import { decide, type NavContext, type Verdict } from './policy';

const GOOGLE = 'https://www.google.com/';
const HN = 'https://news.ycombinator.com/';
const THREAD = 'https://www.reddit.com/r/programming/comments/abc123/some_slug/';

interface Row {
  name: string;
  ctx: NavContext;
  expect: 'allow' | Extract<Verdict, { allow: false }>['reason'];
  /** Asserted only when the row is expected to allow. */
  grantKey?: string | null;
}

const rows: Row[] = [
  // --- Rule 3: the loophole this extension exists to close -----------------
  {
    name: 'google -> homepage is blocked despite a valid referrer',
    ctx: { url: 'https://www.reddit.com/', referrer: GOOGLE },
    expect: 'not-deep-link',
  },
  {
    name: 'google -> subreddit listing is blocked',
    ctx: { url: 'https://www.reddit.com/r/programming/', referrer: GOOGLE },
    expect: 'not-deep-link',
  },
  {
    name: 'google -> subreddit sort page is blocked',
    ctx: { url: 'https://www.reddit.com/r/programming/top/', referrer: GOOGLE },
    expect: 'not-deep-link',
  },
  {
    name: 'google -> /r/all is blocked',
    ctx: { url: 'https://www.reddit.com/r/all', referrer: GOOGLE },
    expect: 'not-deep-link',
  },
  {
    name: 'google -> search results are blocked',
    ctx: { url: 'https://www.reddit.com/search/?q=rust', referrer: GOOGLE },
    expect: 'not-deep-link',
  },
  {
    name: 'google -> bare user profile is blocked',
    ctx: { url: 'https://www.reddit.com/user/someone/', referrer: GOOGLE },
    expect: 'not-deep-link',
  },

  // --- Rule 1: any external origin unlocks a deep link ---------------------
  {
    name: 'google -> thread is allowed',
    ctx: { url: THREAD, referrer: GOOGLE },
    expect: 'allow',
    grantKey: 'thread:abc123',
  },
  {
    name: 'hacker news -> thread is allowed',
    ctx: { url: THREAD, referrer: HN },
    expect: 'allow',
    grantKey: 'thread:abc123',
  },
  {
    name: 'external -> old.reddit thread is allowed',
    ctx: { url: 'https://old.reddit.com/r/programming/comments/abc123/x/', referrer: HN },
    expect: 'allow',
    grantKey: 'thread:abc123',
  },
  {
    name: 'external -> mobile share link is allowed',
    ctx: { url: 'https://www.reddit.com/r/programming/s/Xy7Zq/', referrer: HN },
    expect: 'allow',
    grantKey: 'share:programming/xy7zq',
  },
  {
    name: 'external -> redd.it short link is allowed',
    ctx: { url: 'https://redd.it/abc123', referrer: HN },
    expect: 'allow',
    grantKey: 'shortlink:abc123',
  },
  {
    name: 'external -> wiki page is allowed',
    ctx: { url: 'https://www.reddit.com/r/programming/wiki/index/', referrer: HN },
    expect: 'allow',
    grantKey: 'path:/r/programming/wiki/index',
  },
  {
    name: 'external -> user comment permalink is allowed',
    ctx: { url: 'https://www.reddit.com/user/someone/comments/zzz999/title/', referrer: GOOGLE },
    expect: 'allow',
    grantKey: 'thread:zzz999',
  },

  // --- Manual navigation ---------------------------------------------------
  {
    name: 'typed into the address bar is blocked',
    ctx: { url: THREAD, referrer: null, transitionType: 'typed' },
    expect: 'no-referrer',
  },
  {
    name: 'opened from a bookmark is blocked',
    ctx: { url: THREAD, referrer: null, transitionType: 'auto_bookmark' },
    expect: 'no-referrer',
  },
  {
    name: 'omnibox search is blocked',
    ctx: { url: THREAD, referrer: null, transitionType: 'generated' },
    expect: 'no-referrer',
  },
  {
    name: 'no referrer and no transition info is blocked',
    ctx: { url: THREAD, referrer: null },
    expect: 'no-referrer',
  },
  {
    name: 'link click survives a stripped referrer',
    ctx: { url: THREAD, referrer: null, transitionType: 'link' },
    expect: 'allow',
    grantKey: 'thread:abc123',
  },

  // --- Rule 2: one grant, one page ----------------------------------------
  {
    name: 'reddit -> another thread is blocked',
    ctx: { url: 'https://www.reddit.com/r/rust/comments/def456/x/', referrer: THREAD },
    expect: 'internal-referrer',
  },
  {
    name: 'client-side route to another thread is blocked',
    ctx: {
      url: 'https://www.reddit.com/r/rust/comments/def456/x/',
      grantKey: 'thread:abc123',
      isSpaNavigation: true,
    },
    expect: 'left-granted-page',
  },
  {
    name: 'client-side route to the feed is blocked',
    ctx: { url: 'https://www.reddit.com/', grantKey: 'thread:abc123', isSpaNavigation: true },
    expect: 'left-granted-page',
  },
  {
    name: 'in-thread comment permalink stays allowed',
    ctx: {
      url: 'https://www.reddit.com/r/programming/comments/abc123/some_slug/c0mm3nt/',
      grantKey: 'thread:abc123',
      isSpaNavigation: true,
    },
    expect: 'allow',
    grantKey: 'thread:abc123',
  },
  {
    name: '?context= link on the granted thread stays allowed',
    ctx: { url: `${THREAD}?context=3`, grantKey: 'thread:abc123' },
    expect: 'allow',
    grantKey: 'thread:abc123',
  },
  {
    name: 'reloading the granted thread stays allowed',
    ctx: { url: THREAD, referrer: null, transitionType: 'reload', grantKey: 'thread:abc123' },
    expect: 'allow',
    grantKey: 'thread:abc123',
  },
  {
    name: 'a grant for one thread does not unlock another on full load',
    ctx: {
      url: 'https://www.reddit.com/r/rust/comments/def456/x/',
      referrer: null,
      transitionType: 'typed',
      grantKey: 'thread:abc123',
    },
    expect: 'no-referrer',
  },

  // --- Always-allowed surfaces --------------------------------------------
  {
    name: 'non-reddit pages are untouched',
    ctx: { url: 'https://example.com/whatever', referrer: null },
    expect: 'allow',
  },
  {
    name: 'direct media is allowed',
    ctx: { url: 'https://i.redd.it/abc.jpg', referrer: null },
    expect: 'allow',
  },
  {
    name: 'login is allowed so the browser stays usable',
    ctx: { url: 'https://www.reddit.com/login/', referrer: null },
    expect: 'allow',
  },
];

describe('decide', () => {
  it.each(rows)('$name', (row) => {
    const verdict = decide(row.ctx);
    if (row.expect === 'allow') {
      expect(verdict).toMatchObject({ allow: true });
      if ('grantKey' in row) {
        expect((verdict as Extract<Verdict, { allow: true }>).grantKey).toBe(row.grantKey);
      }
    } else {
      expect(verdict).toEqual({ allow: false, reason: row.expect });
    }
  });
});
