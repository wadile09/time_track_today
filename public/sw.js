// ─────────────────────────────────────────────────────────
// Service Worker for Web Push Notifications
// This runs in the background even when the website is closed
// ─────────────────────────────────────────────────────────

const CACHE_NAME = 'timetrack-chat-v1';

// Install event
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installed');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activated');
  event.waitUntil(self.clients.claim());
});

// Push event — fired when server sends a push notification
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);

  let data = {
    title: 'New Chat Message',
    body: 'You have a new message',
    icon: '/favicon.jpg',
    badge: '/favicon.jpg',
    chatId: null,
    senderName: '',
    isGroup: false,
    groupName: '',
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const title = data.isGroup
    ? `${data.senderName || 'Someone'} in ${data.groupName || 'Group'}`
    : (data.senderName || data.title);

  const options = {
    body: data.body,
    icon: data.icon || '/favicon.jpg',
    badge: data.badge || '/favicon.jpg',
    vibrate: [100, 50, 100, 50, 200],
    data: {
      chatId: data.chatId,
      url: self.registration.scope,
    },
    actions: [
      { action: 'open', title: 'Open Chat' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    tag: 'chat-' + (data.chatId || Date.now()),
    renotify: true,
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click — open the app and navigate to the chat
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click:', event.action);
  event.notification.close();

  if (event.action === 'dismiss') return;

  const chatId = event.notification.data?.chatId;
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If there's already an open tab, focus it and send the chatId
      for (const client of clientList) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.focus();
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            chatId: chatId,
          });
          return;
        }
      }
      // Otherwise open a new tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

// Listen for messages from the main page
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
