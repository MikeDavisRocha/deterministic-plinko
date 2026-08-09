# Two payout tables, one RTP target

A physics solver cannot be tuned to a target RTP. Measuring the board across an
ordinary parameter sweep — restitution 0.10 to 0.70, gravity 900 to 3000 —
produced measured RTPs from 42% to 2813%, because the outermost bins pay 110x
and one drop in a thousand landing there moves RTP by eleven percentage points.
So we fix RTP at the payout table instead of at the physics: Outcome-First Mode
draws its bin from a binomial and uses the industry Reference Table unchanged
(98.99% by construction), while Physics-First Mode keeps its honest measured
distribution and uses a Derived Table solved to pay 98.99% against *that*
distribution. Same RTP, opposite routes, and the contrast is the point of the
project rather than an embarrassment to hide.

## Consequences

- The Derived Table is a build artefact generated from a large offline run, and
  is committed together with the sample count behind it. Its tail entries are
  only as good as the tail estimates, which need far more samples than the body.
  The run is `npm run measure`, and what it commits is `src/sim/measured.data.ts`
  — raw per-bin counts, so a later run can be merged rather than replacing this
  one. The sample count is set by the rarest bin: see the comment on
  `DEFAULT_RUNS` for why the tail, not the body, decides it.
- **Any change to the physics tuning silently invalidates the Derived Table.**
  Regenerating it has to be part of the tuning loop, not an afterthought. This
  is no longer silent: the artefact commits a fingerprint of every number that
  can move a trajectory (`src/sim/fingerprint.ts`), and `measured.test.ts` fails
  with a regenerate-me message the moment the tree stops matching it. A second
  test reproduces the run's first 20 000 seeds bin for bin, so an artefact left
  behind by an older *solver* — same tuning, changed collision code — fails too.
- Two tables means two RTP numbers to keep honest in the README. Neither may be
  quoted without saying which mode and how many samples produced it.
