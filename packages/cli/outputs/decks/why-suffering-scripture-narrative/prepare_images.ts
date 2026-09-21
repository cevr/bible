import { copyFile, mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"

type Slide = { readonly id: string; readonly sourceImage: string }
type Manifest = { readonly slides: ReadonlyArray<Slide> }

const root = dirname(import.meta.path)
const manifest = (await Bun.file(resolve(root, "manifest.json")).json()) as Manifest
await mkdir(resolve(root, "images"), { recursive: true })

const crop = (source: string, output: string, height: number, width: number) => {
  const result = Bun.spawnSync(["sips", "-c", String(height), String(width), source, "--out", output], { stderr: "inherit" })
  if (result.exitCode !== 0) throw new Error(`Crop failed: ${source}`)
}

for (const slide of manifest.slides) {
  const source = resolve(root, slide.sourceImage)
  const local = resolve(root, "images", `${slide.id}.png`)
  if (source !== local) await copyFile(source, local)

  const probe = Bun.spawnSync(["sips", "-g", "pixelWidth", "-g", "pixelHeight", local])
  const output = probe.stdout.toString()
  const width = Number(output.match(/pixelWidth:\s+(\d+)/)?.[1])
  const height = Number(output.match(/pixelHeight:\s+(\d+)/)?.[1])
  if (!width || !height) throw new Error(`Could not read dimensions: ${local}`)

  const fullWidth = Math.floor(height * 16 / 9)
  const fullHeight = Math.floor(width * 9 / 16)
  if (fullWidth <= width) crop(local, resolve(root, "images", `${slide.id}-full.png`), height, fullWidth)
  else crop(local, resolve(root, "images", `${slide.id}-full.png`), fullHeight, width)

  const panelWidth = Math.floor(height * 750 / 903)
  const panelHeight = Math.floor(width * 903 / 750)
  if (panelWidth <= width) crop(local, resolve(root, "images", `${slide.id}-panel.png`), height, panelWidth)
  else crop(local, resolve(root, "images", `${slide.id}-panel.png`), panelHeight, width)
}

const title = resolve(root, "images", "title.png")
const titleProbe = Bun.spawnSync(["sips", "-g", "pixelWidth", "-g", "pixelHeight", title])
const titleOutput = titleProbe.stdout.toString()
const titleWidth = Number(titleOutput.match(/pixelWidth:\s+(\d+)/)?.[1])
const titleHeight = Number(titleOutput.match(/pixelHeight:\s+(\d+)/)?.[1])
const titleCropWidth = Math.floor(titleHeight * 16 / 9)
const titleCropHeight = Math.floor(titleWidth * 9 / 16)
if (titleCropWidth <= titleWidth) crop(title, resolve(root, "images", "title-full.png"), titleHeight, titleCropWidth)
else crop(title, resolve(root, "images", "title-full.png"), titleCropHeight, titleWidth)

console.log(`Prepared title and ${manifest.slides.length} image pairs`)

