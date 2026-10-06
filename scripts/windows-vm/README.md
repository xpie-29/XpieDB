# Testing the Windows version from the Mac (Parallels)

The owner's Windows 11 (ARM) VM runs under Parallels Desktop (Standard edition). That edition cannot run
commands in the VM or capture its screen (`prlctl exec` and `prlctl capture` are Pro/Business only), so these
scripts work through the VM's **shared Downloads folder** instead.

## One-time setup (done 2026-10-06; the owner runs these because they need Administrator approval)
In the VM, in an *Administrator* PowerShell (the shared Downloads path is **not** `$env:USERPROFILE\Downloads`):
```
$d = (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path
cd "$d\xpiedb-vm"
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\setup.ps1          # Git, Node LTS, Rust, Visual Studio C++ Build Tools (winget)
.\setup-clang.ps1    # ARM only: the Clang component that aws-lc-sys needs (set CC to its clang-cl.exe)
```
Copy these scripts to `~/Downloads/xpiedb-vm/` on the Mac first (create `jobs/`, `results/`, `done/`, `data/`).

## Each session
1. The owner starts `.\runner.ps1` in a normal PowerShell window in the VM and leaves it open. It runs every
   `jobs\*.ps1` the Mac drops in `~/Downloads/xpiedb-vm/jobs/`, writes `results\<job>.log` (UTF-16: read with
   `iconv -f UTF-16 -t UTF-8`) and `results\<job>.exit`, and moves the job to `done\`.
2. Copy the project: `rsync -a --delete --exclude node_modules --exclude target --exclude dist --exclude .git
   --exclude 'public/pdfjs' ./ ~/Downloads/xpiedb-vm/project/`, then a job robocopies it to `C:\xpiedb`.
3. Jobs used: `npm ci; npm test; npm run build`; `cargo test --manifest-path src-tauri\Cargo.toml --locked`
   (with `$env:CC` set to the ARM64 `clang-cl.exe` under `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\Llvm\ARM64\bin`);
   `npm run tauri build -- --no-bundle` (about 4 minutes) giving `C:\xpiedb\src-tauri\target\release\xpiedb.exe`.
4. The app's data folder is `%APPDATA%\com.xpiedb.desktop` (Tauri uses the known folder, so `HOME`/`APPDATA`
   overrides do nothing): the VM's own library is the sandbox. Seed it from a copy of the Mac library via the
   shared folder, and delete that copy afterwards.
5. Driving the window: `lib.ps1` (dot-source it) gives `Focus-App`, `Place-App`, `Shot name`, `Click x y`,
   `Scroll x y ticks`, `Keys`, all in **physical pixels** (the VM screen is 3840x2160; screenshots shown at
   1900 px wide need x2.021). Re-take a screenshot after anything that can shift the layout (a search count
   shifted the toolbar buttons once). Tell the owner before taking over the VM's mouse.
