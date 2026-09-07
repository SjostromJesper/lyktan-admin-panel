export default defineEventHandler(async (event) => {
  await requireAccess(event, 'products', 'view')

  const id = getRouterParam(event, 'id')
  const productId = `gid://shopify/Product/${id}`

  const data = await shopifyAdminGraphql(`#graphql
    query ProductDetail($id: ID!) {
      product(id: $id) {
        id
        title
        descriptionHtml
        status
        tags
        variants(first: 1) {
          nodes {
            id
            price
            compareAtPrice
            inventoryQuantity
          }
        }
        collections(first: 20) {
          nodes {
            id
          }
        }
        media(first: 20) {
          nodes {
            id
            ... on MediaImage {
              image {
                url
                altText
              }
            }
          }
        }
        releaseDate: metafield(namespace: "custom", key: "release_date") {
          value
        }
      }
    }
  `, { id: productId })

  const product = data.product

  if (!product) {
    throw createError({ statusCode: 404, statusMessage: 'Produkten hittades inte' })
  }

  const variant = product.variants?.nodes?.[0]

  return {
    product: {
      id: product.id,
      title: product.title,
      description: descriptionFromHtml(product.descriptionHtml || ''),
      status: product.status,
      tags: (product.tags || []).join(', '),
      priceKr: variant ? Number(variant.price) : 0,
      compareAtPriceKr: variant?.compareAtPrice ? Number(variant.compareAtPrice) : null,
      inventoryQuantity: variant?.inventoryQuantity ?? 0,
      collectionIds: (product.collections?.nodes ?? []).map((node: any) => node.id),
      releaseDate: product.releaseDate?.value ?? '',
      images: (product.media?.nodes ?? [])
        .filter((node: any) => node.image)
        .map((node: any) => ({ id: node.id, url: node.image.url, altText: node.image.altText }))
    }
  }
})
