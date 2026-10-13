type ItemInput = { filename?: string, position?: number, dhash?: string | null, artVec?: string | null }
type Body = { name?: string, note?: string, items?: ItemInput[] }

const BUCKET = 'scan-images'
const MAX_ITEMS = 500
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png'])

// Creates the batch + one row per card and hands back signed upload URLs, so
// the browser uploads the (large) JPEGs straight to Storage instead of
// pushing them through a size-limited serverless function.
export default defineEventHandler(async (event) => {
  const admin = await requireAccess(event, 'scan', 'edit')

  const body = await readBody<Body>(event)
  const name = String(body?.name ?? '').trim().slice(0, 120)
  const items = Array.isArray(body?.items) ? body.items : []

  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Buntens namn saknas' })
  }

  if (!items.length || items.length > MAX_ITEMS) {
    throw createError({ statusCode: 400, statusMessage: `Antal kort måste vara 1–${MAX_ITEMS}` })
  }

  const positions = new Set<number>()
  const prepared = items.map((item) => {
    const position = Number(item.position)
    const filename = String(item.filename ?? '').slice(0, 200)
    const ext = filename.split('.').pop()?.toLowerCase() ?? ''

    if (!Number.isInteger(position) || position < 1 || positions.has(position) || !ALLOWED_EXT.has(ext)) {
      throw createError({ statusCode: 400, statusMessage: `Ogiltig fil eller position: ${filename || position}` })
    }

    positions.add(position)

    let dhash: string | null = null
    if (item.dhash != null) {
      try {
        // 64-bit signed value, sent as a decimal string (JSON can't hold bigint).
        const parsed = BigInt(item.dhash)
        dhash = BigInt.asIntN(64, parsed).toString()
      } catch {
        dhash = null
      }
    }

    // Colour descriptor for matching: "[v1,v2,...]" with exactly 576 numbers.
    let artVec: string | null = null
    if (typeof item.artVec === 'string' && item.artVec.length < 20000) {
      const parts = item.artVec.replace(/^\[|\]$/g, '').split(',')
      if (parts.length === 576 && parts.every((v) => Number.isFinite(Number(v)))) {
        artVec = `[${parts.map((v) => Number(v)).join(',')}]`
      }
    }

    return { position, filename, ext, dhash, artVec }
  })

  const supabase = useSupabaseAdmin()

  const { data: batch, error: batchError } = await supabase
    .from('scan_batches')
    .insert({ name, note: body?.note?.trim() || null, status: 'uploading', created_by: admin.email })
    .select('id, name, note, status, created_at')
    .single()

  if (batchError || !batch) {
    throw createError({ statusCode: 500, statusMessage: batchError?.message ?? 'Kunde inte skapa bunten' })
  }

  const rows = prepared.map((p) => ({
    batch_id: batch.id,
    position: p.position,
    filename: p.filename,
    image_path: `${batch.id}/${String(p.position).padStart(4, '0')}.${p.ext}`,
    dhash: p.dhash,
    art_vec: p.artVec
  }))

  const { error: itemsError } = await supabase.from('scan_items').insert(rows)

  if (itemsError) {
    await supabase.from('scan_batches').delete().eq('id', batch.id)
    throw createError({ statusCode: 500, statusMessage: itemsError.message })
  }

  const uploads = await Promise.all(
    rows.map(async (row) => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(row.image_path)

      if (error || !data) {
        throw createError({ statusCode: 500, statusMessage: error?.message ?? 'Kunde inte skapa uppladdningslänk' })
      }

      return { position: row.position, path: row.image_path, signedUrl: data.signedUrl }
    })
  )

  return { batch, uploads }
})
