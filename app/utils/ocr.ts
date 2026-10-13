// OCR of the collector number / set code printed along the bottom of a card,
// run in the browser with tesseract.js right after upload (the image is still
// in memory, so nothing extra is downloaded). Used server-side as a tie-break
// between printings that share the same artwork.

type OcrWorker = {
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string } }>
  setParameters: (params: Record<string, string>) => Promise<unknown>
  terminate: () => Promise<unknown>
}

// Two small crops along the bottom edge, tuned on real 600 dpi scans (set code
// 8/8, collector number 5/8 on a mixed TMT/TMC batch): MTG and new Pokémon
// sets print number + set code bottom-left, older Pokémon sets bottom-right.
const CROPS = [
  { left: 0.02, width: 0.45 },
  { left: 0.53, width: 0.45 }
]
const CROP_TOP = 0.925
const CROP_HEIGHT = 0.065
const TARGET_HEIGHT = 200
const WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/'

const cropStrip = (bitmap: ImageBitmap, left: number, width: number): HTMLCanvasElement => {
  const sx = Math.round(bitmap.width * left)
  const sw = Math.round(bitmap.width * width)
  const sy = Math.round(bitmap.height * CROP_TOP)
  const sh = Math.round(bitmap.height * CROP_HEIGHT)
  const scale = TARGET_HEIGHT / sh

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(sw * scale)
  canvas.height = TARGET_HEIGHT

  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  if (!ctx) throw new Error('Canvas saknas')

  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

  // Greyscale + contrast stretch (2nd..98th percentile); invert dark frames
  // (light text on black) so the text is dark on a light background.
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = image.data
  const grey = new Uint8ClampedArray(px.length / 4)
  const histogram = new Uint32Array(256)

  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const g = Math.round(0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!)
    grey[j] = g
    histogram[g]! += 1
  }

  const percentile = (fraction: number) => {
    let seen = 0
    for (let v = 0; v < 256; v++) {
      seen += histogram[v]!
      if (seen >= grey.length * fraction) return v
    }
    return 255
  }

  const lo = percentile(0.02)
  const hi = Math.max(percentile(0.98), lo + 1)
  const range = hi - lo
  let sum = 0

  for (let j = 0; j < grey.length; j++) {
    grey[j] = Math.max(0, Math.min(255, ((grey[j]! - lo) / range) * 255))
    sum += grey[j]!
  }

  const invert = sum / grey.length < 110

  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const v = invert ? 255 - grey[j]! : grey[j]!
    px[i] = px[i + 1] = px[i + 2] = v
  }

  ctx.putImageData(image, 0, 0)
  return canvas
}

export const createOcrPool = async (size = 2) => {
  const { createWorker } = await import('tesseract.js')

  const workers: OcrWorker[] = await Promise.all(
    Array.from({ length: size }, async () => {
      const worker = (await createWorker('eng')) as unknown as OcrWorker
      await worker.setParameters({ tessedit_char_whitelist: WHITELIST, tessedit_pageseg_mode: '6' })
      return worker
    })
  )

  const free = [...workers]
  const waiting: ((w: OcrWorker) => void)[] = []

  const acquire = () => new Promise<OcrWorker>((resolve) => {
    const w = free.pop()
    if (w) resolve(w)
    else waiting.push(resolve)
  })

  const release = (w: OcrWorker) => {
    const next = waiting.shift()
    if (next) next(w)
    else free.push(w)
  }

  return {
    async recognize(file: Blob): Promise<string> {
      const bitmap = await createImageBitmap(file)
      const worker = await acquire()

      try {
        const parts: string[] = []

        for (const crop of CROPS) {
          const { data } = await worker.recognize(cropStrip(bitmap, crop.left, crop.width))
          parts.push(data.text.replace(/\s+/g, ' ').trim())
        }

        return parts.join(' | ').slice(0, 300)
      } finally {
        bitmap.close()
        release(worker)
      }
    },
    async terminate() {
      await Promise.all(workers.map((w) => w.terminate()))
    }
  }
}
