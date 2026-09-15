/** Deterministic pseudo-random Gurmukhi string generator for property tests. */
const POOL = [
  ...Array.from({ length: 0x0a39 - 0x0a05 + 1 }, (_, i) => 0x0a05 + i).filter(
    (cp) =>
      ![0x0a0b, 0x0a0c, 0x0a0d, 0x0a0e, 0x0a11, 0x0a12, 0x0a29, 0x0a31, 0x0a34, 0x0a37].includes(
        cp,
      ),
  ),
  0x0a3c,
  0x0a3e,
  0x0a3f,
  0x0a40,
  0x0a41,
  0x0a42,
  0x0a47,
  0x0a48,
  0x0a4b,
  0x0a4c,
  0x0a4d,
  0x0a01,
  0x0a02,
  0x0a03,
  0x0a70,
  0x0a71,
  0x0a74,
  0x0a75,
  0x0a51,
  0x0a59,
  0x0a5a,
  0x0a5b,
  0x0a5c,
  0x0a5e,
  0x0a66,
  0x0a6f,
  0x20,
  0x20,
  0x20,
  0xa0,
  0x0a,
  0x0964,
  0x0965,
  0x200c,
  0x200d,
  0x2e,
  0x2c,
];

export function seededGurmukhi(seed: number): (len: number) => string {
  let s = seed >>> 0;
  const next = (): number => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s;
  };
  return (len: number): string => {
    let out = '';
    for (let i = 0; i < len; i++) out += String.fromCodePoint(POOL[next() % POOL.length] as number);
    return out;
  };
}
