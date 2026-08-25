// Same client-credentials pattern as the web project: exchange the custom
// app's client ID/secret for a short-lived (24h) Admin API token — no
// static token is exposed in the Shopify Dev Dashboard UI to store instead.
let cachedToken: { token: string; expiresAt: number } | null = null

const getShopDomain = () =>
  String(process.env.SHOPIFY_STORE_DOMAIN || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')

const fetchAdminToken = async (): Promise<string> => {
  const shopDomain = getShopDomain()
  const clientId = process.env.SHOPIFY_ADMIN_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_ADMIN_CLIENT_SECRET

  if (!shopDomain || !clientId || !clientSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_CLIENT_ID / SHOPIFY_ADMIN_CLIENT_SECRET is missing'
    })
  }

  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`
  })

  const result = await response.json()

  if (!response.ok || !result.access_token) {
    throw createError({
      statusCode: response.status || 500,
      statusMessage: result.error_description || result.error || 'Failed to obtain Shopify Admin API token'
    })
  }

  cachedToken = {
    token: result.access_token,
    expiresAt: Date.now() + (Number(result.expires_in) - 60) * 1000
  }

  return cachedToken.token
}

export const getShopifyAdminToken = async (): Promise<string> => {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token
  }

  return fetchAdminToken()
}

export const shopifyAdminGraphql = async (query: string, variables?: Record<string, unknown>) => {
  const shopDomain = getShopDomain()
  const token = await getShopifyAdminToken()

  const response = await fetch(`https://${shopDomain}/admin/api/2026-01/graphql.json`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token
    },
    body: JSON.stringify({ query, variables })
  })

  const result = await response.json()

  if (!response.ok || result.errors?.length) {
    throw createError({
      statusCode: response.status || 500,
      statusMessage: result.errors?.map((entry: { message: string }) => entry.message).join(', ') || 'Shopify Admin API request failed'
    })
  }

  return result.data
}
