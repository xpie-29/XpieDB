# Help And About Verification

Verified on macOS (Apple Silicon) on 2026-09-21 on the `macos-port` branch.

## Design

- The native menu is Tauri's default menu with Help items added, so Edit (copy and paste),
  Window and the macOS application menu keep their standard behavior. On Windows and Linux the
  stock About item in Help is replaced by ours; on macOS the application-menu About is
  replaced too, so there is one About dialog everywhere.
- Choosing About emits an `open-about` event and the React app shows the dialog, so it looks the
  same on every platform and its link is clickable. The GitHub menu item opens the repository
  directly from Rust with the same opener the app uses for every other external link.
- The version and repository URL come from Rust (`about_info`), so there is one source of truth.
- The link opens through the existing `open_link` command, which only allows http(s) URLs
  without credentials.

## Automated results

- `cargo test`: 78 passed (2 new: the repository URL passes the shared external-link check;
  `about_info` names the app, version and repository).
- `npm run test:ui`: 65 passed (5 new): the event opens the dialog with credits, version and the
  link target; the link goes to the default browser and leaves the app in place; Close and Escape;
  it opens from any page and reopens; other events are ignored. The test waits for the event
  listener to be registered, after an intermittent failure traced to firing the event before
  registration finished (a test race; a person cannot click a menu that fast).
- `cargo fmt --check`, `cargo clippy --all-targets -D warnings`, `npm run build`, `npm test` (63) pass.
- The app starts with the new menu installed (a menu error would have stopped startup).

## Not verified

- The native Help menu itself. macOS would not let automation read another app's menus (no
  accessibility permission), so the menu items and the menu-to-dialog path were not exercised
  end to end. The tests fire the same event the menu emits. Please open Help in the running app.
- Windows (menu bar placement and the replaced stock About item).
