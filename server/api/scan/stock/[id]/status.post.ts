// Changes the stock status of ONE copy (the list calls this per card, in sequence,
// so each request stays within the serverless time limit).
export default defineEventHandler(async (event) => {
  const user = await requireAccess(event, 'scan', 'edit')

  const id = getRouterParam(event, 'id')
  const body = (await readBody(event)) ?? {}

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  if (!STOCK_ACTIONS.includes(body.action)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltig åtgärd' })
  }

  const note = String(body.note ?? '').trim().slice(0, 300) || null

  return changeStockStatus(useSupabaseAdmin(), id, body.action, {
    channel: body.channel ? String(body.channel) : null,
    note,
    orderName: body.orderName ? String(body.orderName).slice(0, 40) : null,
    user: user.email
  })
})
