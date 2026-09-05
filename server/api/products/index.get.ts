export default defineEventHandler(async (event) => {
  await requireAccess(event, 'products', 'view')

  const query = getQuery(event)
  const after = query.after ? String(query.after) : null

  const data = await shopifyAdminGraphql(`#graphql
    query AdminProducts($first: Int!, $after: String) {
      products(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          title
          handle
          status
          totalInventory
          featuredImage {
            url
            altText
          }
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          collections(first: 5) {
            nodes {
              title
            }
          }
        }
      }
    }
  `, { first: 30, after })

  return {
    products: data.products?.nodes ?? [],
    pageInfo: data.products?.pageInfo ?? { hasNextPage: false, endCursor: null }
  }
})
