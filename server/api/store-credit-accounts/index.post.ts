type CreateAccountBody = {
  customerName?: string
  amountKr?: number
  note?: string
}

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'store_credit', 'edit')

  const body = await readBody<CreateAccountBody>(event)

  const customerName = String(body?.customerName || '').trim()
  const amountKr = Number(body?.amountKr)
  const note = body?.note ? String(body.note).trim() : ''

  if (!customerName) {
    throw createError({ statusCode: 400, statusMessage: 'Namn saknas' })
  }

  if (!Number.isFinite(amountKr) || amountKr <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Ange ett giltigt belopp' })
  }

  const supabase = useSupabaseAdmin()

  const { data: account, error: accountError } = await supabase
    .from('store_credit_accounts')
    .insert({ customer_name: customerName, balance_kr: amountKr })
    .select('id, customer_name, balance_kr, created_at, updated_at')
    .single()

  if (accountError) {
    throw createError({ statusCode: 500, statusMessage: accountError.message })
  }

  const { error: transactionError } = await supabase
    .from('store_credit_transactions')
    .insert({ account_id: account.id, amount_kr: amountKr, note: note || null })

  if (transactionError) {
    throw createError({ statusCode: 500, statusMessage: transactionError.message })
  }

  setResponseStatus(event, 201)

  return { account }
})
