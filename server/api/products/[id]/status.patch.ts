const VALID_STATUSES = ['ACTIVE', 'DRAFT', 'ARCHIVED']

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'products', 'edit')

  const id = getRouterParam(event, 'id')
  const productId = `gid://shopify/Product/${id}`

  const body = await readBody<{ status?: string }>(event)
  const status = String(body?.status || '')

  if (!VALID_STATUSES.includes(status)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltig status' })
  }

  const data = await shopifyAdminGraphql(`#graphql
    mutation UpdateProductStatus($product: ProductUpdateInput!) {
      productUpdate(product: $product) {
        product {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `, { product: { id: productId, status } })

  const errors = data.productUpdate?.userErrors ?? []

  if (errors.length) {
    throw createError({ statusCode: 400, statusMessage: errors.map((entry: any) => entry.message).join(', ') })
  }

  return { status: data.productUpdate?.product?.status }
})
