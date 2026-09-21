const SELECT_COLUMNS = 'id, default_pct, fee_kr, credit_bonus_pct, valid_days, pickup_days, company_legal_name, company_org_number, company_address, company_contact, updated_at'

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'kortinkop', 'view')

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('kortinkop_settings')
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { settings: data }
})
