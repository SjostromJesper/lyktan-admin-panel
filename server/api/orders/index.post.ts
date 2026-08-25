type OrderBody = {
  customerName?: string
  customerPhone?: string
  customerEmail?: string
  supplier?: string
  productLine?: string
  productCode?: string
  productName?: string
  priceKr?: number
  notes?: string
}

const VALID_SUPPLIERS = ['games_workshop', 'asmodee']
const SELECT_COLUMNS = 'id, customer_name, customer_phone, customer_email, supplier, product_line, product_code, product_name, price_kr, notes, status, ordered_at, completed_at, created_at'

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'orders', 'edit')

  const body = await readBody<OrderBody>(event)

  const customerName = String(body?.customerName || '').trim()
  const customerPhone = body?.customerPhone ? String(body.customerPhone).trim() : ''
  const customerEmail = body?.customerEmail ? String(body.customerEmail).trim().toLowerCase() : ''
  const supplier = String(body?.supplier || '').trim()
  const productLine = body?.productLine ? String(body.productLine).trim() : ''
  const productCode = body?.productCode ? String(body.productCode).trim() : ''
  const productName = String(body?.productName || '').trim()
  const priceKr = body?.priceKr !== undefined && body.priceKr !== null && String(body.priceKr) !== '' ? Number(body.priceKr) : null
  const notes = body?.notes ? String(body.notes).trim() : ''

  if (!customerName) {
    throw createError({ statusCode: 400, statusMessage: 'Kundnamn saknas' })
  }

  if (!customerPhone && !customerEmail) {
    throw createError({ statusCode: 400, statusMessage: 'Ange telefonnummer eller e-post' })
  }

  if (!VALID_SUPPLIERS.includes(supplier)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltig leverantör' })
  }

  if (!productName) {
    throw createError({ statusCode: 400, statusMessage: 'Produktnamn saknas' })
  }

  if (priceKr !== null && (!Number.isFinite(priceKr) || priceKr < 0)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltigt pris' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('orders')
    .insert({
      customer_name: customerName,
      customer_phone: customerPhone || null,
      customer_email: customerEmail || null,
      supplier,
      product_line: productLine || null,
      product_code: productCode || null,
      product_name: productName,
      price_kr: priceKr,
      notes: notes || null
    })
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  setResponseStatus(event, 201)

  return { order: data }
})
