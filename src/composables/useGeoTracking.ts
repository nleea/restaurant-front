// Driver geolocation capture — a plain factory (no Vue lifecycle hooks) so the driver view can
// own it and start/stop it with the screen, mirroring `useLiveRefetch`. It wraps
// `navigator.geolocation.watchPosition`, but only while BOTH the driver has enabled tracking
// (consent) AND a run is active (`isActive()`), and it throttles what it forwards by time AND
// distance since the last SENT fix — battery, data and privacy. Permission denial is soft: it
// flips `denied` and stops, never throws, so the driver can still work the run.
import { ref, type Ref } from 'vue'
import { haversineMeters } from '@/lib/geo'

/** Don't send a fresh sample until this much time has passed since the last sent one. */
export const MIN_INTERVAL_MS = 15_000
/** …and until the driver has moved at least this far (metres) since the last sent one. */
export const MIN_DISTANCE_M = 30

export interface GeoTrackingOptions {
  /** Gate: only watch while a run is active (preparing/in_transit). Checked on every fix. */
  isActive: () => boolean
  /** A throttled, accepted fix — push it and record it. */
  onFix: (latitude: number, longitude: number) => void
  /** Called when the browser denies permission (or geolocation is unavailable). */
  onDenied?: () => void
  minIntervalMs?: number
  minDistanceMeters?: number
}

export interface GeoTracking {
  /** Consent given: begin watching (if a run is active right now). */
  enable(): void
  /** Consent withdrawn / run over: stop watching. */
  disable(): void
  /** Whether tracking is currently on. */
  enabled: Ref<boolean>
  /** Whether the browser denied the location permission (soft state, never blocks the run). */
  denied: Ref<boolean>
}

export function createGeoTracking(options: GeoTrackingOptions): GeoTracking {
  const minInterval = options.minIntervalMs ?? MIN_INTERVAL_MS
  const minDistance = options.minDistanceMeters ?? MIN_DISTANCE_M

  const enabled = ref(false)
  const denied = ref(false)

  // watchPosition handle + last SENT sample; process plumbing, not reactive state.
  let watchId: number | null = null
  let lastSentAt = 0
  let lastSentCoords: [number, number] | null = null

  function handleFix(position: GeolocationPosition): void {
    // The run may have ended (or the toggle flipped) between updates — stop rather than send.
    if (!enabled.value || !options.isActive()) {
      stopWatch()
      return
    }
    const lat = position.coords.latitude
    const lng = position.coords.longitude
    const now = Date.now()
    if (lastSentCoords !== null) {
      const enoughTime = now - lastSentAt >= minInterval
      const enoughDistance = haversineMeters(lastSentCoords, [lat, lng]) >= minDistance
      if (!(enoughTime && enoughDistance)) return // throttle: needs BOTH time and distance
    }
    lastSentAt = now
    lastSentCoords = [lat, lng]
    options.onFix(lat, lng)
  }

  function handleError(error: GeolocationPositionError): void {
    // Denied is terminal for this session; POSITION_UNAVAILABLE / TIMEOUT are transient — the
    // watcher keeps trying, so a momentary loss of signal doesn't turn tracking off.
    if (error.code === error.PERMISSION_DENIED) {
      denied.value = true
      enabled.value = false
      stopWatch()
      options.onDenied?.()
    }
  }

  function startWatch(): void {
    if (watchId !== null) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      denied.value = true
      enabled.value = false
      options.onDenied?.()
      return
    }
    watchId = navigator.geolocation.watchPosition(handleFix, handleError, {
      enableHighAccuracy: true,
      maximumAge: 10_000,
      timeout: 20_000,
    })
  }

  function stopWatch(): void {
    if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId)
    }
    watchId = null
  }

  return {
    enabled,
    denied,
    enable() {
      denied.value = false
      enabled.value = true
      lastSentAt = 0
      lastSentCoords = null
      if (options.isActive()) startWatch()
    },
    disable() {
      enabled.value = false
      stopWatch()
    },
  }
}
