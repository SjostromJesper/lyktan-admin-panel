// Colour descriptor used for card matching, computed in the browser.
//
// Must stay in step with artVectorFromBuffer() in scripts/load-reference.mjs:
// inset 2.5% (scanner edge / rounded corners), crop the artwork area
// (x 5-95%, y 10-58%), downscale to 64x48, box-average to 16x12 RGB, then
// z-normalise the 576 values per image (robust to brightness/colour cast).
// Returned as the text form pgvector accepts: "[0.123,-1.2,...]".
const INSET = 0.025
const COLS = 16
const ROWS = 12
const OVERSAMPLE = 4

export const computeArtVector = async (file: Blob): Promise<string> => {
  const bitmap = await createImageBitmap(file)

  try {
    const ix = Math.round(bitmap.width * INSET)
    const iy = Math.round(bitmap.height * INSET)
    const w = bitmap.width - 2 * ix
    const h = bitmap.height - 2 * iy

    const sx = ix + Math.round(w * 0.05)
    const sy = iy + Math.round(h * 0.1)
    const sw = Math.round(w * 0.9)
    const sh = Math.round(h * 0.48)

    const canvas = document.createElement('canvas')
    canvas.width = COLS * OVERSAMPLE
    canvas.height = ROWS * OVERSAMPLE
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    if (!ctx) throw new Error('Canvas saknas')

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const values = new Float64Array(COLS * ROWS * 3)

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0
          for (let dy = 0; dy < OVERSAMPLE; dy++) {
            for (let dx = 0; dx < OVERSAMPLE; dx++) {
              sum += data[(((y * OVERSAMPLE + dy) * canvas.width) + (x * OVERSAMPLE + dx)) * 4 + c]!
            }
          }
          values[(y * COLS + x) * 3 + c] = sum / (OVERSAMPLE * OVERSAMPLE)
        }
      }
    }

    let mean = 0
    for (const v of values) mean += v
    mean /= values.length

    let variance = 0
    for (const v of values) variance += (v - mean) ** 2
    const std = Math.sqrt(variance / values.length) || 1

    return `[${Array.from(values, (v) => ((v - mean) / std).toFixed(3)).join(',')}]`
  } finally {
    bitmap.close()
  }
}
