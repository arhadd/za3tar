// Generates the 1024px master app icon: Big Sur-style rounded rect in the
// app's warm cream, with the za3tar herb front and center. Feed the output to
// `npx tauri icon` to regenerate the full icon set.
//
//   swift scripts/make-icon.swift /tmp/za3tar-icon.png

import AppKit

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "/tmp/za3tar-icon.png"
let size = CGFloat(1024)

let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()

// Apple's icon grid: the rounded rect is ~824pt of a 1024 canvas with ~185pt
// corner radius, leaving transparent margin so macOS doesn't double-pad it.
let inset = size * 0.098
let rect = NSRect(x: inset, y: inset, width: size - inset * 2, height: size - inset * 2)
let path = NSBezierPath(roundedRect: rect, xRadius: size * 0.181, yRadius: size * 0.181)

// warm cream body with a whisper of sesame depth, olive rim
let gradient = NSGradient(
    starting: NSColor(calibratedRed: 0.97, green: 0.95, blue: 0.905, alpha: 1),
    ending: NSColor(calibratedRed: 0.91, green: 0.863, blue: 0.753, alpha: 1)
)
gradient?.draw(in: path, angle: -90)
path.lineWidth = size * 0.012
NSColor(calibratedRed: 0.42, green: 0.482, blue: 0.227, alpha: 0.35).setStroke()
path.stroke()

// the herb 🌿, big
let emoji = "🌿" as NSString
let font = NSFont.systemFont(ofSize: size * 0.52)
let attrs: [NSAttributedString.Key: Any] = [.font: font]
let esize = emoji.size(withAttributes: attrs)
emoji.draw(
    at: NSPoint(x: (size - esize.width) / 2, y: (size - esize.height) / 2),
    withAttributes: attrs
)

image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let png = rep.representation(using: .png, properties: [:])
else {
    fputs("failed to render icon\n", stderr)
    exit(1)
}
try! png.write(to: URL(fileURLWithPath: out))
print("wrote \(out)")
