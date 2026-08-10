# Risk is a choice between volatilities, not between values

The board had a measured RTP of 99.0468% and nothing to pay it against. There
was no bet, no balance, and no decision — CONTEXT.md has defined Payout as
`multiplier x bet` since the first commit while no bet existed anywhere in the
product. So the game had mathematics and no stake, which is a demonstration
rather than a game.

Two things fix that together. A wallet gives the multiplier something to act on.
And a **risk level** gives the player the one decision a Plinko board actually
offers: low, medium and high all pay about 98.99%, and differ only in where the
money sits. Low never pays under 0.5x and tops out at 16x; high pays 0.2x across
five middle bins to fund a 1000x edge. Identical expected value, entirely
different experience.

Both modes take the risk level. Outcome-First uses the industry table for that
level unchanged, because it draws from the binomial those tables were designed
against. Physics-First solves each one against the measured distribution by the
same contribution-preserving formula as before — and that costs nothing extra,
because the distribution does not depend on the payout table. Three risks, one
measurement, no new artefact and no regeneration.

## The rounding grid was tuned to a single table, and hid a 4.5-point bug

`roundMultiplier` put everything between 1x and 10x on a half-step grid. The
medium table survived that untouched, because its body is already 1.5, 1, 0.5,
0.3 — numbers that are on the grid whatever the grid is.

The low-risk table lives entirely between 0.5x and 1.6x. On a half-step grid,
1.1 and 1.2 both round to 1.0 and 1.4 rounds to 1.5, and those bins carry most
of the distribution. **The low table paid 94.5175% instead of 98.99%** — four
and a half points, handed to the house by a rounding function.

The band from 1x to 2x is now on a tenth. Low pays 98.9658%, and the medium
table is byte-identical to what it was, so ADR 0001's accounting of the rounding
cost still stands.

## Consequences

- **A test suite that passes tells you about the cases it covers.** The rounding
  grid had a committed literal, an exact-solve assertion and an RTP bound
  pinned to six decimals — all green, all only ever exercised against one table.
  The bug was not hiding from the tests; it was outside them. The suite now
  pins the rounded RTP of all three levels.
- Risk levels ship as three `REFERENCE_TABLES` and three `DERIVED_TABLES`,
  written out as literals for the same reason ADR 0001 gives: the rounded
  numbers are the product and belong where a person can read them. Each is
  asserted to equal the rounded solve.
- **Switching risk keeps the ghost trail; switching mode clears it.** Risk
  changes what the bins are worth and nothing else — same board, same solver,
  same trajectories — so the accumulated picture is still true. A mode switch
  changes which distribution is being drawn, and pooling the two would describe
  neither.
- The wallet is UI state and deliberately not persisted. A balance restored
  from `localStorage` invites treating it as an account, and this is a
  demonstration of mathematics, not a place anyone should feel they hold money.
  `reset balance` is one button away.
- **Replay is a paid round.** The trajectory repeats; the stake does not come
  free. Anything else would make replay the dominant strategy and the RTP a
  fiction.
- The session prints `wagered`, `returned` and the ratio between them beside
  the target. Over a few hundred drops it visibly walks towards the figure
  above it, which is the most honest advertisement the mathematics has: the
  player watches the RTP happen instead of being told it.
- Variable row counts are the obvious next request and are **not** cheap.
  Outcome-First would take them for free, being binomial by construction, but
  each row count is a different board for Physics-First and needs its own
  21-minute measurement and its own solved tables. Nine of them is three hours
  and nine artefacts.
