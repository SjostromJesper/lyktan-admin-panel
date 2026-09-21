const SELECT_COLUMNS = 'id, default_pct, fee_kr, credit_bonus_pct, valid_days, pickup_days, company_legal_name, company_org_number, company_address, company_contact, updated_at'

type SettingsBody = {
  defaultPct?: number
  feeKr?: number
  creditBonusPct?: number
  validDays?: number
  pickupDays?: number
  companyLegalName?: string
  companyOrgNumber?: string
  companyAddress?: string
  companyContact?: string
}

const num = (value: unknown, fallback: number) => (Number.isFinite(Number(value)) ? Number(value) : fallback)

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'kortinkop', 'edit')

  const body = await readBody<SettingsBody>(event)
  const supabase = useSupabaseAdmin()

  const { data: current, error: currentError } = await supabase
    .from('kortinkop_settings')
    .select('id')
    .single()

  if (currentError) {
    throw createError({ statusCode: 500, statusMessage: currentError.message })
  }

  const { data, error } = await supabase
    .from('kortinkop_settings')
    .update({
      default_pct: num(body?.defaultPct, 60),
      fee_kr: num(body?.feeKr, 50),
      credit_bonus_pct: num(body?.creditBonusPct, 10),
      valid_days: num(body?.validDays, 7),
      pickup_days: num(body?.pickupDays, 30),
      company_legal_name: body?.companyLegalName ? String(body.companyLegalName).trim() : 'Lyktan Spel AB',
      company_org_number: body?.companyOrgNumber ? String(body.companyOrgNumber).trim() : '559541-9564',
      company_address: body?.companyAddress ? String(body.companyAddress).trim() : 'Veddestabron 8B, 177 48 Järfälla',
      company_contact: body?.companyContact ? String(body.companyContact).trim() : 'butiklyktan.se',
      updated_at: new Date().toISOString()
    })
    .eq('id', current.id)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { settings: data }
})
