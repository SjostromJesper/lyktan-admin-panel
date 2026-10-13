// 64-bit difference hash (dHash) of an image, computed in the browser.
//
// The reference-database loader script must use the exact same algorithm so
// hashes are comparable: downscale to 36x32 (smooth), box-average to 9x8
// greyscale, then one bit per horizontal neighbour pair (left brighter than
// right = 1), row-major, first bit = most significant. Returned as a signed
// 64-bit decimal string (what the scan_items.dhash bigint column stores).
export const computeDHash = async (file: Blob): Promise<string> => {
  const bitmap = await createImageBitmap(file)

  try {
    const canvas = document.createElement('canvas')
    canvas.width = 36
    canvas.height = 32
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    if (!ctx) throw new Error('Canvas saknas')

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, 36, 32)

    const { data } = ctx.getImageData(0, 0, 36, 32)
    const grey = new Float64Array(9 * 8)

    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 9; x++) {
        let sum = 0
        for (let dy = 0; dy < 4; dy++) {
          for (let dx = 0; dx < 4; dx++) {
            const i = ((y * 4 + dy) * 36 + (x * 4 + dx)) * 4
            sum += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!
          }
        }
        grey[y * 9 + x] = sum / 16
      }
    }

    let hash = 0n
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        hash = (hash << 1n) | (grey[y * 9 + x]! > grey[y * 9 + x + 1]! ? 1n : 0n)
      }
    }

    return BigInt.asIntN(64, hash).toString()
  } finally {
    bitmap.close()
  }
}
