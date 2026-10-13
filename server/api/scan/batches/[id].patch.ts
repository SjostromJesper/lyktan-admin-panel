// Batch-level settings: the purchase-offer percentage for this bunt
// (null = use the default from the price settings).
export default defineEventHandler(async (event) => {
  await requireAccess(event, 'scan', 'edit')

  const id = getRouterParam(event, 'id')
  const body = (await readBody(event)) ?? {}

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const patch: Record<string, unknown> = {}

  if ('purchase_percent' in body) {
    if (body.purchase_percent === null) {
      patch.purchase_percent = null
    } else {
      const percent = Number(body.purchase_percent)
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw createError({ statusCode: 400, statusMessage: 'Procenten måste vara mellan 0 och 100' })
      patch.purchase_percent = percent
    }
  }

  if (!Object.keys(patch).length) {
    throw createError({ statusCode: 400, statusMessage: 'Inget att uppdatera' })
  }

  const { error } = await useSupabaseAdmin().from('scan_batches').update(patch).eq('id', id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { ok: true }
})
