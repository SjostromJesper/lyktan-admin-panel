// Publishes scanned singles to Shopify in the shape the webshop's singles section
// reads (web: server/api/shopify/singelkort.get.ts + pages/singelkort):
//
//  - one product per printing (game + set + collector number + language), titled
//    with just the card name; everything else is metadata (custom.card_game,
//    card_set, set_code, rarity, collector_number, card_language) and tags
//  - variants = Skick x Foil, with Swedish option values (Nyskick/Utmärkt/Bra/Ok/Dåligt, Ja/Nej)
//  - each variant carries the scan of one physical copy as its image
//  - stock is only ever changed with inventoryAdjustQuantities deltas
//
// One call publishes one scan item and is idempotent: re-running a failed item
// does not duplicate the product, variant or stock.

const GAME_LABELS: Record<string, string> = { mtg: 'Magic: The Gathering', pokemon: 'Pokémon' }
const GAME_TAGS: Record<string, string> = { mtg: 'magic', pokemon: 'pokemon' }

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'Engelska', sv: 'Svenska', de: 'Tyska', fr: 'Franska', it: 'Italienska', es: 'Spanska',
  pt: 'Portugisiska', ja: 'Japanska', ko: 'Koreanska', ru: 'Ryska', zhs: 'Kinesiska (förenklad)', zht: 'Kinesiska (traditionell)'
}

// The webshop has five condition levels; PL and PO share the lowest.
const CONDITION_OPTION: Record<string, string> = { NM: 'Nyskick', EX: 'Utmärkt', GD: 'Bra', LP: 'Ok', PL: 'Dåligt', PO: 'Dåligt' }

const RARITY_LABELS: Record<string, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', mythic: 'Mythic Rare', special: 'Special', bonus: 'Bonus' }

const SINGLES_COLLECTION_HANDLE = 'singelkort'

export type PublishItem = {
  id: string
  condition: string
  language: string
  is_foil: boolean
  is_manual: boolean
  manual_name: string | null
  manual_set_name: string | null
  manual_set_code: string | null
  manual_collector_number: string | null
  manual_rarity: string | null
  game: string | null
  price_sek: number | null
  image_source: 'scan' | 'reference'
  image_path: string | null
  sales_channel: string
  status: string
  stock_status: string | null
  publish_status: string | null
  shopify_stocked: boolean
  shopify_product_id: string | null
  shopify_variant_id: string | null
  shopify_inventory_item_id: string | null
  shopify_sku: string | null
  matched_card: {
    id: string
    game: string
    name: string
    set_code: string
    set_name: string
    collector_number: string
    rarity: string | null
    image_url: string | null
    cardmarket_id: number | null
  } | null
}

export const PUBLISH_ITEM_SELECT =
  'id, condition, language, is_foil, is_manual, manual_name, manual_set_name, manual_set_code, manual_collector_number, manual_rarity, game, price_sek, image_source, image_path, sales_channel, status, stock_status, publish_status, shopify_stocked, shopify_product_id, shopify_variant_id, shopify_inventory_item_id, shopify_sku, matched_card:tcg_cards!scan_items_matched_card_id_fkey(id, game, name, set_code, set_name, collector_number, rarity, image_url, cardmarket_id)'

const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const buildCardSpec = (item: PublishItem) => {
  const card = item.matched_card
  const game = card?.game ?? item.game ?? 'mtg'
  const name = (card?.name ?? item.manual_name ?? '').trim()
  const setName = card?.set_name ?? item.manual_set_name ?? ''
  const setCode = (card?.set_code ?? item.manual_set_code ?? '').toUpperCase()
  const number = card?.collector_number ?? item.manual_collector_number ?? ''
  const rarityRaw = (card?.rarity ?? item.manual_rarity ?? '').trim()
  const rarity = RARITY_LABELS[rarityRaw.toLowerCase()] ?? rarityRaw
  const language = item.language || 'en'

  const handleParts = [slug(name), slug(setCode), slug(number)].filter(Boolean)
  // Manual cards without set/number would otherwise collide by name.
  if (item.is_manual && !setCode && !number) handleParts.push(item.id.slice(0, 8))
  if (language !== 'en') handleParts.push(language)

  const conditionOption = CONDITION_OPTION[item.condition] ?? 'Nyskick'
  const foilOption = item.is_foil ? 'Ja' : 'Nej'
  const cardId = card ? (card.cardmarket_id ?? card.id) : item.id
  const sku = `${game}-${cardId}-${item.condition}-${language}-${item.is_foil ? 'foil' : 'nf'}`

  const tags = [
    'single',
    GAME_TAGS[game] ?? game,
    setCode ? `set:${setCode.toLowerCase()}` : '',
    rarity ? `rarity:${slug(rarity)}` : '',
    item.is_foil ? 'foil' : '',
    `skick:${item.condition.toLowerCase()}`,
    `språk:${language}`
  ].filter(Boolean)

  const metafields = [
    { key: 'card_game', value: GAME_LABELS[game] ?? game },
    { key: 'card_set', value: setName },
    { key: 'set_code', value: setCode },
    { key: 'rarity', value: rarity },
    { key: 'collector_number', value: number },
    { key: 'card_language', value: LANGUAGE_LABELS[language] ?? language }
  ]
    .filter((m) => m.value)
    .map((m) => ({ namespace: 'custom', type: 'single_line_text_field', ...m }))

  return { game, name, handle: handleParts.join('-'), sku, conditionOption, foilOption, tags, metafields }
}

type Ctx = {
  locationId: string
  publicationIds: string[]
  headlessPublicationId: string | null
  collectionId: string | null
}

let cachedCtx: { ctx: Ctx, expiresAt: number } | null = null

const HEADLESS_PUBLICATION_NAME = 'Butik Lyktan Headless'

const userErrorMessage = (errors: any[] | undefined) => (errors ?? []).map((e) => e.message).join(', ')

const loadCtx = async (): Promise<Ctx> => {
  if (cachedCtx && Date.now() < cachedCtx.expiresAt) return cachedCtx.ctx

  const data = await shopifyAdminGraphql(`#graphql
    query PublishContext {
      locations(first: 1) { nodes { id } }
      publications(first: 20) { nodes { id name } }
      collectionByHandle(handle: "${SINGLES_COLLECTION_HANDLE}") { id }
    }
  `)

  const locationId = data.locations?.nodes?.[0]?.id

  if (!locationId) {
    throw createError({ statusCode: 500, statusMessage: 'Hittade ingen lagerplats i Shopify' })
  }

  const publications = (data.publications?.nodes ?? []) as { id: string, name: string }[]
  const ctx: Ctx = {
    locationId,
    publicationIds: publications.map((p) => p.id),
    headlessPublicationId: publications.find((p) => p.name === HEADLESS_PUBLICATION_NAME)?.id ?? null,
    collectionId: data.collectionByHandle?.id ?? null
  }

  cachedCtx = { ctx, expiresAt: Date.now() + 5 * 60 * 1000 }
  return ctx
}

const PRODUCT_FIELDS = `#graphql
  id
  handle
  status
  tags
  variants(first: 100) {
    nodes {
      id
      sku
      selectedOptions { name value }
      inventoryItem { id }
    }
  }
  resourcePublicationsV2(first: 20) {
    nodes { isPublished publication { id } }
  }
`

const findProduct = async (handle: string, sku: string) => {
  const byHandle = await shopifyAdminGraphql(`#graphql
    query ProductByHandle($handle: String!) {
      productByIdentifier(identifier: { handle: $handle }) { ${PRODUCT_FIELDS} }
    }
  `, { handle })

  if (byHandle.productByIdentifier) return byHandle.productByIdentifier

  // Created by hand or under another handle: the SKU is the source of truth.
  const bySku = await shopifyAdminGraphql(`#graphql
    query ProductBySku($query: String!) {
      productVariants(first: 1, query: $query) { nodes { product { ${PRODUCT_FIELDS} } } }
    }
  `, { query: `sku:'${sku.replace(/'/g, '')}'` })

  return bySku.productVariants?.nodes?.[0]?.product ?? null
}

const optionValue = (variant: any, name: string) =>
  variant.selectedOptions?.find((o: any) => o.name === name)?.value ?? null

const findVariant = (product: any, spec: ReturnType<typeof buildCardSpec>) =>
  product.variants.nodes.find((v: any) => optionValue(v, 'Skick') === spec.conditionOption && optionValue(v, 'Foil') === spec.foilOption)
  ?? product.variants.nodes.find((v: any) => v.sku === spec.sku)

const imageUrlFor = async (supabase: ReturnType<typeof useSupabaseAdmin>, item: PublishItem) => {
  if (item.image_source === 'reference' && item.matched_card?.image_url) return item.matched_card.image_url

  if (item.image_path) {
    const { data } = await supabase.storage.from('scan-images').createSignedUrl(item.image_path, 60 * 60)
    if (data?.signedUrl) return data.signedUrl
  }

  return item.matched_card?.image_url ?? null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// New variants can't take an image URL directly: upload it as product media, wait
// until Shopify has processed it, then attach it to the variant.
const attachVariantImage = async (productId: string, variantId: string, url: string, alt: string) => {
  const created = await shopifyAdminGraphql(`#graphql
    mutation AddMedia($id: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $id, media: $media) {
        media { id status }
        mediaUserErrors { message }
      }
    }
  `, { id: productId, media: [{ originalSource: url, mediaContentType: 'IMAGE', alt }] })

  const errors = created.productCreateMedia?.mediaUserErrors
  const mediaId = created.productCreateMedia?.media?.[0]?.id

  if (errors?.length || !mediaId) throw createError({ statusCode: 502, statusMessage: userErrorMessage(errors) || 'Bilden laddades inte upp' })

  for (let attempt = 0; attempt < 12; attempt++) {
    const status = await shopifyAdminGraphql(`#graphql
      query MediaStatus($id: ID!) { node(id: $id) { ... on MediaImage { status } } }
    `, { id: mediaId })
    const value = status.node?.status

    if (value === 'READY') break
    if (value === 'FAILED') throw createError({ statusCode: 502, statusMessage: 'Shopify kunde inte bearbeta bilden' })
    if (attempt === 11) throw createError({ statusCode: 504, statusMessage: 'Bilden blev inte klar i tid' })
    await sleep(700)
  }

  const appended = await shopifyAdminGraphql(`#graphql
    mutation AppendMedia($productId: ID!, $variantMedia: [ProductVariantAppendMediaInput!]!) {
      productVariantAppendMedia(productId: $productId, variantMedia: $variantMedia) {
        userErrors { message }
      }
    }
  `, { productId, variantMedia: [{ variantId, mediaIds: [mediaId] }] })

  if (appended.productVariantAppendMedia?.userErrors?.length) {
    throw createError({ statusCode: 502, statusMessage: userErrorMessage(appended.productVariantAppendMedia.userErrors) })
  }
}

export const validatePublishItem = (item: PublishItem) => {
  if (item.status !== 'confirmed') return 'Kortet är inte bekräftat'
  if (item.publish_status === 'published') return 'Kortet är redan publicerat'
  if (item.stock_status && item.stock_status !== 'listed') return 'Kortet är inte längre till salu'
  if (!['shopify', 'both'].includes(item.sales_channel)) return 'Kortet är inte inställt för Shopify'
  if (!item.matched_card && !(item.is_manual && item.manual_name)) return 'Kortet saknar namn'
  if (!item.price_sek || item.price_sek <= 0) return 'Kortet saknar pris'
  return null
}

export const publishScanItem = async (supabase: ReturnType<typeof useSupabaseAdmin>, item: PublishItem) => {
  const invalid = validatePublishItem(item)
  if (invalid) throw createError({ statusCode: 400, statusMessage: invalid })

  const ctx = await loadCtx()
  const spec = buildCardSpec(item)
  const imageUrl = await imageUrlFor(supabase, item)
  const price = Number(item.price_sek).toFixed(2)
  const alt = `${spec.name} (${spec.conditionOption}${item.is_foil ? ', foil' : ''})`
  const optionValues = [
    { optionName: 'Skick', name: spec.conditionOption },
    { optionName: 'Foil', name: spec.foilOption }
  ]

  let product = await findProduct(spec.handle, spec.sku)
  let variant = product ? findVariant(product, spec) : null
  let productId: string = product?.id ?? ''
  let created = false
  let warning: string | null = null

  if (!product) {
    // Brand new printing: productSet creates product, options, variant, image and metafields in one go.
    const data = await shopifyAdminGraphql(`#graphql
      mutation CreateSingle($input: ProductSetInput!) {
        productSet(input: $input, synchronous: true) {
          product { ${PRODUCT_FIELDS} }
          userErrors { field message }
        }
      }
    `, {
      input: {
        title: spec.name,
        handle: spec.handle,
        status: 'ACTIVE',
        tags: spec.tags,
        metafields: spec.metafields,
        collections: ctx.collectionId ? [ctx.collectionId] : undefined,
        files: imageUrl ? [{ originalSource: imageUrl, contentType: 'IMAGE', alt }] : undefined,
        productOptions: [
          { name: 'Skick', position: 1, values: [{ name: spec.conditionOption }] },
          { name: 'Foil', position: 2, values: [{ name: spec.foilOption }] }
        ],
        variants: [{
          optionValues,
          sku: spec.sku,
          price,
          inventoryPolicy: 'DENY',
          inventoryItem: { tracked: true, sku: spec.sku },
          file: imageUrl ? { originalSource: imageUrl, contentType: 'IMAGE', alt } : undefined
        }]
      }
    })

    const errors = data.productSet?.userErrors
    if (errors?.length || !data.productSet?.product) {
      throw createError({ statusCode: 502, statusMessage: `Shopify kunde inte skapa produkten: ${userErrorMessage(errors)}` })
    }

    product = data.productSet.product
    productId = product.id
    variant = findVariant(product, spec)
    created = true
  } else if (!variant) {
    // Known printing, new condition/foil combination: add the variant, keep the rest.
    const data = await shopifyAdminGraphql(`#graphql
      mutation AddVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkCreate(productId: $productId, variants: $variants) {
          productVariants { id sku selectedOptions { name value } inventoryItem { id } }
          userErrors { field message }
        }
      }
    `, {
      productId,
      variants: [{
        optionValues,
        price,
        inventoryPolicy: 'DENY',
        inventoryItem: { tracked: true, sku: spec.sku }
      }]
    })

    const errors = data.productVariantsBulkCreate?.userErrors
    variant = data.productVariantsBulkCreate?.productVariants?.[0]

    if (errors?.length || !variant) {
      throw createError({ statusCode: 502, statusMessage: `Shopify kunde inte lägga till varianten: ${userErrorMessage(errors)}` })
    }

    // inventoryItem.sku in bulk create sets the SKU on the item; the variant read-back may lag.
    variant = { ...variant, sku: variant.sku ?? spec.sku }

    // Image is best effort: the card is still sellable without it, and the warning is shown in the draft view.
    if (imageUrl) {
      try {
        await attachVariantImage(productId, variant.id, imageUrl, alt)
      } catch (err: any) {
        warning = `Bilden kunde inte kopplas till varianten: ${err?.statusMessage || err?.message}`
      }
    }
  }

  if (!variant?.inventoryItem?.id) {
    throw createError({ statusCode: 502, statusMessage: 'Varianten saknar lagerpost i Shopify' })
  }

  // The `single` tag must always be there, also on products that already existed.
  if (!created) {
    const missing = spec.tags.filter((tag) => !(product.tags ?? []).includes(tag))

    if (missing.length) {
      const data = await shopifyAdminGraphql(`#graphql
        mutation AddTags($id: ID!, $tags: [String!]!) {
          tagsAdd(id: $id, tags: $tags) { userErrors { message } }
        }
      `, { id: productId, tags: missing })

      if (data.tagsAdd?.userErrors?.length) {
        throw createError({ statusCode: 502, statusMessage: `Taggarna kunde inte sättas: ${userErrorMessage(data.tagsAdd.userErrors)}` })
      }
    }
  }

  // Remember what exists in Shopify before touching stock, so a failure further
  // down can be retried without creating anything twice.
  await supabase
    .from('scan_items')
    .update({
      shopify_product_id: productId,
      shopify_variant_id: variant.id,
      shopify_inventory_item_id: variant.inventoryItem.id,
      shopify_sku: variant.sku ?? spec.sku
    })
    .eq('id', item.id)

  if (!item.shopify_stocked) {
    const activate = await shopifyAdminGraphql(`#graphql
      mutation Activate($id: ID!, $locationId: ID!) {
        inventoryActivate(inventoryItemId: $id, locationId: $locationId) { userErrors { message } }
      }
    `, { id: variant.inventoryItem.id, locationId: ctx.locationId })

    if (activate.inventoryActivate?.userErrors?.length) {
      throw createError({ statusCode: 502, statusMessage: `Lagerplatsen kunde inte aktiveras: ${userErrorMessage(activate.inventoryActivate.userErrors)}` })
    }

    // Always a delta, never an absolute quantity, so a sale happening meanwhile isn't overwritten.
    const adjust = await shopifyAdminGraphql(`#graphql
      mutation AddStock($input: InventoryAdjustQuantitiesInput!) {
        inventoryAdjustQuantities(input: $input) { userErrors { message } }
      }
    `, {
      input: {
        name: 'available',
        reason: 'received',
        changes: [{ inventoryItemId: variant.inventoryItem.id, locationId: ctx.locationId, delta: 1 }]
      }
    })

    if (adjust.inventoryAdjustQuantities?.userErrors?.length) {
      throw createError({ statusCode: 502, statusMessage: `Saldot kunde inte ökas: ${userErrorMessage(adjust.inventoryAdjustQuantities.userErrors)}` })
    }

    await supabase.from('scan_items').update({ shopify_stocked: true }).eq('id', item.id)
  }

  // Visible on the headless site only once published to its channel (and the others).
  const published = new Set<string>(
    (product.resourcePublicationsV2?.nodes ?? []).filter((n: any) => n.isPublished).map((n: any) => n.publication.id)
  )
  const toPublish = ctx.publicationIds.filter((id) => created || !published.has(id))

  if (toPublish.length) {
    const data = await shopifyAdminGraphql(`#graphql
      mutation Publish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) { userErrors { message } }
      }
    `, { id: productId, input: toPublish.map((publicationId) => ({ publicationId })) })

    if (data.publishablePublish?.userErrors?.length) {
      throw createError({ statusCode: 502, statusMessage: `Produkten kunde inte publiceras: ${userErrorMessage(data.publishablePublish.userErrors)}` })
    }
  }

  if (ctx.headlessPublicationId) {
    const verify = await shopifyAdminGraphql(`#graphql
      query VerifyPublication($id: ID!) {
        product(id: $id) { status resourcePublicationsV2(first: 20) { nodes { isPublished publication { id } } } }
      }
    `, { id: productId })

    const live = (verify.product?.resourcePublicationsV2?.nodes ?? []).some((n: any) => n.isPublished && n.publication.id === ctx.headlessPublicationId)

    if (!live || verify.product?.status !== 'ACTIVE') {
      throw createError({ statusCode: 502, statusMessage: 'Produkten är inte publicerad till "Butik Lyktan Headless"' })
    }
  }

  await supabase
    .from('scan_items')
    .update({ publish_status: 'published', publish_error: warning, published_at: new Date().toISOString(), stock_status: 'listed' })
    .eq('id', item.id)

  // First publish only: log the +1 so the item's history starts here.
  if (!item.shopify_stocked) {
    await supabase.from('stock_event').insert({ scan_item_id: item.id, from_status: null, to_status: 'listed', note: 'Publicerad i Shopify', shopify_delta: 1 })
  }

  return { productId, variantId: variant.id, handle: product.handle as string, sku: variant.sku ?? spec.sku, createdProduct: created, warning }
}

// --- Stock changes after publishing (fas 7) -------------------------------------

export type StockReason = 'correction' | 'restock' | 'shrinkage'

/**
 * Changes the Shopify stock of one variant by a delta (never an absolute value, so a
 * sale in the webshop at the same moment isn't overwritten). A decrease is refused
 * when Shopify no longer has that many, instead of driving the stock negative.
 */
export const adjustShopifyStock = async (inventoryItemId: string, delta: number, reason: StockReason, itemId: string) => {
  const ctx = await loadCtx()

  if (delta < 0) {
    const level = await shopifyAdminGraphql(`#graphql
      query Level($id: ID!, $locationId: ID!) {
        inventoryItem(id: $id) {
          inventoryLevel(locationId: $locationId) { quantities(names: ["available"]) { quantity } }
        }
      }
    `, { id: inventoryItemId, locationId: ctx.locationId })

    const available = level.inventoryItem?.inventoryLevel?.quantities?.[0]?.quantity ?? 0

    if (available < -delta) {
      throw createError({ statusCode: 409, statusMessage: 'Saldot i Shopify är redan 0 (såld i webbshoppen?). Koppla ordern i stället.' })
    }
  }

  const data = await shopifyAdminGraphql(`#graphql
    mutation Adjust($input: InventoryAdjustQuantitiesInput!) {
      inventoryAdjustQuantities(input: $input) { userErrors { message } }
    }
  `, {
    input: {
      name: 'available',
      reason,
      referenceDocumentUri: `logistics://butiklyktan/scan-item/${itemId}`,
      changes: [{ inventoryItemId, locationId: ctx.locationId, delta }]
    }
  })

  if (data.inventoryAdjustQuantities?.userErrors?.length) {
    throw createError({ statusCode: 502, statusMessage: `Saldot kunde inte ändras: ${userErrorMessage(data.inventoryAdjustQuantities.userErrors)}` })
  }
}
