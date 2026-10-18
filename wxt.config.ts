import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'some-reddit',
    description: 'Blocks Reddit unless you were deep-linked in from another site.',
    permissions: ['webNavigation', 'storage', 'tabs'],
    host_permissions: ['*://*.reddit.com/*', '*://*.redd.it/*'],
    // Required for AMO signing and for `web-ext run -t firefox-android`, which
    // refuses to install an add-on without a stable id.
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'some-reddit@max.dev',
              strict_min_version: '115.0',
              // AMO rejects new add-ons without this. Nothing leaves the browser.
              data_collection_permissions: { required: ['none'] },
            },
            gecko_android: { strict_min_version: '115.0' },
          },
        }
      : {}),
  }),
});
