<script setup lang="ts">
import type { Condition, PaymentMethod, OfferStatus } from '~/utils/kortinkop'

type Offer = {
  id: string
  number: string
  status: OfferStatus
  evaluated_at: string
  valid_days: number
  evaluator_name: string | null
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  customer_address: string | null
  customer_submitted_at: string | null
  customer_note: string | null
  id_checked: boolean
  is_minor: boolean
  guardian_name: string | null
  marketing_consent: boolean
  fee_kr: number
  fee_paid_at_submission: boolean
  payment_method: PaymentMethod
  payment_to: string | null
  credit_bonus_pct: number
  offer_total_kr: number | null
  credit_bonus_kr: number | null
  fee_effect_kr: number | null
  grand_total_kr: number | null
}

type Line = {
  id?: string
  localKey: string
  sell: boolean
  name: string
  card_number: string
  card_set: string
  condition: Condition
  grade: string
  qty: number
  market_value_kr: number
  pct: number
  note: string
  is_bulk: boolean
}

type Settings = {
  pickup_days: number
  company_legal_name: string
  company_org_number: string
  company_address: string
  company_contact: string
}

const route = useRoute()
const id = route.params.id as string
const { canEditKortinkop } = usePermissions()

const offer = ref<Offer | null>(null)
const lines = ref<Line[]>([])
const settings = ref<Settings | null>(null)
const loading = ref(true)
const loadError = ref('')

let localKeySeq = 0
const nextLocalKey = () => `new-${++localKeySeq}`

const toLine = (row: any): Line => ({
  id: row.id,
  localKey: row.id || nextLocalKey(),
  sell: row.sell !== false,
  name: row.name || '',
  card_number: row.card_number || '',
  card_set: row.card_set || '',
  condition: row.condition || 'NM',
  grade: row.grade || '',
  qty: row.qty ?? 1,
  market_value_kr: row.market_value_kr ?? 0,
  pct: row.pct ?? 60,
  note: row.note || '',
  is_bulk: Boolean(row.is_bulk)
})

const load = async () => {
  loading.value = true
  loadError.value = ''

  try {
    const [offerRes, settingsRes] = await Promise.all([
      $fetch<{ offer: Offer; lines: any[] }>(`/api/kortinkop/${id}`),
      $fetch<{ settings: Settings }>('/api/kortinkop/settings')
    ])
    applyingServerResponse = true
    offer.value = offerRes.offer
    lines.value = offerRes.lines.map(toLine)
    settings.value = settingsRes.settings
    await nextTick()
    applyingServerResponse = false
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta erbjudandet'
  } finally {
    loading.value = false
  }
}

onMounted(load)

// --- Totals (client mirror for instant feedback; server response is authoritative) ---
const sold = computed(() => lines.value.filter((l) => l.sell))
const marketSold = computed(() => sold.value.reduce((a, l) => a + (Number(l.market_value_kr) || 0) * (Number(l.qty) || 0), 0))
const offerTotal = computed(() => sold.value.reduce((a, l) => a + offerOf(l), 0))
const anySold = computed(() => sold.value.length > 0 && offerTotal.value > 0)

const feeLine = computed<{ label: string; amount: number } | null>(() => {
  if (!offer.value || !offer.value.fee_kr) return null
  const fee = offer.value.fee_kr
  if (offer.value.fee_paid_at_submission && anySold.value) return { label: 'Värderingsavgift återbetalas', amount: fee }
  if (offer.value.fee_paid_at_submission && !anySold.value) return { label: 'Värderingsavgift (betald)', amount: 0 }
  if (!offer.value.fee_paid_at_submission && anySold.value) return { label: 'Värderingsavgift – stryks', amount: 0 }
  return { label: 'Värderingsavgift att betala', amount: -fee }
})

const isCredit = computed(() => offer.value?.payment_method === 'store_credit')
const creditBonus = computed(() => (isCredit.value ? Math.floor(offerTotal.value * ((offer.value?.credit_bonus_pct || 0) / 100)) : 0))
const grandTotal = computed(() => offerTotal.value + creditBonus.value + (feeLine.value?.amount || 0))

// --- Lines editing ---
const addLine = (bulk = false) => {
  lines.value.push({
    localKey: nextLocalKey(),
    sell: true,
    name: bulk ? 'Bulk' : '',
    card_number: '',
    card_set: '',
    condition: 'NM',
    grade: '',
    qty: bulk ? 100 : 1,
    market_value_kr: bulk ? 1 : 0,
    pct: bulk ? 25 : 60,
    note: '',
    is_bulk: bulk
  })
}

const removeLine = (localKey: string) => {
  lines.value = lines.value.filter((l) => l.localKey !== localKey)
  if (!lines.value.length) addLine()
}

// --- Save (debounced autosave + manual) ---
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const saveError = ref('')
let saveTimer: ReturnType<typeof setTimeout> | null = null
// Guards against the autosave watcher re-triggering itself: save() writes
// the server's response back into `offer`/`lines` (to pick up new line
// ids), which the deep watcher below would otherwise see as another edit
// and schedule another save — an infinite loop of PATCH requests.
let applyingServerResponse = false

const save = async () => {
  if (!offer.value || !canEditKortinkop.value) return

  saveState.value = 'saving'
  saveError.value = ''

  try {
    const res = await $fetch<{ offer: Offer; lines: any[] }>(`/api/kortinkop/${id}`, {
      method: 'PATCH',
      body: {
        customerName: offer.value.customer_name,
        customerPhone: offer.value.customer_phone,
        customerEmail: offer.value.customer_email,
        customerAddress: offer.value.customer_address,
        customerSubmittedAt: offer.value.customer_submitted_at,
        customerNote: offer.value.customer_note,
        idChecked: offer.value.id_checked,
        isMinor: offer.value.is_minor,
        guardianName: offer.value.guardian_name,
        marketingConsent: offer.value.marketing_consent,
        evaluatedAt: offer.value.evaluated_at,
        validDays: offer.value.valid_days,
        feeKr: offer.value.fee_kr,
        feePaidAtSubmission: offer.value.fee_paid_at_submission,
        paymentMethod: offer.value.payment_method,
        paymentTo: offer.value.payment_to,
        creditBonusPct: offer.value.credit_bonus_pct,
        lines: lines.value.map((l) => ({
          id: l.id,
          sell: l.sell,
          name: l.name,
          cardNumber: l.card_number,
          cardSet: l.card_set,
          condition: l.condition,
          grade: l.grade,
          qty: l.qty,
          marketValueKr: l.market_value_kr,
          pct: l.pct,
          note: l.note,
          isBulk: l.is_bulk
        }))
      }
    })
    applyingServerResponse = true
    offer.value = res.offer
    lines.value = res.lines.map(toLine)
    await nextTick()
    applyingServerResponse = false
    saveState.value = 'saved'
  } catch (err: any) {
    saveState.value = 'error'
    saveError.value = err?.data?.statusMessage || 'Kunde inte spara'
  }
}

const scheduleSave = () => {
  if (applyingServerResponse || !canEditKortinkop.value) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(save, 700)
}

watch([offer, lines], scheduleSave, { deep: true })

// --- Status transitions ---
const NEXT_STATUS: Partial<Record<OfferStatus, { to: OfferStatus; label: string }[]>> = {
  draft: [{ to: 'offered', label: 'Skicka erbjudande' }],
  offered: [{ to: 'accepted', label: 'Kunden accepterar' }, { to: 'declined', label: 'Kunden avböjer' }, { to: 'expired', label: 'Markera utgånget' }],
  accepted: [{ to: 'paid', label: 'Markera betald' }, { to: 'declined', label: 'Avbryt köpet' }]
}

const statusActions = computed(() => (offer.value ? NEXT_STATUS[offer.value.status] || [] : []))

const changingStatus = ref(false)
const setStatus = async (to: OfferStatus) => {
  if (!offer.value) return
  if (saveTimer) clearTimeout(saveTimer)
  await save()
  changingStatus.value = true
  try {
    const res = await $fetch<{ offer: Offer }>(`/api/kortinkop/${id}/status`, { method: 'POST', body: { status: to } })
    applyingServerResponse = true
    offer.value = res.offer
    await nextTick()
    applyingServerResponse = false
  } catch (err: any) {
    saveError.value = err?.data?.statusMessage || 'Kunde inte ändra status'
    saveState.value = 'error'
  } finally {
    changingStatus.value = false
  }
}

// --- Tabs ---
const activeTab = ref<'edit' | 'doc'>('edit')
const internalCopy = ref(false)
</script>

<template>
  <div class="lyktan-v2 min-h-[calc(100vh-73px)]">
    <p v-if="loading" style="color:var(--muted)">Laddar…</p>
    <p v-else-if="loadError" style="color:var(--bad)">{{ loadError }}</p>

    <template v-else-if="offer">
      <div class="mb-5 flex flex-wrap items-center gap-3">
        <NuxtLink to="/kortinkop" style="color:var(--muted);font-size:13px">← Kortinköp</NuxtLink>
        <h1 class="mono" style="font-size:18px;font-weight:700;margin-left:4px">{{ offer.number }}</h1>
        <span class="cond">{{ STATUS_LABELS[offer.status] }}</span>
        <div class="tabs" role="tablist" style="margin-left:auto">
          <button role="tab" :aria-selected="activeTab === 'edit'" @click="activeTab = 'edit'">Värdering</button>
          <button role="tab" :aria-selected="activeTab === 'doc'" @click="activeTab = 'doc'">Kundens erbjudande</button>
        </div>
      </div>

      <!-- ===== Editor ===== -->
      <div v-if="activeTab === 'edit'" class="kk-grid">
        <div>
          <div class="panel">
            <h2>Säljare (kund)</h2>
            <div class="fields">
              <div class="f"><label>Namn</label><input v-model="offer.customer_name"></div>
              <div class="f"><label>Telefon</label><input v-model="offer.customer_phone" inputmode="tel"></div>
              <div class="f"><label>E-post</label><input v-model="offer.customer_email" inputmode="email"></div>
              <div class="f"><label>Adress</label><input v-model="offer.customer_address"></div>
              <div class="f"><label>Inlämnad</label><input v-model="offer.customer_submitted_at" type="date"></div>
              <div class="f"><label>Kundens anteckning</label><input v-model="offer.customer_note"></div>
            </div>
            <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:14px">
              <label class="check"><input v-model="offer.id_checked" type="checkbox"> Legitimation kontrollerad</label>
              <label class="check"><input v-model="offer.is_minor" type="checkbox"> Säljaren är under 18 år</label>
              <label class="check"><input v-model="offer.marketing_consent" type="checkbox"> Vill ha erbjudanden (marknadsföring)</label>
            </div>
            <div v-if="offer.is_minor" class="fields" style="margin-top:12px">
              <div class="f"><label>Vårdnadshavare</label><input v-model="offer.guardian_name"></div>
            </div>
          </div>

          <div class="panel">
            <h2>Kort</h2>
            <div class="tbl-wrap" style="overflow-x:auto;margin:0 -18px;padding:0 18px">
              <table style="width:100%;border-collapse:collapse;min-width:1080px;font-size:14px">
                <thead>
                  <tr>
                    <th style="width:34px;font-size:11.5px;text-transform:uppercase;color:var(--muted);font-weight:600;text-align:left;padding:6px 4px;border-bottom:1px solid var(--line)" title="Kunden säljer kortet">Säljs</th>
                    <th style="min-width:170px;font-size:11.5px;text-transform:uppercase;color:var(--muted);font-weight:600;text-align:left;padding:6px 4px;border-bottom:1px solid var(--line)">Kortnamn</th>
                    <th style="width:90px;font-size:11.5px;text-transform:uppercase;color:var(--muted);font-weight:600;text-align:left;padding:6px 4px;border-bottom:1px solid var(--line)">Nr</th>
                    <th style="width:130px;font-size:11.5px;text-transform:uppercase;color:var(--muted);font-weight:600;text-align:left;padding:6px 4px;border-bottom:1px solid var(--line)">Set</th>
                    <th style="width:140px;font-size:11.5px;text-transform:uppercase;color:var(--muted);font-weight:600;text-align:left;padding:6px 4px;border-bottom:1px solid var(--line)">Skick</th>
                    <th style="width:80px;font-size:11.5px;text-transform:uppercase;color:var(--muted);font-weight:600;text-align:left;padding:6px 4px;border-bottom:1px solid var(--line)">Gradering</th>
                    <th class="num" style="width:64px;font-size:11.5px;text-transform:uppercase;color:var(--muted);font-weight:600;padding:6px 4px;border-bottom:1px solid var(--line)">Antal</th>
                    <th class="num" style="width:96px;font-size:11.5px;text-transform:uppercase;color:var(--muted);font-weight:600;padding:6px 4px;border-bottom:1px solid var(--line)">Marknadsv.</th>
                    <th class="num" style="width:64px;font-size:11.5px;text-transform:uppercase;color:var(--muted);font-weight:600;padding:6px 4px;border-bottom:1px solid var(--line)">%</th>
                    <th class="num" style="width:88px;font-size:11.5px;text-transform:uppercase;color:var(--muted);font-weight:600;padding:6px 4px;border-bottom:1px solid var(--line)">Erbjud.</th>
                    <th style="width:140px;font-size:11.5px;text-transform:uppercase;color:var(--muted);font-weight:600;text-align:left;padding:6px 4px;border-bottom:1px solid var(--line)">Intern anteckning</th>
                    <th style="width:28px;border-bottom:1px solid var(--line)" />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="line in lines" :key="line.localKey" :style="{ opacity: line.sell ? 1 : .45 }">
                    <td style="padding:4px;border-bottom:1px solid var(--line)"><input v-model="line.sell" type="checkbox" aria-label="Kunden säljer"></td>
                    <td style="padding:4px;border-bottom:1px solid var(--line)"><input v-model="line.name" :placeholder="line.is_bulk ? 'Bulk' : 'Kortnamn'" style="width:100%;background:transparent;border:1px solid transparent;border-radius:5px;padding:5px 6px"></td>
                    <td style="padding:4px;border-bottom:1px solid var(--line)"><input v-model="line.card_number" placeholder="000/000" class="mono" style="width:100%;background:transparent;border:1px solid transparent;border-radius:5px;padding:5px 6px"></td>
                    <td style="padding:4px;border-bottom:1px solid var(--line)"><input v-model="line.card_set" placeholder="Set" style="width:100%;background:transparent;border:1px solid transparent;border-radius:5px;padding:5px 6px"></td>
                    <td style="padding:4px;border-bottom:1px solid var(--line)">
                      <select v-model="line.condition" aria-label="Skick" style="width:100%;background:transparent;border:1px solid transparent;border-radius:5px;padding:5px 6px">
                        <option v-for="c in CONDITIONS" :key="c.code" :value="c.code">{{ c.code }} · {{ c.label }}</option>
                      </select>
                    </td>
                    <td style="padding:4px;border-bottom:1px solid var(--line)"><input v-model="line.grade" placeholder="–" style="width:100%;background:transparent;border:1px solid transparent;border-radius:5px;padding:5px 6px"></td>
                    <td class="num" style="padding:4px;border-bottom:1px solid var(--line)"><input v-model.number="line.qty" type="number" min="1" style="width:100%;text-align:right;background:transparent;border:1px solid transparent;border-radius:5px;padding:5px 6px"></td>
                    <td class="num" style="padding:4px;border-bottom:1px solid var(--line)"><input v-model.number="line.market_value_kr" type="number" min="0" step="0.01" style="width:100%;text-align:right;background:transparent;border:1px solid transparent;border-radius:5px;padding:5px 6px"></td>
                    <td class="num" style="padding:4px;border-bottom:1px solid var(--line)"><input v-model.number="line.pct" type="number" min="0" max="100" style="width:100%;text-align:right;background:transparent;border:1px solid transparent;border-radius:5px;padding:5px 6px"></td>
                    <td class="num mono" style="padding:4px 8px 4px 4px;border-bottom:1px solid var(--line);font-weight:500;white-space:nowrap">{{ kr(offerOf(line)) }}</td>
                    <td style="padding:4px;border-bottom:1px solid var(--line)"><input v-model="line.note" placeholder="Intern" style="width:100%;background:transparent;border:1px solid transparent;border-radius:5px;padding:5px 6px"></td>
                    <td style="padding:4px;border-bottom:1px solid var(--line)">
                      <button type="button" aria-label="Ta bort rad" style="border:0;background:none;color:var(--muted);cursor:pointer;font-size:18px;line-height:1;padding:4px 6px;border-radius:5px" @click="removeLine(line.localKey)">×</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
              <button type="button" class="btn" @click="addLine(false)">+ Lägg till kort</button>
              <button type="button" class="btn" @click="addLine(true)">+ Bulkrad</button>
            </div>
            <p class="hint" style="font-size:12.5px;color:var(--muted);margin:8px 0 0">Marknadsvärde = Cardmarket trend per kort vid värderingen. Erbjudandet avrundas nedåt till hela kronor. Procent och interna anteckningar syns bara på internkopian.</p>
          </div>

          <div class="panel">
            <h2>Inställningar för det här erbjudandet</h2>
            <div class="fields">
              <div class="f"><label>Värderare</label><input v-model="offer.evaluator_name"></div>
              <div class="f"><label>Värderingsdatum</label><input v-model="offer.evaluated_at" type="date"></div>
              <div class="f"><label>Giltigt antal dagar</label><input v-model.number="offer.valid_days" type="number" min="1"></div>
              <div class="f"><label>Värderingsavgift (kr)</label><input v-model.number="offer.fee_kr" type="number" min="0"></div>
              <div class="f"><label>Bonus vid butikskredit (%)</label><input v-model.number="offer.credit_bonus_pct" type="number" min="0"></div>
            </div>
          </div>
        </div>

        <aside class="panel kk-sum" aria-label="Sammanfattning">
          <h2>Sammanfattning</h2>
          <dl style="margin:0;display:grid;grid-template-columns:1fr auto;gap:8px 0;font-size:14px">
            <dt style="color:var(--muted)">Kort ({{ sold.length }} av {{ lines.length }} säljs)</dt><dd />
            <dt style="color:var(--muted)">Marknadsvärde</dt><dd class="mono" style="text-align:right">{{ kr(marketSold) }}</dd>
            <dt style="color:var(--muted)">Vårt erbjudande</dt><dd class="mono" style="text-align:right">{{ kr(offerTotal) }}</dd>
            <template v-if="isCredit && creditBonus">
              <dt style="color:var(--muted)">Butikskredit +{{ offer.credit_bonus_pct }} %</dt><dd class="mono" style="text-align:right">+{{ kr(creditBonus) }}</dd>
            </template>
            <template v-if="feeLine">
              <dt style="color:var(--muted)">{{ feeLine.label }}</dt><dd class="mono" style="text-align:right">{{ feeLine.amount > 0 ? '+' : '' }}{{ kr(feeLine.amount) }}</dd>
            </template>
            <dt style="border-top:1px solid var(--line);padding-top:10px;margin-top:4px;font-weight:600;color:var(--ink)">{{ grandTotal < 0 ? 'Kunden betalar' : (isCredit ? 'Butikskredit' : 'Att betala ut') }}</dt>
            <dd class="mono" style="border-top:1px solid var(--line);padding-top:10px;margin-top:4px;font-weight:600;text-align:right;font-size:20px;color:var(--ink)">{{ kr(Math.abs(grandTotal)) }}</dd>
          </dl>

          <div class="f" style="margin-top:16px">
            <label>Utbetalning</label>
            <select v-model="offer.payment_method">
              <option v-for="(label, method) in PAYMENT_LABELS" :key="method" :value="method">{{ label }}</option>
            </select>
          </div>
          <div class="f" style="margin-top:10px"><label>Betalas till (Swish-nr / konto)</label><input v-model="offer.payment_to"></div>
          <label class="check" style="margin-top:12px"><input v-model="offer.fee_paid_at_submission" type="checkbox"> Avgiften betald vid inlämning</label>

          <p style="font-size:12.5px;color:var(--muted);margin-top:14px">
            <template v-if="saveState === 'saving'">Sparar…</template>
            <template v-else-if="saveState === 'saved'">Sparat</template>
            <template v-else-if="saveState === 'error'">{{ saveError }}</template>
          </p>

          <div v-if="canEditKortinkop" style="display:grid;gap:8px;margin-top:12px">
            <button type="button" class="btn primary" @click="activeTab = 'doc'">Visa kundens erbjudande →</button>
            <button
              v-for="action in statusActions"
              :key="action.to"
              type="button"
              class="btn"
              :class="{ danger: action.to === 'declined' || action.to === 'expired' }"
              :disabled="changingStatus"
              @click="setStatus(action.to)"
            >
              {{ action.label }}
            </button>
          </div>
        </aside>
      </div>

      <!-- ===== Document ===== -->
      <div v-else>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
          <div class="tabs" role="tablist" aria-label="Kopia">
            <button role="tab" :aria-selected="!internalCopy" @click="internalCopy = false">Kundkopia</button>
            <button role="tab" :aria-selected="internalCopy" @click="internalCopy = true">Internkopia</button>
          </div>
          <button type="button" class="btn primary" @click="window.print()">Skriv ut / spara PDF</button>
          <span style="font-size:12.5px;color:var(--muted)">Fungerar inte knappen: tryck ⌘P / Ctrl+P.</span>
        </div>
        <KortinkopDocument v-if="settings" :offer="offer" :lines="lines" :internal="internalCopy" :settings="settings" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.kk-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 20px;
  align-items: start;
}
@media (max-width: 900px) {
  .kk-grid { grid-template-columns: 1fr; }
}
.kk-sum {
  position: sticky;
  top: 16px;
}
</style>
