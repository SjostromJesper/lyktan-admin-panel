type ExportResult =
  | { needsConfirm: true, alreadyExported: { name: string, exportedAt: string | null }[] }
  | { filename: string, csv: string, rows: number, copies: number, skipped: { name: string, reason: string }[], withoutPrice: number, reexported: number }

// Asks the server for the PowerTools file and saves it. Cards exported before are
// listed first (importing them again can double-list them on Cardmarket), and the
// file is only produced once the user has confirmed.
export const usePowertoolsExport = () => {
  const run = async (target: { batchId?: string, ids?: string[], setChannel?: 'cardmarket' | 'both' }) => {
    let result = await $fetch<ExportResult>('/api/scan/export/powertools', { method: 'POST', body: target })

    if ('needsConfirm' in result) {
      const names = result.alreadyExported.slice(0, 8).map((i) => i.name).join(', ')
      const more = result.alreadyExported.length > 8 ? ` och ${result.alreadyExported.length - 8} till` : ''
      const ok = confirm(`${result.alreadyExported.length} exemplar har redan exporterats till PowerTools (${names}${more}).\n\nOm du importerar dem igen kan de få dubbla annonser på Cardmarket. Exportera ändå?`)
      if (!ok) return { cancelled: true as const }
      result = await $fetch<ExportResult>('/api/scan/export/powertools', { method: 'POST', body: { ...target, force: true } })
    }

    if ('needsConfirm' in result) return { cancelled: true as const }

    const url = URL.createObjectURL(new Blob([result.csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = result.filename
    link.click()
    URL.revokeObjectURL(url)

    const parts = [`${result.copies} exemplar i ${result.rows} rader exporterade (${result.filename}).`]
    if (result.withoutPrice) parts.push(`${result.withoutPrice} rader saknar Cardmarket-pris.`)
    if (result.skipped.length) parts.push(`Hoppades över: ${result.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}.`)

    return { cancelled: false as const, message: parts.join(' '), warnings: result.skipped.length + result.withoutPrice }
  }

  return { run }
}
