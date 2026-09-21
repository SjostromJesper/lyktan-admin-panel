import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  nitro: {
    preset: 'netlify'
  },
  modules: ['nuxt-auth-utils', '@vite-pwa/nuxt'],
  // Without an explicit maxAge, the session cookie has no expiry at all —
  // the browser (and especially a PWA on mobile) treats it as a "closes
  // when the tab/app closes" cookie, logging staff out after any pause.
  // 180 days keeps people logged in on their own devices; the login is
  // still password-protected either way.
  runtimeConfig: {
    session: {
      maxAge: 60 * 60 * 24 * 180
    }
  },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      link: [
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        // Fonts for the DESIGN.md design system, used site-wide.
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap' }
      ]
    }
  },
  vite: {
    plugins: [tailwindcss()]
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Butik Lyktan · Admin',
      short_name: 'BL Admin',
      description: 'Adminpanel för Butik Lyktan',
      // Matches the DESIGN.md palette's light-mode --ink/--paper — the PWA
      // manifest has no dark-mode concept, so this is a fixed light pair.
      theme_color: '#1D2230',
      background_color: '#EEF0EC',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: {
      // Never cache API responses — this app is all session-authed,
      // dynamic data (members, schedule, orders). Only the app shell
      // (JS/CSS/icons) is worth precaching.
      navigateFallback: null,
      globPatterns: ['**/*.{js,css,ico,png,svg}'],
      runtimeCaching: [
        {
          urlPattern: /^\/api\//,
          handler: 'NetworkOnly'
        }
      ]
    },
    devOptions: {
      enabled: true,
      type: 'module'
    }
  }
})
