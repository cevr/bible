import { dirname, resolve } from "node:path"

type Slide = {
  readonly id: string
  readonly ref: string
  readonly text: string
  readonly side: "left" | "right"
  readonly note: string
}
type Manifest = { readonly title: string; readonly subtitle: string; readonly slides: ReadonlyArray<Slide> }

const root = dirname(import.meta.path)
const manifest = (await Bun.file(resolve(root, "manifest.json")).json()) as Manifest
const esc = (value: string) => value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n")
const sizeFor = (text: string) => text.length <= 180 ? 48 : text.length <= 300 ? 40 : text.length <= 430 ? 34 : 30

const lines: Array<string> = [
  `set rootPath to "${esc(root)}"`,
  `set savePath to rootPath & "/Why Suffering - Scripture Narrative.key"`,
  `tell application "Keynote Creator Studio"`,
  `  activate`,
  `  set theDoc to make new document with properties {document theme:theme "Basic Black", width:1920, height:1080}`,
  `  tell theDoc`,
  `    set base slide of slide 1 to master slide "Blank"`,
  `    tell slide 1`,
  `      make new image with properties {file:(POSIX file (rootPath & "/images/title-full.png")), position:{0, 0}, width:1920, height:1080}`,
  `      set titleItem to make new text item with properties {object text:"${esc(manifest.title)}", position:{140, 820}, width:1640, height:100}`,
  `      set the font of the object text of titleItem to "Helvetica Neue Light"`,
  `      set the size of the object text of titleItem to 66`,
  `      set the color of the object text of titleItem to {65535, 65535, 65535}`,
  `      set subItem to make new text item with properties {object text:"${esc(manifest.subtitle)}", position:{145, 925}, width:1500, height:60}`,
  `      set the font of the object text of subItem to "Helvetica Neue"`,
  `      set the size of the object text of subItem to 30`,
  `      set the color of the object text of subItem to {39321, 39321, 39321}`,
  `    end tell`,
]

for (const slide of manifest.slides) {
  const imageX = slide.side === "right" ? 1037 : 133
  const textX = slide.side === "right" ? 131 : 984
  const fontSize = sizeFor(slide.text)
  const estimatedHeight = Math.max(180, Math.ceil(slide.text.length / (fontSize <= 34 ? 45 : 34)) * (fontSize + 8))
  const textY = Math.max(120, Math.floor((1080 - estimatedHeight - 70) / 2))
  const refY = Math.min(960, textY + estimatedHeight + 22)
  lines.push(
    `    set fb to make new slide at end with properties {base slide:master slide "Blank"}`,
    `    tell fb`,
    `      make new image with properties {file:(POSIX file (rootPath & "/images/${slide.id}-full.png")), position:{0, 0}, width:1920, height:1080}`,
    `      set presenter notes to "${esc(slide.note)}"`,
    `    end tell`,
    `    set sp to make new slide at end with properties {base slide:master slide "Blank"}`,
    `    tell sp`,
    `      make new image with properties {file:(POSIX file (rootPath & "/images/${slide.id}-panel.png")), position:{${imageX}, 75}, width:750, height:903}`,
    `      set verseItem to make new text item with properties {object text:"${esc(slide.text)}", position:{${textX}, ${textY}}, width:805, height:${estimatedHeight}}`,
    `      set the font of the object text of verseItem to "Helvetica Neue Light"`,
    `      set the size of the object text of verseItem to ${fontSize}`,
    `      set the color of the object text of verseItem to {65535, 65535, 65535}`,
    `      set refItem to make new text item with properties {object text:"${esc(slide.ref)}", position:{${textX}, ${refY}}, width:805, height:55}`,
    `      set the font of the object text of refItem to "Helvetica Neue"`,
    `      set the size of the object text of refItem to 30`,
    `      set the color of the object text of refItem to {39321, 39321, 39321}`,
    `    end tell`,
  )
}

lines.push(
  `    save theDoc in POSIX file savePath`,
  `  end tell`,
  `  return "Built " & (count of slides of theDoc) & " slides at " & savePath`,
  `end tell`,
)

await Bun.write(resolve(root, "build-deck.applescript"), `${lines.join("\n")}\n`)
console.log(`Wrote build-deck.applescript for ${1 + manifest.slides.length * 2} slides`)

