import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { clearGrant, getGrant, resetGrantCache, setGrant } from './grants';

describe('grants', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    resetGrantCache();
  });

  it('round-trips a grant', async () => {
    await setGrant(1, 'thread:abc', 'https://www.reddit.com/r/x/comments/abc/t/');
    expect(await getGrant(1)).toMatchObject({ key: 'thread:abc' });
  });

  it('keeps grants per tab', async () => {
    await setGrant(1, 'thread:abc', 'a');
    await setGrant(2, 'thread:def', 'b');
    expect((await getGrant(1))?.key).toBe('thread:abc');
    expect((await getGrant(2))?.key).toBe('thread:def');
  });

  it('survives the background worker unloading', async () => {
    await setGrant(1, 'thread:abc', 'a');
    resetGrantCache(); // simulates the service worker being terminated
    expect((await getGrant(1))?.key).toBe('thread:abc');
  });

  it('clears a grant', async () => {
    await setGrant(1, 'thread:abc', 'a');
    await clearGrant(1);
    expect(await getGrant(1)).toBeNull();
  });

  it('returns null for a tab with no grant', async () => {
    expect(await getGrant(99)).toBeNull();
  });
});
