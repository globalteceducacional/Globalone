/* Service Worker: Web Push → notificação nativa (Android/desktop). */
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let title = 'ERP Globaltec';
      let body = 'Nova notificação';
      let url = '/notifications';
      let tag = 'erp-push';

      try {
        if (event.data) {
          const json = await event.data.json();
          if (typeof json.title === 'string' && json.title) title = json.title;
          if (typeof json.body === 'string' && json.body) body = json.body;
          if (typeof json.url === 'string' && json.url) url = json.url;
          if (typeof json.tag === 'string' && json.tag) tag = json.tag;
        }
      } catch {
        try {
          const t = event.data && (await event.data.text());
          if (t) body = t;
        } catch {
          /* ignore */
        }
      }

      await self.registration.showNotification(title, {
        body,
        icon: '/favicon.png',
        badge: '/favicon.png',
        tag,
        renotify: true,
        data: { url },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  const path = typeof raw === 'string' && raw.startsWith('/') ? raw : '/notifications';
  const full = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) {
          return c.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(full);
      }
    }),
  );
});
