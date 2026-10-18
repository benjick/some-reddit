# some-reddit

Blocks Reddit unless another site deep-linked you to a specific post.

- Arriving from a link on any other site opens that one page.
- Front pages, subreddit listings, `/r/all` and search never open, no matter where you came from.
- Navigating anywhere else on Reddit — including Reddit's own client-side routing — is blocked again.
- There is no unblock button.

## Installing

### Chrome

```sh
pnpm install
pnpm build
```

Then `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → pick `.output/chrome-mv3`.

This survives restarts. Chrome will warn about developer-mode extensions on startup, and after a rebuild
you have to hit the reload arrow on the extension card. Chrome refuses `.crx` files that did not come from
the Web Store, so loading unpacked is the only way in without publishing.

To get rid of the nag and the manual reloads, publish it to the Chrome Web Store as **Unlisted** — a
one-time developer registration fee and a review, after which `pnpm zip` produces the upload artifact.

### Firefox (desktop)

Firefox will not permanently install an unsigned extension, so this needs a signature from Mozilla. Signing
as **unlisted** means the add-on is signed but not published or discoverable on AMO.

CI does the signing. Every push to `main` is signed by AMO and the result is attached to the rolling
`latest` GitHub release:

```
https://github.com/<owner>/some-reddit/releases/download/latest/some-reddit.xpi
```

In Firefox: **Add-ons and themes** → cog → **Install Add-on From File** → pick the `.xpi`. Opening that URL
in Firefox directly also offers to install it.

One-time setup: create API credentials at https://addons.mozilla.org/developers/addon/api/key/ and add them
to the repo as the secrets `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`.

`about:debugging` → **Load Temporary Add-on** also works without signing, but it is wiped on every restart.

### Firefox for Android

Same signed `.xpi` as desktop. The install entry point is hidden:

1. Download `some-reddit.xpi` from the `latest` release on the phone.
2. **Settings** → **About Firefox** → tap the Firefox logo **five times** to unlock the secret menu.
3. Back in **Settings** → **Install Extension from File** → pick the `.xpi`.

Two requirements the build already satisfies: the add-on needs a fixed id in
`browser_specific_settings.gecko.id`, and it must declare Android compatibility — `gecko_android` in the
manifest plus `.github/amo-metadata.json`. Firefox runs a compatibility check on install and will reject
the file if the listing is desktop-only.

## Development

See [CLAUDE.md](./CLAUDE.md) for architecture and the policy rules. Quick version:

```sh
pnpm dev              # Chrome with HMR and a persistent profile
pnpm dev:firefox      # Firefox desktop
pnpm test             # policy test suite
pnpm compile          # typecheck
```
