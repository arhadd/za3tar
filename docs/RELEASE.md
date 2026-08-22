# v0.1.0 release checklist

Za3tar v0.1.0 is the first public test release. A release is complete only when
a fresh Mac can install, open, record, process, and export without using the
development checkout.

## 1. Version and source

- [ ] `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` all say `0.1.0`.
- [ ] `npm ci` succeeds from a fresh clone.
- [ ] `npm run release:check` succeeds.
- [ ] The release commit is tagged `v0.1.0`.
- [ ] The tag points to the reviewed `main` commit.

## 2. Apple distribution

The Account Holder performs Apple login, identity, certificate, and payment
steps. Do not commit certificates or credentials.

- [ ] Active Apple Developer Program membership.
- [ ] `Developer ID Application` certificate installed in the signing Mac's Keychain.
- [ ] Bundle identifier `com.ala.za3tar` confirmed.
- [ ] Hardened runtime/signing succeeds without unsigned nested binaries.
- [ ] The app/DMG is submitted to Apple's notary service.
- [ ] Notarization succeeds and the ticket is stapled.
- [ ] `spctl --assess --type execute --verbose za3tar.app` accepts the app.
- [ ] `codesign --verify --deep --strict --verbose=2 za3tar.app` succeeds.

## 3. Clean-Mac acceptance

Use a separate macOS account or Mac that has never run the development build.

- [ ] Download the DMG from the draft GitHub release.
- [ ] Verify the published SHA-256 checksum.
- [ ] Drag Za3tar to Applications and open it without bypassing Gatekeeper.
- [ ] Complete microphone and System Audio Recording permission flows.
- [ ] Enter test provider keys through Settings; keys never appear in the webview/logs.
- [ ] Record a consented synthetic Arabic-English call.
- [ ] Confirm transcript, notes, decisions, actions, WhatsApp/email draft, and `.ics` export.
- [ ] Confirm standalone mode works with no agent command configured.
- [ ] Configure a test agent and confirm packet → acknowledgement → status sync.

## 4. Public release

- [ ] Attach signed/notarized DMG and `SHA256SUMS.txt` to the GitHub release.
- [ ] Release notes accurately label v0.1.0 as an early macOS test build.
- [ ] Link `docs/INSTALL.md`, `docs/PRIVACY.md`, and known limitations.
- [ ] Publish the launch demo only after the downloadable artifact passes the clean-Mac test.
- [ ] Open one issue template for private-safe bug reports; never request real meeting audio.

## Stop conditions

Do not publish if Gatekeeper fails, the capture helper is unsigned, a fresh
install cannot request permissions, provider keys leak, or the live demo needs
the development checkout to work.
