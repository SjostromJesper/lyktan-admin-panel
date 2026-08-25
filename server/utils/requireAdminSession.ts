import type { H3Event } from 'h3'

export type Section = 'members' | 'staff' | 'schedule' | 'orders' | 'bookings'
export type AccessLevel = 'none' | 'view' | 'edit'

type SessionUser = {
  email: string
  isSuperAdmin?: boolean
  permissions?: Record<Section, AccessLevel>
}

const LEVEL_RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2 }

/**
 * Throws 401 unless a valid session cookie (set at login) is present.
 * Does not check any specific permission — use requireAccess /
 * requireAnyAccess for routes that need one.
 */
export const requireAdminSession = async (event: H3Event) => {
  const session = await requireUserSession(event)
  return session.user as SessionUser
}

const levelFor = (user: SessionUser, section: Section): AccessLevel =>
  user.isSuperAdmin ? 'edit' : (user.permissions?.[section] ?? 'none')

/**
 * Guards a route behind a minimum access level for one section. The super
 * admin always passes.
 */
export const requireAccess = async (event: H3Event, section: Section, minLevel: AccessLevel = 'view') => {
  const user = await requireAdminSession(event)

  if (LEVEL_RANK[levelFor(user, section)] >= LEVEL_RANK[minLevel]) {
    return user
  }

  throw createError({ statusCode: 403, statusMessage: 'Du har inte behörighet till den här delen' })
}

/**
 * Guards a route behind any of several section requirements — e.g. staff
 * listing is needed both by the Personal page (staff:view) and the Schema
 * page (schedule:view).
 */
export const requireAnyAccess = async (event: H3Event, requirements: { section: Section; minLevel?: AccessLevel }[]) => {
  const user = await requireAdminSession(event)

  const ok = requirements.some(({ section, minLevel = 'view' }) => LEVEL_RANK[levelFor(user, section)] >= LEVEL_RANK[minLevel])

  if (ok) {
    return user
  }

  throw createError({ statusCode: 403, statusMessage: 'Du har inte behörighet till den här delen' })
}
