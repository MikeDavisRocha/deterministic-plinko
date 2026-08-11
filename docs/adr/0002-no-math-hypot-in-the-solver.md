# No Math.hypot in the solver

`Math.hypot` is specified as implementation-approximated, and the engines really
do disagree. Hashing 200,000 results of `Math.hypot(dx, dy)` against
`Math.sqrt(dx*dx + dy*dy)` over plausible board magnitudes: V8 diverges from the
naive form on 75,990 of them (38%, always by one ULP, because V8 uses a
compensated summation); JavaScriptCore matches it exactly. The two engines
therefore produce different `hypot` results for the same inputs — which in a
chaotic system with a dozen collision events per drop means a replay verified in
Chrome does not reproduce in Safari. Both engines agree bit-for-bit on
`Math.sqrt`. The solver uses `Math.sqrt(dx*dx + dy*dy)` everywhere and
`Math.hypot` is banned from `src/sim/`.

## Consequences

- This reads like a pointless de-optimisation, so it needs the guard rail: a
  committed golden hash of a reference trajectory, checked under both V8 and
  JavaScriptCore, fails the moment someone "tidies" it back to `Math.hypot`.
- **That guard rail is now built, and the claim is confirmed rather than
  argued.** `npm run cross-engine` computes the committed trajectory hashes
  inside three engines — V8 via Chromium as a control, SpiderMonkey via Firefox,
  and JavaScriptCore via WebKit — and all three reproduce them bit for bit. CI
  runs it on every push. Until this existed the project asserted engine
  independence on the strength of the `hypot` measurement alone; now something
  fails if it stops being true.
- It is also, incidentally, the larger half of a 28x speed-up in the headless
  Monte Carlo — V8's compensated `hypot` is far slower than a raw `sqrt`.
- A same-engine determinism test cannot catch this class of bug. It passes under
  V8 and passes under JSC while the two disagree with each other.
