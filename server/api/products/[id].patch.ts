export default defineEventHandler(async (event) => {
  await requireAccess(event, 'products', 'edit')

  const id = getRouterParam(event, 'id')
  const productId = `gid://shopify/Product/${id}`

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
  const deleteImageIds = getFields('deleteImageIds')
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

  const currentData = await shopifyAdminGraphql(`#graphql
    query CurrentProduct($id: ID!) {
      product(id: $id) {
        id
        variants(first: 1) {
          nodes {
            id
            inventoryItem {
              id
            }
          }
        }
        collections(first: 20) {
          nodes {
            id
          }
        }
        releaseDate: metafield(namespace: "custom", key: "release_date") {
          id
        }
      }
    }
  `, { id: productId })

  const current = currentData.product

  if (!current) {
    throw createError({ statusCode: 404, statusMessage: 'Produkten hittades inte' })
  }

  const currentCollectionIds: string[] = (current.collections?.nodes ?? []).map((node: any) => node.id)
  const collectionsToJoin = collectionIds.filter((collId) => !currentCollectionIds.includes(collId))
  const collectionsToLeave = currentCollectionIds.filter((collId) => !collectionIds.includes(collId))

  const warnings: string[] = []

  if (deleteImageIds.length) {
    const deleteData = await shopifyAdminGraphql(`#graphql
      mutation DeleteImages($fileIds: [ID!]!) {
        fileDelete(fileIds: $fileIds) {
          userErrors {
            field
            message
          }
        }
      }
    `, { fileIds: deleteImageIds })

    const deleteErrors = deleteData.fileDelete?.userErrors ?? []

    if (deleteErrors.length) {
      warnings.push(`Vissa bilder kunde inte tas bort: ${deleteErrors.map((entry: any) => entry.message).join(', ')}`)
    }
  }

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

  const metafields: { namespace: string, key: string, type: string, value: string }[] = []

  if (releaseDate) {
    metafields.push({ namespace: 'custom', key: 'release_date', type: 'date', value: releaseDate })
  } else if (current.releaseDate?.id) {
    const metafieldDeleteData = await shopifyAdminGraphql(`#graphql
      mutation DeleteReleaseDate($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) {
          userErrors {
            field
            message
          }
        }
      }
    `, { metafields: [{ ownerId: productId, namespace: 'custom', key: 'release_date' }] })

    const metafieldDeleteErrors = metafieldDeleteData.metafieldsDelete?.userErrors ?? []

    if (metafieldDeleteErrors.length) {
      warnings.push(`Releasedatum kunde inte tas bort: ${metafieldDeleteErrors.map((entry: any) => entry.message).join(', ')}`)
    }
  }

  const updateData = await shopifyAdminGraphql(`#graphql
    mutation UpdateProduct($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
      productUpdate(product: $product, media: $media) {
        product {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `, {
    product: {
      id: productId,
      title,
      descriptionHtml: descriptionToHtml(description),
      tags,
      status,
      collectionsToJoin: collectionsToJoin.length ? collectionsToJoin : undefined,
      collectionsToLeave: collectionsToLeave.length ? collectionsToLeave : undefined,
      metafields: metafields.length ? metafields : undefined
    },
    media: mediaInputs.length ? mediaInputs : undefined
  })

  const updateErrors = updateData.productUpdate?.userErrors ?? []

  if (updateErrors.length) {
    throw createError({ statusCode: 400, statusMessage: updateErrors.map((entry: any) => entry.message).join(', ') })
  }

  // From here on the product update already went through — surface problems
  // with price/stock as warnings instead of pretending the whole edit failed.
  const variant = current.variants?.nodes?.[0]

  if (variant?.id) {
    try {
      const variantInput: Record<string, unknown> = { id: variant.id, price: priceKr.toFixed(2) }
      variantInput.compareAtPrice = compareAtPriceKr !== null ? compareAtPriceKr.toFixed(2) : null

      const variantData = await shopifyAdminGraphql(`#graphql
        mutation UpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            userErrors {
              field
              message
            }
          }
        }
      `, { productId, variants: [variantInput] })

      const variantErrors = variantData.productVariantsBulkUpdate?.userErrors ?? []

      if (variantErrors.length) {
        warnings.push(`Pris kunde inte sättas: ${variantErrors.map((entry: any) => entry.message).join(', ')}`)
      }
    } catch (err: any) {
      warnings.push(`Pris kunde inte sättas: ${err?.statusMessage || err?.message}`)
    }

    const inventoryItemId = variant.inventoryItem?.id

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
          // Idempotent — harmless if the item was already tracked/activated
          // from an earlier edit or from product creation.
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

  return { warnings }
})
