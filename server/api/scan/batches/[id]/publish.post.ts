// Publishes ONE confirmed card to Shopify (the draft view calls this per card, in
// sequence, so it stays within the serverless time limit and never creates the
// same product twice in parallel). Failures are stored on the card and can be re-run.
export default defineEventHandler(async (event) => {
  await requireAccess(event, 'scan', 'edit')

  const id = getRouterParam(event, 'id')
  const body = (await readBody(event)) ?? {}
  const itemId = String(body.id ?? '')

  if (!id || !/^[0-9a-f-]{36}$/i.test(itemId)) {
    throw createError({ statusCode: 400, statusMessage: 'Kort saknas' })
  }

  const supabase = useSupabaseAdmin()

  const { data: item, error } = await supabase
    .from('scan_items')
    .select(PUBLISH_ITEM_SELECT)
    .eq('batch_id', id)
    .eq('id', itemId)
    .maybeSingle()

  if (error || !item) {
    throw createError({ statusCode: error ? 500 : 404, statusMessage: error?.message ?? 'Kortet hittades inte' })
  }

  try {
    const result = await publishScanItem(supabase, item as unknown as PublishItem)

    // Batch moves to "published" once every confirmed card meant for Shopify is out.
    const { data: rest } = await supabase
      .from('scan_items')
      .select('id')
      .eq('batch_id', id)
      .eq('status', 'confirmed')
      .in('sales_channel', ['shopify', 'both'])
      .or('publish_status.is.null,publish_status.neq.published')
      .limit(1)

    if (!rest?.length) await supabase.from('scan_batches').update({ status: 'published' }).eq('id', id)
    else await supabase.from('scan_batches').update({ status: 'drafted' }).eq('id', id).in('status', ['confirmed', 'priced'])

    return { ok: true, ...result }
  } catch (err: any) {
    const message = String(err?.statusMessage || err?.message || 'Okänt fel').slice(0, 500)
    await supabase.from('scan_items').update({ publish_status: 'failed', publish_error: message }).eq('id', itemId)
    throw createError({ statusCode: err?.statusCode ?? 500, statusMessage: message })
  }
})
