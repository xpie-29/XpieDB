# Milestone 4: IGDB Search and Metadata Import

Status: verified and approved by the user for the Milestone 4 checkpoint commit.
Live release-identity persistence and IGDB functionality passed user verification.
Starting checkpoint: `558cac6669c16d9107605de0abfb59aa9714e8fb`.

## Design and Security

- Rust owns Twitch OAuth, IGDB queries, and image downloads. React receives only
  configuration presence, focused search models, and editable import drafts.
- Credentials use Windows Credential Manager Generic Credentials, via
  `keyring-core 1.0.0` and `windows-native-keyring-store 1.1.0`. One locally
  persisted OS-protected entry stores the Client ID and Client Secret together,
  namespaced by Tauri application identifier (`<identifier>.twitch`, user `igdb`).
  The isolated verification application does not share the production entry.
- Settings uses a password field, clears entered credentials after successful
  save, and never reads saved secrets back into JavaScript. Failed saves also
  clear the secret field. Clear invalidates the in-memory access token.
- Credential-store initialization failure does not prevent the local Library
  from starting. Credential errors appear only in the optional IGDB workflow.
- `reqwest 0.13.5` uses verified HTTPS, no redirects, 8-second connect and
  20-second overall timeouts. Response limits: token 64 KiB, game JSON 2 MiB,
  thumbnail 1 MiB, imported cover 20 MiB. Cover destinations are fixed IGDB CDN
  URLs constructed from validated image IDs, never arbitrary API URLs.
- Twitch client-credentials exchange uses a POST form. Tokens remain in memory,
  renew with 60 seconds of expiry headroom, and are invalidated/retried once on
  an IGDB 401. API requests are serialized with 300 ms spacing; 429 honors a
  bounded Retry-After delay (60-second fallback), without automatic retry loops.
- Temporary thumbnails use two concurrent Rust downloads and in-memory data
  URLs. Only the selected cover enters managed disk storage. Image decoding,
  dimensions, allocation limits, UUID filenames, and relative paths reuse the
  existing cover pipeline. Review cancellation/replacement uses its cleanup.
- Logs contain static failure descriptions and HTTP status codes, never raw
  response bodies, credentials, tokens, Authorization headers, or request errors
  that might embed sensitive request details. API text renders as React text.

## Import Decisions

- Add Game offers Search IGDB and Enter Manually. Search is explicit (button or
  Enter), limited to 20 focused results with title, year, platforms, and thumbnail.
  Base records sort ahead of versions, but versions remain available so legitimate
  platform releases are not silently hidden.
- A single remote platform is inferred; multiple platforms require selection.
  Known IGDB platform slugs map to fixed built-in local identities, verified as
  built-ins. Unmapped platforms require an explicit existing-platform choice.
  No automatic platform creation or persistent mapping administration is added.
- PC maps from IGDB `win`; Steam is deliberately not treated as an IGDB platform.
  Current mappings cover NES, SNES, N64, GameCube, Wii, Wii U, Switch, Switch 2,
  3DS, PlayStation 1-5, Xbox, Xbox 360, Xbox Series S/X, PC, and Dreamcast.
- Imported fields: source IGDB ID, title, managed platform, release date, genre,
  developer, publisher, and optional managed cover. Companies are separated by
  developer/publisher flags. Multiple names and genres are sorted, deduplicated,
  comma-separated, and bounded to existing text limits.
- Release date is the earliest valid date for the selected platform; if absent,
  use the general first-release date. Region-specific selection is not added.
- Account, rating, tags, and notes remain empty; media type and play status use
  existing defaults. All fields are editable in the existing review form.
- Exact source-ID matches outrank normalized title-plus-platform matches.
  Duplicate details include platform/account/media type; Save another copy is
  an intentional acknowledgement, not a prohibition.
- Metadata and cover failure are independent: a failed cover leaves the review
  draft usable with a warning and manual-cover option.
- Existing nullable `igdb_id` is used without schema changes. Normal edits
  preserve the stored source ID. There is no metadata refresh, sync, background
  request, or IGDB integration into local Library search. Local records win.

## Dependency Review

Existing dependency versions were retained. Direct Rust dependencies added:
reqwest (already transitively locked), tokio sync/time, serde_json, chrono std,
keyring-core, and windows-native-keyring-store. The latter uses Windows APIs and
requires Rust 1.88; reqwest/keyring-core require 1.85. This project specifies
Rust 1.88 and builds on the installed Rust 1.98.1 Windows x64 toolchain.
Additional TLS/platform transitive packages are expected; existing Tauri/Windows
API versions were not consolidated or upgraded merely to remove duplicates.

Development-only `@playwright/test 1.63.0` adds repeatable mocked UI interaction
tests, using installed Microsoft Edge. Node 24.19.0 satisfies its Node >=20
requirement. No existing frontend dependency was upgraded. Run `npm run test:ui`;
it starts a separate Vite server on port 1421 and never accesses a real catalog,
credential store, or live IGDB service. Playwright output directories are ignored.

References:
- [IGDB API documentation](https://api-docs.igdb.com/)
- [Twitch app access tokens](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/)
- [reqwest](https://docs.rs/reqwest/0.13.5/reqwest/)
- [keyring-core](https://docs.rs/keyring-core/latest/keyring_core/struct.Entry.html)
- [Windows keyring store](https://docs.rs/windows-native-keyring-store/latest/windows_native_keyring_store/)
- [Keyring maintained-store transition](https://github.com/open-source-cooperative/keyring-rs/releases)
- [Playwright requirements](https://playwright.dev/docs/intro)

## Automated Results

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`: pass.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings`: pass.
- `cargo test --manifest-path src-tauri/Cargo.toml --locked`: 24 passed; two
  OS-specific checks ignored by default and both passed when explicitly run.
  Covers existing catalog/migration/notes/image/preferences behavior plus
  credentials validation, token parsing/expiry, query escaping, missing fields,
  mapping, company/genre/date extraction, generic errors, corrupt image failure,
  mocked OAuth cache/401 retry/429 backoff, and local edits surviving reopen.
- `npm test`: 47 passed (40 existing, 7 focused IGDB data/workflow tests).
- `npm run test:ui`: 11 passed, including the credential restart investigation rerun.
  Covers path selection, loading, error/manual fallback, empty results, result
  rendering, multi-platform mapping, unmapped choice, editable review/personal
  fields, nonfatal cover warning, intentional duplicate, and cancel cleanup.
- `npm run build`: pass; no TypeScript/Vite warnings, all chunks below 500 kB.
- `npm audit --audit-level=moderate`: zero vulnerabilities after test dependency.
- `npm run tauri build`: pass; Windows x64 release and NSIS bundle completed
  without Rust or Tauri build warnings.

## Manual and Live Verification

Confirmed in the isolated native dev application: launch, empty Library, missing
credentials error, editable manual form/account, Settings configuration state,
and application-data path `com.gamevault.verification`.

The user confirmed live verification complete and the tested IGDB functionality
working as expected. Specifically confirmed in the release EXE: credential save,
successful live connection, complete application exit, relaunch of the same EXE,
configured status without re-entry, and another successful live connection.
This is user-performed verification, not an agent-observed exhaustive click log.
Search, mapping, review/personal edits, duplicate handling, manual fallback, and
local persistence also have the automated coverage listed above. Physical network
disconnection was not separately documented; local-only read/cover code and the
reopen regression establish independence from IGDB after saving.

Release executable launched and a native window titled GameVault was found.
Native visual inspection could not complete: the Windows automation helper
returned `foreground window did not report a process id` on both attempts.
The dev WebView screenshot was inspected successfully and rendered the empty
Library correctly. Subsequent release Settings inspection and the user's live
release workflow/restart verification passed, closing the release acceptance gate.
NSIS installation/uninstallation was not performed.

Production artifacts (ignored, not committed):
- `src-tauri/target/release/gamevault.exe`
- `src-tauri/target/release/bundle/nsis/GameVault_0.1.0_x64-setup.exe`
  No MSI is configured.

No production or personal database has been seeded. Browser fixtures are entirely
synthetic and in memory; Rust persistence tests use temporary databases.
The pre-live read-only inspection confirmed zero verification games, zero tags, and zero
cover files. The games schema has only its existing catalog fields, with no
credential/token columns. Tracked-file inventory and ignore probes confirmed
databases, covers, backups, credentials, dist/target output, and test reports
are excluded. All current uncommitted changes belong to Milestone 4.

## Warnings and Limitations

- Rust and TypeScript/Vite checks have no code warnings.
- Playwright's runner inherits both NO_COLOR and FORCE_COLOR from the environment;
  Node reports an informational color-output conflict, unrelated to app behavior.
- npm install noted the pre-existing esbuild postinstall script is not covered by
  local allowScripts policy. No policy was changed; builds run successfully.
- Git emits informational LF-to-CRLF conversion notices on Windows.
- NSIS installation/uninstallation was not exercised; its build passed.
- Search returns at most 20 results, mapping is fixed to known built-in identities,
  and region selection/mapping administration are not implemented. Unmapped
  platforms require an existing-platform choice; PC is not silently mapped to Steam.
- A process crash during review can leave an unused managed cover, as with the
  existing local image workflow. Normal Cancel/replacement cleans unused imports.
- No refresh/sync/background updates or Milestone 5 functionality was added.

## Credential Restart Investigation

The user successfully saved credentials and tested the live IGDB connection in
the isolated verification application, then closed it and launched the standard
release EXE. The release displayed Not configured. This was a verification-context
mismatch, not credential loss. The initial handoff should have kept the restart
test within one application identity.

| Context | Tauri identifier | Credential Manager target |
| --- | --- | --- |
| Isolated config (`local-data/verification.json`) | `com.gamevault.verification` | `igdb.com.gamevault.verification.twitch` |
| Normal dev or release | `com.gamevault.desktop` | `igdb.com.gamevault.desktop.twitch` |

The service is `<identifier>.twitch`, the user is `igdb`, and the Windows store's
default target format is `<user>.<service>`. Debug/release mode does not change
the key. The explicit isolated config changes both data and credential identity.
Do not merge these namespaces or silently copy credentials between them.

During the investigation, read-only Windows checks under the actual user context confirmed that the isolated
target exists as a Generic Credential with Local machine persistence, while the
release target does not exist. A fresh Rust process called the application's
actual credential-read function and reported only booleans: both Client ID and
Client Secret are present in the isolated entry; neither is configured in the
release namespace. No values, lengths, tokens, or credential blobs were output.
Sandbox-user cmdkey queries initially reported no entries; checks were repeated
under the actual Windows user context before drawing conclusions.

`igdb_save_credentials` writes both fields together in one serialized OS-protected
entry and propagates write errors. It does not cache the entered credentials.
`igdb_test` independently reads that entry on every call, even if a cached access
token exists. Therefore the successful live test was not bypassing failed storage
with unsaved form values. `igdb_config` also reads the store, and Settings invokes
it on mount, rather than relying solely on its post-save React state.

Storage errors already propagated to the UI; however, the mount-time catch
replaced their specific sanitized messages with a generic error. This now retains
the safe backend message. No persistence algorithm, application identity,
dependency version, schema, or credential migration was changed.

Regression coverage added:
- Normal identity resolves to the production service independently of build mode;
  the verification identity is distinct.
- An explicit Windows test writes a UUID-namespaced synthetic credential, reads
  both fields from a separate process, then deletes and verifies removal of that
  synthetic entry. Passed. It never changes real GameVault credentials.
- An opt-in read-only presence diagnostic prints only configuration booleans.
  Passed against the two known GameVault identities.
- UI reload obtains configured status from mocked backend storage, keeps both
  credential fields blank, and allows Test Connection without re-entry.
- UI read/write errors remain visible, a failed save clears the password input,
  and Test Connection stays disabled when storage is unconfigured.

The two OS-specific tests are ignored in the default suite because they require
the real Windows user credential context. Explicit command:
`cargo test --manifest-path src-tauri/Cargo.toml --locked igdb::tests::windows_ -- --ignored --nocapture`.
Only the synthetic restart test mutates storage, and only its unique test entry.

The prescribed repeat test was entirely in
`src-tauri/target/release/gamevault.exe`: Save credentials, Test Connection, close
GameVault, launch that same release EXE, confirm configured, then Test Connection
without re-entering. The release namespace needs one initial save because the
earlier save belonged to the isolated identity. Its existing isolated entry was
left untouched. The user subsequently confirmed the full release restart sequence
passed and authorized completion and commit of Milestone 4.

Post-investigation verification: formatting and strict Clippy passed; 24 standard
Rust tests, two explicit Windows checks, 47 frontend unit tests, and 11 browser
tests passed. The frontend and Windows production build succeeded with no code
warnings; npm audit reports zero vulnerabilities. Only the already documented
Playwright color-environment and Git line-ending informational notices remain.
The release EXE was launched, its actual app-data identity was read as
`com.gamevault.desktop`, and its Settings view correctly showed Not configured.
It was left open for the user to save credentials in the production namespace.
No credentials were transferred, cleared, or logged; no personal catalog records
were edited during the investigation. No commit was created until user acceptance.

## Final Checkpoint

After user acceptance, formatting, strict Clippy, 24 standard Rust tests, both
explicit Windows checks, 47 frontend unit tests, 11 browser tests, frontend build,
npm audit, and Windows production packaging were rerun successfully. No production
source changes were needed in this final pass. README and changelog now describe
the shipped optional IGDB workflow and its credential-identity boundary.

The commit includes only intended source, tests, lockfiles, and documentation.
Secrets, local databases/assets, temporary verification config/logs, browser test
output, and built EXE/NSIS packages remain excluded. User-owned live-test records
and credentials are not deleted as cleanup. Synthetic automated data is confined
to in-memory/browser fixtures, temporary Rust databases, and a unique OS credential
entry whose deletion was verified. Milestone 5 has not been started.
