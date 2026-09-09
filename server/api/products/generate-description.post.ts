const SYSTEM_PROMPT = `Du skriver produktbeskrivningar på svenska för Butik Lyktans webshop (spel- och hobbybutik: kortspel, brädspel, rollspel, miniatyrspel).

Stil:
- Rad 1: en kort, säljande men saklig temarad (vad produkten är / vad den handlar om).
- Därefter: konkreta fakta — vad som ingår, antal, format, specifikationer. Bara det som faktiskt stämmer utifrån given information, hitta inte på detaljer.
- Sluta där. Skriv ALDRIG en avslutande säljmening i stil med "Perfekt för dig som..." eller "Kom förbi butiken...". Ingen generisk call-to-action.
- Max 2-3 korta stycken.

Format: ren text, inga HTML-taggar. Separera stycken med en tom rad. Inget bindestreck-radbrytning, inga rubriker, ingen titel (den skrivs redan ut separat).`

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'products', 'edit')

  const body = await readBody<{ title?: string, facts?: string }>(event)
  const title = String(body?.title || '').trim()
  const facts = String(body?.facts || '').trim()

  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'Titel saknas' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    throw createError({ statusCode: 500, statusMessage: 'ANTHROPIC_API_KEY är inte konfigurerad' })
  }

  const userMessage = facts
    ? `Produkt: ${title}\n\nFakta att utgå från:\n${facts}`
    : `Produkt: ${title}\n\n(Inga extra fakta angivna — skriv en kort, rimlig beskrivning utifrån titeln. Om titeln inte ger nog underlag för konkreta fakta, håll dig till en kort temarad.)`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    })
  })

  const result = await response.json()

  if (!response.ok) {
    throw createError({ statusCode: response.status, statusMessage: result?.error?.message || 'Kunde inte generera text' })
  }

  const text = (result.content ?? [])
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('')
    .trim()

  if (!text) {
    throw createError({ statusCode: 500, statusMessage: 'Fick inget svar från AI:n' })
  }

  return { description: text }
})
