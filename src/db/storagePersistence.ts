export type StoragePersistenceStatus =
  | 'persistent'
  | 'best-effort'
  | 'unsupported'

export async function requestPersistentStorage(): Promise<StoragePersistenceStatus> {
  const storage = globalThis.navigator?.storage
  if (
    !storage
    || typeof storage.persisted !== 'function'
    || typeof storage.persist !== 'function'
  ) {
    console.warn('Persistent browser storage is not supported.')
    return 'unsupported'
  }

  try {
    if (await storage.persisted() || await storage.persist()) {
      return 'persistent'
    }
  } catch (error) {
    console.warn('Persistent browser storage could not be requested.', error)
    return 'best-effort'
  }

  console.warn(
    'Persistent browser storage was denied. IndexedDB remains best effort.',
  )
  return 'best-effort'
}
