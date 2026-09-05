const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const descriptionToHtml = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('')

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'products', 'edit')

  const parts = await readMultipartFormData(event)

  if (!parts) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltig data' })
  }

  const getField = (name: string) => parts.find((part) => part.name === name && !part.filename)?.data?.toString('utf-8') ?? ''
  const getFields = (name: string) => parts.filter((part) => part.name === name && !part.filename).map((part) => part.data.toString('utf-8'))
  const imageFiles = parts.filter((part) => part.name === 'images' && part.filename)

  const title = getField('title').trim()
  const description = getField('description').trim()
  const priceKr = Number(getField('priceKr'))
  const compareAtPriceRaw = getField('compareAtPriceKr').trim()
  const compareAtPriceKr = compareAtPriceRaw ? Number(compareAtPriceRaw) : null
  const inventoryQuantity = Number(getField('inventoryQuantity') || '0')
  const collectionIds = getFields('collectionIds')
  const tagsRaw = getField('tags').trim()
  const tags = tagsRaw ? tagsRaw.split(',').map((tag) => tag.trim()).filter(Boolean) : []
  const status = getField('status') === 'DRAFT' ? 'DRAFT' : 'ACTIVE'
  const releaseDate = getField('releaseDate').trim()

  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'Titel saknas' })
  }

  if (releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltigt releasedatum' })
  }

  if (!Number.isFinite(priceKr) || priceKr < 0) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltigt pris' })
  }

  if (compareAtPriceKr !== null && (!Number.isFinite(compareAtPriceKr) || compareAtPriceKr < 0)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltigt jämförelsepris' })
  }

  if (!Number.isFinite(inventoryQuantity) || inventoryQuantity < 0) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltigt lagerantal' })
  }

  // Images have to be staged+uploaded before the product exists — a staged
  // upload is just a generic file, not yet attached to anything.
  const mediaInputs: { originalSource: string, mediaContentType: string, alt: string }[] = []

  if (imageFiles.length) {
    const stagedData = await shopifyAdminGraphql(`#graphql
      mutation StagedUploads($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      input: imageFiles.map((file) => ({
        resource: 'IMAGE',
        filename: file.filename,
        mimeType: file.type || 'image/jpeg',
        fileSize: String(file.data.length),
        httpMethod: 'POST'
      }))
    })

    const stagedErrors = stagedData.stagedUploadsCreate?.userErrors ?? []

    if (stagedErrors.length) {
      throw createError({ statusCode: 400, statusMessage: stagedErrors.map((entry: any) => entry.message).join(', ') })
    }

    const targets = stagedData.stagedUploadsCreate?.stagedTargets ?? []

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i]
      const file = imageFiles[i]

      const uploadForm = new FormData()

      for (const param of target.parameters) {
        uploadForm.append(param.name, param.value)
      }

      uploadForm.append('file', new Blob([file.data], { type: file.type || 'application/octet-stream' }), file.filename)

      const uploadResponse = await fetch(target.url, { method: 'POST', body: uploadForm })

      if (!uploadResponse.ok) {
        throw createError({ statusCode: 502, statusMessage: `Kunde inte ladda upp bilden "${file.filename}"` })
      }

      mediaInputs.push({ originalSource: target.resourceUrl, mediaContentType: 'IMAGE', alt: title })
    }
  }

  const createData = await shopifyAdminGraphql(`#graphql
    mutation CreateProduct($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
      productCreate(product: $product, media: $media) {
        product {
          id
          handle
          variants(first: 1) {
            nodes {
              id
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `, {
    product: {
      title,
      descriptionHtml: descriptionToHtml(description),
      tags,
      status,
      collectionsToJoin: collectionIds,
      metafields: releaseDate ? [{ namespace: 'custom', key: 'release_date', type: 'date', value: releaseDate }] : undefined
    },
    media: mediaInputs.length ? mediaInputs : undefined
  })

  const createErrors = createData.productCreate?.userErrors ?? []

  if (createErrors.length) {
    throw createError({ statusCode: 400, statusMessage: createErrors.map((entry: any) => entry.message).join(', ') })
  }

  const product = createData.productCreate?.product

  if (!product) {
    throw createError({ statusCode: 500, statusMessage: 'Produkten kunde inte skapas' })
  }

  // From here on the product already exists in Shopify — surface problems
  // as warnings (with a link to finish up there) instead of pretending the
  // whole create failed.
  const warnings: string[] = []
  const variantId = product.variants?.nodes?.[0]?.id

  if (variantId) {
    try {
      const variantInput: Record<string, unknown> = { id: variantId, price: priceKr.toFixed(2) }

      if (compareAtPriceKr !== null) {
        variantInput.compareAtPrice = compareAtPriceKr.toFixed(2)
      }

      // A freshly created variant's inventory item defaults to untracked —
      // stock quantity is meaningless (and totalInventory stays 0) until
      // tracking is turned on explicitly.
      variantInput.inventoryItem = { tracked: true }

      const variantData = await shopifyAdminGraphql(`#graphql
        mutation UpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants {
              id
              inventoryItem {
                id
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `, { productId: product.id, variants: [variantInput] })

      const variantErrors = variantData.productVariantsBulkUpdate?.userErrors ?? []

      if (variantErrors.length) {
        warnings.push(`Pris kunde inte sättas: ${variantErrors.map((entry: any) => entry.message).join(', ')}`)
      } else {
        const inventoryItemId = variantData.productVariantsBulkUpdate?.productVariants?.[0]?.inventoryItem?.id

        if (inventoryItemId) {
          try {
            const locationData = await shopifyAdminGraphql(`#graphql
              query PrimaryLocation {
                locations(first: 1) {
                  nodes {
                    id
                  }
                }
              }
            `)
            const locationId = locationData.locations?.nodes?.[0]?.id

            if (locationId) {
              // A brand new inventory item isn't "stocked" at any location
              // yet — inventorySetQuantities fails with "not stocked at the
              // location" until it's activated there first.
              await shopifyAdminGraphql(`#graphql
                mutation ActivateInventory($id: ID!, $locationId: ID!) {
                  inventoryActivate(inventoryItemId: $id, locationId: $locationId) {
                    userErrors {
                      field
                      message
                    }
                  }
                }
              `, { id: inventoryItemId, locationId })

              const inventoryData = await shopifyAdminGraphql(`#graphql
                mutation SetInventory($input: InventorySetQuantitiesInput!) {
                  inventorySetQuantities(input: $input) {
                    userErrors {
                      field
                      message
                    }
                  }
                }
              `, {
                input: {
                  reason: 'correction',
                  name: 'available',
                  ignoreCompareQuantity: true,
                  quantities: [{ inventoryItemId, locationId, quantity: inventoryQuantity }]
                }
              })

              const inventoryErrors = inventoryData.inventorySetQuantities?.userErrors ?? []

              if (inventoryErrors.length) {
                warnings.push(`Lagerantal kunde inte sättas: ${inventoryErrors.map((entry: any) => entry.message).join(', ')}`)
              }
            } else {
              warnings.push('Hittade ingen butikslokal att sätta lagerantal på.')
            }
          } catch (err: any) {
            warnings.push(`Lagerantal kunde inte sättas: ${err?.statusMessage || err?.message}`)
          }
        }
      }
    } catch (err: any) {
      warnings.push(`Pris/lager kunde inte sättas: ${err?.statusMessage || err?.message}`)
    }
  }

  // A newly created product isn't visible via the Storefront API until it's
  // published to a sales channel — publish to all of them.
  try {
    const pubData = await shopifyAdminGraphql(`#graphql
      query Publications {
        publications(first: 10) {
          nodes {
            id
          }
        }
      }
    `)
    const publicationIds = (pubData.publications?.nodes ?? []).map((entry: any) => entry.id)

    if (publicationIds.length) {
      const publishData = await shopifyAdminGraphql(`#graphql
        mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            userErrors {
              field
              message
            }
          }
        }
      `, { id: product.id, input: publicationIds.map((id: string) => ({ publicationId: id })) })

      const publishErrors = publishData.publishablePublish?.userErrors ?? []

      if (publishErrors.length) {
        warnings.push(`Produkten publicerades inte överallt: ${publishErrors.map((entry: any) => entry.message).join(', ')}`)
      }
    }
  } catch (err: any) {
    warnings.push(`Produkten kunde inte publiceras: ${err?.statusMessage || err?.message}`)
  }

  const shopDomain = String(process.env.SHOPIFY_STORE_DOMAIN || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.myshopify\.com$/i, '')

  setResponseStatus(event, 201)

  return {
    product: {
      id: product.id,
      handle: product.handle,
      adminUrl: `https://admin.shopify.com/store/${shopDomain}/products/${product.id.split('/').pop()}`
    },
    warnings
  }
})
