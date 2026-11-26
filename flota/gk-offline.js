/* GK — logowanie hasłem bez sieci (D78; od 2026-11-26 hasłem zamiast PIN-u — kontrakt 1.45.0, logowanie bez PIN-ów).
   Jeden plik 1:1 w GK Trasy i GK Flota (web/gk-offline.js) — pilnuje .github/spojnosc.py. Ten sam wzór co aplikacje hali
   (wspolne/klient/hala.js → liczWeryfikator) i hub (hala.py → weryfikator_offline).

   Właściciel 2026-10-19: „Tracąc internet nic nie przerywasz, działasz dalej, a po jego odzyskaniu dane trafiają
   w docelowe miejsca.” Właściciel 2026-11-26: PIN-ów nie ma, logujemy się hasłem. Kierowca, który na TYM telefonie
   logował się hasłem w ciągu 16 h (znacznik urządzenia, D43), wchodzi bez sieci tym samym hasłem. Bezpieczeństwo:
     * program po logowaniu daje sól hasła i weryfikator = HMAC-SHA256(PBKDF2(hasło, sól, 200 000), „gk-offline-2|id|znacznik”)
       — telefon nie ma ani hasła, ani skrótu hasła z programu; weryfikator pasuje tylko do znacznika tego telefonu
       i jest ważny najdłużej do jego końca (16 h od hasła);
     * dawne weryfikatory PIN-u („gk-offline-1”) nie otwierają już niczego — rekord bez wersji „gk-offline-2” jest pomijany
       i kasowany (osoba loguje się hasłem przy sieci, potem może znowu bez sieci);
     * 5 złych haseł bez sieci — weryfikator przepada (aplikacja kasuje też znacznik: dalej tylko hasło przy sieci);
     * tryb bez sieci NIE ma tokenu: zapisy czekają w kolejce z autorem = ta osoba i wychodzą dopiero jej zwykłą sesją
       (po powrocie sieci aplikacja loguje ją hasłem trzymanym tylko w pamięci strony albo prosi o logowanie);
     * zegar telefonu cofnięty przed chwilę zapisu — odmowa (ktoś przestawia czas, żeby wydłużyć 16 h).
   Pamięć: przez aplikację (pamiec = { przypomnij(k), zapamietaj(k, v) } — IndexedDB tej aplikacji), klucz
   'offline-konta' = { <id>: { profil, klucze, sol, iteracje, weryfikator, do, zle, zapisano, wersja } }. Potrzebne crypto.subtle
   (https albo localhost) — bez niego logowania bez sieci nie ma. */
(function (global) {
  'use strict';
  const WERSJA = 'gk-offline-2', KLUCZ = 'offline-konta', ZLE_PROBY = 5;

  function loginZNazwy(t) {
    return String(t === null || t === undefined ? '' : t).toLowerCase().replace(/ł/g, 'l')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[._-]+/g, ' ').split(/\s+/).filter(Boolean).join(' ');
  }
  const mozliwy = () => !!(global.crypto && global.crypto.subtle) && typeof TextEncoder !== 'undefined';

  async function liczWeryfikator(haslo, sol, iteracje, id, znacznik) {
    const s = global.crypto.subtle, t = new TextEncoder();
    const k = await s.importKey('raw', t.encode(String(haslo)), 'PBKDF2', false, ['deriveBits']);
    const bity = await s.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: t.encode(String(sol)), iterations: iteracje }, k, 256);
    const h = await s.importKey('raw', bity, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return Array.from(new Uint8Array(await s.sign('HMAC', h, t.encode(`${WERSJA}|${id}|${znacznik}`))),
                      b => b.toString(16).padStart(2, '0')).join('');
  }
  function rowne(a, b) {
    a = String(a); b = String(b);
    let r = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return r === 0;
  }
  async function wszystkie(pamiec) {
    try { const m = await pamiec.przypomnij(KLUCZ); return m && typeof m === 'object' ? m : {}; } catch (e) { return {}; }
  }

  /* Po udanym logowaniu przy sieci: odpowiedź programu (z polem offline) → rekord osoby; bez weryfikatora — rekord
     znika (np. nowe hasło, hasło do zmiany: stare hasło bez sieci nie może dalej otwierać aplikacji). */
  async function zapamietaj(pamiec, profil, offline, klucze) {
    if (!profil || profil.id === undefined || profil.id === null) return;
    const m = await wszystkie(pamiec);
    const teraz = Date.now();
    Object.keys(m).forEach(k => { if (!m[k] || !(Date.parse(m[k].do) > teraz) || m[k].wersja !== WERSJA) delete m[k]; });
    const id = String(profil.id);
    if (offline && offline.wersja === WERSJA && typeof offline.weryfikator === 'string' && typeof offline.sol === 'string') {
      const p = Object.assign({}, profil);
      delete p.token; delete p.znacznik; delete p.offline;
      m[id] = { profil: p, klucze: [...new Set((klucze || []).map(loginZNazwy).filter(Boolean))], sol: offline.sol,
                iteracje: offline.iteracje || 200000, weryfikator: offline.weryfikator, do: offline.do, zle: 0, zapisano: teraz,
                wersja: WERSJA };
    } else delete m[id];
    await pamiec.zapamietaj(KLUCZ, m);
  }
  async function zapomnij(pamiec, id) {
    const m = await wszystkie(pamiec);
    if (String(id) in m) { delete m[String(id)]; await pamiec.zapamietaj(KLUCZ, m); }
  }

  /* Bez sieci: ident + hasło + znacznik tej osoby (z mapy znaczników aplikacji: {z, do}). → { profil, do } albo null
     (nie ma rekordu — ta osoba nie może bez sieci; także dawny rekord PIN-u „gk-offline-1”). Złe hasło — błąd z kodBledu
     'zly_pin' (nazwa kodu bez zmian); piąte albo minione 16 h — 'wymagane_haslo' (aplikacja zapomina wtedy znacznik). */
  async function zaloguj(pamiec, ident, haslo, zn) {
    if (!mozliwy() || !String(haslo || '') || !zn || !zn.z) return null;
    const m = await wszystkie(pamiec);
    const klucz = loginZNazwy(ident);
    const id = Object.keys(m).find(k => m[k] && (m[k].klucze || []).includes(klucz));
    if (!id) return null;
    const w = m[id];
    if (w.wersja !== WERSJA) { delete m[id]; await pamiec.zapamietaj(KLUCZ, m); return null; }   // dawny weryfikator PIN-u
    const blad = (tekst, kod) => { const e = new Error(tekst); e.kodBledu = kod; e.kod = 401; e.bezSieci = true; return e; };
    if (!(Date.parse(w.do) > Date.now()) || !(Date.parse(zn.do) > Date.now()) || Date.now() < (w.zapisano || 0) - 300000) {
      delete m[id]; await pamiec.zapamietaj(KLUCZ, m);
      throw blad('Bez sieci hasło działa do 16 godzin od logowania przy sieci na tym telefonie — ten czas minął. Zaloguj się przy sieci.', 'wymagane_haslo');
    }
    if (!rowne(await liczWeryfikator(haslo, w.sol, w.iteracje, id, zn.z), w.weryfikator)) {
      w.zle = (w.zle || 0) + 1;
      if (w.zle >= ZLE_PROBY) { delete m[id]; await pamiec.zapamietaj(KLUCZ, m); throw blad('5 złych haseł bez sieci — zaloguj się przy sieci.', 'wymagane_haslo'); }
      await pamiec.zapamietaj(KLUCZ, m);
      throw blad('Złe hasło', 'zly_pin');
    }
    if (w.zle) { w.zle = 0; await pamiec.zapamietaj(KLUCZ, m); }
    return { profil: w.profil, do: [w.do, zn.do].sort()[0] };
  }

  global.GKOffline = { WERSJA, mozliwy, liczWeryfikator, zapamietaj, zapomnij, zaloguj, loginZNazwy };
})(typeof window !== 'undefined' ? window : globalThis);
