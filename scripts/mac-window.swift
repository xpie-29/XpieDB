// Prints the CoreGraphics window id of the sandbox XpieDB window: swift scripts/mac-window.swift
// Use it with:  screencapture -x -o -l <id> out.png
import CoreGraphics
import Foundation

let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
for w in list {
  let owner = w[kCGWindowOwnerName as String] as? String ?? ""
  let layer = w[kCGWindowLayer as String] as? Int ?? 0
  if owner.lowercased().contains("xpiedb") && layer == 0 {
    let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
    print(w[kCGWindowNumber as String] as? Int ?? 0, b["X"] ?? 0, b["Y"] ?? 0, b["Width"] ?? 0, b["Height"] ?? 0)
  }
}
