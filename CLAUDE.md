# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser extension that blocks Reddit unless you arrived at a specific piece of content from a link on
another site. The goal is to kill aimless Reddit browsing while keeping Reddit usable as a destination
when something legitimately links there.

Built with [WXT](https://wxt.dev). Targets Chrome (MV3), Firefox desktop (MV2), and **Firefox for
Android**. Android is a hard requirement and it constrains the architecture more than anything else here.

## The policy

These four rules are the product. All code exists to serve them; they were chosen deliberately and should
not be softened without asking.

1. **Any external origin counts as a valid referrer.** Google, HN, Twitter, Discord, a blog — all equal.
   The thing being blocked is aimless browsing, not arrival-by-link.
2. **A valid referral grants exactly one page.** Navigating anywhere else on Reddit — including
   client-side SPA routing — is blocked immediately. There is no session, no timer, no subreddit-wide pass.
3. **Deep links only.** Only links to specific content unlock. The homepage, subreddit listings, `/r/all`,
   `/popular`, and search are blocked *regardless of referrer*. This closes the "google the word reddit and
   click the first result" loophole, which is the specific bypass this extension exists to prevent.
4. **No escape hatch.** No override button, no unblock timer, no options-page toggle. Blocked is blocked;
   the only ways in are a real inbound link or disabling the extension.

### Two deliberate deviations

Both are narrow, both are load-bearing, and both are the first things to revisit if the extension feels
wrong in daily use:

- **Threads grant by thread id, not by exact URL.** Otherwise `?context=3` links and in-thread comment
  permalinks would re-block you inside a thread you were legitimately let into. Other threads stay blocked.
- **`/login` and `/oauth2` are always allowed** (`kind: 'account'` in `lib/urls.ts`). Being unable to log
  in breaks the browser rather than breaking browsing, which is not what rule 4 is for.

## Architecture

### Enforcement is `webNavigation` in the background, not `declarativeNetRequest`

DNR is the wrong tool here for two independent reasons, and both matter:

- The verdict depends on **cross-request state** (does this tab hold a grant, and for which URL?). DNR
  rules are static matchers and cannot express that.
- DNR coverage is uneven across the targets, Firefox for Android especially. The `webNavigation` path
  behaves the same on all three, so there is one code path to reason about and test.

Do not reach for DNR as an optimization without a concrete, measured reason.

### Two decision paths

**Full page loads** are decided by the content script asking the background. The content script is the only
place `document.referrer` is available, and it is the only thing that can hide the page while the verdict
is pending — `tabs.update` alone cannot outrun the first paint, so without it you get a readable flash of
the content you are trying not to read. It fails open after 3s so a background bug cannot leave a
permanently blank page.

**Client-side navigation** is decided entirely in the background, via
`webNavigation.onHistoryStateUpdated` and `onReferenceFragmentUpdated`. Reddit routes via the History API,
so **these two handlers are what make rule 2 enforceable**. Without them, one valid link unlocks unlimited
clicking and the extension is decorative. This is the single most important part of the codebase.

`webNavigation.onCommitted` does not decide anything. It stashes `transitionType` for the content script's
verdict and drops the grant when a tab leaves Reddit.

### Determining the referrer

Resolved in priority order, because referrer information is unreliable:

1. `document.referrer`, reported by the content script.
2. `transitionType` from `onCommitted`, for sites sending `Referrer-Policy: no-referrer`. Only `link`
   counts as proof of a click; `typed`, `generated`, `keyword` and `auto_bookmark` are manual navigation.

Most sites now send origin-only referrers (`https://www.google.com/`), which is fine — only the origin is
ever needed. There is deliberately **no `webRequest` usage**: reading the `Referer` header would require
the `webRequest` permission plus Chrome-only `extraHeaders` handling, for a case the two signals above
already cover.

Known edge case: `pendingTransition` is an in-memory `Map`, so if the MV3 service worker is killed between
`onCommitted` and the content script's message, the transition hint is lost and a no-referrer link click
gets blocked. Rare, and it fails closed, which is the right direction.

### Grant storage is the main correctness trap

Grants live in a `Map` keyed by tab id, **mirrored to `storage.session`**. Chrome MV3 service workers are
terminated aggressively and Firefox event pages unload too; an in-memory-only map silently loses grants
mid-session and blocks a page the user legitimately unlocked. `lib/grants.ts` falls back to
`storage.local` because `storage.session` is missing on older Firefox for Android builds.

## Layout

```
entrypoints/background.ts       navigation handlers, grant lifecycle, verdict dispatch
entrypoints/reddit.content.ts   document_start; hides page, reports document.referrer
entrypoints/blocked/            the block page — the extension's entire UI
lib/policy.ts                   decide() — the verdict function
lib/urls.ts                     classify() — host/path classification and grant keys
lib/grants.ts                   per-tab grants + storage mirroring
lib/messages.ts                 content script <-> background message types
```

**`lib/policy.ts` and `lib/urls.ts` are pure and must stay that way** — no `browser.*`, no I/O. All the
interesting logic lives there so it can be tested without a browser. `background.ts` is thin plumbing
around them; resist putting policy decisions in it.

### URL classification

`classify()` in `lib/urls.ts` maps a URL to a `UrlKind` and a grant key. Deep-linkable kinds are `thread`,
`share` (`/r/{sub}/s/{id}` mobile share links), `wiki`, and `shortlink` (`redd.it/{id}`). Always-allowed
kinds are `external`, `media`, and `account`. Everything else — `listing`, `search`, `other` — is blocked
regardless of referrer.

Subdomains (`old.`, `new.`, `np.`, `sh.`, `amp.`, `www.`) collapse onto the same key, so a grant issued on
`www.reddit.com` still holds on `old.reddit.com`.

## Commands

```sh
pnpm install          # runs `wxt prepare` via postinstall, which generates .wxt/
pnpm dev              # Chrome, HMR
pnpm dev:firefox      # Firefox desktop
pnpm test             # vitest run
pnpm compile          # tsc --noEmit (also typechecks wxt/web-ext/vitest configs)
pnpm build            # -> .output/chrome-mv3
pnpm build:firefox    # -> .output/firefox-mv2
pnpm zip              # packaged artifact for store upload
pnpm zip:firefox      # includes source, required for AMO review
```

If typecheck or tests fail with `failed to resolve "extends":"./.wxt/tsconfig.json"`, run `pnpm wxt
prepare` — the generated `.wxt/` directory is gitignored and missing on fresh clones.

Single tests:

```sh
pnpm vitest run lib/policy.test.ts
pnpm vitest run -t "google -> homepage is blocked"
```

### Dev browser profiles

`web-ext.config.ts` persists the dev browser profile to `.wxt/chrome-data` / `.wxt/firefox-data` with
`keepProfileChanges`, so `pnpm dev` keeps your Reddit login and browser tweaks between restarts. Same
convention as `../github-pr-titles`. These directories survive `wxt prepare` and `wxt build`.

Two details specific to this setup:

- Chrome creates `--user-data-dir` on demand, but Firefox does not, and **WXT 0.21 removed web-ext's
  `profileCreateIfMissing` option** — passing it is now a type error. That is why `dev:firefox` runs
  `mkdir -p .wxt/firefox-data` first. If you copy a `web-ext.config.ts` from an older WXT project, delete
  that option.
- `startUrls` opens a Google search for Reddit threads, which exercises both halves of the policy from one
  page: the thread results should open, the plain `reddit.com` result should not.

`web-ext.config.ts` is gitignored by the WXT template, so it does not survive a fresh clone. If you want
the profile setup version-controlled, move it into the `webExt` key of `wxt.config.ts` instead.

### Firefox for Android dev

`pnpm dev:firefox` runs desktop Firefox and does **not** exercise Android. Android needs a real device:

```sh
pnpm build:firefox
pnpm run:android      # web-ext run -t firefox-android, add --adb-device <id>
```

Requires an adb-connected device running Firefox Nightly. Verify Android separately before believing a fix
works.

Android has no toolbar popup and no prominent options surface, which is why **the block page is the entire
UI**. Any affordance that only exists in a popup or options page effectively does not exist on the primary
target.

## Distribution

End-user install steps live in [README.md](./README.md). What matters when changing code:

- **Chrome** is load-unpacked only; Chrome rejects `.crx` files that did not come from the Web Store. No
  signing step, so nothing in the build constrains it.
- **Firefox desktop and Android both require an AMO signature**, even for private use. Unlisted signing
  produces a signed `.xpi` without a public listing.
- Two manifest details are load-bearing for Android and must not be dropped from `wxt.config.ts`:
  `browser_specific_settings.gecko.id` (a fixed id, without which it cannot be installed from a file at
  all) and `gecko_android`, which with `.github/amo-metadata.json` marks the AMO version Android-compatible.
  Firefox runs a compatibility check on install and rejects a desktop-only listing.
  `gecko.data_collection_permissions` is also required: AMO rejects new add-ons without it.
- `.github/workflows/ci.yml` signs every push to `main` with `web-ext sign --channel unlisted` and replaces
  the assets on the rolling `latest` GitHub release, realmdo-style. AMO refuses to sign a version twice, so
  CI overwrites the patch number with the run number; `package.json` only controls major.minor.
- AMO requires the sources zip alongside the build because the output is bundled; `wxt zip -b firefox`
  emits both, and CI uploads it with `--upload-source-code`.

### First release setup

Not done yet:

1. Create AMO API credentials at https://addons.mozilla.org/developers/addon/api/key/ and add them as the
   repo secrets `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`.
2. Create the GitHub repo, commit and push.
3. Watch the first CI run — the signing path has never been exercised. If AMO rejects it because the
   add-on id does not exist yet, upload one build by hand on AMO as unlisted; every push after that is
   signed by CI.

Then Mac and Android both install from `releases/download/latest/some-reddit.xpi`. Delete this section
once the first signed release exists.

## Testing

Vitest with `WxtVitest`, which polyfills the extension APIs. Use `fakeBrowser` from
`wxt/testing/fake-browser` for anything touching `browser.*`, and call `fakeBrowser.reset()` in
`beforeEach` — its state persists across tests otherwise.

`lib/policy.test.ts` is the suite that matters: a table mapping
`(url, referrer, transitionType, existing grant, isSpaNavigation)` to an expected verdict. **Every bypass
discovered in real use should become a row in that table before it is fixed.** The rows are grouped by
which policy rule they defend, so a new case should go in the group it belongs to.

Entrypoint files are imported into a plain Node environment during tests, where `browser` is not fully
available. Only touch `browser.*` inside an entrypoint's main function — a WXT requirement, not a style
preference.
