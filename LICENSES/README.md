# Za3tar licensing

Za3tar uses two open-source licences with a narrow, explicit boundary.

## AGPL-3.0-only

The root [`LICENSE`](../LICENSE) applies to the desktop application and all
runtime/source code unless a file or directory carries an explicit different
licence notice. This currently includes `src/`, `src-tauri/`, `capture/`, and
the build and release scripts.

If you modify and distribute or provide a network-accessible modified version
of this code, follow the source-availability obligations in the AGPL.

## Apache-2.0

[`Apache-2.0.txt`](Apache-2.0.txt) applies to:

- `docs/AGENT-PROTOCOL.md`;
- `docs/adapters/` — worked examples of implementing the protocol, so an
  implementer can lift code and wording from them into their own agent;
- the protocol envelopes and schemas shown in that specification;
- future files placed under a `protocol/` or `sdk/` directory when those files
  carry an `SPDX-License-Identifier: Apache-2.0` notice.

This exception is intentional: proprietary, commercial, and open-source agents
may implement the Za3tar protocol without adopting the application licence.
The Za3tar application code that sends and parses those envelopes remains
AGPL-3.0-only.

## Commercial services

A hosted or managed Za3tar service can be offered separately. This repository
does not grant access to any future hosted service, support agreement, brand
rights, or enterprise deployment service.

This file explains the project's intended licence boundary; it is not legal
advice.
