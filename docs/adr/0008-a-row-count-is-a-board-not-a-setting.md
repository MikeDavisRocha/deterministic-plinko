# A row count is a board, not a setting

The board was fixed at 16 rows and 17 bins. On a phone that is 17 multipliers
across 390 points of screen: the canvas is scaled to fit its column, so the 10px
bin labels render at 5.6px and the numbers the whole project is about become
unreadable at exactly the moment someone is holding the thing. The layout bug
underneath this was fixed in 4224973; the legibility was left open and named as
the real fix.

ADR 0007 priced that fix and left it: "each row count is a different board for
Physics-First and needs its own 21-minute measurement and its own solved
tables." That is still true. This is the ADR that pays it, for 8 and 12 rows.

## One lattice, three frames

Every constant that can move a disc is shared: 36px spacing, 6px pegs, an 8px
disc, ±1px spawn jitter, the 0.87 triangle ratio, and the same gravity,
restitution, friction and drag. A row count is not a different physics, it is
the same physics stopped earlier — which is what lets the smaller boards inherit
ADR 0003's tuning argument instead of reopening it.

What does change is the frame. Each board is exactly as wide as its own last row
plus the 44px margin the 16-row board always had:

| rows | bins | width | centerX | mean fall |
|---|---|---|---|---|
| 8 | 9 | 412 | 206 | 2.257 s |
| 12 | 13 | 556 | 278 | 3.142 s |
| 16 | 17 | 700 | 350 | 4.035 s |

Those widths are not cosmetic and neither are they arbitrary. `centerX` stays an
integer and every peg keeps landing on an integer x about it, which is the
condition ADR 0004's licence to symmetrise rests on — `npm run symmetry` now
sweeps all three boards and a test asserts the integer centre directly.

The narrower frame is also half of the legibility fix, though not the half it
first looks like. Measured in a 390px viewport at medium risk, a bin is 18px
wide on the 16-row board and 31px on the 8-row one. The *label* barely moves —
6.7px against 7.6px — because the multiplier a smaller board prints is a longer
string, and a label is scaled to the bin it has to fit inside. So the fix is
room, not type size: nine numbers across a phone instead of seventeen, each with
nearly twice the space. (Sizing every label on a board by the widest one in its
table, rather than fixing 10px and letting long ones spill, is worth 1.7px of
that on the 16-row board by itself.)

## The walk is binomial because it is long, not only because it is damped

Each board was measured over the same 100 000 000 drops. The 8-row board took
504 seconds, the 12-row 812, the 16-row 1 120 — 40 minutes for the set.

The distance from a true binomial, in total variation:

| rows | dTV | outermost bin | second bin | never settled |
|---|---|---|---|---|
| 8 | **0.0704** | 1.54x binomial | 0.86x | 0 |
| 12 | 0.0111 | 0.19x | 1.53x | 0 |
| 16 | 0.0028 | 0.48x | 1.36x | 3 |

ADR 0003 concluded that lateral drag is what makes the walk binomial. Read from
this end it is only half the story: a walk also needs *rows* to converge, and
eight of them is not enough. The 8-row board sits twenty-five times further from
the binomial than the 16-row board, and no tuning would close that, because what
it lacks is length. Its distribution oscillates — bins 2 and 6 come up 1.28x
their binomial rate while bins 3 and 5 come up 0.86x — which is the signature of
a lattice walk that has not decorrelated.

The tail inverts with it. At 16 rows the outermost bins are half as likely as a
binomial and the Derived Table doubles their multiplier to compensate; at 8 rows
they are half again *more* likely and the multiplier comes down instead, 13x
becoming 8.46x. The same solve, correcting in opposite directions on two boards,
is the strongest evidence the project has that it is following a measurement
rather than a preconception about tails.

None of this is a defect. It is the clearest case yet for ADR 0001: an honest
simulation is not a binomial, so the payout table is solved against what the
simulation does. The 8-row board is where that stops being a technicality.

## The rounding grid belongs to the board, not to the project

ADR 0007 found a payout table quietly losing 4.5 points to a rounding function
whose grid had been chosen against one table and applied to all of them. The
same trap was waiting one board over, and it is worth stating why rather than
just patching it again.

What a grid costs is not a property of the grid. It is the error per entry
weighted by how much of the distribution sits on that entry. A 17-bin board can
afford half-steps because its bins are individually small and its body values
land on the grid anyway. A 9-bin board cannot: its middle bin alone takes 28% of
every drop. On the old grid the 8-row low table pays **101.92%** and the 12-row
medium table pays **97.88%** — a giveaway and a levy, both from a function whose
only job was legibility.

So the grid is now chosen per table. `roundedTable` walks a ladder of five
progressively finer grids and prints on the coarsest one whose table still pays
what the exact solve pays, to within a tenth of a point. All three 16-row tables
still land on the first rung, so ADR 0001's accounting of their rounding cost
stands unchanged and the printed tables are byte-identical to what they were.

The ladder has to be walked rather than calculated, and that is the part worth
remembering. Rounding error is not monotone in grid size: the 8-row low table
costs 2.93 points on the coarse grid, 0.35 one rung finer, 0.39 finer again, and
0.06 on the fourth. A finer grid bounds the error per entry and says nothing
about which way each entry moves. Every one of the nine tables now prints within
0.09 of a point of its exact solve, at the cost of a few tables printing three
significant figures — 8.46x rather than 8.5x — which is the right way round: the
legible number is the one the player can trust.

## Consequences

- **Nine payout tables, three measured distributions, three seed indexes, three
  fingerprints and nine golden trajectory hashes.** `npm run measure` with no
  argument regenerates all three artefacts and takes 40 minutes; `npm run
  derived` prints the table literals to paste, and the suite refuses a stale
  paste. Adding a fourth row count is now mechanical: add the spec and its
  industry table, measure, derive, print goldens.
- **The row count is an input to verification.** `Session.drawAt` takes it
  alongside the nonce, because the commitment decides a walk and how long the
  walk is belongs to the board. A player who switches boards mid-session keeps
  the same commitment and the same nonce sequence — which is what third-party
  verifiers already expect, since every one of them asks for the row count.
- **`Board` no longer defaults to the Derived Table.** It defaults to no table
  at all, every bin paying 1x. Otherwise everything touching a Board would
  depend on a measurement, including the harness that produces one, and adding a
  board would require its own measurement to already exist.
- **Switching rows clears the ghost trail and the histogram; switching risk
  still does not.** The trail is a picture of a distribution, and the new board
  has a different one — with a different number of bins. The wallet survives,
  because the money is the player's and all nine tables pay the same 98.99%.
- **A narrow window opens on a smaller board**, 8 rows under 520px and 12 under
  760px. A starting point rather than a lock: all three are one tap away on
  every screen, and the desktop default is still the 16-row board every other
  ADR describes.
- The determinism suite now covers three boards rather than one, and
  `npm run cross-engine` reproduces nine trajectories in three engines instead
  of three in three. A board without a golden hash is a board whose determinism
  claim has never been asked of anything but V8, which is the gap ADR 0002 was
  written about.
