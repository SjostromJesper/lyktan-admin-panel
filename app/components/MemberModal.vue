<script setup lang="ts">
import QRCode from 'qrcode'

type Member = {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  age: number | null
  tier: 'litet' | 'stort'
  expiry_date: string | null
  renewed_at: string | null
  qr_token: string
  created_at: string
}

type RenewalEvent = {
  id: string
  months: number
  previous_expiry_date: string | null
  new_expiry_date: string
  source: 'admin' | 'webshop'
  actor: string | null
  created_at: string
}

const props = defineProps<{ member: Member }>()
const emit = defineEmits<{
  close: []
  updated: [member: Member]
  deleted: [id: string]
}>()

const { canEditMembers } = usePermissions()

const member = ref<Member>({ ...props.member })

watch(() => props.member, (m) => {
  member.value = { ...m }
})

// --- QR code ---
const qrDataUrl = ref('')

watch(() => member.value.qr_token, async (token) => {
  qrDataUrl.value = token ? await QRCode.toDataURL(token, { margin: 1, width: 220 }) : ''
}, { immediate: true })

// --- History ---
const history = ref<RenewalEvent[]>([])
const historyLoading = ref(true)

const loadHistory = async () => {
  historyLoading.value = true

  try {
    const res = await $fetch<{ history: RenewalEvent[] }>(`/api/members/${member.value.id}/history`)
    history.value = res.history
  } catch {
    // non-critical — the modal still works without history
  } finally {
    historyLoading.value = false
  }
}

onMounted(loadHistory)

const sourceLabel = (event: RenewalEvent) => {
  if (event.source === 'webshop') return event.actor ? `Webshop (${event.actor})` : 'Webshop'
  return event.actor || 'Admin'
}

const undoing = ref(false)
const undoError = ref('')

const undoEvent = async (undoEventId: string) => {
  if (!confirm('Ångra den här förnyelsen?')) {
    return
  }

  undoing.value = true
  undoError.value = ''

  try {
    const res = await $fetch<{ member: Member }>(`/api/members/${member.value.id}/history/${undoEventId}`, {
      method: 'DELETE'
    })
    member.value = res.member
    emit('updated', res.member)
    await loadHistory()
  } catch (err: any) {
    undoError.value = err?.data?.statusMessage || 'Kunde inte ångra förnyelsen'
  } finally {
    undoing.value = false
  }
}

// --- Renewal ---
const renewing = ref(false)
const renewError = ref('')

const renew = async (months: number) => {
  renewing.value = true
  renewError.value = ''

  try {
    const res = await $fetch<{ member: Member }>(`/api/members/${member.value.id}/renew`, {
      method: 'POST',
      body: { months }
    })
    member.value = res.member
    emit('updated', res.member)
    await loadHistory()
  } catch (err: any) {
    renewError.value = err?.data?.statusMessage || 'Kunde inte förnya medlemskapet'
  } finally {
    renewing.value = false
  }
}

// --- Edit ---
const showEditForm = ref(false)
const editDraft = ref({ firstName: '', lastName: '', phone: '', email: '', age: null as number | null, tier: 'litet' as Member['tier'] })
const editSaving = ref(false)
const editError = ref('')

watch(member, (m) => {
  editDraft.value = {
    firstName: m.first_name,
    lastName: m.last_name,
    phone: m.phone || '',
    email: m.email || '',
    age: m.age,
    tier: m.tier
  }
}, { immediate: true })

const saveEdit = async () => {
  editSaving.value = true
  editError.value = ''

  try {
    const res = await $fetch<{ member: Member }>(`/api/members/${member.value.id}`, {
      method: 'PATCH',
      body: editDraft.value
    })
    member.value = res.member
    emit('updated', res.member)
  } catch (err: any) {
    editError.value = err?.data?.statusMessage || 'Kunde inte spara ändringar'
  } finally {
    editSaving.value = false
  }
}

// --- Delete ---
const deleting = ref(false)

const deleteMember = async () => {
  if (!confirm(`Ta bort ${member.value.first_name} ${member.value.last_name}?`)) {
    return
  }

  deleting.value = true

  try {
    await $fetch(`/api/members/${member.value.id}`, { method: 'DELETE' })
    emit('deleted', member.value.id)
  } catch (err: any) {
    editError.value = err?.data?.statusMessage || 'Kunde inte ta bort medlem'
    deleting.value = false
  }
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" @click.self="emit('close')">
    <div class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-lyktan-paper p-6 shadow-xl">
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-lg font-semibold text-lyktan-ink">{{ member.first_name }} {{ member.last_name }}</h1>
        <div class="flex items-center gap-3">
          <span
            class="rounded-full px-3 py-1 text-sm font-medium"
            :class="(daysLeft(member.expiry_date) ?? -1) >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-black/8 text-lyktan-mute'"
          >
            {{ membershipStatusLabel(member.expiry_date) }}
          </span>
          <button type="button" aria-label="Stäng" class="text-lyktan-mute hover:text-lyktan-ink" @click="emit('close')">✕</button>
        </div>
      </div>

      <div v-if="qrDataUrl" class="mb-6 flex flex-col items-center rounded-2xl border border-black/8 p-5">
        <img :src="qrDataUrl" alt="QR-kod för medlemskap" width="160" height="160" class="rounded-lg">
        <p class="mt-2 text-[0.72rem] text-lyktan-mute">Byts automatiskt vid varje förnyelse</p>
      </div>

      <div v-if="canEditMembers" class="mb-6 rounded-2xl border border-black/8 p-5">
        <h2 class="mb-3 text-sm font-semibold text-lyktan-ink">Förnya medlemskap</h2>

        <p class="mb-4 text-sm text-lyktan-mute">
          <span v-if="member.expiry_date">Giltigt till {{ member.expiry_date }}.</span>
          <span v-else>Inte aktiverat ännu.</span>
          <span v-if="member.renewed_at"> Senast förnyat {{ member.renewed_at }}.</span>
        </p>

        <div class="flex flex-wrap gap-3">
          <button
            v-for="months in [1, 6, 12]"
            :key="months"
            type="button"
            :disabled="renewing"
            class="inline-flex min-h-9 items-center justify-center rounded-full border border-black/15 px-5 text-sm font-medium text-lyktan-ink transition hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
            @click="renew(months)"
          >
            + {{ months }} {{ months === 1 ? 'månad' : 'månader' }}
          </button>
        </div>

        <p v-if="renewError" class="mt-3 text-sm text-red-600">{{ renewError }}</p>
      </div>

      <p v-else class="mb-6 text-sm text-lyktan-mute">
        <span v-if="member.expiry_date">Giltigt till {{ member.expiry_date }}.</span>
        <span v-else>Inte aktiverat ännu.</span>
      </p>

      <div v-if="canEditMembers" class="rounded-2xl border border-black/8 p-5">
        <div class="flex items-center justify-between" :class="{ 'mb-4': showEditForm }">
          <h2 class="text-sm font-semibold text-lyktan-ink">Uppgifter</h2>
          <button
            type="button"
            class="text-sm font-medium text-lyktan-accent hover:underline"
            @click="showEditForm = !showEditForm"
          >
            {{ showEditForm ? 'Dölj' : 'Ändra uppgifter' }}
          </button>
        </div>

        <div v-if="showEditForm">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Förnamn</span>
              <input v-model="editDraft.firstName" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
            </label>

            <label class="block">
              <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Efternamn</span>
              <input v-model="editDraft.lastName" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
            </label>

            <label class="block">
              <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Telefonnummer</span>
              <input v-model="editDraft.phone" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
            </label>

            <label class="block">
              <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">E-post</span>
              <input v-model="editDraft.email" type="email" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
            </label>

            <label class="block">
              <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Ålder</span>
              <input v-model.number="editDraft.age" type="number" min="0" max="130" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
            </label>

            <label class="block">
              <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Medlemskap</span>
              <select v-model="editDraft.tier" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
                <option v-for="(label, key) in TIER_LABELS" :key="key" :value="key">{{ label }}</option>
              </select>
            </label>
          </div>

          <p v-if="editError" class="mt-3 text-sm text-red-600">{{ editError }}</p>

          <div class="mt-4 flex items-center gap-3">
            <button
              type="button"
              :disabled="editSaving"
              class="inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
              @click="saveEdit"
            >
              {{ editSaving ? 'Sparar…' : 'Spara ändringar' }}
            </button>

            <button
              type="button"
              :disabled="deleting"
              class="ml-auto text-sm text-red-600 hover:underline disabled:opacity-40"
              @click="deleteMember"
            >
              Radera konto
            </button>
          </div>
        </div>
      </div>

      <div class="mt-6 rounded-2xl border border-black/8 p-5">
        <h2 class="mb-3 text-sm font-semibold text-lyktan-ink">Historik</h2>

        <p v-if="historyLoading" class="text-sm text-lyktan-mute">Laddar…</p>
        <p v-else-if="!history.length" class="text-sm text-lyktan-mute">Inga förnyelser ännu.</p>

        <ul v-else class="space-y-2">
          <li v-for="(event, i) in history" :key="event.id" class="flex items-center justify-between gap-3 text-sm">
            <span class="text-lyktan-ink">
              +{{ event.months }} {{ event.months === 1 ? 'månad' : 'månader' }}
              <span class="text-lyktan-mute">
                ({{ event.previous_expiry_date || 'ej aktiverad' }} → {{ event.new_expiry_date }})
              </span>
            </span>
            <span class="flex items-center gap-3 whitespace-nowrap text-lyktan-mute">
              {{ sourceLabel(event) }} · {{ event.created_at.slice(0, 10) }}
              <button
                v-if="i === 0 && canEditMembers"
                type="button"
                :disabled="undoing"
                class="text-red-600 hover:underline disabled:opacity-40"
                @click="undoEvent(event.id)"
              >
                Ångra
              </button>
            </span>
          </li>
        </ul>

        <p v-if="undoError" class="mt-3 text-sm text-red-600">{{ undoError }}</p>
      </div>
    </div>
  </div>
</template>
