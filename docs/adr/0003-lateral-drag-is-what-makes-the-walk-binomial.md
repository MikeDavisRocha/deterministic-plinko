# Lateral drag is what makes the walk binomial

The board had two settings and neither worked. At zero clearance the disc could
not fit between two pegs of a row, ground down the lattice through ~750
collisions, and took 13.8 s to fall — but its distribution sat close to the
binomial. Open the clearance up and the fall drops to under 4 s while the
distribution explodes: measured RTPs of 1858% to 2735% against the Reference
Table. The obvious reading was that clearance buys speed at the cost of shape,
and the search was for a middle setting that split the difference.

That reading was wrong twice over.

The first error was treating bin coverage as a target. Sweeping 225 geometry ×
physics combinations at 2000 drops each, *every* configuration that reached all
17 bins had a total-variation distance of 0.095 to 0.65 and an RTP between 206%
and 5457%; every configuration with a good dTV reached only 13 to 16. That is
not a trade-off, it is arithmetic: under a true binomial the outermost bin has
probability 1/65536, so its expected count in 2000 drops is 0.03. Seeing the
outer bins fill up at that sample size is positive evidence that the walk is
broken. Bin coverage only becomes a meaningful test at ~65 000 drops, and until
then it should not be optimised against at all.

The second error was blaming clearance. Roughly one collision per row is what a
binomial *wants* — each row is one left/right decision — so the drop from 750
hits to 27 was progress, not damage. What actually broke the distribution is
that lateral velocity survived from one row to the next. A disc that glances
left off row 4 arrives at row 5 still moving left and glances left again: the
steps of the walk are positively correlated, which fattens the tails, and with
110x on the outermost bins fat tails are exactly where RTP goes to four digits.
The fix is not geometric. Damping lateral velocity between collisions makes
each row an independent coin flip again — `airDrag`, which the original spec
listed as an optional feel knob to "keep 0 for now".

The board therefore ships at 8px of clearance (spacing 36, peg 6, disc 8) with
gravity 2000, restitution 0.45, friction 0.05 and **airDrag 2.0**. Measured over
200 000 headless drops: dTV 0.0040 from the binomial, mean fall 4.04 s (max
6.03 s), all 17 bins reached, no drop failing to settle, and 100.39% RTP against
the Reference Table — which is not how Physics-First Mode will actually pay
(ADR 0001) but is a fair statement of how close to binomial the honest physics
now lands.

## Consequences

- **`airDrag` is load-bearing.** Setting it back to 0 for a "cleaner" model
  reproduces the 1858% RTP. It reads like a cosmetic feel parameter and is not.
- The window is narrow. Holding geometry, gravity and restitution fixed and
  moving airDrag alone from 2.0 to 1.5 takes dTV from 0.0093 to 0.0521 and
  starts producing drops that never settle; moving it to 2.5 takes dTV to
  0.0874. This tuning is a point, not a plateau, so the dTV bound is asserted
  in `src/test/distribution.test.ts` rather than left as a comment.
- `friction` was held at 0.05 throughout and never swept against the refined
  geometry. There may be a wider basin nearby that this search never looked at.
- The tails are still thin evidence. At 200 000 drops the outermost bins have
  counts of 1 and 3 against an expectation of 3.1 each. That is enough to say
  the bins are reachable; it is nowhere near enough to solve the Derived
  Table's 110x entries against, which is the sample-count problem ADR 0001
  already flagged.
- Per ADR 0001 this tuning change invalidates any previously generated Derived
  Table. None exists yet, so the cost is zero exactly once.
