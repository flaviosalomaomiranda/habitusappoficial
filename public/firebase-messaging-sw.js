/* global importScripts, firebase */
importScripts("/__/firebase/12.7.0/firebase-app-compat.js");
importScripts("/__/firebase/12.7.0/firebase-messaging-compat.js");
importScripts("/__/firebase/init.js");

if (firebase && firebase.messaging) {
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = (payload && payload.notification && payload.notification.title) || "Lembrete de rotina";
    const body = (payload && payload.notification && payload.notification.body) || "Você tem uma rotina pendente.";
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: payload && payload.data ? payload.data : {},
    });
  });
}

