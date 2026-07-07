import { api } from '../services/api';

/** Converte chave VAPID base64url para `Uint8Array` exigido por `PushManager.subscribe`. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isWebPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

/** Registra o SW em `/sw.js` (arquivo em `public/`). */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (e) {
    console.error('Falha ao registrar Service Worker:', e);
    return null;
  }
}

/**
 * Se a permissão já for `granted`, registra o SW (se precisar) e envia a subscription ao backend.
 * No iOS, push web costuma funcionar só com PWA adicionada à tela inicial (Safari 16.4+).
 */
export async function subscribeWebPushIfGranted(): Promise<boolean> {
  if (!isWebPushSupported()) return false;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;

  let reg: ServiceWorkerRegistration | undefined =
    (await navigator.serviceWorker.getRegistration()) ?? undefined;
  if (!reg) {
    const created = await registerServiceWorker();
    reg = created ?? undefined;
  }
  if (!reg) return false;

  await navigator.serviceWorker.ready;

  const { data } = await api.get<{ publicKey: string | null }>('/push/vapid-public-key');
  if (!data?.publicKey) return false;

  const key = urlBase64ToUint8Array(data.publicKey);
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key as BufferSource,
  });

  const json = sub.toJSON() as {
    endpoint: string;
    keys?: { p256dh: string; auth: string };
    expirationTime?: number | null;
  };
  if (!json.keys?.p256dh || !json.keys?.auth) return false;

  await api.post('/push/subscribe', json);
  return true;
}
