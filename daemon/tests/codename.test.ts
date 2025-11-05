import { describe, expect, it } from 'vitest';
import { generateSessionCodename } from '../src/codename';

describe('generateSessionCodename', () => {
  it('returns the slug when unused', () => {
    const codename = generateSessionCodename([], { slugFactory: () => 'brisk-otter' });
    expect(codename).toBe('brisk-otter');
  });

  it('retries until a unique slug is produced', () => {
    const slugs = ['brisk-otter', 'brisk-otter', 'gentle-llama'];
    let index = 0;
    const codename = generateSessionCodename(['brisk-otter'], {
      slugFactory: () => slugs[index++] ?? 'fallback-slug',
    });
    expect(codename).toBe('gentle-llama');
  });

  it('adds a salt when all attempts collide', () => {
    const codename = generateSessionCodename(['taken-name'], {
      slugFactory: () => 'taken-name',
      saltFactory: () => 'xy',
      timestampFactory: () => 0,
    });
    expect(codename).toBe('taken-name-xy');
  });
});
