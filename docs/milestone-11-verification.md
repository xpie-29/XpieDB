# Settings Text And Local Install Verification

Verified on macOS (Apple Silicon) on 2026-09-21 on the `macos-port` branch, including in the real native window
(screen capture was enabled for this session).

## IGDB settings text

- The IGDB section now has a plain-language description and a "Set up IGDB access" link (opened in the default
  browser through the app's validated link opener), mirroring the Steam section. The status line stays directly
  below the description and link, and above the form.
- The instructions (Twitch developer console, two-factor authentication, any application name, `http://localhost`
  as the OAuth redirect URL, Client ID and Client Secret) come from general knowledge of IGDB's setup process, not
  from a page I could load. The link goes to IGDB's Getting Started documentation, which is the authoritative
  version. Check it if Twitch's console has changed.
- UI tests (5): description content, the link and that it leaves the app in place, layout order (heading,
  description containing the link, status, then the form), the status changing on save and clear, and the
  description showing in both states. Seeing it in the running app confirmed the same order.

## Local install without signing

- Signing and notarization are only needed to distribute the app to other Macs. The app built here is ad-hoc
  signed (required for Apple Silicon to run it), carries no quarantine flag, and launches from Applications.
- `npm run install:mac` (`scripts/install-mac.sh`): builds the app bundle, quits a running copy, replaces
  `/Applications/XpieDB.app` (or `~/Applications` if that is not writable), and opens it. It never touches the
  data folder. Run for real: built in about 15 seconds when warm, closed the running app, installed, relaunched.
- Verified from the installed app: it starts from `/Applications`, opens the existing library (60 games), and
  renders the Library, Statistics ribbon and inspector in the real window. `codesign -v` reports the bundle is
  not sealed, which is expected for a linker-signed ad-hoc build and does not stop it running locally.

## Installs with an empty library

The 60 "Sample Game" entries used while developing were test data inserted into the development database, never
part of the app. Verified three ways:

- The installed `.app` and the frontend build contain no database, no sample text and no covers; sample data
  exists only in test files (`tests/ui/libraryMock.ts` and the specs that use it).
- A first run with a brand-new empty home folder (what another Mac or a fresh account would see) created a
  library with 0 games and only the 20 built-in platforms, and the real window showed "No games yet".
- The sample games were removed from this Mac's real library (all 60 were sample-named; there were no other games,
  tags, covers or custom platforms). The installed app now opens with "0 games". One app-created safety backup
  from restore testing (`backups/xpiedb-pre-restore-*.zip`) still contains the sample games and can be deleted.

## Not verified

- Behavior on another Mac (it would be blocked by Gatekeeper; see the README).
- Windows packaging.
- Automatic updates: there are none; rerun `npm run install:mac`.
