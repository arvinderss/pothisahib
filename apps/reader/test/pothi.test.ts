import { describe, expect, it } from 'vitest';
import {
  addSlug,
  createPothi,
  moveSlug,
  normalizePothiName,
  POTHI_NAME_MAX,
  removeSlug,
} from '../src/lib/pothi.ts';

describe('personal Pothis', () => {
  it('names are trimmed, collapsed and bounded', () => {
    expect(normalizePothiName('  Morning   Nitnem ')).toBe('Morning Nitnem');
    expect(() => normalizePothiName('   ')).toThrow();
    expect(normalizePothiName('x'.repeat(200)).length).toBe(POTHI_NAME_MAX);
  });

  it('adds Banian in order and ignores duplicates', () => {
    let p = createPothi('Nitnem');
    p = addSlug(p, 'jap-ji-sahib');
    p = addSlug(p, 'jaap-sahib');
    p = addSlug(p, 'jap-ji-sahib');
    expect(p.slugs).toEqual(['jap-ji-sahib', 'jaap-sahib']);
  });

  it('removes a Bani without touching the rest', () => {
    const p = removeSlug(createPothi('N', ['a', 'b', 'c']), 'b');
    expect(p.slugs).toEqual(['a', 'c']);
    expect(removeSlug(p, 'zz').slugs).toEqual(['a', 'c']);
  });

  it('reorders within bounds only', () => {
    const p = createPothi('N', ['a', 'b', 'c']);
    expect(moveSlug(p, 'c', -1).slugs).toEqual(['a', 'c', 'b']);
    expect(moveSlug(p, 'a', -1).slugs).toEqual(['a', 'b', 'c']);
    expect(moveSlug(p, 'c', 1).slugs).toEqual(['a', 'b', 'c']);
    expect(moveSlug(p, 'a', 2).slugs).toEqual(['b', 'c', 'a']);
  });

  it('a new Pothi carries no duplicate slugs and has timestamps', () => {
    const p = createPothi('N', ['a', 'a', 'b']);
    expect(p.slugs).toEqual(['a', 'b']);
    expect(Date.parse(p.createdAt)).not.toBeNaN();
    expect(p.id).toBeTruthy();
  });
});
