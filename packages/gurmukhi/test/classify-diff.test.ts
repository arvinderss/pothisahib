import { describe, expect, it } from 'vitest';
import { classifyDiff, diffKinds } from '../src/index.js';
import { readFileSync } from 'node:fs';

const fx = JSON.parse(
  readFileSync(new URL('../fixtures/unicode-adversarial.json', import.meta.url), 'utf8'),
) as {
  diff_cases: { id: string; a: string; b: string; expect: string[] }[];
};

describe('classifyDiff', () => {
  for (const c of fx.diff_cases) {
    it(`${c.id}: ${JSON.stringify(c.a)} → ${JSON.stringify(c.b)} = ${c.expect.join('+') || '∅'}`, () => {
      const findings = classifyDiff(c.a, c.b);
      expect(findings.map((f) => f.kind)).toEqual(c.expect);
      // spans must slice back to exactly the removed/inserted text
      for (const f of findings) {
        expect([...c.a].slice(f.a.cpStart, f.a.cpEnd).join('')).toBe(f.removed);
        expect([...c.b].slice(f.b.cpStart, f.b.cpEnd).join('')).toBe(f.inserted);
      }
    });
  }
  it('is symmetric in kind', () => {
    for (const c of fx.diff_cases) expect(diffKinds(c.b, c.a)).toEqual(diffKinds(c.a, c.b));
  });
  it('never mutates its inputs', () => {
    const a = 'ਸਤਿਗੁਰੁ';
    const b = 'ਸਤਿਗੁਰੂ';
    classifyDiff(a, b);
    expect(a).toBe('ਸਤਿਗੁਰੁ');
    expect(b).toBe('ਸਤਿਗੁਰੂ');
  });
});
