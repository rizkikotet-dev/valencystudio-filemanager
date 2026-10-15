'use client'

/**
 * Client realtime hub — one shared socket.io connection for the whole app.
 *
 * - Identity-aware rooms: after login the client joins `user:<id>` (+ `admins`
 *   for OWNER/ADMIN sessions) so it only receives relevant change signals.
 * - Public share pages join `slug:<slug>` rooms for live download counters.
 * - Status is exposed via useSyncExternalStore (no re-render storms).
 * - Change events are consumed by <RealtimeBridge /> which coalesces domains
 *   and invalidates the matching TanStack Query caches → UI updates instantly,
 *   no page refresh needed. Polling intervals remain only as a backstop.
 */
import { useSyncExternalStore } from 'react'
import { io, Socket } from 'socket.io-client'

export type RealtimeStatus = 'connecting' | 'live' | 'offline'

export interface RealtimeChangeEvent {
  domains: string[]
  at?: number
  source?: 'api' | 'db'
}

let socket: Socket | null = null
let status: RealtimeStatus = 'connecting'
let identity: { userId: string; privileged: boolean; slug: string | null } = {
  userId: '',
  privileged: false,
  slug: null,
}

const statusListeners = new Set<() => void>()
const changeListeners = new Set<(e: RealtimeChangeEvent) => void>()

function setStatus(next: RealtimeStatus) {
  if (status === next) return
  status = next
  statusListeners.forEach(fn => fn())
}

function resubscribe() {
  if (!socket) return
  socket.emit('subscribe', {
    userId: identity.userId || undefined,
    privileged: identity.privileged || undefined,
    slug: identity.slug || undefined,
  })
}

function ensureSocket(): Socket {
  if (socket) return socket
  // Never put a port in the URL — the gateway routes via XTransformPort.
  socket = io('/?XTransformPort=3003', {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 8000,
  })
  socket.on('connect', () => {
    setStatus('live')
    resubscribe()
  })
  socket.on('disconnect', () => setStatus('offline'))
  socket.on('connect_error', () => setStatus('offline'))
  socket.io.on('reconnect_attempt', () => setStatus('connecting'))
  socket.on('changed', (event: RealtimeChangeEvent) => {
    if (!event || !Array.isArray(event.domains)) return
    changeListeners.forEach(fn => {
      try {
        fn(event)
      } catch {}
    })
  })
  return socket
}

/** Subscribe the socket to identity rooms (call whenever auth state changes). */
export function realtimeSetIdentity(userId: string | null | undefined, privileged: boolean) {
  identity.userId = userId || ''
  identity.privileged = !!privileged
  if (socket?.connected) resubscribe()
}

/** Public share pages: live download counters via a slug room. */
export function realtimeJoinSlug(slug: string) {
  identity.slug = slug
  if (socket?.connected) {
    socket.emit('subscribe', { slug })
  } else {
    ensureSocket()
  }
}

export function realtimeLeaveSlug() {
  const slug = identity.slug
  identity.slug = null
  if (socket?.connected && slug) socket.emit('unsubscribe-slug', slug)
}

/** Register a change handler. Returns unsubscribe. */
export function onRealtimeChange(fn: (e: RealtimeChangeEvent) => void): () => void {
  changeListeners.add(fn)
  ensureSocket()
  return () => changeListeners.delete(fn)
}

/** Status subscription primitives for useSyncExternalStore. */
function subscribeStatus(fn: () => void) {
  statusListeners.add(fn)
  ensureSocket()
  return () => statusListeners.delete(fn)
}

export function useRealtimeStatus(): RealtimeStatus {
  return useSyncExternalStore(subscribeStatus, () => status)
}
