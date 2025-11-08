export { createSweetLinkClient, sweetLinkBrowserTestHelpers } from './client';
export { createSessionStorageAdapter, isStoredSessionFresh } from './storage/session-storage';
export type {
  SweetLinkClient,
  SweetLinkClientOptions,
  SweetLinkSessionBootstrap,
  SweetLinkHandshakeResponse,
  SweetLinkStatusSnapshot,
  SweetLinkStoredSession,
} from './types';
