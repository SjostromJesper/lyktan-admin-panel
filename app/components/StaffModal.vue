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
  created_at: string
}

const ACCESS_LABELS: Record<AccessLevel, string> = {
  none: 'Ingen',
  view: 'Kan se',
  edit: 'Kan redigera'
}

const props = defineProps<{ staff: Staff }>()
const emit = defineEmits<{
  close: []
  updated: [staff: Staff]
  deleted: [id: string]
}>()

const { canEditStaff } = usePermissions()

const staff = ref<Staff>({ ...props.staff })

watch(() => props.staff, (s) => {
  staff.value = { ...s }
})

const editDraft = ref({ name: '', role: '', active: true })

watch(staff, (s) => {
  editDraft.value = { name: s.name, role: s.role || '', active: s.active }
}, { immediate: true })

const saving = ref(false)
const error = ref('')

const save = async () => {
  saving.value = true
  error.value = ''

  try {
    const res = await $fetch<{ staff: Staff }>(`/api/staff/${staff.value.id}`, {
      method: 'PATCH',
      body: editDraft.value
    })
    staff.value = res.staff
    emit('updated', res.staff)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Kunde inte spara ändringar'
  } finally {
    saving.value = false
  }
}

const deleting = ref(false)

const deleteStaff = async () => {
  if (!confirm(`Ta bort ${staff.value.name}? Alla inplanerade pass för personen tas bort.`)) {
    return
  }

  deleting.value = true

  try {
    await $fetch(`/api/staff/${staff.value.id}`, { method: 'DELETE' })
    emit('deleted', staff.value.id)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Kunde inte ta bort personal'
    deleting.value = false
  }
}

// --- Access ---
const hasAccessSet = computed(() => Boolean(staff.value.email))

const accessDraft = ref({
  email: '',
  password: '',
  membersAccess: 'none' as AccessLevel,
  staffAccess: 'none' as AccessLevel,
  scheduleAccess: 'none' as AccessLevel,
  ordersAccess: 'none' as AccessLevel,
  bookingsAccess: 'none' as AccessLevel,
  companyAccess: 'none' as AccessLevel,
  productsAccess: 'none' as AccessLevel
})

watch(staff, (s) => {
  accessDraft.value = {
    email: s.email || '',
    password: '',
    membersAccess: s.members_access || 'none',
    staffAccess: s.staff_access || 'none',
    scheduleAccess: s.schedule_access || 'none',
    ordersAccess: s.orders_access || 'none',
    bookingsAccess: s.bookings_access || 'none',
    companyAccess: s.company_access || 'none',
    productsAccess: s.products_access || 'none'
  }
}, { immediate: true })

const accessSaving = ref(false)
const accessError = ref('')

const saveAccess = async () => {
  if (!accessDraft.value.email) {
    accessError.value = 'Ange en e-postadress'
    return
  }

  if (!hasAccessSet.value && !accessDraft.value.password) {
    accessError.value = 'Sätt ett lösenord för nya konton'
    return
  }

  accessSaving.value = true
  accessError.value = ''

  try {
    const res = await $fetch<{ staff: Staff }>(`/api/staff/${staff.value.id}/access`, {
      method: 'POST',
      body: accessDraft.value
    })
    staff.value = res.staff
    emit('updated', res.staff)
    accessDraft.value.password = ''
  } catch (err: any) {
    accessError.value = err?.data?.statusMessage || 'Kunde inte spara åtkomst'
  } finally {
    accessSaving.value = false
  }
}

const revokeAccess = async () => {
  if (!confirm(`Ta bort inloggningen för ${staff.value.name}?`)) {
    return
  }

  accessSaving.value = true
  accessError.value = ''

  try {
    const res = await $fetch<{ staff: Staff }>(`/api/staff/${staff.value.id}/access`, {
      method: 'POST',
      body: { email: '' }
    })
    staff.value = res.staff
    emit('updated', res.staff)
  } catch (err: any) {
    accessError.value = err?.data?.statusMessage || 'Kunde inte ta bort åtkomst'
  } finally {
    accessSaving.value = false
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
    <div class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-lyktan-paper p-6 shadow-xl">
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-lg font-semibold text-lyktan-ink">{{ staff.name }}</h1>
        <button type="button" aria-label="Stäng" class="text-lyktan-mute hover:text-lyktan-ink" @click="emit('close')">✕</button>
      </div>

      <template v-if="canEditStaff">
        <div class="space-y-4">
          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Namn</span>
            <input v-model="editDraft.name" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Roll</span>
            <input v-model="editDraft.role" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm" placeholder="T.ex. Butikssäljare">
          </label>

          <label class="flex items-center gap-2 text-sm text-lyktan-mute">
            <input v-model="editDraft.active" type="checkbox">
            Aktiv (visas i schemat)
          </label>
        </div>

        <p v-if="error" class="mt-3 text-sm text-red-600">{{ error }}</p>

        <div class="mt-5 flex items-center gap-3">
          <button
            type="button"
            :disabled="saving"
            class="inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
            @click="save"
          >
            {{ saving ? 'Sparar…' : 'Spara ändringar' }}
          </button>

          <button
            type="button"
            :disabled="deleting"
            class="ml-auto text-sm text-red-600 hover:underline disabled:opacity-40"
            @click="deleteStaff"
          >
            Radera person
          </button>
        </div>

        <div class="mt-6 rounded-2xl border border-black/8 p-5">
          <h2 class="mb-1 text-sm font-semibold text-lyktan-ink">Åtkomst till adminpanelen</h2>
          <p class="mb-4 text-[0.72rem] text-lyktan-mute">
            Välj vad {{ staff.name }} ska kunna se eller redigera per del. Utan e-post och lösenord kan personen inte logga in.
          </p>

          <div class="space-y-4">
            <label class="block">
              <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">E-post</span>
              <input v-model="accessDraft.email" type="email" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
            </label>

            <label class="block">
              <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">
                {{ hasAccessSet ? 'Nytt lösenord (lämna tomt för att behålla nuvarande)' : 'Lösenord' }}
              </span>
              <input v-model="accessDraft.password" type="text" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
            </label>

            <div class="grid grid-cols-2 gap-3">
              <label class="block">
                <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Medlemmar</span>
                <select v-model="accessDraft.membersAccess" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
                  <option v-for="(label, key) in ACCESS_LABELS" :key="key" :value="key">{{ label }}</option>
                </select>
              </label>
              <label class="block">
                <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Personal</span>
                <select v-model="accessDraft.staffAccess" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
                  <option v-for="(label, key) in ACCESS_LABELS" :key="key" :value="key">{{ label }}</option>
                </select>
              </label>
              <label class="block">
                <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Schema</span>
                <select v-model="accessDraft.scheduleAccess" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
                  <option v-for="(label, key) in ACCESS_LABELS" :key="key" :value="key">{{ label }}</option>
                </select>
              </label>
              <label class="block">
                <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Beställningar</span>
                <select v-model="accessDraft.ordersAccess" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
                  <option v-for="(label, key) in ACCESS_LABELS" :key="key" :value="key">{{ label }}</option>
                </select>
              </label>
              <label class="block">
                <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Bordsbokning</span>
                <select v-model="accessDraft.bookingsAccess" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
                  <option v-for="(label, key) in ACCESS_LABELS" :key="key" :value="key">{{ label }}</option>
                </select>
              </label>
              <label class="block">
                <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Företag</span>
                <select v-model="accessDraft.companyAccess" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
                  <option v-for="(label, key) in ACCESS_LABELS" :key="key" :value="key">{{ label }}</option>
                </select>
              </label>
              <label class="block">
                <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Produkter</span>
                <select v-model="accessDraft.productsAccess" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
                  <option v-for="(label, key) in ACCESS_LABELS" :key="key" :value="key">{{ label }}</option>
                </select>
              </label>
            </div>
          </div>

          <p v-if="accessError" class="mt-3 text-sm text-red-600">{{ accessError }}</p>

          <div class="mt-4 flex items-center gap-3">
            <button
              type="button"
              :disabled="accessSaving"
              class="inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
              @click="saveAccess"
            >
              {{ accessSaving ? 'Sparar…' : (hasAccessSet ? 'Uppdatera åtkomst' : 'Ge åtkomst') }}
            </button>

            <button
              v-if="hasAccessSet"
              type="button"
              :disabled="accessSaving"
              class="ml-auto text-sm text-red-600 hover:underline disabled:opacity-40"
              @click="revokeAccess"
            >
              Ta bort inloggning
            </button>
          </div>
        </div>
      </template>

      <template v-else>
        <dl class="space-y-3 text-sm">
          <div>
            <dt class="text-[0.72rem] font-medium text-lyktan-mute">Roll</dt>
            <dd class="text-lyktan-ink">{{ staff.role || '—' }}</dd>
          </div>
          <div>
            <dt class="text-[0.72rem] font-medium text-lyktan-mute">Status</dt>
            <dd class="text-lyktan-ink">{{ staff.active ? 'Aktiv' : 'Inaktiv' }}</dd>
          </div>
        </dl>
        <p class="mt-4 text-[0.72rem] text-lyktan-mute">Du har bara läsåtkomst till Personal.</p>
      </template>
    </div>
  </div>
</template>
