type OrderPatchBody = {
  customerName?: string
  customerPhone?: string
  customerEmail?: string
  supplier?: string
  productLine?: string
  productCode?: string
  productName?: string
  priceKr?: number | null
  notes?: string
  status?: 'bokad' | 'bestalld' | 'slut_pa_lager' | 'klar'
}

const VALID_SUPPLIERS = ['games_workshop', 'asmodee']
const VALID_STATUSES = ['bokad', 'bestalld', 'slut_pa_lager', 'klar']

const toIsoDate = (d: Date) => d.toISOString().slice(0, 10)

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'orders', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const body = await readBody<OrderPatchBody>(event)
  const update: Record<string, unknown> = {}

  if (body.customerName !== undefined) {
    const name = String(body.customerName).trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: 'Kundnamn saknas' })
    update.customer_name = name
  }

  if (body.customerPhone !== undefined) update.customer_phone = body.customerPhone ? String(body.customerPhone).trim() || null : null
  if (body.customerEmail !== undefined) update.customer_email = body.customerEmail ? String(body.customerEmail).trim().toLowerCase() || null : null

  if ('customer_phone' in update && 'customer_email' in update && !update.customer_phone && !update.customer_email) {
    throw createError({ statusCode: 400, statusMessage: 'Ange telefonnummer eller e-post' })
  }

  if (body.supplier !== undefined) {
    if (!VALID_SUPPLIERS.includes(body.supplier)) {
      throw createError({ statusCode: 400, statusMessage: 'Ogiltig leverantör' })
    }
    update.supplier = body.supplier
  }

  if (body.productLine !== undefined) update.product_line = body.productLine ? String(body.productLine).trim() || null : null
  if (body.productCode !== undefined) update.product_code = body.productCode ? String(body.productCode).trim() || null : null

  if (body.productName !== undefined) {
    const name = String(body.productName).trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: 'Produktnamn saknas' })
    update.product_name = name
  }

  if (body.priceKr !== undefined) {
    const price = body.priceKr === null || String(body.priceKr) === '' ? null : Number(body.priceKr)
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      throw createError({ statusCode: 400, statusMessage: 'Ogiltigt pris' })
    }
    update.price_kr = price
  }

  if (body.notes !== undefined) update.notes = body.notes ? String(body.notes).trim() || null : null

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      throw createError({ statusCode: 400, statusMessage: 'Ogiltig status' })
    }
    update.status = body.status
    update.completed_at = body.status === 'klar' ? toIsoDate(new Date()) : null
  }

  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Inget att uppdatera' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('orders')
    .update(update)
    .eq('id', id)
    .select('id, customer_name, customer_phone, customer_email, supplier, product_line, product_code, product_name, price_kr, notes, status, ordered_at, completed_at, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { order: data }
})
