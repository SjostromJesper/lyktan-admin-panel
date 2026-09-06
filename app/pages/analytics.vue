<script setup lang="ts">
type Summary = {
  rangeDays: number
  totalPageviews: number
  uniqueVisitors: number
  dailySeries: { date: string, pageviews: number, visitors: number }[]
  topPages: { value: string, count: number }[]
  topReferrers: { value: string, count: number }[]
  deviceCounts: Record<string, number>
}

const DEVICE_LABELS: Record<string, string> = { desktop: 'Dator', mobile: 'Mobil', tablet: 'Surfplatta' }

const range = ref<'7d' | '30d' | '90d'>('30d')
const summary = ref<Summary | null>(null)
const loading = ref(true)
const loadError = ref('')

const loadSummary = async () => {
  loading.value = true
  loadError.value = ''

  try {
    summary.value = await $fetch<Summary>('/api/analytics/summary', { query: { range: range.value } })
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta statistik'
  } finally {
    loading.value = false
  }
}

onMounted(loadSummary)
watch(range, loadSummary)

const maxPageviews = computed(() => Math.max(1, ...(summary.value?.dailySeries.map((d) => d.pageviews) ?? [1])))

const formatDate = (isoDate: string) =>
  new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' }).format(new Date(`${isoDate}T00:00:00`))

const totalDeviceCount = computed(() => Object.values(summary.value?.deviceCounts ?? {}).reduce((sum, n) => sum + n, 0) || 1)

const devicePercent = (count: number) => Math.round((count / totalDeviceCount.value) * 100)
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-xl font-semibold text-lyktan-ink">Statistik</h1>

      <div class="flex gap-2 text-sm">
        <button
          v-for="option in (['7d', '30d', '90d'] as const)"
          :key="option"
          type="button"
          class="rounded-full border px-4 py-1.5 font-medium transition"
          :class="range === option ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
          @click="range = option"
        >
          {{ option === '7d' ? '7 dagar' : option === '30d' ? '30 dagar' : '90 dagar' }}
        </button>
      </div>
    </div>

    <p v-if="loading" class="text-sm text-lyktan-mute">Laddar…</p>
    <p v-else-if="loadError" class="text-sm text-red-600">{{ loadError }}</p>

    <div v-else-if="summary" class="grid gap-6">
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-2">
        <div class="rounded-2xl border border-black/8 bg-lyktan-paper p-6">
          <p class="text-[0.72rem] font-medium text-lyktan-mute">Sidvisningar</p>
          <p class="mt-2 text-3xl font-semibold tracking-[-0.01em] text-lyktan-ink">{{ summary.totalPageviews }}</p>
        </div>
        <div class="rounded-2xl border border-black/8 bg-lyktan-paper p-6">
          <p class="text-[0.72rem] font-medium text-lyktan-mute">Unika besökare</p>
          <p class="mt-2 text-3xl font-semibold tracking-[-0.01em] text-lyktan-ink">{{ summary.uniqueVisitors }}</p>
        </div>
      </div>

      <div class="rounded-2xl border border-black/8 bg-lyktan-paper p-6">
        <p class="mb-4 text-[0.72rem] font-medium text-lyktan-mute">Sidvisningar per dag</p>

        <p v-if="!summary.dailySeries.length" class="text-sm text-lyktan-mute">Ingen data ännu.</p>
        <div v-else class="flex h-32 items-end gap-[2px] overflow-x-auto">
          <div
            v-for="day in summary.dailySeries"
            :key="day.date"
            class="min-w-[6px] flex-1 rounded-t bg-lyktan-ink transition hover:bg-lyktan-accent"
            :style="{ height: `${Math.max(4, (day.pageviews / maxPageviews) * 100)}%` }"
            :title="`${formatDate(day.date)}: ${day.pageviews} sidvisningar, ${day.visitors} besökare`"
          />
        </div>
        <div v-if="summary.dailySeries.length" class="mt-2 flex justify-between text-[0.72rem] text-lyktan-mute">
          <span>{{ formatDate(summary.dailySeries[0]!.date) }}</span>
          <span>{{ formatDate(summary.dailySeries[summary.dailySeries.length - 1]!.date) }}</span>
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <div class="rounded-2xl border border-black/8 bg-lyktan-paper p-6">
          <p class="mb-3 text-[0.72rem] font-medium text-lyktan-mute">Populäraste sidorna</p>
          <p v-if="!summary.topPages.length" class="text-sm text-lyktan-mute">Ingen data ännu.</p>
          <ul v-else class="grid gap-2">
            <li v-for="page in summary.topPages" :key="page.value" class="flex items-center justify-between gap-3 text-sm">
              <span class="truncate text-lyktan-ink">{{ page.value }}</span>
              <span class="shrink-0 text-lyktan-mute">{{ page.count }}</span>
            </li>
          </ul>
        </div>

        <div class="rounded-2xl border border-black/8 bg-lyktan-paper p-6">
          <p class="mb-3 text-[0.72rem] font-medium text-lyktan-mute">Trafikkällor</p>
          <p v-if="!summary.topReferrers.length" class="text-sm text-lyktan-mute">Ingen data ännu.</p>
          <ul v-else class="grid gap-2">
            <li v-for="referrer in summary.topReferrers" :key="referrer.value" class="flex items-center justify-between gap-3 text-sm">
              <span class="truncate text-lyktan-ink">{{ referrer.value }}</span>
              <span class="shrink-0 text-lyktan-mute">{{ referrer.count }}</span>
            </li>
          </ul>
        </div>
      </div>

      <div class="rounded-2xl border border-black/8 bg-lyktan-paper p-6">
        <p class="mb-3 text-[0.72rem] font-medium text-lyktan-mute">Enheter</p>
        <div class="grid gap-3">
          <div v-for="key in ['desktop', 'mobile', 'tablet']" :key="key" class="grid gap-1">
            <div class="flex items-center justify-between text-sm">
              <span class="text-lyktan-ink">{{ DEVICE_LABELS[key] }}</span>
              <span class="text-lyktan-mute">{{ devicePercent(summary.deviceCounts[key] || 0) }}%</span>
            </div>
            <div class="h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
              <div class="h-full rounded-full bg-lyktan-ink" :style="{ width: `${devicePercent(summary.deviceCounts[key] || 0)}%` }" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
