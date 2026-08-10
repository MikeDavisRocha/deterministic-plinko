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

- The Measured Distribution behind the table is a build artefact from a large
  offline run, committed with the sample count behind it. Its tail entries are
  only as good as the tail estimates, which need far more samples than the body.
  The run is `npm run measure`, and what it commits is `src/sim/measured.data.ts`
  — raw per-bin counts, so a later run can be merged rather than replacing this
  one. The sample count is set by the rarest bin: see the comment on
  `DEFAULT_RUNS` for why the tail, not the body, decides it.
- **The Derived Table itself is not a second artefact.** It derives cheaply and
  deterministically from the first, so `src/sim/derived.ts` computes it instead
  of committing it — which means it cannot go stale against the run it is solved
  from, the failure this ADR spends most of its worry on. The rounded numbers
  are still written out by hand there, because those are the product and belong
  somewhere a person can read them; a test asserts the literal is exactly the
  rounded solve.
- **The solve is contribution-preserving**, not a flat rescale:
  `m[i] = reference[i] x binomial[i] / measured[i]`, so each bin returns what
  the same bin returns in Outcome-First Mode. Scaling the whole Reference Table
  by one factor also lands 98.99%, but leaves the per-bin distortion in place —
  bin 1 comes up 1.36x more often than binomial and would still pay about 41x —
  matching the total while missing the volatility. The cost of the honest solve
  is that it prints 230x where the industry prints 110x, and that visible
  divergence is the contrast this ADR is about.
- **The printed table pays 99.0468%, not 98.99%.** The exact solve pays
  98.9883%; rounding to a legible grid costs 0.0568 of a point, most of it one
  entry (bin 6 rounding 0.994 up to 1, across two bins taking 12.3% of drops
  each). The measured figure is what gets quoted. A tighter one is available by
  printing 0.99x, and was not judged worth it.
- `Board` takes the payout table as a constructor parameter, defaulting to the
  Derived Table because Physics-First is the only mode that exists yet.
  Outcome-First will pass `REFERENCE_TABLE` unchanged.
- **Any change to the physics tuning silently invalidates the Derived Table.**
  Regenerating it has to be part of the tuning loop, not an afterthought. This
  is no longer silent: the artefact commits a fingerprint of every number that
  can move a trajectory (`src/sim/fingerprint.ts`), and `measured.test.ts` fails
  with a regenerate-me message the moment the tree stops matching it. A second
  test reproduces the run's first 20 000 seeds bin for bin, so an artefact left
  behind by an older *solver* — same tuning, changed collision code — fails too.
- The Derived Table is solved against the *symmetrised* measured distribution,
  not the raw counts. ADR 0004 has the reasoning and the invariant that licenses
  it.
- Two tables means two RTP numbers to keep honest in the README. Neither may be
  quoted without saying which mode and how many samples produced it.
