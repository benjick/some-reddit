import { describe, expect, it } from 'vitest';
import { classify, isExternalReferrer } from './urls';

describe('classify', () => {
  it.each([
    ['https://www.reddit.com/', 'listing'],
    ['https://reddit.com', 'listing'],
    ['https://www.reddit.com/popular', 'listing'],
    ['https://www.reddit.com/r/rust', 'listing'],
    ['https://www.reddit.com/r/rust/new/', 'listing'],
    ['https://www.reddit.com/user/someone', 'listing'],
    ['https://www.reddit.com/search?q=x', 'search'],
    ['https://www.reddit.com/r/rust/search?q=x', 'search'],
    ['https://www.reddit.com/r/rust/comments/abc/title/', 'thread'],
    ['https://www.reddit.com/comments/abc', 'thread'],
    ['https://www.reddit.com/user/someone/comments/abc/t/', 'thread'],
    ['https://www.reddit.com/r/rust/s/Ab12Cd', 'share'],
    ['https://www.reddit.com/r/rust/wiki/faq', 'wiki'],
    ['https://redd.it/abc', 'shortlink'],
    ['https://i.redd.it/x.jpg', 'media'],
    ['https://v.redd.it/x', 'media'],
    ['https://www.reddit.com/login/', 'account'],
    ['https://example.com/r/rust/comments/abc', 'external'],
    ['not a url', 'external'],
  ])('%s -> %s', (url, kind) => {
    expect(classify(url).kind).toBe(kind);
  });

  it('collapses reddit subdomains onto the same thread key', () => {
    const keys = [
      'https://www.reddit.com/r/rust/comments/abc/title/',
      'https://old.reddit.com/r/rust/comments/abc/title/',
      'https://sh.reddit.com/r/rust/comments/abc/other_slug/',
      'https://np.reddit.com/r/rust/comments/abc/title/?context=3',
      'https://www.reddit.com/r/rust/comments/abc/title/c0mment/',
    ].map((u) => classify(u).key);
    expect(new Set(keys)).toEqual(new Set(['thread:abc']));
  });

  it('gives different threads different keys', () => {
    expect(classify('https://www.reddit.com/r/rust/comments/abc/x/').key).not.toBe(
      classify('https://www.reddit.com/r/rust/comments/def/x/').key,
    );
  });
});

describe('isExternalReferrer', () => {
  it.each([
    ['https://www.google.com/', true],
    ['https://news.ycombinator.com/item?id=1', true],
    ['https://www.reddit.com/r/rust/', false],
    ['https://old.reddit.com/', false],
    ['', false],
    [null, false],
    [undefined, false],
  ])('%s -> %s', (referrer, expected) => {
    expect(isExternalReferrer(referrer)).toBe(expected);
  });
});
