# A round that cannot resolve is voided, not paid

Three seeds in the 100-million drop run never settle. They have been named in
the artefact since the first measurement and treated as a curiosity: excluded
from the counts, so the distribution is unharmed, and unreachable from
Outcome-First Mode, because only a settled drop enters a seed pool.

What nobody had checked is what the *game* does with one. The answer was
nothing. `simulate()` stops at `MAX_STEPS`, but `main.ts` steps the world until
it settles, with no guard at all. The stake is taken before the disc moves, the
disc never lands, and the round never resolves — a player watches a motionless
disc and is quietly down a bet.

## What the three drops actually do

They wedge. All three end pinned against the left wall at x = 52, resting on the
upper-left flank of the leftmost peg of the second-to-last row, 66px above the
bins. Gravity pulls down, the peg pushes up and to the left, the wall pushes
right, and the three cancel. It is not a solver defect in any interesting sense:
a ball wedged into a corner does rest there.

The state is reached after 347 steps — 2.89 simulated seconds — and then holds
exactly:

```
x = 52   y = 488.7991878193699   vx = 5.120707281079565   vy = 1.487499773039627
```

Three things came out of looking properly, and each changed the shape of the
problem.

**There are two trapped spawns, not three.** Seeds 59027096 and 59068407 produce
the identical jitter, `-0.32079143356531858` — a mulberry32 collision. The third
is a different spawn that reaches the same corner.

**The corner belongs to the geometry, not to the 16-row board.** Every board
puts its left wall at x = 44 and its second-to-last row's leftmost peg at x =
62, because ADR 0008 gave them all the same 44px margin. A disc pinned at the
wall is therefore inside that peg's 14px contact radius on all three boards. Set
the wedge up on the 8-row and 12-row boards and it holds just as well. Their
zero unsettled drops in 100 million is a statement about sampling, not about
safety.

**It is fantastically rare because the basin is fantastically small.** Bisecting
around each trapped spawn: one hangs across 2.9e-8 px of spawn position, the
other across 1.3e-9 px, out of a ±1px jitter range. That predicts about three
drops in a hundred million, which is what the run measured. Walls are barely
involved in this game at all — about one drop in 200 000 ever touches one.

## The decision

**The physics is left alone.** Removing the wedge means moving the walls out of
the peg columns' contact radius, which changes the tuning fingerprint and
invalidates three 100-million drop measurements, nine payout tables, three seed
indexes and nine golden trajectory hashes: forty minutes of measurement and a
full regeneration, to change the outcome of one drop in thirty-three million.
Priced and declined, in the same spirit as ADR 0007 declining row counts until
they were worth their measurement.

**The round is voided.** The stake goes back and the round is struck from the
session's accounting rather than recorded as a loss. This is the only answer
consistent with the mathematics already shipped: the measurement *excluded*
these drops from the distribution, so they were never part of the RTP the payout
tables were solved for. Paying them out as bin 0 — where the disc happens to be
hanging — would invent an outcome and quietly add a bin-0 payout the
distribution says nothing about.

**Detection is a proof, not a timeout.** `step()` is a pure function of the
previous state, so a state that comes back can never lead anywhere new: every
step after a repeat repeats what followed the first time. A drop that revisits a
state is therefore over, and a drop that would eventually settle can never
revisit one. That is the whole argument, and it means the guard cannot end a
round that was going to pay.

## Why a cycle detector and not "did the state just repeat"

The left wall's wedge is a fixed point — bit-identical every step — and
comparing against the previous step would have caught all three named seeds.
That would also have been the wrong test, and the mirror image is what shows it.

Mirroring a state across the board does not mirror the arithmetic that produced
it. The same corner on the *right* wall settles into a cycle of period 2 at 16
rows and period 4 at 12. A one-step test misses both, and the drop then runs to
the step guard: 20 000 steps, 167 simulated seconds of a player watching a disc
that is already finished.

So `StallWatch` uses Brent's algorithm — one saved state, compared every step,
moved forward at exponentially growing intervals. It finds a cycle of any length
in constant memory, within about twice the cycle length of entering it. In
practice: hundredths of a second instead of three minutes.

## Consequences

- **Only Physics-First Mode can ever void a round.** Outcome-First draws its
  seed from the Seed Index, which holds only seeds that settled during the
  measurement, and the suite re-simulates every one of the 4 992 of them on
  every run. A commitment cannot promise a bin that the disc then fails to
  reach.
- The artefacts are untouched. No fingerprint moves, no table is re-solved, no
  golden hash changes — the guard observes the simulation and never alters it.
- The unsettled seeds are now covered by tests rather than merely named: they
  are replayed, the wedge is set up on all three boards and both walls, and the
  watch is asserted never to fire across 60 000 drops that do settle.
- **These tests are designed to fail if the geometry is ever fixed.** On the day
  the walls move, `the drops that never settle` starts failing, which is exactly
  the moment the artefact, this ADR and that suite all need revisiting.
- The step-count guard stays as a backstop, at `MAX_STEPS`, so "unsettled" means
  the same thing in the game as it does in the run the distribution came from.
  It has never fired.
