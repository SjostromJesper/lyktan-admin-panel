<script setup lang="ts">
type Member = {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  tier: 'litet' | 'stort'
  expiry_date: string | null
}

const emit = defineEmits<{
  close: []
  select: [member: Member]
}>()

const members = ref<Member[]>([])
const loading = ref(true)
const loadError = ref('')
const search = ref('')
const selectedId = ref<string | null>(null)

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

const filteredMembers = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return members.value

  return members.value.filter((member) => {
    const haystack = `${member.first_name} ${member.last_name} ${member.phone ?? ''} ${member.email ?? ''}`.toLowerCase()
    return haystack.includes(query)
  })
})

const selectedMember = computed(() => members.value.find((member) => member.id === selectedId.value) ?? null)

const confirmSelection = () => {
  if (!selectedMember.value) return
  emit('select', selectedMember.value)
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" @click.self="emit('close')">
    <div class="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-lyktan-paper shadow-xl">
      <div class="flex items-center justify-between border-b border-black/8 p-6 pb-4">
        <h1 class="text-lg font-semibold text-lyktan-ink">Välj befintlig medlem</h1>
        <button type="button" aria-label="Stäng" class="text-lyktan-mute hover:text-lyktan-ink" @click="emit('close')">✕</button>
      </div>

      <div class="border-b border-black/8 p-4">
        <input
          v-model="search"
          type="search"
          placeholder="Sök på namn, telefon eller e-post"
          class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
        >
      </div>

      <div class="flex-1 overflow-y-auto">
        <p v-if="loading" class="p-6 text-sm text-lyktan-mute">Laddar…</p>
        <p v-else-if="loadError" class="p-6 text-sm text-red-600">{{ loadError }}</p>
        <p v-else-if="!filteredMembers.length" class="p-6 text-sm text-lyktan-mute">Inga medlemmar hittades.</p>

        <ul v-else class="divide-y divide-black/6">
          <li v-for="member in filteredMembers" :key="member.id">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 px-6 py-3 text-left transition"
              :class="selectedId === member.id ? 'bg-lyktan-ink/[0.06]' : 'hover:bg-black/[0.02]'"
              @click="selectedId = member.id"
            >
              <span class="min-w-0">
                <span class="flex items-center gap-2 font-medium text-lyktan-ink">
                  <span
                    class="h-2 w-2 shrink-0 rounded-full"
                    :class="{ green: 'bg-emerald-500', yellow: 'bg-amber-400', red: 'bg-red-500' }[membershipDotColor(member.expiry_date)]"
                  />
                  {{ member.first_name }} {{ member.last_name }}
                </span>
                <span class="mt-0.5 block truncate text-[0.8rem] text-lyktan-mute">
                  {{ [member.phone, member.email].filter(Boolean).join(' · ') || 'Ingen kontaktinfo' }}
                </span>
              </span>
              <span class="shrink-0 rounded-full bg-lyktan-surface px-2.5 py-1 text-[0.72rem] font-medium text-lyktan-ink">
                {{ TIER_LABELS[member.tier] }}
              </span>
            </button>
          </li>
        </ul>
      </div>

      <div class="flex items-center gap-3 border-t border-black/8 p-6 pt-4">
        <button
          type="button"
          class="inline-flex min-h-9 items-center justify-center rounded-full border border-black/15 px-5 text-sm font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
          @click="emit('close')"
        >
          Avbryt
        </button>
        <button
          type="button"
          :disabled="!selectedMember"
          class="ml-auto inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          @click="confirmSelection"
        >
          Välj
        </button>
      </div>
    </div>
  </div>
</template>
