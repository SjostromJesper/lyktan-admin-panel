#!/usr/bin/env node
// Engångsuppsättning i Shopify för singlar (idempotent, kan köras om):
//  - metafältsdefinitioner custom.card_language och custom.set_code (läsbara från Storefront API),
//    utöver de som redan finns: card_game, card_set, rarity, collector_number
//  - smart kollektion "Singelkort" (handle singelkort, regel: tagg = single) som webbplatsens
//    singelsektion läser, publicerad till alla försäljningskanaler
//
//   node --env-file=.env scripts/setup-shopify-singles.mjs

const dom = String(process.env.SHOPIFY_STORE_DOMAIN).replace(/^https?:\/\//, '').replace(/\/.*$/, '')

const tokenRes = await (await fetch(`https://${dom}/admin/oauth/access_token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=client_credentials&client_id=${process.env.SHOPIFY_ADMIN_CLIENT_ID}&client_secret=${process.env.SHOPIFY_ADMIN_CLIENT_SECRET}`
})).json()

const gql = async (query, variables) => {
  const res = await (await fetch(`https://${dom}/admin/api/2026-01/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': tokenRes.access_token },
    body: JSON.stringify({ query, variables })
  })).json()
  if (res.errors) throw new Error(JSON.stringify(res.errors))
  return res.data
}

const DEFINITIONS = [
  { key: 'card_language', name: 'Språk (kort)', description: 'Kortets språk, t.ex. Engelska' },
  { key: 'set_code', name: 'Set-kod', description: 'Setets förkortning, t.ex. TMT' }
]

for (const def of DEFINITIONS) {
  const data = await gql(`mutation($d: MetafieldDefinitionInput!) { metafieldDefinitionCreate(definition: $d) { createdDefinition { id } userErrors { code message } } }`, {
    d: {
      name: def.name,
      namespace: 'custom',
      key: def.key,
      description: def.description,
      type: 'single_line_text_field',
      ownerType: 'PRODUCT',
      access: { storefront: 'PUBLIC_READ' }
    }
  })
  const errors = data.metafieldDefinitionCreate.userErrors
  if (errors.some((e) => e.code === 'TAKEN')) console.log(`custom.${def.key}: finns redan`)
  else if (errors.length) throw new Error(JSON.stringify(errors))
  else console.log(`custom.${def.key}: skapad`)
}

let collection = (await gql(`{ collectionByHandle(handle: "singelkort") { id title } }`)).collectionByHandle

if (collection) {
  console.log(`Kollektionen finns redan: ${collection.title}`)
} else {
  const data = await gql(`mutation($input: CollectionInput!) { collectionCreate(input: $input) { collection { id title } userErrors { field message } } }`, {
    input: {
      title: 'Singelkort',
      handle: 'singelkort',
      ruleSet: { appliedDisjunctively: false, rules: [{ column: 'TAG', relation: 'EQUALS', condition: 'single' }] }
    }
  })
  const errors = data.collectionCreate.userErrors
  if (errors.length) throw new Error(JSON.stringify(errors))
  collection = data.collectionCreate.collection
  console.log(`Kollektionen skapad: ${collection.id}`)
}

const publications = (await gql(`{ publications(first: 20) { nodes { id name } } }`)).publications.nodes
const publish = await gql(`mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { field message } } }`, {
  id: collection.id,
  input: publications.map((p) => ({ publicationId: p.id }))
})
if (publish.publishablePublish.userErrors.length) throw new Error(JSON.stringify(publish.publishablePublish.userErrors))
console.log(`Kollektionen publicerad till: ${publications.map((p) => p.name).join(', ')}`)
