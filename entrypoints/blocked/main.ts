import { BLOCK_MESSAGES, type BlockReason } from '@/lib/policy';

const params = new URLSearchParams(location.search);
const reason = params.get('reason') as BlockReason | null;
const blockedUrl = params.get('url');

const reasonEl = document.querySelector<HTMLElement>('#reason');
const urlEl = document.querySelector<HTMLElement>('#url');

// With no recognised reason there is nothing useful to add, so drop the line
// and let the rule at the bottom of the page do the explaining.
const message = reason ? BLOCK_MESSAGES[reason] : undefined;
if (reasonEl) {
  if (message) reasonEl.textContent = message;
  else reasonEl.remove();
}

if (urlEl && blockedUrl) {
  // Rendered as text, never as a link — a clickable link back to the blocked
  // page would be an escape hatch, and there are none by design.
  urlEl.textContent = blockedUrl;
}
