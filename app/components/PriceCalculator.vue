<script setup lang="ts">
// Works out a shelf price from the purchase price: cost -> + markup -> + VAT = price.
// Fill in the cost and a markup and the price follows; or type the price you want and
// the markup is worked out. "Godkänn" hands the price to the product form.
const emit = defineEmits<{ approve: [price: number] }>()

const STORAGE_KEY = 'product-price-calculator'
const VAT_RATES = [25, 12, 6, 0]

const cost = ref<number | null>(null)
const costIncludesVat = ref(false)
const vatRate = ref(25)
const markupPct = ref<number | null>(null)
const price = ref<number | null>(null)
const approved = ref(false)

// Remember the last VAT rate and markup, so the usual values are there next time.
onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    if (VAT_RATES.includes(saved.vatRate)) vatRate.value = saved.vatRate
    if (typeof saved.markupPct === 'number') markupPct.value = saved.markupPct
  } catch { /* nothing saved */ }
})

const remember = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ vatRate: vatRate.value, markupPct: markupPct.value }))
  } catch { /* private mode */ }
}

const vatFactor = computed(() => 1 + vatRate.value / 100)
const costExVat = computed(() => (cost.value == null ? null : costIncludesVat.value ? cost.value / vatFactor.value : cost.value))

const round2 = (n: number) => Math.round(n * 100) / 100

// Cost, VAT or markup changed: recalculate the price (whole kronor, like a shelf price).
const fromMarkup = () => {
  approved.value = false
  remember()
  if (costExVat.value == null) return
  // A price was typed first: once the cost is known, show the markup it gives instead.
  if (markupPct.value == null) {
    if (price.value != null) fromPrice()
    return
  }
  price.value = Math.round(costExVat.value * (1 + markupPct.value / 100) * vatFactor.value)
}

// Price typed in: work out which markup that gives.
const fromPrice = () => {
  approved.value = false
  if (costExVat.value == null || costExVat.value <= 0 || price.value == null) return
  markupPct.value = Math.round(((price.value / vatFactor.value) / costExVat.value - 1) * 1000) / 10
  remember()
}

const breakdown = computed(() => {
  if (price.value == null || price.value <= 0) return null
  const exVat = price.value / vatFactor.value
  const profit = costExVat.value != null ? exVat - costExVat.value : null
  return {
    exVat: round2(exVat),
    vat: round2(price.value - exVat),
    profit: profit != null ? round2(profit) : null,
    margin: profit != null && exVat > 0 ? Math.round((profit / exVat) * 1000) / 10 : null
  }
})

const canApprove = computed(() => price.value != null && price.value > 0)

const approve = () => {
  if (!canApprove.value) return
  emit('approve', price.value!)
  approved.value = true
}

const kr = (n: number) => `${n.toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} kr`
</script>

<template>
  <details class="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
    <summary class="cursor-pointer text-sm font-medium text-lyktan-ink">Prisuträknare</summary>

    <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <label class="block">
        <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Inköpspris (kr)</span>
        <input v-model.number="cost" type="number" min="0" step="0.01" inputmode="decimal" class="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm" @input="fromMarkup">
      </label>

      <label class="block">
        <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Moms</span>
        <select v-model.number="vatRate" class="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm" @change="fromMarkup">
          <option v-for="rate in VAT_RATES" :key="rate" :value="rate">{{ rate }} %</option>
        </select>
      </label>

      <label class="block">
        <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Påslag (%)</span>
        <input v-model.number="markupPct" type="number" step="0.1" inputmode="decimal" class="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm" @input="fromMarkup">
      </label>

      <label class="block">
        <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Pris inkl. moms (kr)</span>
        <input v-model.number="price" type="number" min="0" step="1" inputmode="decimal" class="w-full rounded-lg border border-[var(--accent)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold" @input="fromPrice">
      </label>
    </div>

    <label class="mt-2 flex items-center gap-2 text-[0.8rem] text-lyktan-mute">
      <input v-model="costIncludesVat" type="checkbox" @change="fromMarkup"> Inköpspriset inkluderar redan moms
    </label>

    <p v-if="breakdown" class="mt-2 text-[0.8rem] text-lyktan-mute" aria-live="polite">
      {{ kr(breakdown.exVat) }} exkl. moms · moms {{ kr(breakdown.vat) }}<template v-if="breakdown.profit != null"> · vinst {{ kr(breakdown.profit) }} ({{ breakdown.margin }} % av priset exkl. moms)</template>
    </p>
    <p class="mt-1 text-[0.72rem] text-lyktan-mute">Påslaget läggs på inköpspriset exkl. moms, sedan läggs momsen på. Du kan också skriva in önskat pris, så räknas påslaget ut.</p>

    <div class="mt-3 flex items-center gap-3">
      <button type="button" class="btn primary" :disabled="!canApprove" @click="approve">Godkänn och använd priset</button>
      <span v-if="approved" class="text-[0.8rem]" style="color:var(--ok)">Priset {{ kr(price!) }} är satt på produkten.</span>
    </div>
  </details>
</template>
