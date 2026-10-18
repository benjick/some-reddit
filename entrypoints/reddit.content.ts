import type { CheckRequest, CheckResponse } from '@/lib/messages';

/**
 * Runs at document_start and hides the page until the background replies.
 * Redirecting alone cannot outrun the first paint, so without this you get a
 * readable flash of the content you are trying not to read.
 */
export default defineContentScript({
  matches: ['*://*.reddit.com/*', '*://*.redd.it/*'],
  runAt: 'document_start',
  allFrames: false,

  main() {
    const root = document.documentElement;
    if (!root) return;

    root.style.setProperty('visibility', 'hidden', 'important');
    const reveal = () => root.style.removeProperty('visibility');

    // Fail open. A background bug should not leave an unreadable blank page
    // with no way to recover.
    const failOpen = setTimeout(reveal, 3000);

    const request: CheckRequest = {
      type: 'check',
      url: location.href,
      referrer: document.referrer || null,
    };

    browser.runtime
      .sendMessage(request)
      .then((response: CheckResponse | undefined) => {
        clearTimeout(failOpen);
        // When blocked, stay hidden — the background is navigating this tab away.
        if (response?.allowed !== false) reveal();
      })
      .catch(() => {
        clearTimeout(failOpen);
        reveal();
      });
  },
});
