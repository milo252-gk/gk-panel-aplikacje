/* Powiadomienia przy ZAMKNIĘTEJ aplikacji (O4 → D28) — część service workera wspólna dla Lidera, UR, KJ i Panelu.
   Dołącza ją sw.js aplikacji (także Panelu — od 2026-10-02 kierownik dostaje „po terminie”) przez importScripts('../wspolne/hala-push-sw.js').

   Hub wysyła push BEZ treści (szyfrowanie treści wymagałoby bibliotek spoza Pythona), więc tutaj po jego
   otrzymaniu pytamy hub „co nowego” adresem subskrypcji i dopiero wtedy pokazujemy powiadomienie.
   Dotknięcie powiadomienia obsługuje sw.js aplikacji (data.adres = np. '#awarie'); aplikacja bez własnej
   obsługi ustawia self.HALA_PUSH_OBSLUZ_KLIK = true przed importScripts.                                   */

// Nie zaczyna się od prefiksu aplikacji — sprzątanie starych wersji jej nie usunie. Na GitHub Pages wszystkie
// programy GK dzielą jedno źródło (milo252-gk.github.io) i jeden zbiór pamięci podręcznych — stąd przedrostek „hala-”.
const HALA_PUSH_PAMIEC = 'hala-push';

/* Adres huba podaje hala.js po włączeniu powiadomień: aplikacja może stać na innym adresie niż hub (Pages → tunel). */
self.addEventListener('message', e => {
  if (!e.data || e.data.typ !== 'hala-push-hub' || typeof e.data.hub !== 'string' || !/^https?:\/\//.test(e.data.hub)) return;
  e.waitUntil(caches.open(HALA_PUSH_PAMIEC).then(c => c.put('hub', new Response(e.data.hub))));
});

/* Gdzie pytać o treść: najpierw plik adresu obok aplikacji (GitHub Pages, D33) — adres tunelu zmienia się po każdym
   restarcie komputera w biurze, a push przychodzi przy ZAMKNIĘTEJ aplikacji, która nie zdążyła podać nowego adresu.
   Plik leży poziom wyżej niż zakres workera (…/ur/ → …/konfiguracja.json). ?t= omija pamięć CDN Pages. Na samym hubie
   pliku nie ma (404) — wtedy adres zapamiętany od aplikacji, a na końcu ten sam adres co aplikacja. */
async function halaPushHub() {
  try {
    const stop = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const zegar = stop ? setTimeout(() => stop.abort(), 4000) : null;
    const r = await fetch(new URL('../konfiguracja.json?t=' + Date.now(), self.registration.scope).href,
                          { cache: 'no-store', signal: stop ? stop.signal : undefined });
    if (zegar) clearTimeout(zegar);
    if (r.ok) {
      const k = await r.json();
      if (k && typeof k.hub === 'string' && /^https?:\/\//.test(k.hub)) {
        const adres = k.hub.replace(/\/$/, '');
        try { await (await caches.open(HALA_PUSH_PAMIEC)).put('hub', new Response(adres)); } catch (e) { /* tylko pamięć */ }
        return adres;
      }
    }
  } catch (e) { /* offline albo brak pliku — niżej */ }
  try {
    const o = await (await caches.open(HALA_PUSH_PAMIEC)).match('hub');
    if (o) return (await o.text()).replace(/\/$/, '');
  } catch (e) { /* niżej: ten sam adres co aplikacja */ }
  return self.location.origin;
}

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let wiadomosci = [];
    try {
      const sub = await self.registration.pushManager.getSubscription();
      const odp = await fetch((await halaPushHub()) + '/api/v1/push/co-nowego', {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub ? sub.endpoint : '' }) });
      if (odp.ok) wiadomosci = (await odp.json()).wiadomosci || [];
    } catch (err) { /* hub nieosiągalny — i tak coś pokażemy, żeby mechanik zajrzał do aplikacji */ }

    // Aplikacja na ekranie sama zadzwoniła i pokazała komunikat (strumień) — drugie powiadomienie tylko by dublowało.
    // matchAll z includeUncontrolled zwraca WSZYSTKIE okna z tego adresu (np. Panel otwarty na tym samym
    // komputerze) — liczą się tylko okna tej aplikacji.
    const zakres = new URL(self.registration.scope).pathname;
    const okna = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (okna.some(o => o.visibilityState === 'visible' && new URL(o.url).pathname.startsWith(zakres))) return;

    if (!wiadomosci.length) wiadomosci = [{ tytul: 'GK Panel Kierownika', tresc: 'Nowe zdarzenie na hali — otwórz aplikację.', tag: 'hala', adres: '' }];
    // Ikona PNG: SVG w powiadomieniu nie każda przeglądarka rysuje (Android), PNG — każda.
    const ikona = new URL('./ikona-192.png', self.registration.scope).href;
    const znaczek = new URL('./ikona.svg', self.registration.scope).href;
    await Promise.all(wiadomosci.map(w => self.registration.showNotification(w.tytul || 'GK Panel Kierownika', {
      body: w.tresc || '', tag: w.tag || 'hala', renotify: true, requireInteraction: !!w.pilne,
      icon: ikona, badge: znaczek, vibrate: w.pilne ? [300, 150, 300, 150, 300] : [200],
      data: { adres: w.adres || '' } })));
  })());
});

if (self.HALA_PUSH_OBSLUZ_KLIK === true) {
  self.addEventListener('notificationclick', e => {
    e.notification.close();
    const adres = (e.notification.data && e.notification.data.adres) || '';
    e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(okna => {
      const moje = okna.find(o => new URL(o.url).pathname.startsWith(new URL(self.registration.scope).pathname));
      if (moje) { if (adres) moje.postMessage({ typ: 'otworz', adres }); return moje.focus(); }
      return self.clients.openWindow(new URL('./' + adres, self.registration.scope).href);
    }));
  });
}
