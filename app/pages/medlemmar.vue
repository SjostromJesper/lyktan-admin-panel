<script setup lang="ts">
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

const { canEditMembers, canViewMembers } = usePermissions()
const showScanModal = ref(false)
const showLogModal = ref(false)

const members = ref<Member[]>([])
const loading = ref(true)
const loadError = ref('')

const loadMembers = async () => {
  loading.value = true
  loadError.value = ''

  try {
    const res = await $fetch<{ members: Member[] }>('/api/members')
    members.value = res.members
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta medlemmar'
  } finally {
    loading.value = false
  }
}

onMounted(loadMembers)

// --- Add member form ---
const showAddForm = ref(false)
const addSaving = ref(false)
const addError = ref('')
const newMember = ref({
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  age: null as number | null,
  tier: 'litet' as Member['tier']
})

const resetAddForm = () => {
  newMember.value = { firstName: '', lastName: '', phone: '', email: '', age: null, tier: 'litet' }
  addError.value = ''
}

const submitAdd = async () => {
  addSaving.value = true
  addError.value = ''

  try {
    const { member } = await $fetch<{ member: Member }>('/api/members', {
      method: 'POST',
      body: {
        firstName: newMember.value.firstName,
        lastName: newMember.value.lastName,
        phone: newMember.value.phone,
        email: newMember.value.email,
        age: newMember.value.age,
        tier: newMember.value.tier
      }
    })
    resetAddForm()
    showAddForm.value = false
    members.value.unshift(member)
    selectedMember.value = member
  } catch (err: any) {
    addError.value = err?.data?.statusMessage || 'Kunde inte spara medlem'
  } finally {
    addSaving.value = false
  }
}

// --- Modal ---
const selectedMember = ref<Member | null>(null)

const onMemberUpdated = (updated: Member) => {
  const idx = members.value.findIndex((m) => m.id === updated.id)
  if (idx !== -1) members.value[idx] = updated
  selectedMember.value = updated
}

const onMemberDeleted = (id: string) => {
  members.value = members.value.filter((m) => m.id !== id)
  selectedMember.value = null
}

</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold text-lyktan-ink">Medlemmar</h1>
      <div class="flex flex-wrap gap-3">
        <button
          v-if="canViewMembers"
          type="button"
          class="inline-flex min-h-9 items-center justify-center rounded-full border border-black/15 px-5 text-sm font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
          @click="showLogModal = true"
        >
          Logg
        </button>
        <button
          v-if="canViewMembers"
          type="button"
          class="inline-flex min-h-9 items-center justify-center rounded-full border border-black/15 px-5 text-sm font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
          @click="showScanModal = true"
        >
          Skanna medlem
        </button>
        <button
          v-if="canEditMembers"
          type="button"
          class="inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black"
          @click="showAddForm = !showAddForm"
        >
          {{ showAddForm ? 'Avbryt' : '+ Ny medlem' }}
        </button>
      </div>
    </div>

    <form
      v-if="showAddForm && canEditMembers"
      class="mb-8 grid grid-cols-1 gap-4 rounded-2xl border border-black/8 bg-lyktan-paper p-6 sm:grid-cols-2"
      @submit.prevent="submitAdd"
    >
      <label class="block">
        <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Förnamn</span>
        <input v-model="newMember.firstName" required class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
      </label>

      <label class="block">
        <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Efternamn</span>
        <input v-model="newMember.lastName" required class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
      </label>

      <label class="block">
        <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Telefonnummer</span>
        <input v-model="newMember.phone" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
      </label>

      <label class="block">
        <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">E-post</span>
        <input v-model="newMember.email" type="email" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
      </label>

      <label class="block">
        <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Ålder</span>
        <input v-model.number="newMember.age" type="number" min="0" max="130" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
      </label>

      <label class="block">
        <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Medlemskap</span>
        <select v-model="newMember.tier" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          <option v-for="(label, key) in TIER_LABELS" :key="key" :value="key">{{ label }}</option>
        </select>
      </label>

      <p v-if="addError" class="sm:col-span-2 text-sm text-red-600">{{ addError }}</p>

      <div class="sm:col-span-2">
        <button
          type="submit"
          :disabled="addSaving"
          class="inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          {{ addSaving ? 'Sparar…' : 'Spara medlem' }}
        </button>
      </div>
    </form>

    <p v-if="loading" class="text-sm text-lyktan-mute">Laddar…</p>
    <p v-else-if="loadError" class="text-sm text-red-600">{{ loadError }}</p>
    <p v-else-if="!members.length" class="text-sm text-lyktan-mute">Inga medlemmar ännu.</p>

    <div v-else class="overflow-x-auto rounded-2xl border border-black/8 bg-lyktan-paper">
      <table class="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr class="border-b border-black/8 text-[0.72rem] font-medium text-lyktan-mute">
            <th class="px-4 py-3">Namn</th>
            <th class="px-4 py-3">Kontakt</th>
            <th class="px-4 py-3">Ålder</th>
            <th class="px-4 py-3">Medlemskap</th>
            <th class="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="member in members"
            :key="member.id"
            class="cursor-pointer border-b border-black/6 last:border-0 hover:bg-black/[0.02]"
            @click="selectedMember = member"
          >
            <td class="px-4 py-3 font-medium text-lyktan-ink">
              <span class="inline-flex items-center gap-2">
                <span
                  class="h-2 w-2 shrink-0 rounded-full"
                  :class="{
                    green: 'bg-emerald-500',
                    yellow: 'bg-amber-400',
                    red: 'bg-red-500'
                  }[membershipDotColor(member.expiry_date)]"
                />
                {{ member.first_name }} {{ member.last_name }}
              </span>
            </td>
            <td class="px-4 py-3 text-lyktan-mute">
              <div v-if="member.phone">{{ member.phone }}</div>
              <div v-if="member.email">{{ member.email }}</div>
            </td>
            <td class="px-4 py-3">{{ member.age ?? '—' }}</td>
            <td class="px-4 py-3">{{ TIER_LABELS[member.tier] }}</td>
            <td class="px-4 py-3">
              <span
                class="rounded-full px-2.5 py-1 text-[0.72rem] font-medium"
                :class="(daysLeft(member.expiry_date) ?? -1) >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-black/8 text-lyktan-mute'"
              >
                {{ membershipStatusLabel(member.expiry_date) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <MemberModal
      v-if="selectedMember"
      :member="selectedMember"
      @close="selectedMember = null"
      @updated="onMemberUpdated"
      @deleted="onMemberDeleted"
    />

    <ScanModal v-if="showScanModal" @close="showScanModal = false" />
    <ScanLogModal v-if="showLogModal" @close="showLogModal = false" />
  </div>
</template>
