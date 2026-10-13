<script setup lang="ts">
import { SCAN_CONDITIONS, SCAN_CONDITION_LABELS, SCAN_LANGUAGES } from '~/types/scan'
import type { RefCard, ScanCandidate, ScanItem } from '~/types/scan'

const props = defineProps<{ item: ScanItem, canEdit: boolean }>()

const emit = defineEmits<{
  'pick-candidate': [candidate: ScanCandidate]
  'pick-card': [card: RefCard]
  update: [patch: Record<string, unknown>]
  confirm: []
  skip: []
  unidentified: []
  reopen: []
  manual: [fields: { name: string, game: 'mtg' | 'pokemon', set_name: string, set_code: string, collector_number: string, rarity: string }]
}>()

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ej identifierad',
  matched: 'Träff',
  needs_review: 'Behöver granskas',
  confirmed: 'Bekräftad',
  skipped: 'Överhoppad',
  unidentified: 'Hittades inte'
}

const candidates = computed(() => (props.item.match_candidates ?? []).slice(0, 5))
const hovered = ref<ScanCandidate | null>(null)

const current = computed(() => {
  const card = props.item.matched_card
  if (card) return { name: card.name, line: `${card.set_code} ${card.collector_number} · ${card.set_name}`, rarity: card.rarity }
  if (props.item.is_manual && props.item.manual_name) {
    return {
      name: props.item.manual_name,
      line: [props.item.manual_set_code, props.item.manual_collector_number, props.item.manual_set_name].filter(Boolean).join(' · '),
      rarity: props.item.manual_rarity
    }
  }
  return null
})

const referenceImage = computed(
  () => hovered.value?.image_url ?? props.item.matched_card?.image_url ?? candidates.value[0]?.image_url ?? null
)

const canConfirm = computed(() => Boolean(props.item.matched_card || (props.item.is_manual && props.item.manual_name)))

// --- Search ---
const searchQuery = ref('')
const searchGame = ref<'' | 'mtg' | 'pokemon'>('')
const searchResults = ref<RefCard[]>([])
const searching = ref(false)
const searchError = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined

watch([searchQuery, searchGame], () => {
  clearTimeout(searchTimer)
  searchError.value = ''

  if (searchQuery.value.trim().length < 2) {
    searchResults.value = []
    return
  }

  searchTimer = setTimeout(async () => {
    searching.value = true

    try {
      const res = await $fetch<{ cards: RefCard[] }>('/api/scan/cards/search', {
        query: { q: searchQuery.value.trim(), game: searchGame.value || undefined }
      })
      searchResults.value = res.cards
    } catch (err: any) {
      searchError.value = err?.data?.statusMessage || 'Sökningen misslyckades'
    } finally {
      searching.value = false
    }
  }, 300)
})

const pickSearchResult = (card: RefCard) => {
  emit('pick-card', card)
  searchQuery.value = ''
  searchResults.value = []
}

// --- Manual entry ---
const showManual = ref(false)
const manual = ref({ name: '', game: 'mtg' as 'mtg' | 'pokemon', set_name: '', set_code: '', collector_number: '', rarity: '' })

const submitManual = () => {
  if (!manual.value.name.trim()) return
  emit('manual', { ...manual.value, name: manual.value.name.trim() })
  showManual.value = false
}

watch(() => props.item.id, () => {
  searchQuery.value = ''
  searchResults.value = []
  hovered.value = null
  showManual.value = false
  manual.value = {
    name: props.item.manual_name ?? '',
    game: props.item.game ?? 'mtg',
    set_name: props.item.manual_set_name ?? '',
    set_code: props.item.manual_set_code ?? '',
    collector_number: props.item.manual_collector_number ?? '',
    rarity: props.item.manual_rarity ?? ''
  }
}, { immediate: true })

const fieldClass = 'w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm'
</script>

<template>
  <div class="rounded-2xl border border-[var(--line)] p-4">
    <div class="mb-3 flex items-center justify-between gap-3">
      <h2 class="text-sm font-semibold text-lyktan-ink">Kort nr {{ item.position }}</h2>
      <span class="rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-lyktan-mute">{{ STATUS_LABELS[item.status] || item.status }}</span>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <figure>
        <div class="aspect-[5/7] overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-2)]">
          <img v-if="item.image_url" :src="item.image_url" :alt="`Skannat kort nr ${item.position}`" class="h-full w-full object-cover">
        </div>
        <figcaption class="mt-1 text-[0.7rem] text-lyktan-mute">Skannat</figcaption>
      </figure>
      <figure>
        <div class="aspect-[5/7] overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-2)]">
          <img v-if="referenceImage" :src="referenceImage" alt="Referensbild" class="h-full w-full object-cover">
          <div v-else class="grid h-full place-items-center px-3 text-center text-xs text-lyktan-mute">Ingen referensbild</div>
        </div>
        <figcaption class="mt-1 text-[0.7rem] text-lyktan-mute">{{ hovered ? 'Förhandsvisning' : 'Referens' }}</figcaption>
      </figure>
    </div>

    <div class="mt-3 min-h-[2.75rem]">
      <template v-if="current">
        <p class="font-medium text-lyktan-ink">{{ current.name }}</p>
        <p class="text-[0.8rem] text-lyktan-mute">{{ current.line }}<span v-if="current.rarity"> · {{ current.rarity }}</span></p>
      </template>
      <p v-else class="text-sm text-lyktan-mute">Inget kort valt än.</p>
    </div>

    <template v-if="canEdit">
      <div v-if="candidates.length" class="mt-3">
        <p class="mb-1 text-[0.72rem] font-medium text-lyktan-mute">Förslag (tangent 1–{{ candidates.length }})</p>
        <ul class="space-y-1">
          <li v-for="(c, i) in candidates" :key="c.card_id">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition hover:bg-[var(--surface-2)]"
              :class="item.matched_card?.id === c.card_id ? 'border-[var(--ok)] bg-[var(--ok-soft)]' : 'border-[var(--line)]'"
              @mouseenter="hovered = c"
              @mouseleave="hovered = null"
              @focus="hovered = c"
              @blur="hovered = null"
              @click="emit('pick-candidate', c)"
            >
              <span class="mono grid h-5 w-5 shrink-0 place-items-center rounded bg-[var(--surface-2)] text-[0.7rem]">{{ i + 1 }}</span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-lyktan-ink">{{ c.name }}</span>
                <span class="block truncate text-[0.72rem] text-lyktan-mute">{{ c.set_code }} {{ c.collector_number }} · {{ c.set_name }}</span>
              </span>
              <span class="mono shrink-0 text-[0.68rem] text-lyktan-mute">
                <span v-if="c.ocr_hits >= 2" title="Set-kod och nummer lästa från kortet">OCR ✓✓ </span>
                <span v-else-if="c.ocr_hits === 1" title="Delvis OCR-träff">OCR ✓ </span>
                {{ c.distance.toFixed(1) }}
              </span>
            </button>
          </li>
        </ul>
      </div>

      <div class="mt-3">
        <label class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute" for="scan-search">Sök kort (namn, eller t.ex. "MH3 123")</label>
        <div class="flex gap-2">
          <input id="scan-search" v-model="searchQuery" type="search" :class="fieldClass" placeholder="Island, MH3 123, SVI 045…" autocomplete="off">
          <select v-model="searchGame" aria-label="Spel" class="rounded-lg border border-[var(--line)] bg-transparent px-2 text-sm">
            <option value="">Alla</option>
            <option value="mtg">Magic</option>
            <option value="pokemon">Pokémon</option>
          </select>
        </div>
        <p v-if="searching" class="mt-1 text-xs text-lyktan-mute">Söker…</p>
        <p v-if="searchError" class="mt-1 text-xs text-[var(--bad)]">{{ searchError }}</p>
        <ul v-if="searchResults.length" class="mt-2 max-h-56 space-y-1 overflow-y-auto">
          <li v-for="card in searchResults" :key="card.id">
            <button type="button" class="flex w-full items-center gap-2 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-left text-sm hover:bg-[var(--surface-2)]" @click="pickSearchResult(card)">
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-lyktan-ink">{{ card.name }}</span>
                <span class="block truncate text-[0.72rem] text-lyktan-mute">{{ card.set_code }} {{ card.collector_number }} · {{ card.set_name }}</span>
              </span>
              <span class="shrink-0 text-[0.68rem] text-lyktan-mute">{{ card.game === 'mtg' ? 'Magic' : 'Pokémon' }}</span>
            </button>
          </li>
        </ul>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-3">
        <label class="block">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Skick</span>
          <select :value="item.condition" :class="fieldClass" @change="emit('update', { condition: ($event.target as HTMLSelectElement).value })">
            <option v-for="c in SCAN_CONDITIONS" :key="c" :value="c">{{ SCAN_CONDITION_LABELS[c] }}</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Språk</span>
          <select :value="item.language" :class="fieldClass" @change="emit('update', { language: ($event.target as HTMLSelectElement).value })">
            <option v-for="(label, code) in SCAN_LANGUAGES" :key="code" :value="code">{{ label }}</option>
          </select>
        </label>
        <label class="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" :checked="item.is_foil" @change="emit('update', { is_foil: ($event.target as HTMLInputElement).checked })">
          Foil <span class="text-[0.72rem] text-lyktan-mute">(tangent F)</span>
        </label>
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <button v-if="item.status !== 'confirmed'" type="button" class="btn primary" :disabled="!canConfirm" @click="emit('confirm')">Bekräfta (Enter)</button>
        <button v-else type="button" class="btn" @click="emit('reopen')">Ångra bekräftelse</button>
        <button type="button" class="btn" :disabled="item.status === 'skipped'" @click="emit('skip')">Hoppa över (S)</button>
        <button type="button" class="btn" :disabled="item.status === 'unidentified'" @click="emit('unidentified')">Ej identifierad (U)</button>
        <button type="button" class="btn" @click="showManual = !showManual">{{ showManual ? 'Stäng manuellt' : 'Lägg in manuellt' }}</button>
      </div>

      <form v-if="showManual" class="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-[var(--line)] p-3" @submit.prevent="submitManual">
        <label class="col-span-2 block">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Namn *</span>
          <input v-model="manual.name" required :class="fieldClass">
        </label>
        <label class="block">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Spel</span>
          <select v-model="manual.game" :class="fieldClass">
            <option value="mtg">Magic</option>
            <option value="pokemon">Pokémon</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Sällsynthet</span>
          <input v-model="manual.rarity" :class="fieldClass">
        </label>
        <label class="block">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Set-kod</span>
          <input v-model="manual.set_code" :class="fieldClass">
        </label>
        <label class="block">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Samlarnummer</span>
          <input v-model="manual.collector_number" :class="fieldClass">
        </label>
        <label class="col-span-2 block">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Setnamn</span>
          <input v-model="manual.set_name" :class="fieldClass">
        </label>
        <div class="col-span-2 flex items-center gap-3">
          <button type="submit" class="btn primary">Spara som bekräftat kort</button>
          <span class="text-[0.72rem] text-lyktan-mute">Sparas utan koppling till referensdatan; pris sätts manuellt senare.</span>
        </div>
      </form>

      <p v-if="item.ocr_text" class="mono mt-3 break-words text-[0.68rem] text-lyktan-mute">OCR: {{ item.ocr_text }}</p>
    </template>
  </div>
</template>
