<script setup lang="ts">
type Staff = { id: string; name: string; role: string | null; active: boolean }
type Shift = { id: string; staff_id: string; shift_date: string; start_time: string; end_time: string; notes: string | null }

const { canEditSchedule } = usePermissions()

const staffList = ref<Staff[]>([])
const shifts = ref<Shift[]>([])
const loading = ref(true)
const loadError = ref('')

const weekStart = ref(startOfWeek(new Date()))
const weekDays = computed(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart.value, i)))
const today = new Date()

const weekRangeLabel = computed(() => {
  const first = weekDays.value[0]
  const last = weekDays.value[6]
  return `${formatDayShort(first)} – ${formatDayShort(last)} ${last.getFullYear()}`
})

const load = async () => {
  loading.value = true
  loadError.value = ''

  try {
    const [staffRes, shiftsRes] = await Promise.all([
      $fetch<{ staff: Staff[] }>('/api/staff'),
      $fetch<{ shifts: Shift[] }>('/api/shifts', {
        query: { from: toIsoDate(weekDays.value[0]), to: toIsoDate(weekDays.value[6]) }
      })
    ])
    staffList.value = staffRes.staff.filter((s) => s.active)
    shifts.value = shiftsRes.shifts
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta schemat'
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(weekStart, load)

const prevWeek = () => { weekStart.value = addDays(weekStart.value, -7) }
const nextWeek = () => { weekStart.value = addDays(weekStart.value, 7) }
const goToday = () => { weekStart.value = startOfWeek(new Date()) }

const shiftsFor = (staffId: string, date: Date) => {
  const iso = toIsoDate(date)
  return shifts.value.filter((s) => s.staff_id === staffId && s.shift_date === iso)
}

// --- Hours summary ---
const minutesForShift = (shift: Shift) => {
  const [sh, sm] = shift.start_time.split(':').map(Number)
  const [eh, em] = shift.end_time.split(':').map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

const minutesForStaff = (staffId: string) =>
  weekDays.value.reduce((sum, day) => sum + shiftsFor(staffId, day).reduce((s, shift) => s + minutesForShift(shift), 0), 0)

const formatHours = (minutes: number) => {
  const hours = minutes / 60
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1).replace('.', ',')} h`
}

const totalMinutesAllStaff = computed(() => staffList.value.reduce((sum, s) => sum + minutesForStaff(s.id), 0))

// --- Copy previous week ---
const copying = ref(false)
const copyMessage = ref('')

const copyPreviousWeek = async () => {
  if (!confirm('Kopiera förra veckans pass hit? Dagar som redan har ett pass lämnas orörda.')) {
    return
  }

  copying.value = true
  copyMessage.value = ''

  try {
    const prevStart = addDays(weekStart.value, -7)
    const prevEnd = addDays(weekStart.value, -1)

    const res = await $fetch<{ shifts: Shift[] }>('/api/shifts', {
      query: { from: toIsoDate(prevStart), to: toIsoDate(prevEnd) }
    })

    let created = 0
    let skipped = 0

    for (const prevShift of res.shifts) {
      const prevDate = new Date(`${prevShift.shift_date}T00:00:00`)
      const day = prevDate.getDay()
      const offset = day === 0 ? 6 : day - 1
      const targetDate = addDays(weekStart.value, offset)

      if (shiftsFor(prevShift.staff_id, targetDate).length) {
        skipped++
        continue
      }

      const created_ = await $fetch<{ shift: Shift }>('/api/shifts', {
        method: 'POST',
        body: {
          staffId: prevShift.staff_id,
          date: toIsoDate(targetDate),
          startTime: prevShift.start_time.slice(0, 5),
          endTime: prevShift.end_time.slice(0, 5),
          notes: prevShift.notes || ''
        }
      })
      shifts.value.push(created_.shift)
      created++
    }

    copyMessage.value = skipped
      ? `${created} pass kopierade, ${skipped} hoppades över (redan schemalagt).`
      : `${created} pass kopierade.`
  } catch (err: any) {
    copyMessage.value = err?.data?.statusMessage || 'Kunde inte kopiera schemat'
  } finally {
    copying.value = false
  }
}

// --- Modal ---
const modalOpen = ref(false)
const editingShift = ref<Shift | null>(null)
const modalStaffId = ref('')
const modalStaffName = ref('')
const modalDate = ref('')
const form = ref({ startTime: '09:00', endTime: '17:00', notes: '' })
const saving = ref(false)
const formError = ref('')

const openAdd = (person: Staff, date: Date) => {
  editingShift.value = null
  modalStaffId.value = person.id
  modalStaffName.value = person.name
  modalDate.value = toIsoDate(date)
  form.value = { startTime: '09:00', endTime: '17:00', notes: '' }
  formError.value = ''
  modalOpen.value = true
}

const openEdit = (shift: Shift, person: Staff) => {
  editingShift.value = shift
  modalStaffId.value = shift.staff_id
  modalStaffName.value = person.name
  modalDate.value = shift.shift_date
  form.value = {
    startTime: shift.start_time.slice(0, 5),
    endTime: shift.end_time.slice(0, 5),
    notes: shift.notes || ''
  }
  formError.value = ''
  modalOpen.value = true
}

const closeModal = () => { modalOpen.value = false }

const PRESET_META = [
  { key: 'heldag', label: 'Heldag', classes: 'border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-200' },
  { key: 'morgon', label: 'Morgonpass', classes: 'border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-200' },
  { key: 'kvall', label: 'Kvällspass', classes: 'border-indigo-200 bg-indigo-100 text-indigo-800 hover:bg-indigo-200' }
] as const

type PresetKey = typeof PRESET_META[number]['key']
type PresetTimes = Record<PresetKey, { startTime: string; endTime: string }>

// Fredag och tidigare = vanliga öppettider, lördag/söndag har kortare öppettider.
const PRESET_TIMES: Record<'weekday' | 'saturday' | 'sunday', PresetTimes> = {
  weekday: {
    heldag: { startTime: '10:00', endTime: '22:00' },
    morgon: { startTime: '10:00', endTime: '16:00' },
    kvall: { startTime: '16:00', endTime: '22:00' }
  },
  saturday: {
    heldag: { startTime: '11:00', endTime: '19:00' },
    morgon: { startTime: '11:00', endTime: '16:00' },
    kvall: { startTime: '16:00', endTime: '19:00' }
  },
  sunday: {
    heldag: { startTime: '12:00', endTime: '18:00' },
    morgon: { startTime: '12:00', endTime: '16:00' },
    kvall: { startTime: '16:00', endTime: '18:00' }
  }
}

const dayKindForDate = (dateStr: string): 'weekday' | 'saturday' | 'sunday' => {
  if (!dateStr) return 'weekday'
  const day = new Date(`${dateStr}T00:00:00`).getDay()
  if (day === 6) return 'saturday'
  if (day === 0) return 'sunday'
  return 'weekday'
}

const quickPresets = computed(() => {
  const times = PRESET_TIMES[dayKindForDate(modalDate.value)]
  return PRESET_META.map((meta) => ({ ...meta, ...times[meta.key] }))
})

const applyPreset = (preset: { startTime: string; endTime: string }) => {
  form.value.startTime = preset.startTime
  form.value.endTime = preset.endTime
}

const saveShift = async () => {
  saving.value = true
  formError.value = ''

  try {
    if (editingShift.value) {
      const res = await $fetch<{ shift: Shift }>(`/api/shifts/${editingShift.value.id}`, {
        method: 'PATCH',
        body: { startTime: form.value.startTime, endTime: form.value.endTime, notes: form.value.notes }
      })
      const idx = shifts.value.findIndex((s) => s.id === res.shift.id)
      if (idx !== -1) shifts.value[idx] = res.shift
    } else {
      const res = await $fetch<{ shift: Shift }>('/api/shifts', {
        method: 'POST',
        body: {
          staffId: modalStaffId.value,
          date: modalDate.value,
          startTime: form.value.startTime,
          endTime: form.value.endTime,
          notes: form.value.notes
        }
      })
      shifts.value.push(res.shift)
    }
    modalOpen.value = false
  } catch (err: any) {
    formError.value = err?.data?.statusMessage || 'Kunde inte spara passet'
  } finally {
    saving.value = false
  }
}

const deleteShift = async () => {
  if (!editingShift.value) return
  if (!confirm('Ta bort passet?')) return

  saving.value = true

  try {
    await $fetch(`/api/shifts/${editingShift.value.id}`, { method: 'DELETE' })
    shifts.value = shifts.value.filter((s) => s.id !== editingShift.value!.id)
    modalOpen.value = false
  } catch (err: any) {
    formError.value = err?.data?.statusMessage || 'Kunde inte ta bort passet'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-xl font-semibold text-lyktan-ink">Schema</h1>

      <div class="flex flex-wrap items-center gap-3">
        <button type="button" class="shrink-0 rounded-full border border-black/15 px-3 py-1.5 text-sm hover:bg-black/[0.04]" @click="prevWeek">←</button>
        <button type="button" class="shrink-0 rounded-full border border-black/15 px-4 py-1.5 text-sm hover:bg-black/[0.04]" @click="goToday">Idag</button>
        <span class="whitespace-nowrap text-sm font-medium text-lyktan-ink">{{ weekRangeLabel }}</span>
        <button type="button" class="shrink-0 rounded-full border border-black/15 px-3 py-1.5 text-sm hover:bg-black/[0.04]" @click="nextWeek">→</button>
        <button
          v-if="canEditSchedule"
          type="button"
          :disabled="copying"
          class="shrink-0 whitespace-nowrap rounded-full border border-black/15 px-4 py-1.5 text-sm hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
          @click="copyPreviousWeek"
        >
          {{ copying ? 'Kopierar…' : 'Kopiera förra veckan' }}
        </button>
      </div>
    </div>

    <p v-if="copyMessage" class="mb-4 text-sm text-lyktan-mute">{{ copyMessage }}</p>

    <p v-if="loading" class="text-sm text-lyktan-mute">Laddar…</p>
    <p v-else-if="loadError" class="text-sm text-red-600">{{ loadError }}</p>
    <p v-else-if="!staffList.length" class="text-sm text-lyktan-mute">
      Ingen aktiv personal ännu. Lägg till personal på <NuxtLink to="/personal" class="text-lyktan-accent hover:underline">Personal-sidan</NuxtLink> för att kunna schemalägga.
    </p>

    <div v-else class="overflow-x-auto rounded-2xl border border-black/8 bg-lyktan-paper">
      <table class="w-full min-w-[900px] table-fixed text-left text-sm">
        <thead>
          <tr class="border-b border-black/8 text-[0.72rem] font-medium text-lyktan-mute">
            <th class="w-36 px-4 py-3">Personal</th>
            <th v-for="day in weekDays" :key="toIsoDate(day)" class="px-2 py-3 text-center" :class="{ 'text-lyktan-accent': isSameDate(day, today) }">
              {{ WEEKDAY_SHORT[day.getDay() === 0 ? 6 : day.getDay() - 1] }} {{ formatDayShort(day) }}
            </th>
            <th class="px-4 py-3 text-right">Timmar</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="person in staffList" :key="person.id" class="border-b border-black/6 last:border-0">
            <td class="px-4 py-3 align-top font-medium text-lyktan-ink">
              {{ person.name }}
              <div v-if="person.role" class="text-[0.72rem] font-normal text-lyktan-mute">{{ person.role }}</div>
            </td>
            <td v-for="day in weekDays" :key="toIsoDate(day)" class="px-2 py-2 align-top">
              <template v-if="canEditSchedule">
                <button
                  v-if="!shiftsFor(person.id, day).length"
                  type="button"
                  class="flex min-h-12 w-full items-center justify-center rounded-lg border border-dashed border-black/15 text-lyktan-mute transition hover:border-black/30 hover:text-lyktan-ink"
                  @click="openAdd(person, day)"
                >
                  +
                </button>
                <div v-else class="space-y-1">
                  <button
                    v-for="shift in shiftsFor(person.id, day)"
                    :key="shift.id"
                    type="button"
                    class="block w-full rounded-lg bg-lyktan-ink/5 px-2 py-1.5 text-left text-[0.8rem] font-medium text-lyktan-ink transition hover:bg-lyktan-ink/10"
                    @click="openEdit(shift, person)"
                  >
                    {{ shift.start_time.slice(0, 5) }}–{{ shift.end_time.slice(0, 5) }}
                  </button>
                </div>
              </template>
              <div v-else class="space-y-1">
                <div
                  v-for="shift in shiftsFor(person.id, day)"
                  :key="shift.id"
                  class="rounded-lg bg-lyktan-ink/5 px-2 py-1.5 text-[0.8rem] font-medium text-lyktan-ink"
                >
                  {{ shift.start_time.slice(0, 5) }}–{{ shift.end_time.slice(0, 5) }}
                </div>
              </div>
            </td>
            <td class="px-4 py-3 text-right align-top text-lyktan-mute">{{ formatHours(minutesForStaff(person.id)) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="border-t border-black/8 text-sm font-medium text-lyktan-ink">
            <td class="px-4 py-3" :colspan="8">Totalt</td>
            <td class="px-4 py-3 text-right">{{ formatHours(totalMinutesAllStaff) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div v-if="modalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" @click.self="closeModal">
      <div class="w-full max-w-sm rounded-2xl bg-lyktan-paper p-6 shadow-xl">
        <div class="mb-5 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold text-lyktan-ink">{{ modalStaffName }}</h2>
            <p class="text-sm text-lyktan-mute">{{ modalDate }}</p>
          </div>
          <button type="button" aria-label="Stäng" class="text-lyktan-mute hover:text-lyktan-ink" @click="closeModal">✕</button>
        </div>

        <div class="mb-4 flex flex-wrap gap-2">
          <button
            v-for="preset in quickPresets"
            :key="preset.label"
            type="button"
            class="rounded-full border px-3 py-1 text-[0.8rem] font-medium transition"
            :class="preset.classes"
            @click="applyPreset(preset)"
          >
            {{ preset.label }} ({{ preset.startTime }}–{{ preset.endTime }})
          </button>
        </div>

        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <label class="block">
              <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Start</span>
              <input v-model="form.startTime" type="time" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
            </label>
            <label class="block">
              <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Slut</span>
              <input v-model="form.endTime" type="time" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
            </label>
          </div>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Anteckning</span>
            <input v-model="form.notes" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm" placeholder="Valfritt">
          </label>
        </div>

        <p v-if="formError" class="mt-3 text-sm text-red-600">{{ formError }}</p>

        <div class="mt-5 flex items-center gap-3">
          <button
            type="button"
            :disabled="saving"
            class="inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
            @click="saveShift"
          >
            {{ saving ? 'Sparar…' : 'Spara' }}
          </button>

          <button
            v-if="editingShift"
            type="button"
            :disabled="saving"
            class="ml-auto text-sm text-red-600 hover:underline disabled:opacity-40"
            @click="deleteShift"
          >
            Ta bort pass
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
