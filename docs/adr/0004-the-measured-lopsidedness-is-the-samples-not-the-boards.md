# The measured lopsidedness is the sample's, not the board's

The 100 000 000-drop Measured Distribution came out asymmetric. Testing each
mirrored bin pair against a 50/50 split gives chi-square 26.5 on 8 degrees of
freedom, p = 8.5e-4, worst at bins 7 and 9: 17 387 197 against 17 367 367, a
3.36 sigma gap. Small — 0.11% on that pair — but the board is symmetric, so the
first reading was that the solver has a side, most likely in the order the
row-based broad phase resolves contacts.

Geometry kills that suspect before any measurement. Pegs in a row sit 36px
apart and pegs in adjacent rows 36.1px apart, while a contact needs the disc's
centre within 14px of both — under 28px of separation. The disc can never touch
two pegs in one step, so resolution order never arises. The lattice is exactly
mirror-symmetric too, and not merely approximately: peg x coordinates land on
integers about centerX = 350, so a mirrored pair costs no rounding.

What settles it is that a drop has exactly one random input. Spawn jitter is
drawn in the World constructor and the RNG is never touched again, so a bin is a
deterministic function of one number in [-1, 1). On a mirror-image board that
function must be antisymmetric: spawn at `centerX - j` and you land in bin
`16 - b` whenever `centerX + j` lands in `b`. It holds for 1 000 000 pairs —
500 000 jitters the RNG actually produces and 500 000 on an even grid across the
range, which reaches spawns it never picks — with not one exception.

So the physics has no side, and the lopsidedness is a property of *which*
jitters mulberry32 hands out for sequential seeds 0..99 999 999. Taking only the
first output of a PRNG seeded with consecutive integers is effectively hashing
the seed, and the map from jitter to bin is chaotic enough to amplify the
structure that leaves behind. The coarse checks miss it: the sample mean sits
0.39 standard errors from centre and the sign balance at z = 1.34.

**The Derived Table is therefore solved against `MEASURED_SYMMETRIC`** — the
counts with mirrored bins averaged — rather than against the raw counts.

We are not reseeding to fix the sample instead. Warming the RNG past its first
output would work, and would also move every trajectory in the project:
regenerate the golden hashes, rerun the 17-minute measurement, and rewrite the
tuning fingerprint, all to buy what averaging already delivers.

## Consequences

- `MEASURED` stays the honest record of what the run produced and is what any
  claim about the run should quote. `MEASURED_SYMMETRIC` is a correction with a
  stated licence, and the licence is the antisymmetry invariant — not a wish for
  tidier numbers.
- Symmetrising doubles the effective sample on every pair, which is worth most
  where samples are thinnest: bins 0 and 16 go from 700 and 754 apart to 1454
  together, a 2.6% relative standard error against 3.8%.
- No RTP figure changes. Both payout tables are symmetric, and averaging
  mirrored probabilities cannot change a sum weighted by a symmetric table.
- **The licence is revocable, and a test guards it.** The `mirror symmetry`
  suite in `src/test/determinism.test.ts` runs a few thousand pairs; `npm run
  symmetry` sweeps a million. Whoever fixes the three drops that never settle
  will be changing collision handling, which is exactly the kind of change that
  can introduce a side — and if it does, symmetrising is no longer justified and
  the suite says so before the Derived Table is regenerated against it.
- The chi-square itself is pinned in `measured.test.ts` between 10 and 60. If a
  future reseeding makes the lopsidedness vanish, symmetrising has become
  unnecessary and that test is where it shows up.
