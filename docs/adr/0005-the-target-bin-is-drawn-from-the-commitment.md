# The Target Bin is drawn from the commitment, not from the physics

Outcome-First Mode has to decide the bin before the disc moves, from a value
neither the operator nor the player can steer alone. That is a hash problem, not
a physics problem, and this ADR covers only the deciding. How the simulation is
then steered to the decided bin is a separate question and a separate decision.

The scheme is the industry one, and deliberately so: HMAC-SHA256 keyed with the
Server Seed over the message `clientSeed:nonce:round`, output bytes taken four
at a time into floats in [0, 1), one float per row, each compared against a half
to decide left or right. The Target Bin is the number of steps that went right.
The Server Seed is published as its SHA-256 before play and revealed after, so a
player can check that the seed which decided their drops is the seed that was
committed to before they made them.

**We are matching a scheme, not designing one.** Taking four bytes to extract a
single bit is wasteful, and a bespoke version would read sixteen bits out of one
HMAC round instead of two rounds out of sixty-four bytes. It would also be
unverifiable in practice. A player checks a provably fair game with a
third-party verifier they already trust, and a scheme only our own page can
reproduce gives up the entire property it is named for. The waste buys
compatibility with what the public verifiers implement, and that is the trade.

## Consequences

- **The distribution is binomial by construction**, which is what entitles this
  mode to the Reference Table unchanged — the table pays exactly 98.99% against
  a true binomial and 100.51% against our measured physics, which is ADR 0001's
  entire argument for two tables. The claim is carried by a test rather than by
  this paragraph: `src/test/fair.test.ts` pins the chi-square against the
  binomial at 11.7782 on 14 degrees of freedom over 50 000 fixed nonces, with
  the outermost bins pooled so no cell expects fewer than 5.
- **SHA-256 and HMAC are written out in `src/core/sha256.ts` rather than taken
  from `crypto.subtle`.** WebCrypto is async, and the drop path is synchronous —
  an await between pressing drop and spawning the disc would spread through the
  loop to buy nothing. Writing it out also means the browser and the test suite
  run the same code, so a committed vector proves the thing the game runs. It is
  checked against the published FIPS 180-4 and RFC 4231 vectors, including the
  longer-than-a-block key case, which is the branch a short server seed never
  reaches and a long one breaks on.
- Nothing here imports the solver, and the tuning fingerprint does not move. The
  Measured Distribution and the Derived Table are untouched by this mode
  existing, and no regeneration is owed.
- **The determinism ban now covers `src/fair/` and `src/core/sha256.ts`.** A
  `Math.random` in the solver breaks replay; one here breaks the fairness
  promise itself, since a Target Bin a player cannot recompute is not verifiable
  at all. Same scan, in `determinism.test.ts`.
- Bin 0 is every step left, which is the leftmost bin, so a Target Bin indexes
  `board.bins` directly with no mirroring. A test asserts every drawn bin exists
  on a board built with the Reference Table.
- Reachability is arithmetic here, not measurement. Physics-First has to measure
  which bins its solver can actually put a disc into — see `REACHABLE` in
  `src/sim/measured.ts` — while every bin from 0 to 16 is reachable here by
  definition, and the test pins the two nonces that demonstrate the extremes
  rather than sampling until it finds them.
- **Nothing is constant-time and nothing needs to be.** The secret this handles
  is a server seed that gets published a few drops later. There is no timing
  side channel worth the complexity of closing.
- Steering is still open. The commitment names a bin; making an honest-looking
  disc arrive in it is the next decision, and the shape of the tail is what
  constrains it — bin 0 comes up once in 65 536 drops under the commitment but
  once in about 143 000 seeds under the physics, so a live seed search is not a
  candidate for the tail without an index behind it.
