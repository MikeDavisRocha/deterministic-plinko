# Outcome-First steers by seed index

ADR 0005 decides the bin before the disc moves. This one gets the disc there.
The constraint is that the two modes have to run the same solver — the project
exists to put an honest simulation beside the architecture real money games
use, and that comparison means nothing if the second mode quietly plays a
different physics.

So steering is a lookup rather than an intervention. The run that measures the
distribution now also records, per bin, the first 128 seeds that settle there;
the commitment names a Target Bin and then picks a seed out of that bin's pool
with one more float off the same HMAC stream. `World` gets a seed, exactly as in
Physics-First Mode, and nothing downstream can tell which mode asked.

## What was rejected

**Searching for a seed live.** Deriving `seed = f(commitment, attempt)` and
incrementing until the drop lands in the target needs no artefact at all and
gives an unbounded supply of trajectories. It is priced by the rarest bin, and
the physics tail is thinner than the binomial one it has to serve: bin 0 comes
up once in 65 536 drops under the commitment but once in about 143 000 seeds
under the solver — 700 hits in 100 million. At roughly 70 microseconds a drop
that is ten seconds of searching for a fall that takes four to watch. The fix
that suggests itself, capping the attempts and falling back, is precisely the
thing that cannot be done: a commitment you are permitted to abandon when it
gets expensive is not a commitment.

**Nudging the disc.** A lateral bias chosen at spawn reaches any bin instantly
with no artefact and no pool. It also means the two modes no longer run the same
`step()`, and then Physics-First's measured distribution says nothing about what
Outcome-First shows. That is the one cost this project cannot pay.

## Consequences

- **The pool is finite: 128 falls per bin.** A player who reached bin 8 two
  hundred times in a session would see a repeat. This is the real cost of the
  choice and it is not hidden — 128 is what the rarest bin can afford, since bin
  0 only lands 700 times in the whole run.
- **The index is canonical, not curated.** "The first 128 seeds under
  `MEASURED_SAMPLES` that settle in bin k" is fully determined, so a player can
  regenerate it rather than trust that it was assembled without a thumb on the
  scale. A test reproduces the near end of every pool from the first 20 000
  seeds and asserts it matches.
- **It ships inside `measured.data.ts`, from the same run as the counts.** The
  staleness ADR 0001 worries about is a two-artefact problem, and this avoids
  being a second artefact: one run, one fingerprint, one `MEASURED_TUNING` guard
  in `measured.test.ts` covering both. Regenerating to add the index left every
  count byte-identical, as it had to — the run is a deterministic function of
  seeds 0..99 999 999 and the solver did not change.
- **A steered drop cannot draw a seed that hangs.** Only settled drops enter a
  pool, so the three seeds in `UNSETTLED_SEEDS` are excluded structurally rather
  than filtered afterwards. Physics-First still has to live with them; this mode
  is built so it cannot inherit them.
- **Steering cannot move RTP.** The bin is already drawn from a binomial, and
  which of 128 trajectories illustrates it changes nothing about what is paid.
  Outcome-First pays the Reference Table's exact 64873/65536 — a rational rather
  than a measurement, which is the whole contrast with Physics-First's measured
  99.0468%.
- **Every indexed seed is verified to land where it is filed**, all 2 176 of
  them, on every test run. A single misfiled seed would show a player a disc
  settling in a bin the commitment did not name, which is the one failure this
  design is not allowed to have.
- The index inherits the Measured Distribution's regeneration rule exactly:
  change the solver and it must be rebuilt, and the fingerprint guard fails
  until it is. Anyone fixing the three stuck seeds pays for both at once, which
  is the argument for doing that work in one pass if it is ever done.
