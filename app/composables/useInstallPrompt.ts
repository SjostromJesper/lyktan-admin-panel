type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
const isStandalone = ref(false)
let listenersAttached = false

const checkStandalone = () => {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari's own flag for an already-installed home-screen app.
    (window.navigator as any).standalone === true
  )
}

export const useInstallPrompt = () => {
  if (!listenersAttached && typeof window !== 'undefined') {
    listenersAttached = true
    isStandalone.value = checkStandalone()

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault()
      deferredPrompt.value = event as BeforeInstallPromptEvent
    })

    window.addEventListener('appinstalled', () => {
      deferredPrompt.value = null
      isStandalone.value = true
    })
  }

  const canInstall = computed(() => !isStandalone.value && deferredPrompt.value !== null)

  const install = async () => {
    if (!deferredPrompt.value) return

    await deferredPrompt.value.prompt()
    await deferredPrompt.value.userChoice
    deferredPrompt.value = null
  }

  return { canInstall, install }
}
