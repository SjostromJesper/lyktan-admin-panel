<script setup lang="ts">
type Account = {
  id: string
  customer_name: string
  balance_kr: number
  created_at: string
  updated_at: string
}

type Transaction = {
  id: string
  amount_kr: number
  note: string | null
  created_at: string
}

type Grant = {
  id: string
  customer_name: string
  type: 'event_access' | 'custom'
  event_name: string | null
  custom_text: string | null
  reason: string | null
  redeemed: boolean
  redeemed_at: string | null
  created_at: string
}

const { canEditStoreCredit } = usePermissions()

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })

// ============================================================
// Store credit — one balance per person, adjusted up/down
// ============================================================

const accounts = ref<Account[]>([])
const accountsLoading = ref(true)
const accountsError = ref('')

const loadAccounts = async () => {
  accountsLoading.value = true
  accountsError.value = ''

  try {
    const res = await $fetch<{ accounts: Account[] }>('/api/store-credit-accounts')
    accounts.value = res.accounts
  } catch (err: any) {
    accountsError.value = err?.data?.statusMessage || 'Kunde inte hämta store credit'
  } finally {
    accountsLoading.value = false
  }
}

onMounted(loadAccounts)

// --- Add new person ---
const addAccountOpen = ref(false)
const addAccountSaving = ref(false)
const addAccountError = ref('')

const newAccount = ref({ customerName: '', amountKr: null as number | null, note: '' })

const resetAddAccountForm = () => {
  newAccount.value = { customerName: '', amountKr: null, note: '' }
  addAccountError.value = ''
}

const submitAddAccount = async () => {
  addAccountError.value = ''

  if (!newAccount.value.customerName.trim()) {
    addAccountError.value = 'Ange ett namn'
    return
  }

  if (!newAccount.value.amountKr || newAccount.value.amountKr <= 0) {
    addAccountError.value = 'Ange ett belopp'
    return
  }

  addAccountSaving.value = true

  try {
    await $fetch('/api/store-credit-accounts', {
      method: 'POST',
      body: {
        customerName: newAccount.value.customerName,
        amountKr: newAccount.value.amountKr,
        note: newAccount.value.note
      }
    })
    resetAddAccountForm()
    addAccountOpen.value = false
    await loadAccounts()
  } catch (err: any) {
    addAccountError.value = err?.data?.statusMessage || 'Kunde inte spara'
  } finally {
    addAccountSaving.value = false
  }
}

// --- Increase / decrease balance ---
const adjustingId = ref<string | null>(null)
const adjustMode = ref<'increase' | 'decrease'>('increase')
const adjustAmount = ref<number | null>(null)
const adjustNote = ref('')
const adjustSaving = ref(false)
const adjustError = ref('')

const openAdjust = (account: Account, mode: 'increase' | 'decrease') => {
  adjustingId.value = account.id
  adjustMode.value = mode
  adjustAmount.value = null
  adjustNote.value = ''
  adjustError.value = ''
}

const cancelAdjust = () => {
  adjustingId.value = null
}

const submitAdjust = async (account: Account) => {
  adjustError.value = ''

  if (!adjustAmount.value || adjustAmount.value <= 0) {
    adjustError.value = 'Ange ett belopp'
    return
  }

  const deltaKr = adjustMode.value === 'increase' ? adjustAmount.value : -adjustAmount.value

  adjustSaving.value = true

  try {
    const res = await $fetch<{ account: Account }>(`/api/store-credit-accounts/${account.id}/transactions`, {
      method: 'POST',
      body: { deltaKr, note: adjustNote.value }
    })
    const index = accounts.value.findIndex((a) => a.id === account.id)
    if (index !== -1) accounts.value[index] = res.account
    delete historyByAccount.value[account.id]
    adjustingId.value = null
  } catch (err: any) {
    adjustError.value = err?.data?.statusMessage || 'Kunde inte spara'
  } finally {
    adjustSaving.value = false
  }
}

// --- History ---
const expandedId = ref<string | null>(null)
const historyByAccount = ref<Record<string, Transaction[]>>({})
const historyLoading = ref<string | null>(null)

const toggleHistory = async (account: Account) => {
  if (expandedId.value === account.id) {
    expandedId.value = null
    return
  }

  expandedId.value = account.id

  if (historyByAccount.value[account.id]) return

  historyLoading.value = account.id

  try {
    const res = await $fetch<{ transactions: Transaction[] }>(`/api/store-credit-accounts/${account.id}/transactions`)
    historyByAccount.value[account.id] = res.transactions
  } catch {
    historyByAccount.value[account.id] = []
  } finally {
    historyLoading.value = null
  }
}

// --- Delete ---
const deletingId = ref<string | null>(null)

const removeAccount = async (account: Account) => {
  if (!confirm(`Ta bort store credit-kontot för ${account.customer_name}?`)) {
    return
  }

  deletingId.value = account.id

  try {
    await $fetch(`/api/store-credit-accounts/${account.id}`, { method: 'DELETE' })
    accounts.value = accounts.value.filter((a) => a.id !== account.id)
  } catch (err: any) {
    accountsError.value = err?.data?.statusMessage || 'Kunde inte ta bort'
  } finally {
    deletingId.value = null
  }
}

// ============================================================
// Övriga förmåner — event-tillträde & egna förmåner (fritext)
// ============================================================

const view = ref<'active' | 'redeemed'>('active')
const grants = ref<Grant[]>([])
const loading = ref(true)
const loadError = ref('')
const search = ref('')

const loadGrants = async () => {
  loading.value = true
  loadError.value = ''

  try {
    const res = await $fetch<{ grants: Grant[] }>('/api/store-credit', { query: { view: view.value } })
    grants.value = res.grants
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta förmåner'
  } finally {
    loading.value = false
  }
}

onMounted(loadGrants)
watch(view, loadGrants)

const visibleGrants = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return grants.value
  return grants.value.filter((g) => g.customer_name.toLowerCase().includes(term))
})

// --- Add form ---
const addOpen = ref(false)
const addSaving = ref(false)
const addError = ref('')

const newGrant = ref({
  customerName: '',
  reason: '',
  giveEvent: false,
  eventName: '',
  giveCustom: false,
  customText: ''
})

const resetAddForm = () => {
  newGrant.value = { customerName: '', reason: '', giveEvent: false, eventName: '', giveCustom: false, customText: '' }
  addError.value = ''
}

const submitAdd = async () => {
  addError.value = ''

  if (!newGrant.value.customerName.trim()) {
    addError.value = 'Ange ett namn'
    return
  }

  if (!newGrant.value.giveEvent && !newGrant.value.giveCustom) {
    addError.value = 'Välj minst en förmån att ge'
    return
  }

  addSaving.value = true

  try {
    await $fetch('/api/store-credit', {
      method: 'POST',
      body: {
        customerName: newGrant.value.customerName,
        reason: newGrant.value.reason,
        eventAccess: newGrant.value.giveEvent ? { eventName: newGrant.value.eventName } : null,
        custom: newGrant.value.giveCustom ? { text: newGrant.value.customText } : null
      }
    })
    resetAddForm()
    addOpen.value = false
    if (view.value === 'active') await loadGrants()
  } catch (err: any) {
    addError.value = err?.data?.statusMessage || 'Kunde inte spara'
  } finally {
    addSaving.value = false
  }
}

// --- Redeem / delete ---
const savingId = ref<string | null>(null)

const setRedeemed = async (grant: Grant, redeemed: boolean) => {
  savingId.value = grant.id

  try {
    await $fetch(`/api/store-credit/${grant.id}`, { method: 'PATCH', body: { redeemed } })
    grants.value = grants.value.filter((g) => g.id !== grant.id)
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte uppdatera'
  } finally {
    savingId.value = null
  }
}

const remove = async (grant: Grant) => {
  const label = grant.type === 'event_access' ? 'event-tillträdet' : 'förmånen'

  if (!confirm(`Ta bort ${label} för ${grant.customer_name}?`)) {
    return
  }

  savingId.value = grant.id

  try {
    await $fetch(`/api/store-credit/${grant.id}`, { method: 'DELETE' })
    grants.value = grants.value.filter((g) => g.id !== grant.id)
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte ta bort'
  } finally {
    savingId.value = null
  }
}
</script>

<template>
  <div>
    <h1 class="mb-1 text-xl font-semibold text-lyktan-ink">Store credit</h1>
    <p class="mb-6 text-sm text-lyktan-mute">
      Varje person har ett eget saldo som du justerar upp när dom får mer och ner när dom handlar för det. Övriga förmåner, som fritt tillträde till event, ligger som egna objekt du bockar av när de hämtats ut.
    </p>

    <section class="mb-10">
      <div class="mb-4 flex flex-wrap items-start justify-between gap-4">
        <h2 class="text-base font-semibold text-lyktan-ink">Saldon</h2>

        <button
          v-if="canEditStoreCredit"
          type="button"
          class="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg bg-lyktan-ink px-5 text-sm font-medium text-[var(--paper)] transition hover:bg-black"
          @click="addAccountOpen = !addAccountOpen; if (!addAccountOpen) resetAddAccountForm()"
        >
          {{ addAccountOpen ? 'Avbryt' : '+ Ny person' }}
        </button>
      </div>

      <div v-if="addAccountOpen" class="mb-4 rounded-2xl border border-[var(--line)] bg-lyktan-paper p-5">
        <div class="grid gap-4 sm:grid-cols-3">
          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Namn</span>
            <input v-model="newAccount.customerName" class="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm" placeholder="T.ex. Beppe Beppson">
          </label>
          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Belopp (kr)</span>
            <input v-model.number="newAccount.amountKr" type="number" min="0" class="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm" placeholder="200">
          </label>
          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Anteckning (valfritt)</span>
            <input v-model="newAccount.note" class="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm" placeholder="T.ex. Vann Riftbound-turneringen">
          </label>
        </div>

        <p v-if="addAccountError" class="mt-3 text-sm text-[var(--bad)]">{{ addAccountError }}</p>

        <div class="mt-4">
          <button
            type="button"
            :disabled="addAccountSaving"
            class="inline-flex min-h-9 items-center justify-center rounded-lg bg-lyktan-ink px-5 text-sm font-medium text-[var(--paper)] transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
            @click="submitAddAccount"
          >
            {{ addAccountSaving ? 'Sparar…' : 'Spara' }}
          </button>
        </div>
      </div>

      <p v-if="accountsLoading" class="text-sm text-lyktan-mute">Laddar…</p>
      <p v-else-if="accountsError" class="text-sm text-[var(--bad)]">{{ accountsError }}</p>
      <p v-else-if="!accounts.length" class="text-sm text-lyktan-mute">Ingen har store credit just nu.</p>

      <div v-else class="overflow-x-auto rounded-2xl border border-[var(--line)] bg-lyktan-paper">
        <table class="w-full min-w-[680px] text-left text-sm">
          <thead>
            <tr class="border-b border-[var(--line)] text-[0.72rem] font-medium text-lyktan-mute">
              <th class="px-4 py-3">Namn</th>
              <th class="px-4 py-3">Saldo</th>
              <th class="px-4 py-3">Senast ändrad</th>
              <th v-if="canEditStoreCredit" class="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            <template v-for="account in accounts" :key="account.id">
              <tr class="border-b border-[var(--line)]">
                <td class="px-4 py-3 font-medium text-lyktan-ink">{{ account.customer_name }}</td>
                <td class="px-4 py-3 font-medium text-lyktan-ink">{{ account.balance_kr }} kr</td>
                <td class="px-4 py-3 text-lyktan-mute">{{ formatDate(account.updated_at) }}</td>
                <td v-if="canEditStoreCredit" class="px-4 py-3">
                  <div class="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      class="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[0.8rem] font-medium text-lyktan-ink transition hover:bg-[var(--surface-2)]"
                      @click="openAdjust(account, 'increase')"
                    >
                      + Öka
                    </button>
                    <button
                      type="button"
                      :disabled="account.balance_kr <= 0"
                      class="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[0.8rem] font-medium text-lyktan-ink transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
                      @click="openAdjust(account, 'decrease')"
                    >
                      − Minska
                    </button>
                    <button
                      type="button"
                      class="text-sm text-lyktan-mute hover:underline"
                      @click="toggleHistory(account)"
                    >
                      Historik
                    </button>
                    <button
                      type="button"
                      :disabled="deletingId === account.id"
                      class="text-sm text-[var(--bad)] hover:underline disabled:opacity-40"
                      @click="removeAccount(account)"
                    >
                      Ta bort
                    </button>
                  </div>
                </td>
              </tr>

              <tr v-if="adjustingId === account.id" class="border-b border-[var(--line)] bg-lyktan-surface/60">
                <td colspan="4" class="px-4 py-4">
                  <div class="flex flex-wrap items-end gap-3">
                    <label class="block">
                      <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">
                        {{ adjustMode === 'increase' ? 'Öka med (kr)' : 'Minska med (kr)' }}
                      </span>
                      <input v-model.number="adjustAmount" type="number" min="0" class="w-32 rounded-lg border border-[var(--line)] px-3 py-2 text-sm" placeholder="50">
                    </label>
                    <label class="block flex-1 min-w-[180px]">
                      <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Anteckning (valfritt)</span>
                      <input
                        v-model="adjustNote"
                        class="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
                        :placeholder="adjustMode === 'increase' ? 'T.ex. Vann turnering' : 'T.ex. Köpte en boosterbox'"
                      >
                    </label>
                    <button
                      type="button"
                      :disabled="adjustSaving"
                      class="inline-flex min-h-9 items-center justify-center rounded-lg bg-lyktan-ink px-5 text-sm font-medium text-[var(--paper)] transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
                      @click="submitAdjust(account)"
                    >
                      {{ adjustSaving ? 'Sparar…' : 'Spara' }}
                    </button>
                    <button type="button" class="text-sm text-lyktan-mute hover:underline" @click="cancelAdjust">Avbryt</button>
                  </div>
                  <p v-if="adjustError" class="mt-2 text-sm text-[var(--bad)]">{{ adjustError }}</p>
                </td>
              </tr>

              <tr v-if="expandedId === account.id" class="border-b border-[var(--line)]">
                <td colspan="4" class="px-4 py-4">
                  <p v-if="historyLoading === account.id" class="text-sm text-lyktan-mute">Laddar historik…</p>
                  <p v-else-if="!historyByAccount[account.id]?.length" class="text-sm text-lyktan-mute">Ingen historik ännu.</p>
                  <ul v-else class="space-y-1.5 text-sm">
                    <li v-for="tx in historyByAccount[account.id]" :key="tx.id" class="flex items-center gap-3">
                      <span class="w-16 shrink-0 font-medium" :class="tx.amount_kr >= 0 ? 'text-[var(--ok)]' : 'text-[var(--bad)]'">
                        {{ tx.amount_kr >= 0 ? '+' : '' }}{{ tx.amount_kr }} kr
                      </span>
                      <span class="text-lyktan-mute">{{ tx.note || '—' }}</span>
                      <span class="ml-auto shrink-0 text-[0.72rem] text-lyktan-mute">{{ formatDate(tx.created_at) }}</span>
                    </li>
                  </ul>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <div class="mb-4 flex flex-wrap items-start justify-between gap-4">
        <h2 class="text-base font-semibold text-lyktan-ink">Övriga förmåner</h2>

        <button
          v-if="canEditStoreCredit"
          type="button"
          class="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg bg-lyktan-ink px-5 text-sm font-medium text-[var(--paper)] transition hover:bg-black"
          @click="addOpen = !addOpen; if (!addOpen) resetAddForm()"
        >
          {{ addOpen ? 'Avbryt' : '+ Ny förmån' }}
        </button>
      </div>

      <div v-if="addOpen" class="mb-6 rounded-2xl border border-[var(--line)] bg-lyktan-paper p-5">
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block sm:col-span-2">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Namn</span>
            <input v-model="newGrant.customerName" class="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm" placeholder="T.ex. Beppe Beppson">
          </label>

          <label class="block sm:col-span-2">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Anledning (valfritt)</span>
            <input v-model="newGrant.reason" class="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm" placeholder="T.ex. Vann Riftbound-turneringen">
          </label>
        </div>

        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <div class="rounded-xl border border-[var(--line)] p-4">
            <label class="flex items-center gap-2 text-sm font-medium text-lyktan-ink">
              <input v-model="newGrant.giveEvent" type="checkbox">
              Fritt tillträde till event
            </label>
            <label v-if="newGrant.giveEvent" class="mt-3 block">
              <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Event</span>
              <input v-model="newGrant.eventName" class="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm" placeholder="T.ex. Nexus Night">
            </label>
          </div>

          <div class="rounded-xl border border-[var(--line)] p-4">
            <label class="flex items-center gap-2 text-sm font-medium text-lyktan-ink">
              <input v-model="newGrant.giveCustom" type="checkbox">
              Egen förmån
            </label>
            <label v-if="newGrant.giveCustom" class="mt-3 block">
              <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Beskrivning</span>
              <input v-model="newGrant.customText" class="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm" placeholder="T.ex. 10% rabatt nästa köp">
            </label>
          </div>
        </div>

        <p v-if="addError" class="mt-3 text-sm text-[var(--bad)]">{{ addError }}</p>

        <div class="mt-4">
          <button
            type="button"
            :disabled="addSaving"
            class="inline-flex min-h-9 items-center justify-center rounded-lg bg-lyktan-ink px-5 text-sm font-medium text-[var(--paper)] transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
            @click="submitAdd"
          >
            {{ addSaving ? 'Sparar…' : 'Spara' }}
          </button>
        </div>
      </div>

      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex gap-2 text-sm">
          <button
            type="button"
            class="rounded-lg border px-4 py-1.5 font-medium transition"
            :class="view === 'active' ? 'border-lyktan-ink bg-lyktan-ink text-[var(--paper)]' : 'border-[var(--line)] text-lyktan-ink hover:bg-[var(--surface-2)]'"
            @click="view = 'active'"
          >
            Aktiva
          </button>
          <button
            type="button"
            class="rounded-lg border px-4 py-1.5 font-medium transition"
            :class="view === 'redeemed' ? 'border-lyktan-ink bg-lyktan-ink text-[var(--paper)]' : 'border-[var(--line)] text-lyktan-ink hover:bg-[var(--surface-2)]'"
            @click="view = 'redeemed'"
          >
            Inlösta
          </button>
        </div>

        <input
          v-model="search"
          type="search"
          placeholder="Sök namn…"
          class="min-h-9 w-full max-w-[220px] rounded-lg border border-[var(--line)] px-4 text-sm"
        >
      </div>

      <p v-if="loading" class="text-sm text-lyktan-mute">Laddar…</p>
      <p v-else-if="loadError" class="text-sm text-[var(--bad)]">{{ loadError }}</p>
      <p v-else-if="!visibleGrants.length" class="text-sm text-lyktan-mute">
        {{ view === 'active' ? 'Inga aktiva förmåner just nu.' : 'Inga inlösta förmåner ännu.' }}
      </p>

      <div v-else class="overflow-x-auto rounded-2xl border border-[var(--line)] bg-lyktan-paper">
        <table class="w-full min-w-[680px] text-left text-sm">
          <thead>
            <tr class="border-b border-[var(--line)] text-[0.72rem] font-medium text-lyktan-mute">
              <th class="px-4 py-3">Namn</th>
              <th class="px-4 py-3">Förmån</th>
              <th class="px-4 py-3">Anledning</th>
              <th class="px-4 py-3">{{ view === 'active' ? 'Skapad' : 'Inlöst' }}</th>
              <th v-if="canEditStoreCredit" class="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="grant in visibleGrants" :key="grant.id" class="border-b border-[var(--line)] last:border-0">
              <td class="px-4 py-3 font-medium text-lyktan-ink">{{ grant.customer_name }}</td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex rounded-full px-2.5 py-1 text-[0.72rem] font-medium"
                  :class="grant.type === 'event_access' ? 'bg-[var(--warn-soft)] text-[var(--warn)]' : 'bg-[var(--focus-soft)] text-[var(--focus)]'"
                >
                  {{ grant.type === 'event_access' ? grant.event_name : grant.custom_text }}
                </span>
              </td>
              <td class="px-4 py-3 text-lyktan-mute">{{ grant.reason || '—' }}</td>
              <td class="px-4 py-3 text-lyktan-mute">{{ formatDate(view === 'active' ? grant.created_at : (grant.redeemed_at || grant.created_at)) }}</td>
              <td v-if="canEditStoreCredit" class="px-4 py-3">
                <div class="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    :disabled="savingId === grant.id"
                    class="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[0.8rem] font-medium text-lyktan-ink transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
                    @click="setRedeemed(grant, view === 'active')"
                  >
                    {{ view === 'active' ? 'Markera inlöst' : 'Ångra' }}
                  </button>
                  <button
                    type="button"
                    :disabled="savingId === grant.id"
                    class="text-sm text-[var(--bad)] hover:underline disabled:opacity-40"
                    @click="remove(grant)"
                  >
                    Ta bort
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
