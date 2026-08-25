import { createClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase client using the service role key — bypasses RLS.
 * Every route that uses this must call requireAdminSession() first.
 *
 * Deliberately not cached as a module-level singleton: in the Nuxt dev
 * server, HMR reloads of route files can end up holding a stale reference
 * to a previous client instance, which starts returning empty results
 * without erroring. A fresh client is cheap (it's just an HTTP wrapper,
 * no real connection to open) so we just create one per call.
 */
export const useSupabaseAdmin = () => {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is missing'
    })
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
}

// The one account that always has full access, regardless of the `staff`
// table's permission flags — so admin access can never be locked out by a
// misconfigured permission row.
export const SUPER_ADMIN_EMAIL = 'jesper@butiklyktan.se'
