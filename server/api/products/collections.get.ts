export default defineEventHandler(async (event) => {
  await requireAccess(event, 'products', 'view')

  const data = await shopifyAdminGraphql(`#graphql
    query Collections {
      collections(first: 50, sortKey: TITLE) {
        nodes {
          id
          title
        }
      }
    }
  `)

  return { collections: data.collections?.nodes ?? [] }
})
