# Windows verification (0.2.0 plus the usability batches), 2026-10-06

Environment: the owner's Windows 11 **ARM64** VM in Parallels on an Apple-silicon Mac (see
`scripts/windows-vm/README.md`). Native ARM build; an x64 PC was not available.

## Passed
- `cargo fmt --check`, `cargo clippy --locked --all-targets -D warnings`, `cargo test --locked`: **182 passed, 4 ignored**
  (same as macOS).
- `npm test` 98 passed; `npm run build` passes, including `scripts/prepare-pdfjs.mjs`.
- `npm run tauri build -- --no-bundle` builds `xpiedb.exe` (25 MB, release).
- The app starts on a copy of the real library: migrations 9 to 11 apply, all 364 games and the new toolbar show,
  native Windows menu bar (File, Edit, Window, Help), Help > About shows 0.2.0 and the repository link.
- Add Guide: the new "Save and attach PDF or ePub" saves the guide, opens the **native Windows Open dialog**
  (with the PDF/ePub filter), attaches the chosen PDF into `%APPDATA%\com.xpiedb.desktop\guide-files\` (Copy column
  shows "Both").
- **In-app reader on Windows** (guidefile over `http://guidefile.localhost`): a 12-page PDF loads, text and fonts render,
  search finds a word on page 7 and jumps to it, night mode works, full screen fills the whole 3840x2160 screen
  and the button leaves it (Esc does not leave full screen; that is the design).

## Findings
- **Windows will not replace an open database file.** One Rust test (a backup restore while the test still held a
  connection) failed on Windows and passed on macOS; fixed by closing the connection first. The app itself opens a
  connection per command, so it is not affected.
- Building on **Windows ARM** needs the Visual Studio "C++ Clang Compiler" component (for `aws-lc-sys`). An ordinary
  x64 Windows PC should not need it (it needs NASM or Clang, which the Tauri prerequisites usually cover). Untested.

## Not covered
- A real x64 Windows machine; the installer bundle (NSIS/MSI) and SmartScreen behaviour; the old `com.gamevault.desktop`
  data folder migration (still absent); system accent colour on Windows (next task).
