# Deterministic Plinko

A Plinko board simulated by a hand-written physics solver — no physics engine.
It exists to put two things side by side: a physically honest simulation, and
the outcome-first architecture real money games are required to use. Plinko is
the subject because it makes that contrast concrete, not because the project is
about gambling; the transferable part is a solver whose behaviour was measured
rather than assumed, and a payout model solved against the measurement.

## Language

### The board

**Board**:
The static lattice of pegs and the row of bins beneath it. Generated once from
constants; never mutated by a drop.
_Avoid_: field, grid, layout

**Peg**:
One fixed circular obstacle in the lattice.
_Avoid_: pin, nail, obstacle

**Row**:
One horizontal line of pegs. Row index doubles as the step index of the
left/right walk a disc performs on its way down.
_Avoid_: line, level, layer

**Disc**:
The falling body. Exactly one is in flight per drop.
_Avoid_: ball, chip, puck, token

**Clearance**:
The horizontal room left for the disc's centre between two pegs of the same
row: `spacingX - 2 x (pegRadius + discRadius)`. At or below zero the disc
cannot pass between them and grinds down the lattice instead of falling
through it. A board with non-positive clearance is invalid.
_Avoid_: gap, spacing, margin

**Bin**:
One of the landing slots under the last peg row. There is always one fewer bin
than there are pegs in the last row.
_Avoid_: bucket, slot, pocket, cell

**Reachable Bin**:
A bin that some seed can actually put a disc into under the current physics
tuning. Not every bin is reachable — establishing which are, by measurement, is
a required step before any RTP claim.

### A play

**Drop**:
One disc released and simulated from spawn until it settles in a bin. The unit
of play, and the unit of replay.
_Avoid_: run, throw, play, round

**Settle**:
The moment a drop's bin is decided and the simulation for that disc stops.
_Avoid_: land, finish, resolve

**Fall Time**:
Simulated seconds from spawn to settle. A tuning target in its own right, not
a free consequence — the physics is tuned to land it in a watchable range.
_Avoid_: duration, drop time

**Multiplier**:
The payout factor printed on a bin, e.g. `110x`. Which multiplier a bin carries
depends on the mode: see [[Reference Table]] and [[Derived Table]].
_Avoid_: prize, reward, odds

**Payout**:
`multiplier x bet` for a settled drop. Distinct from [[Multiplier]], which is
the bin's static factor.

**RTP** (return to player):
The long-run ratio of total payout to total bet, as a percentage. Both modes
target 98.99%, and reach it by opposite routes. Measured RTP and target RTP are
always reported separately.

### The two modes

**Physics-First Mode**:
The mode where the simulation decides the outcome. A seeded stream drives the
spawn position; the bin is whatever the disc reaches. Honest and fully
replayable. Its distribution is not binomial, so it uses the [[Derived Table]].
_Avoid_: physics mode, emergent mode, simulation mode

**Outcome-First Mode**:
The mode where the bin is decided before the disc moves, by a provably fair
[[Commitment]], and the simulation is steered to land on that [[Target Bin]].
Its distribution is binomial by construction, so it uses the
[[Reference Table]]. This is how real money Plinko is built.
_Avoid_: fair mode, casino mode, rigged mode, guided mode

### Payout tables

**Measured Distribution**:
The empirical per-bin probabilities produced by a large offline run of the
solver at a fixed tuning. Committed as a build artefact alongside the sample
count that produced it, because the [[Derived Table]] is only as trustworthy as
the tail estimates behind it.
_Avoid_: histogram, empirical curve

**Symmetrised Distribution**:
The [[Measured Distribution]] with mirrored bins averaged. What the
[[Derived Table]] is actually solved against, because the solver is provably
antisymmetric and any left/right difference in the counts therefore belongs to
the seed sample rather than to the board. See
docs/adr/0004-the-measured-lopsidedness-is-the-samples-not-the-boards.md.
_Avoid_: smoothed distribution, folded distribution

**Seed Index**:
Per bin, the first 128 seeds under the [[Measured Distribution]]'s sample count
that settle there. What [[Outcome-First Mode]] draws a trajectory from once the
[[Commitment]] has named a [[Target Bin]] — steering is a lookup, so the solver
runs the same drop it would have run in [[Physics-First Mode]]. Canonical
rather than curated: "the first 128 seeds landing in bin k" is reproducible by
anyone with the solver. Ships inside the same artefact as the counts, from the
same run. See docs/adr/0006-outcome-first-steers-by-seed-index.md.
_Avoid_: seed table, seed pool, lookup table

**Reference Table**:
The industry-standard 16-row medium-risk multiplier table. Pays exactly 98.99%
against a true binomial. Used by [[Outcome-First Mode]] unchanged.
_Avoid_: stake table, standard table, real table

**Derived Table**:
A multiplier table solved so that it pays 98.99% against the
[[Symmetrised Distribution]] rather than against a binomial. Used by
[[Physics-First Mode]]. Solved per bin rather than scaled as a whole, so each
bin returns what the same bin returns under [[Outcome-First Mode]]; the body is
untouched and the tail carries the whole correction, printing 230x where the
[[Reference Table]] prints 110x. Rounded to a printable grid, which costs
0.0568 of a point: it pays 99.0468%, and that is the figure to quote. Computed
from the committed distribution rather than committed separately, so it cannot
go stale against it.
_Avoid_: custom table, tuned table, fixed table

### Provably fair

**Server Seed**:
The operator's secret value for a session, published as a hash before play and
revealed afterwards so past drops can be verified. [[Outcome-First Mode]] only.

**Client Seed**:
The player-supplied value mixed with the [[Server Seed]]. Its purpose is to
prove the operator could not have chosen the outcome alone.

**Nonce**:
The per-drop counter that makes each drop in a session distinct without
changing either seed.

**Commitment**:
The SHA-256 of the [[Server Seed]], published before play. It fixes the seed
without disclosing it, so revealing the seed afterwards proves the drops were
decided by a value chosen before the player played.
_Avoid_: hash, pledge, seed hash

**Target Bin**:
The bin [[Outcome-First Mode]] draws from the [[Commitment]] before the disc
moves, and the bin the [[Drop]] is then steered into. Derived as the number of
right steps in a 16-step walk read out of HMAC-SHA256, so it is binomial by
construction. See
docs/adr/0005-the-target-bin-is-drawn-from-the-commitment.md.
_Avoid_: chosen bin, intended bin, predetermined bin

### The visual record

**Ghost Trail**:
The accumulated, low-alpha record of past trajectories baked into a persistent
texture. A rendering artefact only; it is not part of the simulation and is not
required to be reproducible.
_Avoid_: heatmap, history, path overlay
