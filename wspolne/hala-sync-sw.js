/* Wysyłka kolejki po powrocie sieci BEZ otwierania aplikacji (D78) — część service workera wspólna dla Lidera, UR, KJ
   i Panelu. Dołącza ją sw.js aplikacji przez importScripts('../wspolne/hala-sync-sw.js') (po hala-push-sw.js).

   Właściciel 2026-10-19: „Tracąc internet nic nie przerywasz, działasz dalej, a po jego odzyskaniu dane trafiają
   w docelowe miejsca.” Dotąd kolejka wychodziła dopiero, gdy ktoś otworzył aplikację. Teraz hala.js przy zapisie bez
   sieci (albo po nieudanej wysyłce) rejestruje Background Sync „hala-kolejka”, a przeglądarka budzi ten worker, gdy
   sieć wraca — także przy zamkniętej aplikacji. Działa w Chrome/Edge (Android, komputer); iPhone (Safari) tego nie ma —
   tam jak dotąd: kolejka idzie przy otwarciu aplikacji.

   Zasady te same co w hala.js (KONTRAKT §8):
     * wysyłamy TYLKO zapisy osoby, której sesja (token) leży w pamięci aplikacji — nigdy cudzym tokenem; zapisy innych
       osób na wspólnym telefonie czekają (albo wyśle je kierownik: Moje konto → „Wyślij”);
     * najpierw zdjęcia, potem zdarzenia (paczki po 50, `wyslano` w skali zegara huba — pamiec 'zegar');
     * odrzucone przez hub → magazyn „odrzucone” (nic nie znika samo), błąd sieci → przeglądarka ponowi sync sama;
     * bez sesji (tryb bez sieci D78, wylogowany, sesja wygasła) i przy ostatniej próbie — powiadomienie lokalne
       „N zapisów czeka — otwórz aplikację” (tylko gdy jest zgoda na powiadomienia).
   Okno tej aplikacji na ekranie robi to samo samo (hala.js) — wtedy worker nic nie robi.
   Pamięć: tylko IndexedDB hala-<aplikacja> (D33: wspólne źródło Pages — żadnych cudzych baz). */

(function () {
  'use strict';
  const TAG = 'hala-kolejka';
  const PACZKA = 50;
  const aplikacja = () => self.HALA_APLIKACJA
    || new URL(self.registration.scope).pathname.split('/').filter(Boolean).pop();

  /* Baza bez tworzenia: worker nie zakłada pustej hala-<app> w telefonie, w którym aplikacja jeszcze nie ruszyła. */
  function otworz(nazwa) {
    return new Promise(ok => {
      let z;
      try { z = indexedDB.open(nazwa); } catch (e) { ok(null); return; }
      z.onupgradeneeded = () => { try { z.transaction.abort(); } catch (e) { /* i tak null */ } };
      z.onsuccess = () => ok(z.result);
      z.onerror = () => ok(null);
      z.onblocked = () => ok(null);
    });
  }
  function dzialanie(db, magazyn, tryb, praca) {
    return new Promise((ok, zle) => {
      const t = db.transaction(magazyn, tryb);
      const z = praca(t.objectStore(magazyn));
      t.oncomplete = () => ok(z ? z.result : undefined);
      t.onerror = () => zle(t.error);
      t.onabort = () => zle(t.error || new Error('przerwane'));
    });
  }
  const zamknij = db => { try { if (db && db.close) db.close(); } catch (e) { /* już zamknięta */ } };
  const czytaj = (db, k) => dzialanie(db, 'pamiec', 'readonly', s => s.get(k)).then(w => (w ? w.wartosc : undefined));
  const iso = ms => new Date(ms).toISOString();

  /* Adres huba jak w hala.js: konfiguracja.json obok aplikacji (Pages, D33), potem zapamiętany, potem ten sam adres. */
  async function adresHuba(db, opcje) {
    if (opcje && opcje.hub) return opcje.hub;
    try {
      const r = await fetch(new URL('../konfiguracja.json?t=' + Date.now(), self.registration.scope).href, { cache: 'no-store' });
      if (r.ok) {
        const k = await r.json();
        if (k && typeof k.hub === 'string' && /^https?:\/\//.test(k.hub)) return k.hub.replace(/\/$/, '');
      }
    } catch (e) { /* bez pliku albo bez sieci */ }
    const zapamietany = await czytaj(db, 'hub').catch(() => null);
    return zapamietany ? String(zapamietany).replace(/\/$/, '') : self.location.origin;
  }

  /* Jedno przejście kolejki. → { wyslane, odrzucone, czeka, cudze, powod } — powod: '' | 'brak_bazy' | 'brak_sesji' | 'sesja'
     (hub powiedział 401). Błąd sieci — wyjątek (przeglądarka ponowi sync). opcje: { app, hub } (testy). */
  async function wyslijKolejke(opcje) {
    const o = opcje || {};
    const db = await otworz('hala-' + (o.app || aplikacja()));
    if (!db || !db.objectStoreNames.contains('kolejka')) { zamknij(db); return { wyslane: 0, odrzucone: 0, czeka: 0, cudze: 0, powod: 'brak_bazy' }; }
    try {
      const token = await czytaj(db, 'token');
      const ja = await czytaj(db, 'pracownik');
      let kolejka = await dzialanie(db, 'kolejka', 'readonly', s => s.getAll());
      const wynik = { wyslane: 0, odrzucone: 0, czeka: kolejka.length, cudze: 0, powod: '' };
      if (!token || !ja || !ja.id) { wynik.powod = 'brak_sesji'; return wynik; }
      wynik.cudze = kolejka.filter(w => w.autor !== ja.id).length;
      let moje = kolejka.filter(w => w.autor === ja.id);
      const pliki = (await dzialanie(db, 'pliki', 'readonly', s => s.getAll()))
        .filter(p => !p.wyslany && !p.odrzucony && (!p.autor || p.autor === ja.id));
      if (!moje.length && !pliki.length) return wynik;
      const hub = await adresHuba(db, o);
      const zegar = await czytaj(db, 'zegar');
      const przes = zegar && typeof zegar.p === 'number' && Date.now() - zegar.kiedy < 7 * 86400000 ? zegar.p : 0;
      const nag = { Authorization: 'Bearer ' + token };
      for (const p of pliki) {
        let r;
        try {
          r = await fetch(`${hub}/api/v1/pliki/${encodeURIComponent(p.id)}`, { method: 'PUT', cache: 'no-store', body: p.blob,
                          headers: Object.assign({ 'Content-Type': p.mime || 'image/jpeg' }, nag) });
        } catch (e) { break; }                      // zdjęcie poczeka, zdarzenia idą dalej (jak hala.js, etap 1)
        if (r.status === 401) { wynik.powod = 'sesja'; return wynik; }
        let json = null;
        try { json = await r.json(); } catch (e) { json = null; }
        if (r.ok) { p.wyslany = true; p.wyslanyKiedy = Date.now(); }
        else if (r.status < 500 && json && typeof json === 'object') p.odrzucony = json.blad || `HTTP ${r.status}`;
        else break;
        await dzialanie(db, 'pliki', 'readwrite', s => s.put(p));
      }
      while (moje.length) {
        const paczka = moje.slice(0, PACZKA);
        const r = await fetch(`${hub}/api/v1/zdarzenia`, {
          method: 'POST', cache: 'no-store', headers: Object.assign({ 'Content-Type': 'application/json' }, nag),
          body: JSON.stringify({ wyslano: iso(Date.now() + przes), zdarzenia: paczka.map(w => w.zd) }) });
        if (r.status === 401) { wynik.powod = 'sesja'; break; }
        if (!r.ok) throw new Error('HTTP ' + r.status);      // 5xx, brama Cloudflare — przeglądarka ponowi
        const dane = await r.json();
        const wyniki = new Map((dane.wyniki || []).map(w => [w.id, w]));
        await new Promise((ok, zle) => {
          const t = db.transaction(['kolejka', 'odrzucone'], 'readwrite');
          for (const w of paczka) {
            const x = wyniki.get(w.zd.id);
            if (!x) continue;
            if (x.status === 'odrzucone') {
              t.objectStore('odrzucone').put({ id: w.zd.id, zd: w.zd, autor: w.autor, powod: x.powod, kiedy: iso(Date.now()) });
              wynik.odrzucone++;
            } else wynik.wyslane++;
            t.objectStore('kolejka').delete(w.nr);
          }
          t.oncomplete = ok; t.onerror = () => zle(t.error); t.onabort = () => zle(t.error || new Error('przerwane'));
        });
        if (paczka.every(w => !wyniki.has(w.zd.id))) break;    // hub nic nie rozpoznał — nie kręcimy się w kółko
        kolejka = await dzialanie(db, 'kolejka', 'readonly', s => s.getAll());
        moje = kolejka.filter(w => w.autor === ja.id);
      }
      wynik.czeka = (await dzialanie(db, 'kolejka', 'readonly', s => s.getAll())).length;
      return wynik;
    } finally {
      zamknij(db);
    }
  }

  const odmiana = n => (n === 1 ? 'zapis czeka' : (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) ? 'zapisy czekają' : 'zapisów czeka');
  async function powiadom(ile, powod) {
    if (!ile || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const ikona = new URL('./ikona-192.png', self.registration.scope).href;
    await self.registration.showNotification('GK — zapisy w telefonie', {
      body: `${ile} ${odmiana(ile)} — otwórz aplikację${powod === 'brak_sesji' || powod === 'sesja' ? ' i zaloguj się' : ''}, żeby je wysłać.`,
      tag: TAG, renotify: false, icon: ikona, badge: new URL('./ikona.svg', self.registration.scope).href, data: { adres: '' } });
  }

  self.addEventListener('sync', e => {
    if (e.tag !== TAG) return;
    e.waitUntil((async () => {
      const zakres = new URL(self.registration.scope).pathname;
      const okna = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const moje = okna.filter(x => new URL(x.url).pathname.startsWith(zakres));
      if (moje.some(x => x.visibilityState === 'visible')) return;    // aplikacja na ekranie wysyła sama (hala.js)
      let w;
      try {
        w = await wyslijKolejke();
      } catch (err) {
        if (e.lastChance) { try { await powiadom(await ileCzeka(), ''); } catch (e2) { /* trudno */ } }
        throw err;                                                     // przeglądarka ponowi później
      }
      for (const x of moje) x.postMessage({ typ: 'hala-kolejka', aplikacja: aplikacja() });
      if (w.powod === 'brak_sesji' || w.powod === 'sesja') await powiadom(w.czeka, w.powod);
    })());
  });

  async function ileCzeka() {
    const db = await otworz('hala-' + aplikacja());
    if (!db) return 0;
    try { return db.objectStoreNames.contains('kolejka') ? (await dzialanie(db, 'kolejka', 'readonly', s => s.count())) : 0; }
    finally { zamknij(db); }
  }

  self.HalaSyncSW = { wyslijKolejke, TAG };
})();
