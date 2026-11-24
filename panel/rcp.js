/* Panel Zarządczy GK — zakładka RCP (rejestracja czasu pracy). Tylko kierownik zakładu i admin (serwer też odmawia: 403).

   Odbicia robi terminal na hali (terminal.html, konto „ekran”); tu kierownik widzi dni, zatwierdza je albo poprawia, przypisuje
   breloki i pobiera plik dla płac. Godziny liczy SERWER (gk_rcp.py) — Panel nic nie liczy, tylko pokazuje i woła
   /api/v1/panel/rcp/…. Surowe odbicia nigdy się nie zmieniają: korekta to nowy wpis z powodem, anulowanie zostawia ślad.

   Zakładka rysuje się RAZ i odświeża tylko na polecenie (zmiana okresu/filtra, akcja, „Odśwież”, co minutę) — Panel woła
   rysuj() przy każdym zdarzeniu z huba i nie może zamazywać wpisywanego tekstu. Czyste funkcje: W.rcp* (widok.js). */

(() => {
  'use strict';
  const P = window.Panel;
  const { hala, W, esc } = P;

  const S = { czesc: 'dni', od: '', do: '', filtr: 'do_zatwierdzenia', szukaj: '', dni: null, potwierdzenia: [], karty: null, wnioski: null, nieznane: null, pule: null, brak: null, lista: null, grafik: null, tydzien: '', blad: '', otwarte: new Set(),
              eksport: { format: 'csv', wszystkie: false } };
  let korzen = null, wczytuje = false, ostatnieOdswiezenie = 0;
  const ODSWIEZ_MS = 60000;

  const api = (metoda, sciezka, cialo) => hala.zapytaj(metoda, '/api/v1/panel/rcp/' + sciezka, cialo);
  const tekstBledu = e => (e && e.odHuba && e.message) ? e.message : P.komunikatBledu(e);

  // ---- daty (dni zakładu jako „RRRR-MM-DD”; rachunek w UTC, żeby strefa przeglądarki nie przesuwała dnia)
  const dodajDni = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const poniedzialek = iso => { const d = new Date(iso + 'T00:00:00Z'); return dodajDni(iso, -((d.getUTCDay() + 6) % 7)); };
  const DNI_TYG = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'];

  // ---- dane
  async function wczytaj() {
    if (wczytuje) return;
    wczytuje = true;
    try {
      if (!S.od) Object.assign(S, W.rcpOkres(hala.teraz()));
      if (S.czesc === 'dni' || S.dni === null) {
        const r = await api('GET', `dni?od=${S.od}&do=${S.do}`);
        S.dni = r.dni; S.potwierdzenia = r.potwierdzenia || [];
      }
      if (S.czesc === 'karty' || S.czesc === 'grafik' || S.karty === null) {
        const r = await api('GET', 'karty');
        S.karty = r.karty;
      }
      if (S.czesc === 'wnioski' || S.wnioski === null) S.wnioski = (await api('GET', 'wnioski')).wnioski;
      if (S.czesc === 'wnioski') S.pule = await api('GET', 'pule');
      if (S.czesc === 'karty') S.nieznane = (await api('GET', 'nieznane')).nieznane;
      if (S.czesc === 'dni') S.brak = await api('GET', 'brak-odbic');
      if (S.czesc === 'grafik') {
        if (!S.tydzien) S.tydzien = poniedzialek(W.dzienZakladu(hala.teraz()));
        S.grafik = await api('GET', `grafik?od=${S.tydzien}&do=${dodajDni(S.tydzien, 6)}`);
      }
      S.blad = '';
    } catch (e) { S.blad = tekstBledu(e); }
    finally { wczytuje = false; ostatnieOdswiezenie = Date.now(); rysujTresc(); }
  }

  // ---- widok „Dni”
  const znacznik = (tekst, rodzaj) => `<span class="znacznik ${rodzaj || 'neutral'}">${esc(tekst)}</span>`;
  const nazwaRodzaju = r => (r === 'wyjscie' ? 'wyjście' : 'wejście');
  const dzisIso = () => new Date().toISOString();

  // Potwierdzenie Lidera/Mistrza (D96): kto, o której, notatka zmiany i uwaga przy tej osobie. To nie jest zatwierdzenie dnia.
  function sprawdzone(w) {
    const p = (S.potwierdzenia || []).find(x => x.dzien === w.dzien && x.osoby.some(o => o.id === w.pracownik));
    if (!p) return '';
    const uwaga = (p.osoby.find(o => o.id === w.pracownik) || {}).uwaga;
    return `<div class="rcp-sprawdzone">${P.ik('osoba', 14)}Sprawdzone przez Lidera: <b>${esc(p.kto)}</b>, ${esc(W.godzina(p.kiedy))} — ${esc(p.notatka)}${uwaga ? `<span class="slaby"> · przy osobie: ${esc(uwaga)}</span>` : ''}</div>`;
  }

  function wierszDnia(w) {
    const otwarty = S.otwarte.has(w.klucz);
    const zat = w.status === 'zatwierdzony', wPracy = w.status === 'w_pracy';
    const nad = [w.ponadNorme && `ponad 8 h: ${w.ponadNorme}`, w.wDzienWolny && `${w.dzienWolny || 'dzień wolny'}: ${w.wDzienWolny}`, w.nocne && `nocne: ${w.nocne}`]
      .filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('');
    const odbicia = w.odbicia.map(o => `<li>${esc(W.godzina(o.czas))} — ${esc(nazwaRodzaju(o.rodzaj))}
        <span class="slaby">${o.zrodlo === 'korekta' ? `· ręcznie: ${esc(o.powod || '')}` : '· terminal'}</span>
        ${zat || !o.id ? '' : `<button type="button" class="maly" data-akcja="anuluj" data-odbicie="${esc(o.id)}">Anuluj odbicie</button>`}</li>`).join('');
    return `<article class="zlecenie rcp-dzien" data-klucz="${esc(w.klucz)}" data-pracownik="${esc(w.pracownik)}" data-dzien="${esc(w.dzien)}">
      <div class="opis">
        <div class="tytul"><b>${esc(w.nazwa)}</b> <span class="slaby">${esc(w.dzienOpis)}</span></div>
        <div class="szczegoly"><span>${esc(w.godziny || '—')}</span><span><b>${esc(w.czas)}</b></span>${nad}
          ${zat ? znacznik(`Zatwierdzone (${w.zatwierdzil})`, 'ok') : ''}${w.zmiana ? znacznik('Zmiana ' + w.zmiana) : ''}${w.spoznienie ? znacznik(`Spóźnienie ${w.spoznienie} min`, 'uwaga') : ''}${wPracy ? znacznik('W pracy', 'uwaga') : ''}${w.uwagi.map(u => znacznik(u, 'uwaga')).join('')}</div>
        ${sprawdzone(w)}
        ${otwarty ? `<div class="rcp-popraw">
          <ul class="rcp-odbicia">${odbicia}</ul>
          ${zat ? '<p class="slaby">Dzień jest zatwierdzony — najpierw wycofaj zatwierdzenie, żeby go poprawić.</p>' : `<form class="rcp-korekta" autocomplete="off">
            <label>Brakujące odbicie<select name="rodzaj"><option value="wyjscie">Wyjście</option><option value="wejscie">Wejście</option></select></label>
            <label>Kiedy<input name="czas" type="datetime-local" required></label>
            <label>Powód<input name="powod" maxlength="300" required placeholder="np. zapomniał odbić"></label>
            <button type="submit" class="glowny maly">Dodaj odbicie</button>
          </form>`}
        </div>` : ''}
      </div>
      <div class="akcje">
        ${zat ? '<button type="button" class="maly" data-akcja="wycofaj">Wycofaj</button>'
              : (wPracy || !w.odbicia.length) ? '' : `<button type="button" class="${w.uwagi.length ? 'maly' : 'glowny maly'}" data-akcja="zatwierdz">${w.uwagi.length ? 'Zatwierdź mimo uwag' : 'Zatwierdź'}</button>`}
        <button type="button" class="maly" data-akcja="popraw" aria-expanded="${otwarty}">${otwarty ? 'Zwiń' : 'Odbicia'}</button>
      </div></article>`;
  }

  // „Kto nie odbił”: na zmianie trwającej albo świeżo zakończonej — brak wejścia (plan jest, odbicia nie) i brak wyjścia.
  function brakOdbic() {
    const b = S.brak;
    if (!b || !b.zmiana || (!b.brak_wejscia.length && !b.brak_wyjscia.length)) return '';
    const lista = (naglowek, osoby, opis) => osoby.length ? `<p><b>${naglowek} · ${osoby.length}:</b> ${osoby.map(o => esc(o.nazwa) + (opis ? opis(o) : '')).join(', ')}</p>` : '';
    return `<div class="rcp-brak" role="status"><b>Zmiana ${esc(b.zmiana)} — brakujące odbicia</b>
      ${lista('Brak wejścia', b.brak_wejscia)}${lista('Brak wyjścia', b.brak_wyjscia, o => o.wejscie ? ` (wszedł ${esc(godzinaLok(o.wejscie))})` : '')}</div>`;
  }
  const godzinaLok = iso => { const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  function trescDni() { return brakOdbic() + trescDniLista(); }
  function trescDniLista() {
    const l = W.rcpLiczby(S.dni || []);
    const licznik = { do_zatwierdzenia: l.doZatwierdzenia, z_uwagami: l.zUwagami, spoznienia: l.spoznienia, zatwierdzone: l.zatwierdzone, wszystkie: l.razem };
    const wiersze = W.rcpWiersze(S.dni || [], { filtr: S.filtr, szukaj: S.szukaj });
    return `<div class="rcp-pasek">
        <label>Od<input type="date" data-pole="od" value="${esc(S.od)}"></label>
        <label>Do<input type="date" data-pole="do" value="${esc(S.do)}"></label>
        <label class="rcp-szukaj">Szukaj<input type="search" data-pole="szukaj" value="${esc(S.szukaj)}" placeholder="nazwisko"></label>
        <button type="button" class="maly" data-akcja="odswiez">Odśwież</button>
      </div>
      <div class="chipy karta-chipy" role="group" aria-label="Filtr dni">${W.RCP_FILTRY.map(([k, nazwa]) =>
        `<button type="button" class="chip${(k === 'z_uwagami' || k === 'spoznienia') && licznik[k] ? ' spoznione' : ''}" data-filtr="${k}" aria-pressed="${S.filtr === k}">${esc(nazwa)} · ${licznik[k]}</button>`).join('')}</div>
      <div class="lista">${wiersze.map(wierszDnia).join('') || `<p class="pusto${S.dni && S.filtr === 'do_zatwierdzenia' && !l.razem ? '' : ''}">${S.dni === null ? 'Wczytuję…' : (l.razem ? 'Nic w tym filtrze.' : 'Brak odbić w tym okresie.')}</p>`}</div>`;
  }

  // ---- osoby: konta GK z hali (od D97 także „Pracownik produkcji” — bez dostępu do aplikacji, tylko brelok)
  const osobyRcp = () => (hala.pracownicy || []).filter(p => p.aktywny !== false && !(p.role || []).includes('ekran'));
  const linieSlownika = () => Object.entries((hala.slowniki && hala.slowniki.linie) || {}).map(([k, v]) => [k, (v && v.nazwa) || k]);
  const nazwaLinii = kod => (linieSlownika().find(([k]) => k === kod) || [kod, kod])[1];

  function podgladListy() {
    const l = S.lista;
    if (!l || !l.podglad) return '';
    const p = l.podglad;
    return `<div class="rcp-podglad" aria-live="polite">
      <p><b>${p.ok}</b> kont do założenia${p.bledy ? `, <b class="blad-tekst">${p.bledy}</b> do poprawy` : ''}. Nic nie jest jeszcze zapisane — konta powstaną dopiero po zatwierdzeniu, wszystkie naraz.</p>
      <ul class="rcp-odbicia">${p.wiersze.map(w => `<li>${w.blad ? P.ik('ostrzezenie', 14) : P.ik('haczyk', 14)} ${esc(w.nazwa || '(brak nazwy)')}
        <span class="slaby">· ${esc(w.linie.map(nazwaLinii).join(', ') || 'bez linii')} · ${w.karta ? 'brelok ' + esc(w.karta) : 'bez breloka'}</span>
        ${w.blad ? `<span class="blad-tekst"> — wiersz ${w.nr}: ${esc(w.blad)}</span>` : ''}</li>`).join('')}</ul>
      ${p.bledy ? '<p class="slaby">Popraw wskazane wiersze w polu powyżej i sprawdź jeszcze raz.</p>'
                : `<button type="button" class="glowny" data-akcja="lista-zapisz">Załóż ${p.ok} ${p.ok === 1 ? 'konto' : 'kont'}</button>`}</div>`;
  }

  function trescImportu() {
    const linie = linieSlownika();
    return `<h3>Pracownicy produkcji</h3>
      <p class="slaby opis-widoku">Każdy pracownik ma konto GK. Wklej listę — powstaną konta z funkcją „Pracownik produkcji” (bez dostępu do aplikacji: tylko terminal RCP,
        własne dane i wnioski urlopowe) i przypisane breloki. Hasło i PIN startowy ustawia osoba przy pierwszym użyciu. Linia decyduje, którego Lidera lub Mistrza osoba jest „do sprawdzenia”.</p>
      <details class="rcp-lista"${S.listaOtwarta ? ' open' : ''}><summary>Wklej listę pracowników</summary>
        <form class="rcp-lista-formularz" autocomplete="off">
          <label>Jedna osoba w wierszu: <span class="slaby">Imię Nazwisko; linia; brelok (średnik, tabulator albo przecinek; brelok można pominąć)</span>
            <textarea name="lista" rows="6" placeholder="Jan Kowalski; ${esc((linie[0] || ['', 'Linia 1'])[1])}; 6450974">${esc((S.lista && S.lista.tekst) || '')}</textarea></label>
          <button type="submit" class="maly">Sprawdź listę</button>
          <p class="blad" role="alert" hidden></p>
        </form>
        ${podgladListy()}
      </details>`;
  }

  // ---- widok „Wnioski urlopowe” (D97): wnioski z terminala; zatwierdza kierownik zakładu i Menedżer, zatwierdzony wpisuje się do Urlopów
  const dataPl = iso => String(iso || '').split('-').reverse().join('.');
  const liczbaOczekujacych = () => (S.wnioski || []).filter(w => w.status === 'oczekuje').length;
  function wierszWniosku(w) {
    const stan = w.status === 'oczekuje' ? znacznik('Czeka na decyzję', 'uwaga')
      : w.status === 'zatwierdzony' ? znacznik('Zatwierdzony', 'ok') : znacznik('Odrzucony', 'blad');
    const decyzja = w.decyzja ? `<span class="slaby">· ${esc(w.decyzja.kto)}${w.decyzja.powod ? ': ' + esc(w.decyzja.powod) : ''}</span>` : '';
    return `<article class="zlecenie${w.status === 'oczekuje' ? '' : ' wyslane'}" data-wniosek="${esc(String(w.id))}">
      <div class="opis"><div class="tytul"><b>${esc(w.nazwa)}</b> ${stan}</div>
        <div class="szczegoly"><span>${esc(dataPl(w.od))} – ${esc(dataPl(w.do))}</span><span>· ${esc(w.rodzaj_nazwa)}</span>${w.notatka ? `<span>· ${esc(w.notatka)}</span>` : ''}${decyzja}</div></div>
      ${w.status === 'oczekuje' ? `<div class="akcje"><button type="button" class="maly glowny" data-akcja="wniosek-zatwierdz">Zatwierdź</button>
        <button type="button" class="maly" data-akcja="wniosek-odrzuc">Odrzuć</button></div>` : ''}</article>`;
  }
  function trescWnioskow() {
    const w = S.wnioski;
    if (w === null) return '<p class="pusto">Wczytuję…</p>';
    const czekaja = w.filter(x => x.status === 'oczekuje'), reszta = w.filter(x => x.status !== 'oczekuje').slice(0, 30);
    return `<p class="slaby opis-widoku">Pracownik składa wniosek na terminalu (po przyłożeniu breloka). Zatwierdzony wniosek wpisuje się do Administracji → Urlopy
        i działa dokładnie jak urlop wpisany ręcznie; pracownik widzi decyzję na terminalu w „Sprawdź dane”.</p>
      <h3>Czekają na decyzję · ${czekaja.length}</h3>
      <div class="lista">${czekaja.map(wierszWniosku).join('') || '<p class="pusto">Brak wniosków do rozpatrzenia.</p>'}</div>
      ${reszta.length ? `<h3>Ostatnie decyzje</h3><div class="lista">${reszta.map(wierszWniosku).join('')}</div>` : ''}
      ${trescPul()}`;
  }

  // Pula dni urlopu na rok (dni robocze): terminal pokazuje pracownikowi „zostało X dni”. Bez ustawionej puli terminal niczego nie pokazuje.
  function trescPul() {
    const p = S.pule;
    if (!p) return '';
    return `<h3>Pula urlopu na ${esc(String(p.rok))}</h3>
      <p class="slaby">Ile dni urlopu przysługuje osobie w roku. Wykorzystane liczymy z wpisów w Urlopach (dni robocze, bez świąt).</p>
      <div class="lista">${p.osoby.map(o => `<form class="zlecenie rcp-pula-formularz" data-pracownik="${esc(o.id)}" autocomplete="off">
        <div class="opis"><div class="tytul"><b>${esc(o.nazwa)}</b></div>
          <div class="szczegoly"><span>${o.pula === null ? 'pula nie ustawiona' : `wykorzystano ${o.wykorzystano}, zostało ${o.zostalo}`}</span></div></div>
        <div class="akcje"><label>Dni<input name="dni" type="number" min="0" max="60" step="1" required value="${o.pula === null ? '' : esc(String(o.pula))}"></label>
          <input type="hidden" name="rok" value="${esc(String(p.rok))}"><button type="submit" class="maly">Zapisz</button></div></form>`).join('')
        || '<p class="pusto">Brak osób z funkcją „Pracownik produkcji”.</p>'}</div>`;
  }

  // ---- widok „Karty”
  function trescKart() {
    const karty = S.karty || [];
    const maja = new Set(karty.map(k => k.pracownik));
    const osoby = osobyRcp();
    const bez = osoby.filter(p => !maja.has(p.id));
    return `<p class="slaby opis-widoku">Brelok przypisujesz osobie raz: kliknij pole „Numer karty” i przyłóż brelok do czytnika
        (czytnik sam wpisze numer i zatwierdzi). Jedna osoba ma jeden aktywny brelok; nowy zastępuje stary.</p>
      <form class="rcp-karta-formularz" autocomplete="off">
        <label>Osoba<select name="pracownik" required><option value="">— wybierz —</option>${(bez.length ? bez : osoby).map(p => `<option value="${esc(p.id)}">${esc(p.nazwa)}</option>`).join('')}</select></label>
        <label>Numer karty<input name="karta" inputmode="numeric" required placeholder="przyłóż brelok do czytnika"></label>
        <button type="submit" class="glowny">Przypisz brelok</button>
        <p class="blad" role="alert" hidden></p>
      </form>
      <h3>Przypisane breloki · ${karty.length}</h3>
      <div class="lista">${karty.map(k => `<article class="zlecenie" data-pracownik="${esc(k.pracownik)}">
          <div class="opis"><div class="tytul"><b>${esc(k.nazwa || k.pracownik)}</b></div><div class="szczegoly"><span>numer: ${esc(k.numer)}</span></div></div>
          <div class="akcje"><button type="button" class="maly" data-akcja="odepnij">Odepnij</button></div></article>`).join('')
        || `<p class="pusto">${S.karty === null ? 'Wczytuję…' : 'Żaden brelok nie jest jeszcze przypisany.'}</p>`}</div>
      ${bez.length ? `<h3>Bez breloka · ${bez.length}</h3><p class="slaby">${bez.map(p => esc(p.nazwa)).join(', ')}</p>` : ''}
      ${trescNieznanych()}
      ${trescImportu()}`;
  }

  // Nieznane breloki z terminali (ostatnie 30 dni; zapisujemy tylko 4 ostatnie cyfry). Żeby przypisać — przyłóż brelok do czytnika w formularzu wyżej.
  function trescNieznanych() {
    const n = S.nieznane;
    if (n === null) return '';
    return `<h3>Nieznane breloki · ostatnie 30 dni · ${n.length}</h3>
      <p class="slaby">Ktoś przyłożył brelok, którego nie ma w systemie. Pokazujemy tylko 4 ostatnie cyfry. Żeby go przypisać, wybierz osobę, kliknij „Numer karty” i przyłóż ten brelok do czytnika.</p>
      <div class="lista">${n.map(x => `<article class="zlecenie"><div class="opis"><div class="tytul"><b>…${esc(x.koncowka)}</b> ${znacznik(x.ile + '×', 'uwaga')}</div>
        <div class="szczegoly"><span>ostatnio ${esc(new Date(x.ostatnio).toLocaleString('pl-PL'))}</span><span>· terminal: ${esc(x.urzadzenie || '—')}</span></div></div></article>`).join('')
        || '<p class="pusto">Żaden nieznany brelok nie był przykładany.</p>'}</div>`;
  }

  // ---- widok „Grafik” (prosty plan zmian: osoba × dzień; plan wolno zmieniać, odbicia nie)
  function trescGrafiku() {
    const g = S.grafik;
    if (!g) return '<p class="pusto">Wczytuję…</p>';
    const dni = [0, 1, 2, 3, 4, 5, 6].map(i => dodajDni(S.tydzien, i));
    const plan = new Map((g.wpisy || []).map(w => [`${w.pracownik}|${w.dzien}`, w.zmiana]));
    const zmiany = Object.entries(g.zmiany || {});
    const maja = new Set((S.karty || []).map(k => k.pracownik));
    // Wiersze: osoby z brelokiem (to oni odbijają się na terminalu) + każdy, kto ma plan w tym tygodniu.
    const osoby = osobyRcp().filter(p => maja.has(p.id) || dni.some(d => plan.has(`${p.id}|${d}`)))
      .sort((a, b) => String(a.nazwa).localeCompare(String(b.nazwa), 'pl'));
    // D95: zmiany, których plan zakładu tego dnia nie przewiduje, są wyszarzone (wybór nadal możliwy — plan niczego nie blokuje).
    const komorka = (p, d) => {
      const planowe = Hala.zmianyPlanowe ? Hala.zmianyPlanowe(d, g.plan_zmian, g.zmiany) : null;
      return `<td><select data-grafik data-pracownik="${esc(p.id)}" data-dzien="${d}" aria-label="${esc(p.nazwa)} ${d}">
        <option value="">—</option>${zmiany.map(([k, z]) => {
          const poza = planowe && !planowe.includes(k);
          return `<option value="${esc(k)}" title="${esc(z.od)}–${esc(z.do)}${poza ? ' — poza planem zakładu' : ''}"${poza ? ' class="poza-planem"' : ''}${plan.get(p.id + '|' + d) === k ? ' selected' : ''}>${esc(k)}</option>`;
        }).join('')}</select></td>`;
    };
    const startyZmian = zmiany.map(([k, z]) => `${esc(k)} o ${esc(String(z.od).replace(/^0/, ''))}`).join(', ');
    return `<div class="rcp-pasek">
        <button type="button" class="maly" data-akcja="tydzien-wstecz">${P.ik('strzalka-lewo', 14)}Poprzedni</button>
        <b>${esc(S.tydzien.split('-').reverse().join('.'))} – ${esc(dni[6].split('-').reverse().join('.'))}</b>
        <button type="button" class="maly" data-akcja="tydzien-dalej">Następny${P.ik('strzalka-prawo', 14)}</button>
        <button type="button" class="maly" data-akcja="kopiuj-tydzien">Kopiuj ten tydzień na następny</button>
      </div>
      <p class="slaby opis-widoku">Zmiany zaczynają się: ${startyZmian} — odbicie po starcie zmiany to spóźnienie. Bez planu zmianę
        podpowiada godzina wejścia. Breloki przypisujesz w części „Breloki”; tu pojawiają się osoby z brelokiem.</p>
      <div class="rcp-siatka-pudlo"><table class="rcp-siatka"><thead><tr><th>Osoba</th>${dni.map((d, i) => `<th>${DNI_TYG[i]} ${esc(d.slice(8))}.${esc(d.slice(5, 7))}</th>`).join('')}</tr></thead>
        <tbody>${osoby.map(p => `<tr><th scope="row">${esc(p.nazwa)}</th>${dni.map(d => komorka(p, d)).join('')}</tr>`).join('')
          || '<tr><td colspan="8" class="pusto">Brak osób z brelokiem — przypisz je w części „Breloki”.</td></tr>'}</tbody></table></div>`;
  }

  // ---- widok „Plik dla płac”
  function trescEksportu() {
    return `<p class="slaby opis-widoku">Plik zawiera tylko dni ZATWIERDZONE (płace nie dostają niesprawdzonych godzin). Układ kolumn jest tymczasowy —
        dostosujemy go do wzoru z IMAG/Wapro, gdy go dostarczysz.</p>
      <form class="rcp-eksport" autocomplete="off">
        <label>Od<input type="date" name="od" value="${esc(S.od)}" required></label>
        <label>Do<input type="date" name="do" value="${esc(S.do)}" required></label>
        <label>Format<select name="format"><option value="csv"${S.eksport.format === 'csv' ? ' selected' : ''}>CSV (Excel, średnik)</option><option value="txt"${S.eksport.format === 'txt' ? ' selected' : ''}>TXT (tabulator)</option></select></label>
        <label class="rcp-wybor"><input type="checkbox" name="wszystkie"${S.eksport.wszystkie ? ' checked' : ''}> Także niezatwierdzone (tylko podgląd roboczy)</label>
        <button type="submit" class="glowny">Pobierz plik</button>
        <p class="blad" role="alert" hidden></p>
      </form>`;
  }

  // ---- szkielet i rysowanie
  const CZESCI = [['dni', 'Dni'], ['grafik', 'Grafik'], ['karty', 'Breloki'], ['wnioski', 'Wnioski urlopowe'], ['eksport', 'Plik dla płac']];

  function rysujTresc() {
    if (!korzen) return;
    const t = korzen.querySelector('.rcp-tresc');
    const aktywny = document.activeElement;
    const zapamietaj = aktywny && t.contains(aktywny) && aktywny.dataset ? aktywny.dataset.pole : null;
    const html = S.blad ? `<p class="blad" role="alert">${esc(S.blad)}</p>${S.czesc === 'dni' ? trescDni() : ''}`
      : (S.czesc === 'dni' ? trescDni() : S.czesc === 'grafik' ? trescGrafiku() : S.czesc === 'karty' ? trescKart() : S.czesc === 'wnioski' ? trescWnioskow() : trescEksportu());
    if (t.innerHTML !== html) {
      t.innerHTML = html;
      if (zapamietaj) { const el = t.querySelector(`[data-pole="${zapamietaj}"]`); if (el) { el.focus(); if (el.setSelectionRange && el.type === 'search') el.setSelectionRange(el.value.length, el.value.length); } }
    }
    for (const b of korzen.querySelectorAll('[data-rcp-czesc]')) {
      b.setAttribute('aria-pressed', String(b.dataset.rcpCzesc === S.czesc));
      if (b.dataset.rcpCzesc === 'wnioski') b.textContent = liczbaOczekujacych() ? `Wnioski urlopowe · ${liczbaOczekujacych()}` : 'Wnioski urlopowe';
    }
  }

  async function wykonaj(wywolanie, sukces) {
    try { await wywolanie(); if (sukces) P.komunikat(sukces, 'ok'); await wczytaj(); }
    catch (e) { P.komunikat(tekstBledu(e), 'blad'); }
  }

  function zbudujSzkielet(el) {
    el.innerHTML = `<section class="rcp" aria-label="Rejestracja czasu pracy">
      <div class="chipy" role="group" aria-label="Część RCP">${CZESCI.map(([k, n]) => `<button type="button" class="chip" data-rcp-czesc="${k}" aria-pressed="${k === S.czesc}">${esc(n)}</button>`).join('')}</div>
      <div class="rcp-tresc"></div></section>`;
    korzen = el.querySelector('.rcp');

    korzen.addEventListener('click', async ev => {
      const cz = ev.target.closest('[data-rcp-czesc]');
      if (cz) { S.czesc = cz.dataset.rcpCzesc; S.blad = ''; rysujTresc(); if (S.czesc !== 'eksport') { if (S.czesc === 'grafik') S.grafik = null; wczytaj(); } return; }
      const f = ev.target.closest('[data-filtr]');
      if (f) { S.filtr = f.dataset.filtr; rysujTresc(); return; }
      const b = ev.target.closest('[data-akcja]');
      if (!b) return;
      const wiersz = b.closest('[data-pracownik]');
      const pracownik = wiersz && wiersz.dataset.pracownik, dzien = wiersz && wiersz.dataset.dzien;
      switch (b.dataset.akcja) {
        case 'odswiez': await wczytaj(); break;
        case 'tydzien-wstecz': S.tydzien = dodajDni(S.tydzien, -7); S.grafik = null; rysujTresc(); await wczytaj(); break;
        case 'tydzien-dalej': S.tydzien = dodajDni(S.tydzien, 7); S.grafik = null; rysujTresc(); await wczytaj(); break;
        case 'kopiuj-tydzien':
          if (await P.potwierdz('Skopiować plan?', 'Plan tego tygodnia zastąpi plan następnego (dla osób, które mają wpisy w tym tygodniu).', 'Kopiuj'))
            await wykonaj(() => api('POST', 'grafik', { kopiuj_tydzien_od: S.tydzien }), 'Plan skopiowany na następny tydzień');
          break;
        case 'popraw': { const k = wiersz.dataset.klucz; if (S.otwarte.has(k)) S.otwarte.delete(k); else S.otwarte.add(k); rysujTresc(); break; }
        case 'zatwierdz': {
          const wd = (S.dni || []).find(d => d.pracownik === pracownik && d.dzien === dzien);
          const uwagi = wd && wd.anomalie.length;
          if (uwagi && !(await P.potwierdz('Zatwierdzić dzień z uwagami?', wd.anomalie.map(W.rcpUwaga).join(', ') + '. Zatwierdź tylko, jeśli to się zgadza.', 'Zatwierdź'))) break;
          await wykonaj(() => api('POST', 'zatwierdz', { pracownik, dzien, swiadomie: !!uwagi }), 'Dzień zatwierdzony');
          break;
        }
        case 'wycofaj': {
          const powod = await P.zapytajTekst({ tytul: 'Wycofać zatwierdzenie?', etykieta: 'Dlaczego? (zostanie zapisane)', wymagany: true, przycisk: 'Wycofaj' });
          if (powod) await wykonaj(() => api('POST', 'wycofaj', { pracownik, dzien, powod }), 'Zatwierdzenie wycofane');
          break;
        }
        case 'anuluj': {
          const powod = await P.zapytajTekst({ tytul: 'Anulować odbicie?', etykieta: 'Dlaczego? (odbicie zostaje w dzienniku, ale nie liczy się do godzin)', wymagany: true, przycisk: 'Anuluj odbicie', wstecz: 'Nie' });
          if (powod) await wykonaj(() => api('POST', 'anuluj', { odbicie: b.dataset.odbicie, powod }), 'Odbicie anulowane');
          break;
        }
        case 'lista-zapisz': {
          try {
            const w = await api('POST', 'import', { lista: S.lista.tekst, zapisz: true });
            P.komunikat(`Założono konta: ${w.dodano}`, 'ok'); S.lista = null; await wczytaj();
          } catch (e) { P.komunikat(tekstBledu(e), 'blad'); }
          break;
        }
        case 'wniosek-zatwierdz': case 'wniosek-odrzuc': {
          const id = b.closest('[data-wniosek]').dataset.wniosek, zatwierdz = b.dataset.akcja === 'wniosek-zatwierdz';
          const w = (S.wnioski || []).find(x => String(x.id) === id);
          if (zatwierdz) {
            if (await P.potwierdz('Zatwierdzić wniosek?', `${w ? w.nazwa + ': ' + dataPl(w.od) + ' – ' + dataPl(w.do) : ''}. Urlop wpisze się do Administracji → Urlopy.`, 'Zatwierdź'))
              await wykonaj(() => api('POST', 'wniosek/decyzja', { id, decyzja: 'zatwierdz' }), 'Wniosek zatwierdzony, urlop wpisany');
          } else {
            const powod = await P.zapytajTekst({ tytul: 'Odrzucić wniosek?', etykieta: 'Powód (zobaczy go pracownik)', wymagany: true, przycisk: 'Odrzuć', wstecz: 'Nie' });
            if (powod) await wykonaj(() => api('POST', 'wniosek/decyzja', { id, decyzja: 'odrzuc', powod }), 'Wniosek odrzucony');
          }
          break;
        }
        case 'odepnij': {
          if (await P.potwierdz('Odpiąć brelok?', 'Osoba nie będzie mogła odbijać się tym brelokiem, aż przypiszesz nowy.', 'Odepnij'))
            await wykonaj(() => api('POST', 'karty', { pracownik, odepnij: true }), 'Brelok odpięty');
          break;
        }
        default: break;
      }
    });

    korzen.addEventListener('change', ev => {
      if (ev.target.dataset && ev.target.dataset.grafik !== undefined) {
        const { pracownik, dzien } = ev.target.dataset;
        wykonaj(() => api('POST', 'grafik', { pracownik, dni: [dzien], zmiana: ev.target.value || null }), '');
        return;
      }
      const p = ev.target.dataset && ev.target.dataset.pole;
      if (p === 'od' || p === 'do') { S[p] = ev.target.value; if (S.od && S.do) wczytaj(); }
    });
    korzen.addEventListener('toggle', ev => { if (ev.target.classList && ev.target.classList.contains('rcp-lista')) S.listaOtwarta = ev.target.open; }, true);
    korzen.addEventListener('input', ev => {
      if (ev.target.name === 'lista' && S.lista) S.lista = { tekst: ev.target.value, podglad: null };   // zmiana tekstu unieważnia podgląd
      if (ev.target.dataset && ev.target.dataset.pole === 'szukaj') { S.szukaj = ev.target.value; rysujTresc(); }
    });

    korzen.addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = ev.target, blad = f.querySelector('.blad');
      const pokazBlad = t => { if (blad) { blad.textContent = t; blad.hidden = !t; } };
      if (f.classList.contains('rcp-korekta')) {
        const wiersz = f.closest('[data-pracownik]');
        const czas = f.czas.value ? new Date(f.czas.value).toISOString() : '';
        await wykonaj(() => api('POST', 'korekta', { pracownik: wiersz.dataset.pracownik, rodzaj: f.rodzaj.value, czas, powod: f.powod.value.trim() }), 'Odbicie dodane');
      } else if (f.classList.contains('rcp-lista-formularz')) {
        S.lista = { tekst: f.lista.value, podglad: null };
        try {
          S.lista.podglad = await api('POST', 'import', { lista: f.lista.value });
          S.listaOtwarta = true; pokazBlad(''); rysujTresc();
        } catch (e) { pokazBlad(tekstBledu(e)); }
      } else if (f.classList.contains('rcp-pula-formularz')) {
        await wykonaj(() => api('POST', 'pule', { pracownik: f.dataset.pracownik, rok: f.rok.value, dni: f.dni.value }), 'Pula urlopu zapisana');
      } else if (f.classList.contains('rcp-karta-formularz')) {
        try {
          const w = await api('POST', 'karty', { pracownik: f.pracownik.value, karta: f.karta.value.trim() });
          P.komunikat(`Brelok przypisany: ${w.nazwa}`, 'ok'); f.karta.value = ''; await wczytaj();
        } catch (e) { pokazBlad(tekstBledu(e)); }
      } else if (f.classList.contains('rcp-eksport')) {
        S.od = f.od.value; S.do = f.do.value; S.eksport = { format: f.format.value, wszystkie: f.wszystkie.checked };
        try {
          const w = await api('GET', `eksport?od=${S.od}&do=${S.do}&format=${S.eksport.format}${S.eksport.wszystkie ? '&wszystkie=1' : ''}`);
          if (!w.wiersze) { pokazBlad('Brak zatwierdzonych dni w tym okresie — nie ma czego pobrać.'); return; }
          pokazBlad('');
          const blob = new Blob(['﻿' + w.tresc], { type: S.eksport.format === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = w.nazwa_pliku;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          P.komunikat(`Pobrano ${w.nazwa_pliku} (${w.wiersze} wierszy)`, 'ok');
        } catch (e) { pokazBlad(tekstBledu(e)); }
      }
    });
  }

  function rysuj(el) {
    if (!korzen || !el.contains(korzen)) { korzen = null; zbudujSzkielet(el); rysujTresc(); wczytaj(); return; }
    // Panel woła rysuj() przy każdym zdarzeniu z huba — dane odświeżamy tylko co minutę i tylko na liście dni.
    if ((S.czesc === 'dni' || S.czesc === 'wnioski') && Date.now() - ostatnieOdswiezenie > ODSWIEZ_MS) wczytaj();
  }

  P.widoki.rcp = { rysuj };
})();
