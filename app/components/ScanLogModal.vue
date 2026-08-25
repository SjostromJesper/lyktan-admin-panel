<script setup lang="ts">
type ScanEntry = {
  id: string
  member_id: string | null
  member_name: string | null
  approved: boolean
  reason: 'not_found' | 'expired' | 'never_activated' | null
  scanned_by: string
  created_at: string
}

const emit = defineEmits<{ close: [] }>()

const scans = ref<ScanEntry[]>([])
const loading = ref(true)
const loadError = ref('')

const load = async () => {
  loading.value = true
  loadError.value = ''

  try {
    const res = await $fetch<{ scans: ScanEntry[] }>('/api/members/scan-log')
    scans.value = res.scans
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta loggen'
  } finally {
    loading.value = false
  }
}

onMounted(load)

const reasonLabel = (reason: ScanEntry['reason']) => {
  if (reason === 'expired') return 'Utgånget'
  if (reason === 'never_activated') return 'Aldrig aktiverat'
  if (reason === 'not_found') return 'Okänd kod'
  return ''
}

const formatTime = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleDateString('sv-SE')} ${d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" @click.self="emit('close')">
    <div class="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-lyktan-paper p-6 shadow-xl">
      <div class="mb-4 flex items-center justify-between">
        <h1 class="text-lg font-semibold text-lyktan-ink">Skanningslogg</h1>
        <button type="button" aria-label="Stäng" class="text-lyktan-mute hover:text-lyktan-ink" @click="emit('close')">✕</button>
      </div>

      <p v-if="loading" class="text-sm text-lyktan-mute">Laddar…</p>
      <p v-else-if="loadError" class="text-sm text-red-600">{{ loadError }}</p>
      <p v-else-if="!scans.length" class="text-sm text-lyktan-mute">Inga skanningar ännu.</p>

      <ul v-else class="space-y-2">
        <li v-for="scan in scans" :key="scan.id" class="flex items-center justify-between gap-3 rounded-lg border border-black/6 px-3 py-2 text-sm">
          <div>
            <span class="font-medium text-lyktan-ink">{{ scan.member_name || 'Okänd kod' }}</span>
            <span v-if="!scan.approved" class="ml-2 text-[0.72rem] text-lyktan-mute">{{ reasonLabel(scan.reason) }}</span>
            <div class="text-[0.72rem] text-lyktan-mute">{{ formatTime(scan.created_at) }} · {{ scan.scanned_by }}</div>
          </div>
          <span
            class="whitespace-nowrap rounded-full px-2.5 py-1 text-[0.72rem] font-medium"
            :class="scan.approved ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'"
          >
            {{ scan.approved ? 'Godkänd' : 'Nekad' }}
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>
