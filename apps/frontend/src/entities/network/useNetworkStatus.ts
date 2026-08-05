import { ref } from 'vue'

export type NetworkConnectionType =
  | 'bluetooth'
  | 'cellular'
  | 'ethernet'
  | 'none'
  | 'other'
  | 'unknown'
  | 'wifi'
  | 'wimax'

type EffectiveConnectionType = 'slow-2g' | '2g' | '3g' | '4g'

interface NetworkInformation extends EventTarget {
  type?: NetworkConnectionType
  effectiveType?: EffectiveConnectionType
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation
  mozConnection?: NetworkInformation
  webkitConnection?: NetworkInformation
}

function getConnection(): NetworkInformation | undefined {
  const currentNavigator = navigator as NavigatorWithConnection
  return currentNavigator.connection
    ?? currentNavigator.mozConnection
    ?? currentNavigator.webkitConnection
}

const isOnline = ref(navigator.onLine)
const connectionType = ref<NetworkConnectionType>('unknown')
const effectiveConnectionType = ref<EffectiveConnectionType | null>(null)

function updateNetworkStatus() {
  const connection = getConnection()
  isOnline.value = navigator.onLine
  connectionType.value = isOnline.value
    ? connection?.type ?? 'unknown'
    : 'none'
  effectiveConnectionType.value = connection?.effectiveType ?? null
}

updateNetworkStatus()
window.addEventListener('online', updateNetworkStatus)
window.addEventListener('offline', updateNetworkStatus)
getConnection()?.addEventListener('change', updateNetworkStatus)

export function useNetworkStatus() {
  return {
    isOnline,
    connectionType,
    effectiveConnectionType,
  }
}
