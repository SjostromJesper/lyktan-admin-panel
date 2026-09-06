<script setup lang="ts">
type AccessLevel = 'none' | 'view' | 'edit'

type Staff = {
  id: string
  name: string
  role: string | null
  active: boolean
  email?: string | null
  members_access?: AccessLevel
  staff_access?: AccessLevel
  schedule_access?: AccessLevel
  orders_access?: AccessLevel
  bookings_access?: AccessLevel
  company_access?: AccessLevel
  products_access?: AccessLevel
  analytics_access?: AccessLevel
  created_at: string
}

const { canEditStaff } = usePermissions()

const ACCESS_LABELS: Record<AccessLevel, string> = { none: '', view: 'kan se', edit: 'kan redigera' }

const accessSummary = (person: Staff) => {
  if (!person.email) return '—'
  const parts = [
    person.members_access && person.members_access !== 'none' && `Medlemmar (${ACCESS_LABELS[person.members_access]})`,
    person.staff_access && person.staff_access !== 'none' && `Personal (${ACCESS_LABELS[person.staff_access]})`,
    person.schedule_access && person.schedule_access !== 'none' && `Schema (${ACCESS_LABELS[person.schedule_access]})`,
    person.orders_access && person.orders_access !== 'none' && `Beställningar (${ACCESS_LABELS[person.orders_access]})`,
    person.bookings_access && person.bookings_access !== 'none' && `Bordsbokning (${ACCESS_LABELS[person.bookings_access]})`,
    person.company_access && person.company_access !== 'none' && `Företag (${ACCESS_LABELS[person.company_access]})`,
    person.products_access && person.products_access !== 'none' && `Produkter (${ACCESS_LABELS[person.products_access]})`,
    person.analytics_access && person.analytics_access !== 'none' && `Statistik (${ACCESS_LABELS[person.analytics_access]})`
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : 'Inloggning, ingen behörighet'
}

const staffList = ref<Staff[]>([])
const loading = ref(true)
const loadError = ref('')

const loadStaff = async () => {
  loading.value = true
  loadError.value = ''

  try {
    const res = await $fetch<{ staff: Staff[] }>('/api/staff')
    staffList.value = res.staff
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta personal'
  } finally {
    loading.value = false
  }
}

onMounted(loadStaff)

// --- Add ---
const showAddForm = ref(false)
const addSaving = ref(false)
const addError = ref('')
const newStaff = ref({ name: '', role: '' })

const submitAdd = async () => {
  addSaving.value = true
  addError.value = ''

  try {
    const { staff } = await $fetch<{ staff: Staff }>('/api/staff', {
      method: 'POST',
      body: newStaff.value
    })
    staffList.value.push(staff)
    staffList.value.sort((a, b) => a.name.localeCompare(b.name))
    newStaff.value = { name: '', role: '' }
    showAddForm.value = false
  } catch (err: any) {
    addError.value = err?.data?.statusMessage || 'Kunde inte spara personal'
  } finally {
    addSaving.value = false
  }
}

// --- Modal ---
const selectedStaff = ref<Staff | null>(null)

const onStaffUpdated = (updated: Staff) => {
  const idx = staffList.value.findIndex((s) => s.id === updated.id)
  if (idx !== -1) staffList.value[idx] = updated
  selectedStaff.value = updated
}

const onStaffDeleted = (id: string) => {
  staffList.value = staffList.value.filter((s) => s.id !== id)
  selectedStaff.value = null
}
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-xl font-semibold text-lyktan-ink">Personal</h1>
      <button
        v-if="canEditStaff"
        type="button"
        class="inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black"
        @click="showAddForm = !showAddForm"
      >
        {{ showAddForm ? 'Avbryt' : '+ Ny person' }}
      </button>
    </div>

    <form
      v-if="showAddForm && canEditStaff"
      class="mb-8 grid grid-cols-1 gap-4 rounded-2xl border border-black/8 bg-lyktan-paper p-6 sm:grid-cols-2"
      @submit.prevent="submitAdd"
    >
      <label class="block">
        <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Namn</span>
        <input v-model="newStaff.name" required class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
      </label>

      <label class="block">
        <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Roll</span>
        <input v-model="newStaff.role" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm" placeholder="T.ex. Butikssäljare">
      </label>

      <p v-if="addError" class="sm:col-span-2 text-sm text-red-600">{{ addError }}</p>

      <div class="sm:col-span-2">
        <button
          type="submit"
          :disabled="addSaving"
          class="inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          {{ addSaving ? 'Sparar…' : 'Spara person' }}
        </button>
      </div>
    </form>

    <p v-if="loading" class="text-sm text-lyktan-mute">Laddar…</p>
    <p v-else-if="loadError" class="text-sm text-red-600">{{ loadError }}</p>
    <p v-else-if="!staffList.length" class="text-sm text-lyktan-mute">Ingen personal ännu.</p>

    <div v-else class="overflow-x-auto rounded-2xl border border-black/8 bg-lyktan-paper">
      <table class="w-full min-w-[480px] text-left text-sm">
        <thead>
          <tr class="border-b border-black/8 text-[0.72rem] font-medium text-lyktan-mute">
            <th class="px-4 py-3">Namn</th>
            <th class="px-4 py-3">Roll</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Åtkomst</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="person in staffList"
            :key="person.id"
            class="cursor-pointer border-b border-black/6 last:border-0 hover:bg-black/[0.02]"
            @click="selectedStaff = person"
          >
            <td class="px-4 py-3 font-medium text-lyktan-ink">{{ person.name }}</td>
            <td class="px-4 py-3 text-lyktan-mute">{{ person.role || '—' }}</td>
            <td class="px-4 py-3">
              <span
                class="rounded-full px-2.5 py-1 text-[0.72rem] font-medium"
                :class="person.active ? 'bg-emerald-100 text-emerald-700' : 'bg-black/8 text-lyktan-mute'"
              >
                {{ person.active ? 'Aktiv' : 'Inaktiv' }}
              </span>
            </td>
            <td class="px-4 py-3 text-lyktan-mute">{{ accessSummary(person) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <StaffModal
      v-if="selectedStaff"
      :staff="selectedStaff"
      @close="selectedStaff = null"
      @updated="onStaffUpdated"
      @deleted="onStaffDeleted"
    />
  </div>
</template>
