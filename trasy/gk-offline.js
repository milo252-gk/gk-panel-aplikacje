/* GK — logowanie PIN-em bez sieci (D78). Jeden plik 1:1 w GK Trasy i GK Flota (web/gk-offline.js) — pilnuje
   .github/spojnosc.py. Ten sam wzór co aplikacje hali (wspolne/klient/hala.js → liczWeryfikator) i hub.

   Właściciel 2026-10-19: „Tracąc internet nic nie przerywasz, działasz dalej, a po jego odzyskaniu dane trafiają
   w docelowe miejsca.” Kierowca, który na TYM telefonie logował się w ciągu 16 h (znacznik urządzenia, D43), wchodzi
   bez sieci swoim PIN-em. Bezpieczeństwo:
     * program po logowaniu daje sól PIN-u i weryfikator = HMAC-SHA256(PBKDF2(PIN, sól, 200 000), „gk-offline-1|id|znacznik”)
       — telefon nie ma ani PIN-u, ani skrótu PIN-u z programu; weryfikator pasuje tylko do znacznika tego telefonu
       i jest ważny najdłużej do jego końca (16 h od hasła);
     * 5 złych PIN-ów bez sieci — weryfikator przepada (aplikacja kasuje też znacznik: dalej tylko hasło przy sieci);
     * tryb bez sieci NIE ma tokenu: zapisy czekają w kolejce z autorem = ta osoba i wychodzą dopiero jej zwykłą sesją
       (po powrocie sieci aplikacja loguje ją PIN-em trzymanym tylko w pamięci strony albo prosi o logowanie);
     * zegar telefonu cofnięty przed chwilę zapisu — odmowa (ktoś przestawia czas, żeby wydłużyć 16 h).
   Pamięć: przez aplikację (pamiec = { przypomnij(k), zapamietaj(k, v) } — IndexedDB tej aplikacji), klucz
   'offline-konta' = { <id>: { profil, klucze, sol, iteracje, weryfikator, do, zle, zapisano } }. Potrzebne crypto.subtle
   (https albo localhost) — bez niego logowania bez sieci nie ma. */
(function (global) {
  'use strict';
  const WERSJA = 'gk-offline-1', KLUCZ = 'offline-konta', ZLE_PINY = 5;

  function loginZNazwy(t) {
    return String(t === null || t === undefined ? '' : t).toLowerCase().replace(/ł/g, 'l')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[._-]+/g, ' ').split(/\s+/).filter(Boolean).join(' ');
  }
  const mozliwy = () => !!(global.crypto && global.crypto.subtle) && typeof TextEncoder !== 'undefined';

  async function liczWeryfikator(pin, sol, iteracje, id, znacznik) {
    const s = global.crypto.subtle, t = new TextEncoder();
    const k = await s.importKey('raw', t.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
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
     znika (np. nowy PIN, PIN do zmiany: stary PIN bez sieci nie może dalej otwierać aplikacji). */
  async function zapamietaj(pamiec, profil, offline, klucze) {
    if (!profil || profil.id === undefined || profil.id === null) return;
    const m = await wszystkie(pamiec);
    const teraz = Date.now();
    Object.keys(m).forEach(k => { if (!m[k] || !(Date.parse(m[k].do) > teraz)) delete m[k]; });
    const id = String(profil.id);
    if (offline && offline.wersja === WERSJA && typeof offline.weryfikator === 'string' && typeof offline.sol === 'string') {
      const p = Object.assign({}, profil);
      delete p.token; delete p.znacznik; delete p.offline;
      m[id] = { profil: p, klucze: [...new Set((klucze || []).map(loginZNazwy).filter(Boolean))], sol: offline.sol,
                iteracje: offline.iteracje || 200000, weryfikator: offline.weryfikator, do: offline.do, zle: 0, zapisano: teraz };
    } else delete m[id];
    await pamiec.zapamietaj(KLUCZ, m);
  }
  async function zapomnij(pamiec, id) {
    const m = await wszystkie(pamiec);
    if (String(id) in m) { delete m[String(id)]; await pamiec.zapamietaj(KLUCZ, m); }
  }

  /* Bez sieci: ident + PIN + znacznik tej osoby (z mapy znaczników aplikacji: {z, do}). → { profil, do } albo null
     (nie ma rekordu — ta osoba nie może bez sieci). Zły PIN — błąd z kodBledu 'zly_pin'; piąty albo minione 16 h —
     'wymagane_haslo' (aplikacja zapomina wtedy znacznik). */
  async function zaloguj(pamiec, ident, pin, zn) {
    if (!mozliwy() || !/^\d{4}$/.test(String(pin || '')) || !zn || !zn.z) return null;
    const m = await wszystkie(pamiec);
    const klucz = loginZNazwy(ident);
    const id = Object.keys(m).find(k => m[k] && (m[k].klucze || []).includes(klucz));
    if (!id) return null;
    const w = m[id];
    const blad = (tekst, kod) => { const e = new Error(tekst); e.kodBledu = kod; e.kod = 401; e.bezSieci = true; return e; };
    if (!(Date.parse(w.do) > Date.now()) || !(Date.parse(zn.do) > Date.now()) || Date.now() < (w.zapisano || 0) - 300000) {
      delete m[id]; await pamiec.zapamietaj(KLUCZ, m);
      throw blad('Bez sieci PIN działa do 16 godzin od hasła na tym telefonie — ten czas minął. Zaloguj się przy sieci.', 'wymagane_haslo');
    }
    if (!rowne(await liczWeryfikator(pin, w.sol, w.iteracje, id, zn.z), w.weryfikator)) {
      w.zle = (w.zle || 0) + 1;
      if (w.zle >= ZLE_PINY) { delete m[id]; await pamiec.zapamietaj(KLUCZ, m); throw blad('5 złych PIN-ów — wpisz hasło (potrzebna sieć).', 'wymagane_haslo'); }
      await pamiec.zapamietaj(KLUCZ, m);
      throw blad('Zły PIN', 'zly_pin');
    }
    if (w.zle) { w.zle = 0; await pamiec.zapamietaj(KLUCZ, m); }
    return { profil: w.profil, do: [w.do, zn.do].sort()[0] };
  }

  global.GKOffline = { WERSJA, mozliwy, liczWeryfikator, zapamietaj, zapomnij, zaloguj, loginZNazwy };
})(typeof window !== 'undefined' ? window : globalThis);
