## What and why

<!-- What changes, and why it needed changing. -->

## How it was verified

<!-- Tests, manual steps, or the platform you ran it on. `npm run release:check`
     covers versions, licence boundary, build, Rust tests, and the capture helper. -->

## Checklist

- [ ] Commits are signed off (`git commit -s`) — see [CONTRIBUTING](../CONTRIBUTING.md#sign-off-dco)
- [ ] I have read the [relicensing grant](../CONTRIBUTING.md#relicensing-grant) and agree to it for this contribution
- [ ] No `.env`, API keys, recordings, or real meeting content in the diff
- [ ] Rust: `cargo fmt` and `cargo clippy` are clean. TS: `tsc` is clean
- [ ] No new network calls beyond the user's own configured APIs and agent command
