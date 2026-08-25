<script setup lang="ts">
const { fetch: refreshSession } = useUserSession()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const submit = async () => {
  error.value = ''
  loading.value = true

  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { email: email.value, password: password.value }
    })
    await refreshSession()
    await navigateTo('/')
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Något gick fel'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-[80vh] items-center justify-center">
    <form
      class="w-full max-w-sm rounded-2xl border border-black/8 bg-lyktan-paper p-8 shadow-sm"
      @submit.prevent="submit"
    >
      <h1 class="mb-6 text-lg font-semibold text-lyktan-ink">Logga in</h1>

      <label class="mb-4 block">
        <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">E-post</span>
        <input
          v-model="email"
          type="email"
          autocomplete="username"
          required
          class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-lyktan-accent"
        >
      </label>

      <label class="mb-6 block">
        <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Lösenord</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-lyktan-accent"
        >
      </label>

      <p v-if="error" class="mb-4 text-sm text-red-600">{{ error }}</p>

      <button
        type="submit"
        :disabled="loading"
        class="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-lyktan-ink px-6 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
      >
        {{ loading ? 'Loggar in…' : 'Logga in' }}
      </button>
    </form>
  </div>
</template>
