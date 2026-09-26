export default defineEventHandler(async (event) => {
  await requireAccess(event, 'events', 'view')

  const data = await shopifyAdminGraphql(`#graphql
    query EventProducts {
      products(first: 100, sortKey: CREATED_AT, reverse: true, query: "tag:event") {
        nodes {
          id
          legacyResourceId
          title
          handle
          status
          featuredImage { url altText }
          dateAndTime: metafield(namespace: "custom", key: "date_and_time") { value }
        }
      }
    }
  `)

  const events = (data.products?.nodes ?? []).map((product: any) => ({
    id: product.legacyResourceId,
    title: product.title,
    handle: product.handle,
    status: product.status,
    imageUrl: product.featuredImage?.url ?? null,
    dateAndTime: product.dateAndTime?.value ?? null
  }))

  return { events }
})
