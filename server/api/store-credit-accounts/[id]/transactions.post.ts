type TransactionBody = {
  deltaKr?: number
  note?: string
}

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'store_credit', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const body = await readBody<TransactionBody>(event)
  const deltaKr = Number(body?.deltaKr)
  const note = body?.note ? String(body.note).trim() : ''

  if (!Number.isFinite(deltaKr) || deltaKr === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Ange ett giltigt belopp' })
  }

  const supabase = useSupabaseAdmin()

  const { data: account, error: accountError } = await supabase
    .from('store_credit_accounts')
    .select('id, balance_kr')
    .eq('id', id)
    .single()

  if (accountError) {
    throw createError({ statusCode: 500, statusMessage: accountError.message })
  }

  const newBalance = Number(account.balance_kr) + deltaKr

  if (newBalance < 0) {
    throw createError({ statusCode: 400, statusMessage: 'Beloppet överstiger saldot' })
  }

  const { data: updated, error: updateError } = await supabase
    .from('store_credit_accounts')
    .update({ balance_kr: newBalance, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, customer_name, balance_kr, created_at, updated_at')
    .single()

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: updateError.message })
  }

  const { error: transactionError } = await supabase
    .from('store_credit_transactions')
    .insert({ account_id: id, amount_kr: deltaKr, note: note || null })

  if (transactionError) {
    throw createError({ statusCode: 500, statusMessage: transactionError.message })
  }

  return { account: updated }
})
