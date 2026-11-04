// Le service worker de HouseMate : il ne fait que recevoir les notifications
// push (SPEC § 6). Aucun cache : l'app reste servie par le réseau.

self.addEventListener("push", event => {
  const message = event.data ? event.data.json() : {};

  event.waitUntil(
    self.registration.showNotification(message.title || "HouseMate", {
      body: message.body || "",
      icon: "/icon/192",
      badge: "/icon/192",
      // Une seule notification du matin à l'écran : la suivante la remplace.
      tag: "housemate-matin",
      data: { url: message.url || "/" },
    }),
  );
});

/** Ramène l'app au premier plan sur la page voulue, ou l'ouvre. */
async function ouvrir(url) {
  const fenetres = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const ouverte = fenetres.find(f => f.url.startsWith(self.location.origin));

  if (!ouverte) {
    return self.clients.openWindow(url);
  }

  const active = await ouverte.focus();

  return active.navigate(url);
}

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  );

  event.waitUntil(ouvrir(url.href));
});
