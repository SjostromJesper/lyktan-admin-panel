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
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }
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
      theme_color: '#1d1d1f',
      background_color: '#f5f5f7',
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
