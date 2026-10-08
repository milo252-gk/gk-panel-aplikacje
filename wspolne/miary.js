/* GK Panel Kierownika — wspólne miary (D47): jak liczymy każdy wskaźnik i wybór zakresu dat.

   Panel → Wskaźniki i UR → KPI pokazują TE SAME definicje (jedno miejsce — ten plik), zgodne z kodem, który liczy
   (Hala.kpiAwarii / Hala.wskaznikiOkresu i bliźniaki w hubie, KONTRAKT §6.1, §6.3a, D37, D44):
       HalaMiary.DEFINICJE.mttr            // {nazwa, tekst}
       HalaMiary.title('mttr')             // tekst do atrybutu title (podpowiedź myszą)
       HalaMiary.przycisk('mttr')          // <button class="hala-info">i</button> — dotknięcie na telefonie pokazuje tekst
       HalaMiary.podlacz(el)               // jedno nasłuchiwanie dotknięć „i” w kontenerze (dymek: popover, Esc zamyka)
   Zakres dat (Panel → Wskaźniki → „Zakres”, UR → KPI → „Zakres”):
       HalaMiary.zakres('2026-09-01', '2026-09-30')   // {od, do (ms, doba zakładu, „do” włącznie), dni, opis} albo {blad}
       HalaMiary.pamiecZakresu('panel', () => hala.teraz())   // zapamiętany zakres z DZIŚ (hala.panel.zakres; inny dzień = brak)
   Wygląd: hala.css → .hala-info, .hala-info-dymek, .hala-zakres. Ładowanie: po hala.js (daty zakładu z Hala.lokalny). */

(function (global) {
  'use strict';

  /* Definicje — po polsku, krótko, ale dokładnie tak, jak liczy kod. Zmieniasz regułę liczenia — zmień tekst tutaj. */
  const DEFINICJE = {
    awarie: { nazwa: 'Awarie',
      tekst: 'Awarie zgłoszone w wybranym okresie (wszystkie priorytety). Anulowane — fałszywy alarm — się nie liczą.' },
    zatrzymania: { nazwa: 'Zatrzymania linii',
      tekst: 'Awarie zgłoszone w okresie z priorytetem, który zatrzymuje linię („Zatrzymanie linii”, także po korekcie priorytetu przez UR). Anulowane się nie liczą.' },
    przestoj: { nazwa: 'Przestój łącznie',
      tekst: 'Czas, przez który linie stały w okresie: od zgłoszenia awarii do potwierdzenia przez lidera, że linia ruszyła (trwająca — do teraz). Liczony 24/7, także gdy naprawa jest wstrzymana. Przycięty do okresu, więc liczy się też awaria zgłoszona wcześniej. Nakładające się awarie jednej linii liczą się raz; suma po liniach. Bez anulowanych.' },
    reakcja: { nazwa: 'Reakcja UR (średnio)',
      tekst: 'Średni czas od zgłoszenia awarii do chwili, gdy mechanik ją przyjął („Mechanik w drodze”) albo od razu zaczął naprawę. Z awarii zgłoszonych w okresie, które UR już przyjął.' },
    mttr: { nazwa: 'MTTR (średnio)',
      tekst: 'Średni czas naprawy: od zgłoszenia awarii do „Zakończona przez UR”. Bez czekania na potwierdzenie lidera. Z awarii zgłoszonych w okresie i już zakończonych przez UR.' },
    mtbf: { nazwa: 'MTBF',
      tekst: 'Średni czas pracy maszyny między awariami zatrzymującymi linię: od potwierdzenia naprawy jednej do zgłoszenia następnej tej samej maszyny (awarie zgłoszone w okresie). Awarie bez zatrzymania nie przerywają pracy, a ponowne zgłoszenie w trakcie trwającej awarii to ta sama przerwa. „—”, gdy żadna maszyna nie miała w okresie dwóch takich awarii.' },
    braki: { nazwa: 'Braki w próbach',
      tekst: 'Suma braków ÷ suma sprawdzonych sztuk ze wszystkich prób (lidera i KJ) rozpoczętych w okresie, w procentach z jednym miejscem po przecinku.' },
    zlecenia_wykonane: { nazwa: 'Zlecenia wykonane',
      tekst: 'Zlecenia od kierownika zlecone w okresie: ile dział wykonał (wykonane i już zamknięte) z wszystkich zleconych. Zaplanowane liczą się od chwili, gdy hub je zlecił.' },
    zlecenia_w_terminie: { nazwa: 'Zlecenia w terminie',
      tekst: 'Ze zleceń zleconych w okresie, które mają termin: procent wykonanych do terminu. Po terminie = wykonane po terminie, niezrobione po minionym terminie i przepadłe z końcem zmiany. Otwarte przed terminem, anulowane i „Dział nie może wykonać” się nie liczą.' },
    przestoj_linie: { nazwa: 'Przestój na linię',
      tekst: 'Przestój każdej linii w okresie (tak jak „Przestój łącznie”), liczba awarii i zatrzymań zgłoszonych w okresie oraz MTTR linii. Pasek — względem linii z najdłuższym przestojem.' },
    wady: { nazwa: 'Najczęstsze wady',
      tekst: 'Pięć wad z największą liczbą sztuk w próbach rozpoczętych w okresie (katalog wad KJ). Procent — udział w sumie wszystkich wad; wada bez ilości liczy się jako 1 szt.' },
    terminowosc_dzialy: { nazwa: 'Zlecenia w terminie — działy',
      tekst: 'Zlecenia w terminie (jak w kafelku) osobno dla każdego działu, a niżej dla osób wskazanych w zleceniu. Zielony pasek od 80 %.' },
    plan_przegladow: { nazwa: 'Plan przeglądów',
      tekst: 'Przeglądy z terminem w okresie: zrobione w terminie ÷ rozliczone (zrobione w terminie i po terminie, opóźnione — termin minął, a nie zrobione — i usunięte z planu po terminie). Przeglądy z przyszłym terminem się nie liczą.' },
  };

  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Tekst do title: „MTTR (średnio) — Średni czas…”. Nieznany klucz — pusto (literówka nie pokaże „undefined”). */
  function title(klucz) {
    const d = DEFINICJE[klucz];
    return d ? `${d.nazwa} — ${d.tekst}` : '';
  }

  /* Przycisk „i” (mysz: title; telefon: dotknięcie → dymek z tekstem; czytnik ekranu: aria-label). */
  function przycisk(klucz) {
    const d = DEFINICJE[klucz];
    if (!d) return '';
    return `<button type="button" class="hala-info" data-info="${esc(klucz)}" aria-label="Jak liczymy: ${esc(d.nazwa)}" title="${esc(title(klucz))}" aria-expanded="false">i</button>`;
  }

  /* Jeden dymek na stronę (popover="auto": dotknięcie obok i Esc zamykają same; bez Popover API — zwykłe hidden). */
  let dymek = null, otwartyPrzycisk = null;
  function pokazDymek(b) {
    const d = DEFINICJE[b.dataset.info];
    if (!d || typeof document === 'undefined') return;
    if (!dymek) {
      dymek = document.createElement('div');
      dymek.className = 'hala-info-dymek';
      dymek.id = 'hala-info-dymek';
      dymek.setAttribute('role', 'tooltip');
      if ('popover' in dymek) {
        dymek.setAttribute('popover', 'auto');
        dymek.addEventListener('toggle', ev => { if (ev.newState === 'closed' && otwartyPrzycisk) { otwartyPrzycisk.setAttribute('aria-expanded', 'false'); otwartyPrzycisk = null; } });
      } else {
        dymek.hidden = true;
      }
      document.body.appendChild(dymek);
    }
    const ten = otwartyPrzycisk === b;
    zamknij();
    if (ten) return;                                  // drugie dotknięcie tego samego „i” — tylko zamyka
    dymek.innerHTML = `<b>${esc(d.nazwa)}</b><span>${esc(d.tekst)}</span>`;
    b.setAttribute('aria-expanded', 'true');
    b.setAttribute('aria-controls', dymek.id);
    otwartyPrzycisk = b;
    if (dymek.showPopover) dymek.showPopover(); else dymek.hidden = false;
    // Pod przyciskiem, w granicach ekranu (16 px marginesu); gdy pod spodem brak miejsca — nad nim.
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
    if (otwartyPrzycisk) otwartyPrzycisk.setAttribute('aria-expanded', 'false');
    otwartyPrzycisk = null;
  }

  /* Dotknięcia „i” w kontenerze — raz na kontener (ekrany przerysowują treść, kontener zostaje). */
  function podlacz(el) {
    if (!el || el.dataset.halaInfo) return;
    el.dataset.halaInfo = '1';
    el.addEventListener('click', ev => {
      const b = ev.target.closest && ev.target.closest('.hala-info');
      if (!b || !el.contains(b)) return;
      ev.preventDefault();
      ev.stopPropagation();
      pokazDymek(b);
    });
    if (!podlacz.bezPopover && typeof document !== 'undefined') {
      podlacz.bezPopover = true;
      // Bez Popover API (stare przeglądarki): Esc i dotknięcie obok zamykają ręcznie.
      document.addEventListener('keydown', ev => { if (ev.key === 'Escape') zamknij(); });
      document.addEventListener('click', ev => { if (dymek && !dymek.showPopover && !dymek.contains(ev.target)) zamknij(); });
    }
  }

  // ------------------------------------------------------------ zakres dat

  const MAKS_DNI = 366;                 // jak zestawienia CSV i trasa huba /api/v1/panel/wskazniki
  const dwa = n => String(n).padStart(2, '0');
  const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
  /* RRRR-MM-DD → DD.MM.RRRR (daty w podpisach po polsku). */
  function dataPl(tekst) {
    const m = RE_DATA.exec(tekst || '');
    return m ? `${m[3]}.${m[2]}.${m[1]}` : String(tekst || '');
  }
  /* Dzień kalendarza (bez strefy) → liczba dni od epoki — do liczenia długości zakresu niezależnie od zmiany czasu. */
  const dzienNr = (r, m, d) => Math.round(Date.UTC(r, m - 1, d) / 86400000);

  /* Zakres dni zakładu od–do (oba włącznie) → okno [od, do) w ms: od północy „od” do północy dnia po „do” (czas zakładu,
     Europe/Warsaw — Hala.zLokalnego, nie strefa urządzenia). Błędy po polsku, z instrukcją. */
  function zakres(od, do_) {
    const a = RE_DATA.exec(od || ''), b = RE_DATA.exec(do_ || '');
    if (!a || !b) return { blad: 'Wybierz obie daty: „od” i „do”.' };
    const [ra, ma, da] = a.slice(1).map(Number), [rb, mb, db] = b.slice(1).map(Number);
    const na = dzienNr(ra, ma, da), nb = dzienNr(rb, mb, db);
    const prawdziwa = (r, m, d) => { const x = new Date(Date.UTC(r, m - 1, d)); return x.getUTCFullYear() === r && x.getUTCMonth() === m - 1 && x.getUTCDate() === d; };
    if (!prawdziwa(ra, ma, da) || !prawdziwa(rb, mb, db) || ra < 2000 || rb > 2100) return { blad: 'Nieprawidłowa data — wybierz dzień z kalendarza (lata 2000–2100).' };
    if (na > nb) return { blad: `Data „od” (${dataPl(od)}) jest po dacie „do” (${dataPl(do_)}) — zamień je miejscami.` };
    const dni = nb - na + 1;
    if (dni > MAKS_DNI) return { blad: `Najwyżej ${MAKS_DNI} dni naraz (wybrano ${dni}) — skróć zakres.` };
    const H = global.Hala;
    const nast = new Date(Date.UTC(rb, mb - 1, db + 1));
    return { od: H.zLokalnego(ra, ma, da, 0, 0), do: H.zLokalnego(nast.getUTCFullYear(), nast.getUTCMonth() + 1, nast.getUTCDate(), 0, 0),
             dni, odData: od, doData: do_, opis: od === do_ ? dataPl(od) : `${dataPl(od)} – ${dataPl(do_)}` };
  }

  /* Dzień zakładu (RRRR-MM-DD) chwili ms. */
  function dzien(ms) {
    const l = global.Hala.lokalny(ms);
    return `${l.rok}-${dwa(l.miesiac)}-${dwa(l.dzien)}`;
  }
  /* Domyślny zakres: ostatnie 7 dni z dziś włącznie. */
  function domyslnyZakres(teraz) {
    const l = global.Hala.lokalny(teraz);
    const p = new Date(Date.UTC(l.rok, l.miesiac - 1, l.dzien - 6));
    return { od: `${p.getUTCFullYear()}-${dwa(p.getUTCMonth() + 1)}-${dwa(p.getUTCDate())}`, do: dzien(teraz) };
  }

  /* Ostatnio wybrany zakres — tylko z dziś (dzień zakładu zapisany obok): jutro wybór zaczyna się od nowa (prośba
     właściciela 2026-10-08: „pamiętaj w sesji, nie między dniami”). Klucz `hala.<aplikacja>.zakres` w localStorage — na
     Pages jedno źródło dzielą wszystkie programy GK, więc tylko klucze `hala.*` (KONTRAKT §9, t_dostep.py → WspolneZrodlo).
     Bez pamięci przeglądarki (tryb prywatny) — domyślny zakres. */
  function pamiecZakresu(aplikacja, teraz) {     // teraz: funkcja → ms (hala.teraz)
    const ap = String(aplikacja || 'app').replace(/[^a-z]/g, '');
    return {
      czytaj() {
        try {
          const z = JSON.parse(global.localStorage.getItem('hala.' + ap + '.zakres') || 'null');
          if (z && z.dzien === dzien(teraz()) && RE_DATA.test(z.od) && RE_DATA.test(z.do)) return { od: z.od, do: z.do, wybrany: !!z.wybrany };
        } catch (e) { /* zepsuty wpis albo brak pamięci — jak brak */ }
        return Object.assign(domyslnyZakres(teraz()), { wybrany: false });
      },
      zapisz(z) {
        try {
          global.localStorage.setItem('hala.' + ap + '.zakres', JSON.stringify({ od: z.od, do: z.do, wybrany: !!z.wybrany, dzien: dzien(teraz()) }));
        } catch (e) { /* bez pamięci też działa */ }
      },
    };
  }

  /* Pasek „od … do … Pokaż” (formularz; wartości RRRR-MM-DD, podpis z datami po polsku rysuje ekran). */
  function poleZakresu(z, blad) {
    return `<form class="hala-zakres" novalidate aria-label="Zakres dat">
      <label>od <input type="date" name="od" value="${esc(z.od)}" required></label>
      <label>do <input type="date" name="do" value="${esc(z.do)}" required></label>
      <button type="submit" class="glowny">Pokaż</button>
      ${blad ? `<p class="blad" role="alert">${esc(blad)}</p>` : ''}
    </form>`;
  }

  global.HalaMiary = { DEFINICJE, title, przycisk, podlacz, zamknij, zakres, dataPl, dzien, domyslnyZakres, pamiecZakresu, poleZakresu, MAKS_DNI };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.HalaMiary;
})(typeof window !== 'undefined' ? window : globalThis);
