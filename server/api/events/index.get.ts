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
          variants(first: 50) { nodes { title } }
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
    dateAndTime: product.dateAndTime?.value ?? null,
    // An event with several variants (e.g. four play times) has that many occasions.
    occasions: product.variants?.nodes?.length > 1 ? product.variants.nodes.length : 0
  }))

  return { events }
})
