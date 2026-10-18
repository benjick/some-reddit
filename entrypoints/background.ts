import { decide, type BlockReason } from '@/lib/policy';
import { classify } from '@/lib/urls';
import { clearGrant, getGrant, setGrant } from '@/lib/grants';
import type { CheckRequest, CheckResponse } from '@/lib/messages';

/**
 * Enforcement lives here rather than in declarativeNetRequest: the verdict
 * depends on per-tab grant state that static rules cannot express, and the
 * webNavigation path behaves identically on Chrome, Firefox and Firefox for
 * Android. See CLAUDE.md.
 */
export default defineBackground(() => {
  /**
   * transitionType from onCommitted, stashed until the content script asks for
   * a verdict a few milliseconds later. Only used as a fallback for sites that
   * strip the referrer entirely.
   */
  const pendingTransition = new Map<number, string>();

  function blockPageUrl(reason: BlockReason, blockedUrl: string): string {
    const params = new URLSearchParams({ reason, url: blockedUrl });
    return browser.runtime.getURL(`/blocked.html?${params.toString()}`);
  }

  async function block(tabId: number, reason: BlockReason, blockedUrl: string) {
    await clearGrant(tabId);
    try {
      await browser.tabs.update(tabId, { url: blockPageUrl(reason, blockedUrl) });
    } catch {
      // Tab closed mid-navigation.
    }
  }

  // --- Full page loads -----------------------------------------------------
  // The content script asks for the verdict, because it is the only place
  // document.referrer is available and it can hide the page while we decide.

  browser.runtime.onMessage.addListener((message: CheckRequest, sender, sendResponse) => {
    if (message?.type !== 'check') return;
    const tabId = sender.tab?.id;
    if (tabId == null) return;

    (async () => {
      const grant = await getGrant(tabId);
      const verdict = decide({
        url: message.url,
        referrer: message.referrer,
        transitionType: pendingTransition.get(tabId) ?? null,
        grantKey: grant?.key ?? null,
      });
      pendingTransition.delete(tabId);

      if (verdict.allow) {
        if (verdict.grantKey) await setGrant(tabId, verdict.grantKey, message.url);
        sendResponse({ allowed: true } satisfies CheckResponse);
      } else {
        sendResponse({ allowed: false } satisfies CheckResponse);
        await block(tabId, verdict.reason, message.url);
      }
    })();

    return true; // keep the message channel open for the async response
  });

  browser.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;
    pendingTransition.set(details.tabId, details.transitionType);
    // Leaving Reddit entirely drops the grant, so coming back later needs a
    // fresh inbound link.
    if (classify(details.url).kind === 'external') void clearGrant(details.tabId);
  });

  // --- Client-side navigation ---------------------------------------------
  // Reddit routes via the History API. Without these two handlers the whole
  // policy collapses: one valid link would unlock unlimited clicking.

  async function handleSpaNavigation(details: { tabId: number; frameId: number; url: string }) {
    if (details.frameId !== 0) return;
    const grant = await getGrant(details.tabId);
    const verdict = decide({
      url: details.url,
      grantKey: grant?.key ?? null,
      isSpaNavigation: true,
    });
    if (!verdict.allow) await block(details.tabId, verdict.reason, details.url);
  }

  browser.webNavigation.onHistoryStateUpdated.addListener(handleSpaNavigation);
  browser.webNavigation.onReferenceFragmentUpdated.addListener(handleSpaNavigation);

  browser.tabs.onRemoved.addListener((tabId) => {
    pendingTransition.delete(tabId);
    void clearGrant(tabId);
  });
});
