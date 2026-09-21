<script setup lang="ts">
type OfferRow = {
  id: string
  number: string
  status: 'draft' | 'offered' | 'accepted' | 'paid' | 'declined' | 'expired'
  customer_name: string
  evaluated_at: string
  grand_total_kr: number | null
  created_at: string
}

const { canEditKortinkop } = usePermissions()

const offers = ref<OfferRow[]>([])
const loading = ref(true)
const loadError = ref('')

const loadOffers = async () => {
  loading.value = true
  loadError.value = ''

  try {
    const res = await $fetch<{ offers: OfferRow[] }>('/api/kortinkop')
    offers.value = res.offers
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta erbjudanden'
  } finally {
    loading.value = false
  }
}

onMounted(loadOffers)

const creating = ref(false)
const createError = ref('')

const createOffer = async () => {
  creating.value = true
  createError.value = ''

  try {
    const { offer } = await $fetch<{ offer: { id: string } }>('/api/kortinkop', { method: 'POST' })
    await navigateTo(`/kortinkop/${offer.id}`)
  } catch (err: any) {
    createError.value = err?.data?.statusMessage || 'Kunde inte skapa ny värdering'
    creating.value = false
  }
}

const formatDate = (value: string) => new Date(value).toLocaleDateString('sv-SE')
</script>

<template>
  <div class="lyktan-v2 min-h-[calc(100vh-73px)]">
    <div class="mb-6 flex items-center justify-between gap-3">
      <h1 class="text-xl font-semibold" style="letter-spacing:-.01em">Kortinköp</h1>
      <button
        v-if="canEditKortinkop"
        type="button"
        class="btn primary"
        :disabled="creating"
        @click="createOffer"
      >
        {{ creating ? 'Skapar…' : '+ Ny värdering' }}
      </button>
    </div>

    <p v-if="createError" class="notice" style="background:var(--accent-soft)"><b>Fel:</b> {{ createError }}</p>

    <p v-if="loading" style="color:var(--muted)">Laddar…</p>
    <p v-else-if="loadError" style="color:var(--bad)">{{ loadError }}</p>
    <p v-else-if="!offers.length" style="color:var(--muted)">Inga värderingar ännu.</p>

    <div v-else class="panel" style="padding:0">
      <div class="tbl-wrap" style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <thead>
            <tr>
              <th style="text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600;padding:10px 14px;border-bottom:1px solid var(--line)">Nummer</th>
              <th style="text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600;padding:10px 14px;border-bottom:1px solid var(--line)">Kund</th>
              <th style="text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600;padding:10px 14px;border-bottom:1px solid var(--line)">Status</th>
              <th style="text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600;padding:10px 14px;border-bottom:1px solid var(--line)">Värderat</th>
              <th class="num" style="font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600;padding:10px 14px;border-bottom:1px solid var(--line)">Summa</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="offer in offers"
              :key="offer.id"
              style="cursor:pointer;border-bottom:1px solid var(--line)"
              @click="navigateTo(`/kortinkop/${offer.id}`)"
            >
              <td class="mono" style="padding:10px 14px">{{ offer.number }}</td>
              <td style="padding:10px 14px">{{ offer.customer_name || '—' }}</td>
              <td style="padding:10px 14px">
                <span class="cond" :style="{ color: offer.status === 'paid' ? 'var(--ok)' : offer.status === 'declined' || offer.status === 'expired' ? 'var(--bad)' : 'var(--muted)' }">
                  {{ STATUS_LABELS[offer.status] }}
                </span>
              </td>
              <td style="padding:10px 14px">{{ formatDate(offer.evaluated_at) }}</td>
              <td class="num" style="padding:10px 14px">{{ kr(offer.grand_total_kr) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
