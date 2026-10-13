export default defineEventHandler(async (event) => {
  await requireAccess(event, 'scan', 'view')
  return { settings: await loadScanSettings(useSupabaseAdmin()) }
})
