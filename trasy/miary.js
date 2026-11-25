/* GK Trasy — miary: definicje liczb („i” przy kafelkach i nagłówkach) i wybór zakresu dat (2026-11-18).

   Wzór: wspolne/klient/miary.js w Panelu Zarządczym GK (HalaMiary). Tutaj osobna, mniejsza kopia na potrzeby Tras
   (inne liczby, bez zegara zakładu Hala) — ta sama zasada: jedno miejsce z tekstami, które mówią, JAK liczymy.
       MiaryTras.DEFINICJE.za_pierwszym      // {nazwa, tekst}
       MiaryTras.przycisk('za_pierwszym')    // <button class="miara-i">i</button> — dotknięcie pokazuje dymek z tekstem
       MiaryTras.podlacz(el)                 // jedno nasłuchiwanie dotknięć „i” w kontenerze
       MiaryTras.dolaczDoKafli(el, kafelki)  // „i” do kafelków Pulpitu (kafelki są przyciskami — „i” to span role=button)
       MiaryTras.zakres(od, do)              // {od, do, dni} albo {blad} — najwyżej 366 dni, po polsku
       MiaryTras.pamiecZakresu()             // zakres wskaźników zapamiętany do końca dnia (Pamiec, klucz gk-trasy.wskazniki_zakres)
   Wygląd: wskazniki.css (.miara-i, .miara-dymek, .zakres-dat). Zmieniasz regułę liczenia w trasex.py (a_wskazniki) —
   zmień tekst tutaj. */

const MiaryTras = (() => {
  'use strict';

  const DEFINICJE = {
    // ---- Wskaźniki dostaw
    trasy: { nazwa: 'Trasy',
      tekst: 'Trasy z dniem w wybranym zakresie dat. Odwołane się nie liczą.' },
    punkty: { nazwa: 'Punkty dostaw',
      tekst: 'Punkty klientów na tych trasach (bez odwołanych i bez naszych lokalizacji — załadunek to nie dostawa). Liczone w dniu trasy.' },
    dostarczone: { nazwa: 'Dostarczone',
      tekst: 'Punkty zamknięte jako dostarczone, razem z tymi, które dopiero po nadrobieniu zaległości.' },
    za_pierwszym: { nazwa: 'Za pierwszym razem',
      tekst: 'Dostarczone punkty, których nigdy nie trzeba było nadrabiać jako zaległe, w stosunku do wszystkich zamkniętych (dostarczone + nieudane), w procentach. Zielony od 80 %. „—”, gdy nic nie zostało zamknięte.' },
    nieudane: { nazwa: 'Nieudane',
      tekst: 'Punkty zamknięte przez kierowcę jako nieudane i jeszcze nienadrobione. Nadrobiony punkt wraca do trasy jako zwykły i nie jest już nieudany.' },
    po_nadrobieniu: { nazwa: 'Po nadrobieniu',
      tekst: 'Dostarczone punkty, które wcześniej były zaległe (pierwsza próba się nie udała, biuro wyznaczyło nadrobienie). Liczone w dniu trasy nadrobienia.' },
    otwarte: { nazwa: 'Jeszcze otwarte',
      tekst: 'Punkty bez wyniku: kierowca ich nie dostarczył ani nie zgłosił jako nieudane. Dla dni, które minęły, to zaległości.' },
    powody: { nazwa: 'Nieudane wg powodu',
      tekst: 'Powód wpisany przez kierowcę przy nieudanej dostawie. Procent — udział w nieudanych z wybranego zakresu.' },
    kierowcy: { nazwa: 'Wg kierowcy',
      tekst: 'Kierowca trasy. „Za pierwszym razem” liczone tak samo jak kafelek, osobno dla każdego kierowcy.' },
    klienci: { nazwa: 'Klienci z nieudanymi',
      tekst: 'Do dziesięciu klientów z największą liczbą nieudanych dostaw w zakresie dat, z liczbą wszystkich ich punktów.' },
    // ---- Kafelki Pulpitu
    'p-alarm': { nazwa: 'Alarm',
      tekst: 'Ostrzeżenie dla Szefa Sprzedaży: kopia zapasowa, adres na Pages albo mało miejsca na dysku. Dotknięcie otwiera ustawienie, które to naprawia.' },
    'p-zalegle': { nazwa: 'Zaległe dostawy',
      tekst: 'Punkty z minionych dni (z ostatnich dni wg ustawienia), które nie zostały dostarczone: nieudane albo niezamknięte. Odwołane przez biuro się nie liczą.' },
    'p-odrzucone': { nazwa: 'Odrzucone zapisy z telefonów',
      tekst: 'Zapisy kierowców, których serwer nie przyjął (np. dostawa zatwierdzona przez biuro przed ich wysłaniem). Biuro może je przyjąć albo pobrać.' },
    'p-pilne': { nazwa: 'Sprawy do decyzji',
      tekst: 'Pilne ostrzeżenia z sekcji „Trasy w toku”: wstrzymany wyjazd (numer zamówienia się nie zgadza), kierowca, który miał być u klienta i nie potwierdził, albo dostawa, która nie zdąży przed zamknięciem u klienta.' },
    'p-do-zatwierdzenia': { nazwa: 'Do zatwierdzenia',
      tekst: 'Dostawy i nieudane próby zamknięte przez kierowców, których biuro jeszcze nie przyjęło — ze wszystkich dni.' },
    'p-bez-kierowcy': { nazwa: 'Trasy bez kierowcy',
      tekst: 'Trasy wybranego dnia (od dziś), które jeszcze nie mają kierowcy i nie są zakończone. Dotknięcie otwiera listę tych tras — kierowcę wybierzesz wprost na karcie trasy.' },
    'p-uwagi-trasy': { nazwa: 'Uwagi w trasie',
      tekst: 'Zgłoszenia kierowców z trasy wybranego dnia: objazd, długi załadunek lub rozładunek, awaria, korek. Szczegóły z godziną, powodem i zdjęciem są na karcie trasy; plan i szacunek godzin się od tego nie zmieniają.' },
    'p-braki': { nazwa: 'Do sprawdzenia',
      tekst: 'Rozbieżności w danych, np. niezgodny licznik albo spalanie. Dotknięcie otwiera raport pracy z tym zakresem.' },
    'p-punkty': { nazwa: 'Punkty dnia',
      tekst: 'Wszystkie punkty na trasach wybranego dnia (bez odwołanych), także nasze miejsca, jak załadunek.' },
    'p-dostarczone': { nazwa: 'Dostarczone',
      tekst: 'Punkty wybranego dnia zamknięte jako dostarczone (jeszcze niekoniecznie zatwierdzone przez biuro).' },
    'p-nieudane': { nazwa: 'Nieudane',
      tekst: 'Punkty wybranego dnia zamknięte przez kierowcę jako nieudane. Szczegóły i powody są niżej, w „Nieudane dostawy — do decyzji”.' },
  };

  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function title(klucz) {
    const d = DEFINICJE[klucz];
    return d ? `${d.nazwa} — ${d.tekst}` : '';
  }

  function przycisk(klucz) {
    const d = DEFINICJE[klucz];
    if (!d) return '';
    return `<button type="button" class="miara-i" data-info="${esc(klucz)}" aria-label="Jak liczymy: ${esc(d.nazwa)}" title="${esc(title(klucz))}" aria-expanded="false">i</button>`;
  }

  /* Jeden dymek na stronę; dotknięcie obok i Esc zamykają (popover="auto", a bez Popover API ręcznie). */
  let dymek = null, otwarty = null;
  function pokaz(b) {
    const d = DEFINICJE[b.dataset.info];
    if (!d) return;
    if (!dymek) {
      dymek = document.createElement('div');
      dymek.className = 'miara-dymek';
      dymek.id = 'miara-dymek';
      dymek.setAttribute('role', 'tooltip');
      if ('popover' in dymek) {
        dymek.setAttribute('popover', 'auto');
        dymek.addEventListener('toggle', ev => {
          if (ev.newState === 'closed' && otwarty) { otwarty.setAttribute('aria-expanded', 'false'); otwarty = null; }
        });
      } else {
        dymek.hidden = true;
      }
      document.body.appendChild(dymek);
    }
    const ten = otwarty === b;
    zamknij();
    if (ten) return;
    dymek.innerHTML = `<b>${esc(d.nazwa)}</b><span>${esc(d.tekst)}</span>`;
    b.setAttribute('aria-expanded', 'true');
    b.setAttribute('aria-controls', dymek.id);
    otwarty = b;
    if (dymek.showPopover) dymek.showPopover(); else dymek.hidden = false;
    const r = b.getBoundingClientRect(), szer = Math.min(340, window.innerWidth - 32);
    dymek.style.width = `${szer}px`;
    const lewo = Math.max(16, Math.min(r.left + r.width / 2 - szer / 2, window.innerWidth - szer - 16));
    const wys = dymek.offsetHeight;
    const gora = r.bottom + 8 + wys > window.innerHeight - 8 ? Math.max(8, r.top - 8 - wys) : r.bottom + 8;
    dymek.style.left = `${Math.round(lewo)}px`;
    dymek.style.top = `${Math.round(gora)}px`;
  }
  function zamknij() {
    if (!dymek) return;
    if (dymek.hidePopover) { try { dymek.hidePopover(); } catch (e) { /* już zamknięty */ } } else dymek.hidden = true;
    if (otwarty) otwarty.setAttribute('aria-expanded', 'false');
    otwarty = null;
  }

  let globalne = false;
  function podlacz(el) {
    if (!el || el.dataset.miaryTras) return;
    el.dataset.miaryTras = '1';
    // Faza przechwytywania: „i” w kafelku-przycisku nie może uruchomić kliknięcia samego kafelka.
    el.addEventListener('click', ev => {
      const b = ev.target.closest && ev.target.closest('.miara-i');
      if (!b || !el.contains(b)) return;
      ev.preventDefault();
      ev.stopPropagation();
      pokaz(b);
    }, true);
    el.addEventListener('keydown', ev => {
      const b = ev.target.closest && ev.target.closest('.miara-i');
      if (b && b.tagName !== 'BUTTON' && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); ev.stopPropagation(); pokaz(b); }
    }, true);
    if (!globalne) {
      globalne = true;
      document.addEventListener('keydown', ev => { if (ev.key === 'Escape') zamknij(); });
      document.addEventListener('click', ev => { if (dymek && !dymek.showPopover && !dymek.contains(ev.target)) zamknij(); });
    }
  }

  /* Kafelki Pulpitu bywają przyciskami (klik → przewinięcie), więc „i” w nich to span role="button", a nie drugi <button>
     w <button>. Wołane z rysujKafelkiPulpitu() po zbudowaniu rzędu; kafelki = ta sama lista, z której rysowano rząd. */
  function dolaczDoKafli(el, kafelki) {
    if (!el || !Array.isArray(kafelki)) return;
    podlacz(el);
    Array.from(el.children).forEach((dziecko, i) => {
      const k = kafelki[i];
      const etykieta = dziecko.querySelector && dziecko.querySelector('.etykieta');
      if (!k || !etykieta || !DEFINICJE['p-' + k.kod] || etykieta.querySelector('.miara-i')) return;
      const d = DEFINICJE['p-' + k.kod];
      const znak = document.createElement('span');
      znak.className = 'miara-i';
      znak.setAttribute('role', 'button');
      znak.tabIndex = 0;
      znak.dataset.info = 'p-' + k.kod;
      znak.setAttribute('aria-label', `Jak liczymy: ${d.nazwa}`);
      znak.setAttribute('aria-expanded', 'false');
      znak.title = title('p-' + k.kod);
      znak.textContent = 'i';
      etykieta.appendChild(znak);
    });
  }

  // ------------------------------------------------------------ zakres dat
  const MAKS_DNI = 366;
  const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
  const dwa = n => String(n).padStart(2, '0');
  const iso = d => `${d.getUTCFullYear()}-${dwa(d.getUTCMonth() + 1)}-${dwa(d.getUTCDate())}`;
  function dataPl(t) {
    const m = RE_DATA.exec(t || '');
    return m ? `${m[3]}.${m[2]}.${m[1]}` : String(t || '');
  }
  function dzienUTC(t) {
    const m = RE_DATA.exec(t || '');
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
  }
  function zakres(od, do_) {
    const a = dzienUTC(od), b = dzienUTC(do_);
    if (!RE_DATA.test(od || '') || !RE_DATA.test(do_ || '')) return { blad: 'Wybierz obie daty: „od” i „do”.' };
    if (!a || !b || a.getUTCFullYear() < 2000 || b.getUTCFullYear() > 2100) return { blad: 'Nieprawidłowa data — wybierz dzień z kalendarza (lata 2000–2100).' };
    if (a > b) return { blad: `Data „od” (${dataPl(od)}) jest po dacie „do” (${dataPl(do_)}) — zamień je miejscami.` };
    const dni = Math.round((b - a) / 86400000) + 1;
    if (dni > MAKS_DNI) return { blad: `Najwyżej ${MAKS_DNI} dni naraz (wybrano ${dni}) — skróć zakres.` };
    return { od, do: do_, dni, opis: od === do_ ? dataPl(od) : `${dataPl(od)} – ${dataPl(do_)}` };
  }
  /* Gotowe okresy względem dziś (RRRR-MM-DD, czas lokalny urządzenia — jak dzisiaj() w app.js). */
  function okres(nazwa, dzis) {
    const d = dzienUTC(dzis);
    const przes = n => iso(new Date(d.getTime() + n * 86400000));
    if (nazwa === 'dzis') return { od: dzis, do: dzis };
    if (nazwa === 'wczoraj') return { od: przes(-1), do: przes(-1) };
    if (nazwa === '7dni') return { od: przes(-6), do: dzis };
    if (nazwa === 'miesiac') return { od: `${dzis.slice(0, 7)}-01`, do: dzis };
    return null;
  }

  /* Wybrany okres pamiętamy do końca dnia (jak Panel: „pamiętaj w sesji, nie między dniami”): jutro wybór wraca do
     „Ostatnie 7 dni”. Klucz gk-trasy.wskazniki_zakres (przez Pamiec — przedrostek jak reszta Tras). */
  const KLUCZ_PAMIECI = 'wskazniki_zakres';
  function pamiecZakresu(dzis) {
    const domyslny = Object.assign({ okres: '7dni' }, okres('7dni', dzis));
    return {
      czytaj() {
        try {
          const z = JSON.parse(Pamiec.czytaj(KLUCZ_PAMIECI) || 'null');
          if (z && z.dzien === dzis && RE_DATA.test(z.od) && RE_DATA.test(z.do)
              && ['dzis', 'wczoraj', '7dni', 'miesiac', 'zakres'].includes(z.okres) && !zakres(z.od, z.do).blad) {
            return { okres: z.okres, od: z.od, do: z.do };
          }
        } catch (e) { /* zepsuty wpis — jak brak */ }
        return domyslny;
      },
      zapisz(z) {
        Pamiec.zapisz(KLUCZ_PAMIECI, JSON.stringify({ okres: z.okres, od: z.od, do: z.do, dzien: dzis }));
      },
    };
  }

  function poleZakresu(z, blad) {
    return `<form class="zakres-dat" novalidate aria-label="Zakres dat">
      <label>od <input type="date" name="od" value="${esc(z.od)}" required></label>
      <label>do <input type="date" name="do" value="${esc(z.do)}" required></label>
      <button type="submit" class="glowny">Pokaż</button>
      ${blad ? `<p class="blad-zakresu" role="alert">${esc(blad)}</p>` : ''}
    </form>`;
  }

  return { DEFINICJE, title, przycisk, podlacz, zamknij, dolaczDoKafli, zakres, okres, dataPl, pamiecZakresu, poleZakresu, MAKS_DNI };
})();
