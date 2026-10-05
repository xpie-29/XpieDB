// Real mouse/keyboard input for driving the sandbox app.
//   swift scripts/mac-click.swift click X Y        (screen points, from mac-window.swift's origin)
//   swift scripts/mac-click.swift dblclick X Y
//   swift scripts/mac-click.swift drag X1 Y1 X2 Y2
//   swift scripts/mac-click.swift scroll DY        (negative scrolls down)
//   swift scripts/mac-click.swift type "text"
// Needs the Accessibility permission for the app that runs it (System Settings > Privacy & Security).
import CoreGraphics
import Foundation

let a = CommandLine.arguments
func pt(_ i: Int) -> CGPoint { CGPoint(x: Double(a[i])!, y: Double(a[i + 1])!) }
func mouse(_ type: CGEventType, _ p: CGPoint, clicks: Int64 = 1) {
  let e = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: p, mouseButton: .left)!
  e.setIntegerValueField(.mouseEventClickState, value: clicks)
  e.post(tap: .cghidEventTap)
  usleep(40_000)
}
func click(_ p: CGPoint, clicks: Int64 = 1) {
  mouse(.mouseMoved, p)
  for n in 1...clicks { mouse(.leftMouseDown, p, clicks: n); mouse(.leftMouseUp, p, clicks: n) }
}
switch a.count > 1 ? a[1] : "" {
case "click": click(pt(2))
case "dblclick": click(pt(2), clicks: 2)
case "drag":
  let s = pt(2), e = pt(4)
  mouse(.mouseMoved, s); mouse(.leftMouseDown, s)
  for i in 1...12 {
    let f = Double(i) / 12
    mouse(.leftMouseDragged, CGPoint(x: s.x + (e.x - s.x) * f, y: s.y + (e.y - s.y) * f))
  }
  mouse(.leftMouseUp, e)
case "scroll":
  CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: Int32(a[2])!, wheel2: 0, wheel3: 0)!
    .post(tap: .cghidEventTap)
case "type":
  for u in a[2].utf16 {
    var c = u
    let d = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true)!
    d.keyboardSetUnicodeString(stringLength: 1, unicodeString: &c); d.post(tap: .cghidEventTap)
    let up = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false)!
    up.keyboardSetUnicodeString(stringLength: 1, unicodeString: &c); up.post(tap: .cghidEventTap)
    usleep(20_000)
  }
default: print("usage: see header"); exit(2)
}
