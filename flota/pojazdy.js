/* Ekrany floty: pulpit, kartoteka pojazdów, karta jednego auta, terminy.
   To jest ta część programu, w której biuro spędza cały dzień — więc liczy się
   czytelność listy stu aut, a nie efekty.

   Stanów terminów NIE liczymy tutaj drugi raz. Serwer dokłada do każdego
   pojazdu i każdego terminu gotowe `stan` i `dni` (stan_terminow w flotex.py);
   własna kopia tej reguły w przeglądarce rozjeżdżałaby się z tą, po której
   idą alarmy mailowe — i biuro widziałoby na ekranie inny kolor niż w skrzynce. */

/* ------------------------------------------------------------ narzędzia */

const RODZAJE_POJAZDU = ['osobowy', 'dostawczy', 'ciezarowy', 'przyczepa', 'maszyna'];
const NAZWY_RODZAJU = {
  osobowy: 'osobowy', dostawczy: 'dostawczy', ciezarowy: 'ciężarowy',
  przyczepa: 'przyczepa', maszyna: 'maszyna',
};

/* Opis terminu w jednym zdaniu, po polsku, z odmianą. „za 1 dni" na liście
   stu aut czyta się jak usterka programu, a nie jak termin.                 */
function opisTerminu(dni) {
  if (dni === null || dni === undefined) return 'data nieczytelna';
  if (dni < 0) return `${-dni} ${odmiana(-dni, 'dzień', 'dni', 'dni')} po terminie`;
  if (dni === 0) return 'dziś mija termin';
  if (dni === 1) return 'jutro mija termin';
  return `za ${dni} ${odmiana(dni, 'dzień', 'dni', 'dni')}`;
}

/* Ile zapisów czeka w telefonach kierowców. Serwer oddaje LISTĘ wierszy
   {imie, ile}, a nie liczbę — a pusta lista jest w JavaScripcie prawdziwa,
   więc `if (lista)` zapalało wstęgę także wtedy, gdy nie czekało nic.       */
function czekaWTelefonach(lista) {
  return (lista || []).reduce((suma, w) => suma + (Number(w.ile) || 0), 0);
}

function nazwaPojazdu(p) {
  return [p.marka, p.model].filter(Boolean).join(' ') || 'bez opisu';
}

/* Plakietka najbliższego terminu pojazdu. Pojazd bez żadnej wpisanej daty
   dostaje szarą „brak dat", a nie zielone „ok" — zielone znaczyłoby, że ktoś
   sprawdził i jest dobrze, a tu po prostu nikt nic nie wpisał.              */
function plakietkaTerminu(t) {
  if (!t || !t.najblizszy) {
    return '<span class="plakietka">brak dat</span>';
  }
  return `<span class="plakietka p-${escHtml(t.stan)}">${escHtml(t.najblizszy.nazwa)}
          — ${escHtml(opisTerminu(t.dni))}</span>`;
}

/* ------------------------------------------------------------- PULPIT */

EKRANY.pulpit = {
  tytul: 'Pulpit',
  tylkoBiuro: true,
  poSynchronizacji() { if (stan.ekran === 'pulpit') odswiezEkran(); },

  async rysuj(pole) {
    const d = await sprobuj(() => API.get('/api/pulpit'));
    if (!d) { pole.innerHTML = '<div class="pusto">Nie udało się wczytać pulpitu.</div>'; return; }
    const kaf = d.kafelki || {};
    const klasa = (ile, pilne) => !ile ? 'zero' : (pilne || '');

    pole.innerHTML = `
      ${wstegiAlarmow(d.alarmy_systemu)}
      ${kafelekNaStart(kaf)}

      <div class="karta">
        <div class="karta-gora">
          <h2>${escHtml(d.firma || 'Flota')}</h2>
          <span class="slaby male">${escHtml(miesiacSlownie(d.okres))}</span>
        </div>
        <div class="kafelki">
          <button type="button" data-kafel="terminy" class="${klasa(kaf.po_terminie, 'pilne')}">
            <span class="etykieta">Po terminie</span><b>${kaf.po_terminie || 0}</b></button>
          <button type="button" data-kafel="terminy" class="${klasa(kaf.terminy_w_oknie, 'uwaga')}">
            <span class="etykieta">Terminy w ciągu ${Number(kaf.okno_dni) || 30} ${
              odmiana(Number(kaf.okno_dni) || 30, 'dnia', 'dni', 'dni')}</span><b>${
              kaf.terminy_w_oknie || 0}</b></button>
          <button type="button" data-kafel="zalegle" class="${klasa(kaf.zalegle, 'uwaga')}">
            <span class="etykieta">Zaległe przeglądy</span><b>${kaf.zalegle || 0}</b></button>
          <button type="button" data-kafel="usterki" class="${klasa(kaf.usterki, 'uwaga')}">
            <span class="etykieta">Otwarte usterki</span><b>${kaf.usterki || 0}</b></button>
          <button type="button" data-kafel="do-zatwierdzenia"
                  class="${klasa(kaf.do_zatwierdzenia, 'uwaga')}">
            <span class="etykieta">Do zatwierdzenia</span><b>${kaf.do_zatwierdzenia || 0}</b></button>
        </div>
        <p class="slaby male" style="margin:12px 0 0">
          Aut w kartotece: <b>${kaf.auta || 0}</b>${(d.bez_kierowcy || []).length
            ? ` · bez przypisanego kierowcy: <b>${d.bez_kierowcy.length}</b>` : ''}
        </p>
      </div>

      ${czekaWTelefonach(d.w_telefonach) ? `<div class="wstega info">
        W telefonach kierowców czeka ${czekaWTelefonach(d.w_telefonach)}
        ${odmiana(czekaWTelefonach(d.w_telefonach), 'zapis', 'zapisy', 'zapisów')}
        do wysłania (${d.w_telefonach.map(w => escHtml(w.imie)).join(', ')}).
        To nie jest zaległość — dojdą, gdy telefon złapie zasięg.</div>` : ''}

      ${d.instrukcja_gotowa === false ? `<div class="wstega blad">
        <b>Pomoc w drodze jest pusta.</b>
        Kierowca na poboczu nic w niej nie znajdzie.
        <button class="tekstowy" id="p-do-instrukcji">Uzupełnij teraz</button></div>` : ''}

      ${(d.do_sprawdzenia || []).length ? `<div class="wstega uwaga">
        Podejrzany skok licznika w tym miesiącu:
        ${d.do_sprawdzenia.map(w => escHtml(w.rejestracja)).join(', ')}.
        Sprawdź, czy to nie pomyłka w odczycie.</div>` : ''}

      <h3>Terminy do pilnowania${d.alarmow > (d.alarmy || []).length
        ? ` <span class="slaby male">(pokazuję ${d.alarmy.length} z ${d.alarmow})</span>` : ''}</h3>
      <div id="p-alarmy">${listaAlarmow(d.alarmy || [])}</div>

      <h3>Przeglądy zaległe za ${escHtml(d.okres ? miesiacSlownie(d.okres) : 'ten miesiąc')}</h3>
      <div id="p-zalegle">${listaZaleglych(d.zalegle || [])}</div>

      ${(d.usterki || []).length ? `<h3>Otwarte usterki</h3>
        <div id="p-usterki">${listaUsterekPulpitu(d.usterki)}</div>` : ''}
    `;

    pole.querySelectorAll('[data-pojazd]').forEach(el => {
      el.onclick = () => pokazEkran('pojazd', { id: Number(el.dataset.pojazd) });
    });
    pole.querySelectorAll('[data-kafel]').forEach(b => {
      b.onclick = () => otworzKafelPulpitu(b.dataset.kafel, pole);
    });
    podepnijWstegiAlarmow(pole);
    const doInstrukcji = pole.querySelector('#p-do-instrukcji');
    if (doInstrukcji) doInstrukcji.onclick = () => pokazEkran('awaria');
    const pierwszeAuto = pole.querySelector('#p-start-auto');
    if (pierwszeAuto) pierwszeAuto.onclick = () => oknoPojazdu(null);
  },
};

/* „Na start” (UI etap 3) — świeży program miał pusty pulpit z samymi zerami
   i nic nie mówiło, od czego zacząć. Cztery kroki w kolejności, w jakiej
   naprawdę trzeba je zrobić. Karta znika, gdy w kartotece jest pierwsze auto
   — dalej pulpit sam pokazuje, czego brakuje (terminy, instrukcja, kierowcy). */
function kafelekNaStart(kaf) {
  if ((kaf || {}).auta) return '';
  return `<div class="karta" id="p-na-start">
    <h2 style="margin-top:0">Na start</h2>
    <ol class="na-start">
      <li><b>Dodaj auta</b> — sam numer rejestracyjny wystarczy, resztę dopiszesz później.</li>
      <li><b>Wpisz terminy</b> (badanie techniczne, OC) w menu <b>${ikonka('kalendarz')}Terminy</b> — program
        przypomni, zanim miną.</li>
      <li><b>Zaproś kierowców</b> — <b>${ikonka('zaproszenie')}Zaproś kierowcę</b> (kod QR do telefonu), potem
        w karcie auta „Przypisz” kierowcę.</li>
      <li><b>Uzupełnij ${ikonka('ratunek')}Instrukcję w razie awarii</b> — kierowca otworzy ją także bez zasięgu.</li>
    </ol>
    <button class="glowny" id="p-start-auto">+ Dodaj pierwsze auto</button>
  </div>`;
}

/* Dokąd prowadzi kafelek pulpitu. Terminy i zaległe przeglądy mają swoją
   listę na tym samym pulpicie, liczoną z tych samych danych co liczba
   (ekran „Terminy” pokazuje wszystkie daty, nie tylko pilne),
   więc przewijamy do niej. Usterki i przeglądy do zatwierdzenia otwierają
   swój ekran z filtrem, który daje dokładnie te pozycje.                   */
function celKafelkaPulpitu(kafel) {
  return {
    terminy: { przewin: 'p-alarmy' },
    zalegle: { przewin: 'p-zalegle' },
    usterki: { ekran: 'usterki', filtr: '_filtrUsterek', wartosc: { status: '' } },
    'do-zatwierdzenia': { ekran: 'przeglady', filtr: '_filtrProtokolow',
                          wartosc: { status: 'wykonany', okres: '' } },
  }[kafel] || null;
}

function otworzKafelPulpitu(kafel, pole) {
  const cel = celKafelkaPulpitu(kafel);
  if (!cel) return;
  if (cel.ekran) {
    stan[cel.filtr] = Object.assign({}, cel.wartosc);
    pokazEkran(cel.ekran);
    return;
  }
  // Do nagłówka nad listą — sama lista zaczynałaby się bez tytułu.
  const lista = pole.querySelector('#' + cel.przewin);
  if (lista) (lista.previousElementSibling || lista).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function listaAlarmow(alarmy) {
  if (!alarmy.length) {
    return `<div class="pusto"><span class="duza-ikona">${GKIkony.html('kalendarz', 38)}</span>
            Żaden termin nie zbliża się do końca. Nic nie wymaga reakcji.</div>`;
  }
  return alarmy.map(a => `
    <button class="pozycja s-${escHtml(a.stan)}" data-pojazd="${a.pojazd}">
      <span class="numer">${escHtml(a.rejestracja || '')}</span>
      <span class="srodek">
        <span class="nazwa">${escHtml(a.nazwa || a.rodzaj || 'termin')}</span>
        <span class="adres">${escHtml(a.rejestracja || '')}${a.kierowca_imie
          ? ' · ' + escHtml(a.kierowca_imie) : ' · bez kierowcy'}</span>
        ${a.termin ? `<span class="dopisek slaby">do ${escHtml(polskaData(a.termin))}</span>` : ''}
      </span>
      <span class="prawo">
        <span class="plakietka p-${escHtml(a.stan)}">${escHtml(opisTerminu(a.dni))}</span>
      </span>
    </button>`).join('');
}

function listaZaleglych(zalegle) {
  if (!zalegle.length) {
    return `<div class="pusto"><span class="duza-ikona">${GKIkony.html('ok-kolo', 38)}</span>
            Wszystkie przeglądy za ten miesiąc są już oddane.</div>`;
  }
  return zalegle.map(z => `
    <button class="pozycja s-${escHtml(z.status === 'brak' ? 'zalegly' : z.status)}"
            data-pojazd="${z.pojazd}">
      <span class="numer">${escHtml(z.rejestracja || '')}</span>
      <span class="srodek">
        <span class="nazwa">${escHtml(z.rejestracja)} · ${escHtml(
          [z.marka, z.model].filter(Boolean).join(' ') || 'bez opisu')}</span>
        <span class="adres">${z.kierowca_imie
          ? escHtml(z.kierowca_imie) : 'brak — auto nie jest nikomu przypisane'}</span>
        ${z.powod ? `<span class="dopisek">Odrzucony: ${escHtml(z.powod)}</span>` : ''}
      </span>
      <span class="prawo">
        <span class="plakietka p-${escHtml(z.status === 'brak' ? 'zalegly' : z.status)}">${
          escHtml(z.status === 'brak' ? 'nie oddany' : (OPIS_STATUSU[z.status] || z.status))}</span>
      </span>
    </button>`).join('');
}

function listaUsterekPulpitu(usterki) {
  return usterki.map(u => `
    <button class="pozycja s-${escHtml(u.status)}" data-pojazd="${u.pojazd}">
      <span class="numer">${escHtml(u.rejestracja || '')}</span>
      <span class="srodek">
        <span class="nazwa">${escHtml(u.opis)}</span>
        <span class="adres">${escHtml(u.rejestracja || '')} · zgłoszona
          ${escHtml(polskaData(u.utworzono))}</span>
      </span>
      <span class="prawo">
        <span class="plakietka p-${escHtml(u.waga)}">${escHtml(opisKodu(OPIS_WAGI, u.waga))}</span>
        <span class="plakietka p-${escHtml(u.status)}">${escHtml(opisKodu(OPIS_USTERKI, u.status))}</span>
      </span>
    </button>`).join('');
}

/* ------------------------------------------------------- KARTOTEKA FLOTY */

EKRANY.pojazdy = {
  tytul: 'Flota',
  poSynchronizacji() { if (stan.ekran === 'pojazdy') odswiezEkran(); },

  async rysuj(pole) {
    const f = filtrOsoby('_filtrFloty', { rodzaj: '', wszystkie: false, sortuj: '' });
    const pyt = new URLSearchParams();
    if (f.rodzaj) pyt.set('rodzaj', f.rodzaj);
    if (f.wszystkie) pyt.set('wszystkie', '1');
    const biuro = jestBiuro();
    const lista = posortujFlote(await sprobuj(() => API.get('/api/pojazdy?' + pyt.toString())) || [],
      biuro ? f.sortuj : '');
    stan.pojazdy = lista;

    pole.innerHTML = `
      <div class="pasek-narzedzi">
        ${biuro ? `<label>Rodzaj<select id="p-rodzaj">
          <option value="">wszystkie</option>
          ${RODZAJE_POJAZDU.map(r => `<option value="${r}"${f.rodzaj === r ? ' selected' : ''}>${
            escHtml(NAZWY_RODZAJU[r])}</option>`).join('')}
        </select></label>
        <label class="male"><input type="checkbox" id="p-wszystkie"${
          f.wszystkie ? ' checked' : ''}> pokaż wycofane</label>
        ${polaSortowania(f.sortuj, OPCJE_SORTOWANIA_FLOTY)}
        <button class="glowny" id="p-nowy">+ Dodaj auto</button>` : ''}
      </div>
      ${lista.length ? tabelaFloty(lista, biuro) : `<div class="pusto">
        <span class="duza-ikona">${GKIkony.html('pojazd', 38)}</span>
        ${f.rodzaj ? 'Nic nie pasuje do tych warunków.'
          : (biuro ? 'Nie ma jeszcze żadnego auta — dodaj pierwsze.'
                   : 'Nie masz przypisanego żadnego auta. Zgłoś to biuru.' + kontaktBiura())}</div>`}
    `;

    // Szukanie po tekście jest tylko w nagłówku (#gora-szukaj): jedno pole, jedno
    // zachowanie (wyniki w trakcie pisania, skok do auta, usterki albo przeglądu).
    // Drugie pole „Szukaj” (z Enter) obok niego było mylące, więc go tu nie ma.
    if (biuro) {
      pole.querySelector('#p-rodzaj').onchange = e => { f.rodzaj = e.target.value; odswiezEkran(); };
      pole.querySelector('#p-wszystkie').onchange = e => {
        f.wszystkie = e.target.checked; odswiezEkran();
      };
      pole.querySelector('#sortowanie').onchange = e => { f.sortuj = e.target.value; odswiezEkran(); };
      pole.querySelector('#p-nowy').onclick = () => oknoPojazdu(null);
    }
    pole.querySelectorAll('[data-pojazd]').forEach(el => {
      el.onclick = () => pokazEkran('pojazd', { id: Number(el.dataset.pojazd) });
    });
  },
};

/* D15 (decyzja właściciela 2026-11-25): sortowanie kartoteki i Terminów na wierzchu, jak w Przeglądach i Usterkach
   (STYL-GK §6): „Domyślnie” zostawia kolejność z programu, obok jawne tryby. Wybór jest pamiętany na osobę razem
   z filtrami (filtrOsoby, klucz `sortuj`); nieznana zapisana wartość wraca do „Domyślnie”. Tylko klient. */
const OPCJE_SORTOWANIA_FLOTY = [['', 'Domyślnie'], ['rejestracja', 'Rejestracja A → Z'],
  ['termin', 'Najpilniejszy termin'], ['przebieg', 'Przebieg: od największego'], ['kierowca', 'Kierowca A → Z']];
const OPCJE_SORTOWANIA_TERMINOW = [['', 'Domyślnie'], ['pozne', 'Najpóźniejsze najpierw'],
  ['rejestracja', 'Rejestracja A → Z']];
function porownajTekst(a, b) {
  return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), 'pl', { sensitivity: 'base', numeric: true });
}
/* Auta bez kierowcy / bez terminu / bez przebiegu zawsze na końcu. */
function posortujFlote(lista, tryb) {
  const dni = p => (p.terminy && typeof p.terminy.dni === 'number') ? p.terminy.dni : Infinity;
  const porownania = {
    rejestracja: (a, b) => porownajTekst(a.rejestracja, b.rejestracja),
    termin: (a, b) => (dni(a) === dni(b) ? 0 : (dni(a) < dni(b) ? -1 : 1)),
    przebieg: (a, b) => ((a.przebieg == null) - (b.przebieg == null))
      || (Number(b.przebieg) || 0) - (Number(a.przebieg) || 0),
    kierowca: (a, b) => (!a.kierowca_imie - !b.kierowca_imie) || porownajTekst(a.kierowca_imie, b.kierowca_imie),
  };
  const cmp = porownania[tryb];
  if (!cmp) return lista;
  return lista.map((x, i) => [x, i]).sort((a, b) => cmp(a[0], b[0]) || a[1] - b[1]).map(x => x[0]);
}
function posortujTerminy(lista, tryb) {
  if (tryb === 'pozne') return lista.slice().reverse();
  if (tryb === 'rejestracja') {
    return lista.map((x, i) => [x, i])
      .sort((a, b) => porownajTekst(a[0].rejestracja, b[0].rejestracja) || a[1] - b[1]).map(x => x[0]);
  }
  return lista;
}

/* Stałe pole „Szukaj” w nagłówku (#gora-szukaj, index.html; podpina je app.js).
   Od 26.11 (decyzja właściciela) szuka PROGRAM: GET /api/szukaj?q=…&ile=… (flotex.py → a_szukaj) — w autach
   (rejestracja, marka, model, VIN dla biura, kierowca, najbliższy termin; dla biura też daty i polisy), usterkach
   (opis, rejestracja, kto zgłosił, status, waga), przeglądach (rejestracja, kierowca, miesiąc, status) i terminach.
   Telefon nie pobiera już trzech list po 500 wierszy. Uprawnienia robi program (te same funkcje co listy):
   kierowca dostaje tylko swoje auto i bez imion/notatek innych osób. Bez programu — szukanie w tym, co ten
   telefon/komputer ma w pamięci odpowiedzi (szukajZPamieci), z dopiskiem, a gdy nie ma nic — komunikat.
   Zmiana osoby (szukajZapomnij) czyści pole, wyniki i odrzuca odpowiedzi „w locie”. Wyniki są klikalne:
   auto → karta auta, usterka → karta jej auta (kierowca: lista usterek), przegląd → protokół (kierowca: lista
   przeglądów), termin → Terminy tego auta (kierowca: karta auta).                                         */
const SZUKAJ_MIN = 2;
const SZUKAJ_W_GRUPIE = 8;         // tyle wyników w grupie na start; reszta pod „Pokaż wszystkie”
const SZUKAJ_WSZYSTKIE = 50;       // „Pokaż wszystkie”: tyle w grupie odda program (SZUKAJ_MAKS_W_GRUPIE)
let szukajEpoka = 0;               // rośnie przy zmianie osoby: odpowiedzi „w locie” poprzedniej osoby giną
let szukajWyczysc = null;          // ustawia podepnijSzukajGora: czyści pole, wyniki i licznik

function normalizujSzukane(t) {
  return String(t == null ? '' : t).toLowerCase()
    .replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/* Zmiana osoby (wylogowanie, inne logowanie): tekst w polu, wyniki i odpowiedzi, które jeszcze nie doszły,
   poprzedniej osoby nie mogą trafić do następnej. Woła zapomnijStanOsoby() z app.js.  */
function szukajZapomnij() {
  szukajEpoka++;
  if (szukajWyczysc) szukajWyczysc();
}

/* Po zapisie nic nie trzeba unieważniać: każde szukanie pyta program o stan bieżący. Funkcja zostaje, bo woła ją
   API.zadanie() po każdym zapisie (miejsce na przyszłą pamięć wyników). */
function szukajPrzeterminuj() { /* szukanie bez własnej pamięci — zawsze świeże */ }

/* Mapowanie wierszy list na wyniki {rodzaj, id, pojazd, tytul, opis} — bez filtrowania (to robi program). */
function szukajMapuj(dane) {
  const auta = (dane.auta || dane.pojazdy || []).map(p => {
    const t = p.terminy && p.terminy.najblizszy;
    return { rodzaj: 'auto', id: p.id, pojazd: p.id, tytul: p.rejestracja,
      opis: [p.marka || p.model ? nazwaPojazdu(p) : '', p.kierowca_imie, p.aktywny ? '' : 'wycofane',
        t ? t.nazwa + ' — ' + opisTerminu(p.terminy.dni) : ''].filter(Boolean).join(' · ') };
  });
  const usterki = (dane.usterki || []).map(u => ({ rodzaj: 'usterka', id: u.id, pojazd: u.pojazd,
    tytul: (u.rejestracja || '') + ' — ' + u.opis,
    opis: [opisKodu(OPIS_USTERKI, u.status), u.zglosil_imie ? 'zgłosił ' + u.zglosil_imie : ''].filter(Boolean).join(' · ') }));
  const przeglady = (dane.przeglady || []).map(g => ({ rodzaj: 'przeglad', id: g.id, pojazd: g.pojazd,
    tytul: (g.rejestracja || '') + ' — ' + (g.okres || ''),
    opis: [opisKodu(OPIS_STATUSU, g.status), g.kierowca_imie].filter(Boolean).join(' · ') }));
  const terminy = (dane.terminy || []).map(t => ({ rodzaj: 'termin', id: t.id, pojazd: t.pojazd,
    tytul: (t.rejestracja || '') + ' — ' + (t.nazwa || '') + ' ' + polskaData(t.termin),
    opis: t.dni == null ? '' : opisTerminu(t.dni) }));
  return { auta, usterki, przeglady, terminy };
}

/* Filtr bez programu (te same reguły co a_szukaj w flotex.py) na danych z pamięci urządzenia. */
function szukajWDanych(tekst, dane, biuro) {
  const slowa = normalizujSzukane(tekst).split(/\s+/).filter(Boolean);
  const pasuje = pola => {
    const s = normalizujSzukane(pola.filter(x => x != null && x !== '').join(' '));
    return slowa.every(w => s.includes(w));
  };
  // Terminy i polisy z list aut: daty i jako „10.12.2026” (jak na ekranie), i jako „2026-12-10”. Numer polisy
  // i ubezpieczyciela program oddaje tylko biuru (kierowca ich nie dostaje, więc ich też nie przeszuka).
  const terminyAuta = p => {
    const t = p.terminy && p.terminy.najblizszy;
    return [t ? t.nazwa : '', biuro ? polskaData(p.data_badania) : '', biuro ? p.data_badania : '',
      biuro ? polskaData(p.data_oc) : '', biuro ? p.data_oc : '',
      biuro ? polskaData(p.polisa_ac_do) : '', biuro ? p.polisa_ac_do : '',
      biuro ? p.polisa_nr : '', biuro ? p.ubezpieczyciel : ''];
  };
  // Usterki i przeglądy po rejestracji, a nie po marce i modelu auta: „mast” nie ma
  // zwracać wszystkich usterek każdego Mastera, tylko to, co ktoś o tym napisał.
  return szukajMapuj({
    auta: (dane.pojazdy || []).filter(p => pasuje([p.rejestracja, p.marka, p.model, p.rok,
      biuro ? p.vin : '', p.kierowca_imie, p.aktywny ? '' : 'wycofane'].concat(terminyAuta(p)))),
    usterki: (dane.usterki || []).filter(u => pasuje([u.rejestracja, u.opis, u.rozwiazanie,
      u.zglosil_imie, opisKodu(OPIS_USTERKI, u.status), opisKodu(OPIS_WAGI, u.waga)])),
    przeglady: (dane.przeglady || []).filter(g => pasuje([g.rejestracja, g.kierowca_imie,
      g.okres, g.uwagi, g.powod, opisKodu(OPIS_STATUSU, g.status)])),
    terminy: (dane.terminy || []).filter(t => pasuje([t.rejestracja, t.nazwa, polskaData(t.termin), t.termin,
      biuro ? t.dokument : '', biuro ? t.ubezpieczyciel : ''])),
  });
}

/* Listy z pamięci odpowiedzi tej osoby (app.js: odpowiedzZPamieci — klucz z id osoby, więc nigdy cudze).
   Pierwszy adres, który jest w pamięci, wygrywa. null = nic nie ma. */
const SZUKAJ_ADRESY_PAMIECI = {
  pojazdy: ['/api/pojazdy?wszystkie=1', '/api/pojazdy'],
  usterki: ['/api/usterki?status=wszystkie&ile=500', '/api/usterki?status=wszystkie', '/api/usterki'],
  przeglady: ['/api/przeglady?ile=500', '/api/przeglady'],
  terminy: ['/api/terminy'],
};
async function szukajZPamieci() {
  if (typeof odpowiedzZPamieci !== 'function') return null;
  const dane = {};
  let cos = false;
  for (const [grupa, adresy] of Object.entries(SZUKAJ_ADRESY_PAMIECI)) {
    dane[grupa] = [];
    for (const a of adresy) {
      const w = await odpowiedzZPamieci(a).catch(() => null);
      if (w && Array.isArray(w.dane)) { dane[grupa] = w.dane; cos = true; break; }
    }
  }
  return cos ? dane : null;
}

/* Wyniki dla tekstu: z programu, a bez niego — z pamięci (zPamieci: true). null = w międzyczasie zmieniła się
   osoba (wynik poprzedniej osoby nigdy nie trafia do następnej). */
async function szukajPobierz(tekst, ile) {
  const epoka = szukajEpoka;
  let w;
  try {
    w = await API.get('/api/szukaj?q=' + encodeURIComponent(tekst) + '&ile=' + ile);
  } catch (e) {
    if (epoka !== szukajEpoka) return null;
    const bezProgramu = !e || e.kod == null
      || (typeof KODY_BEZ_PROGRAMU !== 'undefined' && KODY_BEZ_PROGRAMU.indexOf(e.kod) >= 0);
    if (!bezProgramu) throw new Error('Nie udało się wyszukać — spróbuj za chwilę.');
    const zPamieci = await szukajZPamieci();
    if (epoka !== szukajEpoka) return null;
    if (!zPamieci) throw new Error('Szukanie wymaga połączenia z programem w biurze.');
    const m = szukajWDanych(tekst, zPamieci, jestBiuro());
    return Object.assign(m, { zPamieci: true,
      ile: { auta: m.auta.length, usterki: m.usterki.length, przeglady: m.przeglady.length, terminy: m.terminy.length } });
  }
  if (epoka !== szukajEpoka) return null;
  return Object.assign(szukajMapuj(w || {}), { ile: (w && w.ile) || {} });
}

function szukajOtworz(w, biuro) {
  if (w.rodzaj === 'przeglad') {
    if (biuro) pokazEkran('protokol', { id: w.id }); else pokazEkran('przeglady');
  } else if (w.rodzaj === 'usterka' && !biuro) {
    pokazEkran('usterki');
  } else if (w.rodzaj === 'termin' && biuro) {
    pokazEkran('terminy', { pojazd: w.pojazd });
  } else {
    pokazEkran('pojazd', { id: w.pojazd });
  }
}

function podepnijSzukajGora() {
  const pole = document.getElementById('gora-szukaj');
  const panel = document.getElementById('szukaj-wyniki');
  if (!pole || !panel || pole.dataset.podpiete) return;
  pole.dataset.podpiete = '1';
  let licznik = 0, zegar = null;
  const rozwiniete = new Set();                     // grupy z klikniętym „Pokaż wszystkie”
  const zamknij = () => { panel.hidden = true; panel.innerHTML = ''; };
  const komunikatPanelu = tekst => { panel.innerHTML = `<div class="szukaj-pusto">${escHtml(tekst)}</div>`; panel.hidden = false; };
  // Zmiana osoby: wynik wpisany przez poprzednią osobę nie może zostać w polu ani w panelu,
  // a odpowiedź, która jeszcze nie doszła, ma być odrzucona (licznik rośnie).
  szukajWyczysc = () => { licznik++; clearTimeout(zegar); rozwiniete.clear(); pole.value = ''; zamknij(); };

  async function szukaj() {
    const tekst = pole.value.trim();
    const moj = ++licznik;
    if (tekst.length < SZUKAJ_MIN) { zamknij(); return; }
    let w;
    try { w = await szukajPobierz(tekst, rozwiniete.size ? SZUKAJ_WSZYSTKIE : SZUKAJ_W_GRUPIE); }
    catch (e) { if (moj === licznik) komunikatPanelu(e && e.message || 'Nie udało się wyszukać.'); return; }
    if (!w || moj !== licznik) return;              // zmieniła się osoba albo wpisano już coś nowszego
    const biuro = jestBiuro();
    const grupy = [['Auta', 'auta'], ['Usterki', 'usterki'], ['Przeglądy', 'przeglady'], ['Terminy', 'terminy']]
      .map(([nazwa, klucz]) => [nazwa, w[klucz] || [], Math.max((w.ile || {})[klucz] || 0, (w[klucz] || []).length)]);
    const dopisek = w.zPamieci
      ? '<div class="szukaj-pusto">Bez połączenia z programem — wyniki z danych zapamiętanych w tym urządzeniu.</div>' : '';
    if (!grupy.some(g => g[1].length)) { komunikatPanelu('Nic nie znaleziono.'); panel.insertAdjacentHTML('beforeend', dopisek); return; }
    const wyniki = [];
    panel.innerHTML = dopisek + grupy.filter(g => g[1].length).map(([nazwa, lista, razem]) => {
      const pokaz = rozwiniete.has(nazwa) ? lista : lista.slice(0, SZUKAJ_W_GRUPIE);
      const wiecej = razem > pokaz.length && !rozwiniete.has(nazwa);
      return `
      <div class="szukaj-grupa">${nazwa} (${razem})</div>
      ${pokaz.map(x => { wyniki.push(x); return `<button type="button" class="szukaj-wynik"
        data-nr="${wyniki.length - 1}"><b>${escHtml(x.tytul)}</b><span>${escHtml(x.opis)}</span></button>`; }).join('')}
      ${wiecej ? `<button type="button" class="szukaj-wiecej" data-grupa="${escHtml(nazwa)}">Pokaż wszystkie (${razem})</button>` : ''}
      ${rozwiniete.has(nazwa) && razem > pokaz.length
        ? `<div class="szukaj-pusto">Pokazano ${pokaz.length} z ${razem} — wpisz więcej, żeby zawęzić.</div>` : ''}`;
    }).join('');
    panel.hidden = false;
    panel.querySelectorAll('.szukaj-wynik').forEach(b => {
      b.onclick = () => { const x = wyniki[Number(b.dataset.nr)]; zamknij(); pole.value = ''; szukajOtworz(x, biuro); };
    });
    panel.querySelectorAll('.szukaj-wiecej').forEach(b => {
      b.onclick = () => { rozwiniete.add(b.dataset.grupa); szukaj(); };
    });
  }

  pole.addEventListener('input', () => { clearTimeout(zegar); rozwiniete.clear(); zegar = setTimeout(szukaj, 250); });
  pole.addEventListener('focus', () => { if (pole.value.trim().length >= SZUKAJ_MIN) szukaj(); });
  pole.addEventListener('keydown', e => {
    if (e.key === 'Escape') { zamknij(); pole.blur(); }
    if (e.key === 'Enter') { clearTimeout(zegar); szukaj(); }
    if (e.key === 'ArrowDown') { const p = panel.querySelector('.szukaj-wynik'); if (p) { e.preventDefault(); p.focus(); } }
  });
  panel.addEventListener('keydown', e => {
    const b = [...panel.querySelectorAll('.szukaj-wynik, .szukaj-wiecej')], i = b.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && i < b.length - 1) { e.preventDefault(); b[i + 1].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? b[i - 1] : pole).focus(); }
    if (e.key === 'Escape') { zamknij(); pole.focus(); }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.gora-szukaj') && !e.target.closest('#szukaj-wyniki')) zamknij();
  });
}

/* D2 (2026-11-17): na telefonie lista aut to KARTY, nie tabela — w tabeli
   Przebieg i „Najbliższy termin” lądowały poza ekranem. Oba widoki są w tym
   samym HTML-u i przełącza je CSS (.flota-tabela / .flota-karty, granica
   820 px jak wszędzie); dane i kliknięcie (data-pojazd) są te same.        */
function kartyFloty(lista, biuro) {
  return `<div class="flota-karty">${lista.map(p => `
    <button type="button" class="auto-karta${p.aktywny ? '' : ' slaby'}" data-pojazd="${p.id}">
      <span class="auto-karta-gora">
        <b class="rejestracja">${escHtml(p.rejestracja)}</b>
        <span class="auto-karta-status">${plakietkaTerminu(p.terminy)}</span>
      </span>
      <span class="auto-karta-opis">${escHtml(nazwaPojazdu(p))}${p.aktywny ? ''
        : ' <span class="plakietka">wycofane</span>'}
        <span class="slaby male">${escHtml(NAZWY_RODZAJU[p.rodzaj] || p.rodzaj || '')}${
          p.rok ? ', ' + p.rok : ''}</span></span>
      <span class="auto-karta-dol">
        <span>Przebieg: <b>${p.przebieg != null ? escHtml(kilometry(p.przebieg)) : '—'}</b></span>
        ${biuro ? `<span>Kierowca: <b>${p.kierowca_imie ? escHtml(p.kierowca_imie)
          : '<span class="slaby">nikt</span>'}</b></span>` : ''}
      </span>
    </button>`).join('')}</div>`;
}

function tabelaFloty(lista, biuro) {
  return kartyFloty(lista, biuro) + `<div class="karta scisla flota-tabela"><div class="tabela-przewijana"><table>
    <thead><tr>
      <th>Rejestracja</th><th>Auto</th>${biuro ? '<th>Kierowca</th>' : ''}
      <th class="liczba">Przebieg</th><th>Najbliższy termin</th>
    </tr></thead>
    <tbody>${lista.map(p => `
      <tr data-pojazd="${p.id}" style="cursor:pointer"${
        p.aktywny ? '' : ' class="slaby"'}>
        <td><b class="rejestracja">${escHtml(p.rejestracja)}</b>${p.aktywny ? '' : ' <span class="plakietka">wycofane</span>'}</td>
        <td>${escHtml(nazwaPojazdu(p))}<br><span class="slaby male">${
          escHtml(NAZWY_RODZAJU[p.rodzaj] || p.rodzaj || '')}${p.rok ? ', ' + p.rok : ''}</span></td>
        ${biuro ? `<td>${p.kierowca_imie ? escHtml(p.kierowca_imie)
          : '<span class="slaby">— nikt —</span>'}</td>` : ''}
        <td class="liczba">${p.przebieg != null ? escHtml(kilometry(p.przebieg)) : '—'}</td>
        <td>${plakietkaTerminu(p.terminy)}</td>
      </tr>`).join('')}
    </tbody></table></div></div>`;
}

/* --------------------------------------------------------- KARTA POJAZDU */

EKRANY.pojazd = {
  tytul: 'Karta auta',
  poSynchronizacji() { if (stan.ekran === 'pojazd') odswiezEkran(); },

  async rysuj(pole, param) {
    const id = Number((param && param.id) || (stan.parametryEkranu || {}).id);
    if (!id) { pokazEkran('pojazdy'); return; }
    const p = await sprobuj(() => API.get('/api/pojazdy/' + id));
    if (!p) { pole.innerHTML = '<div class="pusto">Nie udało się wczytać karty.</div>'; return; }
    document.getElementById('tytul-ekranu').textContent = p.rejestracja;
    const biuro = jestBiuro();

    pole.innerHTML = `
      ${p.aktywny ? '' : `<div class="wstega uwaga">To auto jest wycofane z floty.
        Zostaje w kartotece razem z całą historią, ale nie liczy się do alarmów.</div>`}

      <div class="karta">
        <div class="karta-gora">
          <div>
            <h2 class="rejestracja" style="margin:0">${escHtml(p.rejestracja)}</h2>
            <p class="slaby" style="margin:4px 0 0">${escHtml(nazwaPojazdu(p))}${
              p.rok ? ', rocznik ' + p.rok : ''} · ${escHtml(NAZWY_RODZAJU[p.rodzaj] || p.rodzaj)}</p>
          </div>
          <div class="uchwyty">
            ${biuro ? '<button id="p-edytuj">Edytuj</button>' : ''}
            ${biuro ? `<button id="p-kierowca">${p.kierowca_imie ? 'Zmień kierowcę' : 'Przypisz kierowcę'}</button>` : ''}
          </div>
        </div>
        <div class="dwie-kolumny">
          <div>
            <p><b>Kierowca:</b> ${p.kierowca_imie ? escHtml(p.kierowca_imie)
              : '<span class="slaby">brak — auto nie jest nikomu przypisane</span>'}</p>
            <p><b>Przebieg:</b> ${p.przebieg != null ? escHtml(kilometry(p.przebieg)) : '—'}
              ${p.przebieg_o ? `<span class="slaby male">(spisany ${
                escHtml(polskaData(p.przebieg_o))})</span>` : ''}</p>
            <p><b>Przegląd wewnętrzny:</b> co ${p.przeglad_co_mies || 1}
              ${odmiana(p.przeglad_co_mies || 1, 'miesiąc', 'miesiące', 'miesięcy')}</p>
          </div>
          <div>
            ${p.vin ? `<p><b>VIN:</b> ${escHtml(p.vin)}</p>` : ''}
            ${p.ubezpieczyciel ? `<p><b>Ubezpieczyciel:</b> ${escHtml(p.ubezpieczyciel)}</p>` : ''}
            ${p.polisa_nr ? `<p><b>Polisa:</b> ${escHtml(p.polisa_nr)}</p>` : ''}
            ${biuro && (p.ubezpieczyciel || p.polisa_nr) ? `<p class="slaby male">Ubezpieczyciela
              i numer polisy poprawia się we wpisie OC w Terminach.</p>` : ''}
          </div>
        </div>
        ${p.uwagi ? `<p class="dopisek">${escHtml(p.uwagi)}</p>` : ''}
      </div>

      <div class="karta">
        <div class="karta-gora"><h3>Terminy</h3>
          ${biuro ? '<button id="p-do-terminow">Otwórz w Terminach</button>' : ''}</div>
        ${terminyPojazdu(p.terminy, biuro)}
      </div>

      <details class="karta karta-zwijana" open><summary>Przeglądy miesięczne</summary>
        <div class="zwijana-tresc">${historiaProtokolow(p.przeglady || [])}</div></details>

      <details class="karta karta-zwijana"><summary>Odczyty licznika</summary>
        <div class="zwijana-tresc">${historiaOdczytow(p.odczyty || [])}</div></details>

      ${biuro ? `<details class="karta karta-zwijana"><summary>Kto prowadził</summary>
        <div class="zwijana-tresc">${historiaPrzypisan(p.przypisania || [])}</div></details>`
        : ''}

      ${(p.tankowania || []).length ? `
      <details class="karta karta-zwijana"><summary>Tankowania</summary>
        <div class="zwijana-tresc">${historiaTankowan(p.tankowania, p.spalanie)}</div></details>`
        : ''}

      <details class="karta karta-zwijana"${(p.usterki || []).length ? ' open' : ''}>
        <summary>Usterki otwarte (${(p.usterki || []).length})</summary>
        <div class="zwijana-tresc">${(p.usterki || []).length
          ? (p.usterki || []).map(u => `<div class="brak">
              <span class="plakietka p-${escHtml(u.waga)}">${escHtml(opisKodu(OPIS_WAGI, u.waga))}</span>
              <span>${escHtml(u.opis)}<br><span class="slaby male">zgłoszona ${
                escHtml(polskaData(u.utworzono))}</span></span></div>`).join('')
          : '<p class="slaby">Nic nie wisi na tym aucie.</p>'}</div></details>

      <div class="przyciski"><button id="p-wroc">${ikonka('strzalka-lewo')}Wróć do floty</button>
        ${jestAdministratorem() && p.aktywny
          ? '<button class="niszczacy" id="p-wycofaj">Wycofaj z floty</button>' : ''}
      </div>`;

    pole.querySelector('#p-wroc').onclick = () => pokazEkran('pojazdy');
    if (biuro) {
      pole.querySelector('#p-edytuj').onclick = () => oknoPojazdu(p);
      pole.querySelector('#p-kierowca').onclick = () => oknoPrzypisania(p);
      const wycofaj = pole.querySelector('#p-wycofaj');
      if (wycofaj) wycofaj.onclick = () => wycofajPojazd(p);
      // Karta tylko pokazuje terminy; dopisuje się je, poprawia i odnawia
      // w Terminach — odfiltrowanych do tego auta (i tego terminu).
      pole.querySelector('#p-do-terminow').onclick = () => pokazEkran('terminy', { pojazd: p.id });
      pole.querySelectorAll('[data-do-terminow]').forEach(b => {
        b.onclick = () => pokazEkran('terminy', { pojazd: p.id, rodzaj: b.dataset.doTerminow });
      });
    }
    pole.querySelectorAll('[data-protokol]').forEach(b => {
      b.onclick = () => pokazEkran('protokol', { id: Number(b.dataset.protokol) });
    });
  },
};

/* Terminy auta na karcie — TYLKO do odczytu (etap 2 poprawek UI, decyzja
   właściciela: jedna lista terminów). Badanie i OC wpisywało się kiedyś
   w formularzu karty, a odnawiało w Terminach, i biuro nie wiedziało, które
   miejsce jest prawdziwe. Teraz każda data żyje w Terminach; tu biuro widzi
   ją i jednym kliknięciem przechodzi do tego wpisu.                         */
function terminyPojazdu(t, biuro) {
  const lista = (t && t.lista) || [];
  const brakuje = ['badanie', 'oc'].filter(r => !lista.some(w => w.rodzaj === r));
  const podpowiedz = biuro && brakuje.length
    ? `<p class="slaby male">${brakuje.length === 2 ? 'Badania technicznego i OC'
        : (brakuje[0] === 'badanie' ? 'Badania technicznego' : 'OC')} jeszcze nie wpisano —
        dopisuje się je w <b>Terminach</b> („Otwórz w Terminach” → „+ Dodaj termin”).</p>` : '';
  if (!lista.length) return '<p class="slaby">Nie wpisano żadnej pilnowanej daty.</p>' + podpowiedz;
  return lista.map(w => `
    <div class="brak">
      <span class="plakietka p-${escHtml(w.stan)}">${escHtml(opisTerminu(w.dni))}</span>
      <span>${biuro ? `<button class="tekstowy" data-do-terminow="${escHtml(w.rodzaj)}"
          title="Otwórz ten termin w Terminach"><b>${escHtml(w.nazwa)}</b></button>`
          : `<b>${escHtml(w.nazwa)}</b>`}${w.termin ? ' — do ' + escHtml(polskaData(w.termin)) : ''}
        ${w.id ? '' : '<br><span class="slaby male">data z karty auta</span>'}</span>
    </div>`).join('') + podpowiedz;
}

function historiaProtokolow(lista) {
  if (!lista.length) return '<p class="slaby">Jeszcze żadnego przeglądu.</p>';
  return `<ul class="os-czasu">${lista.map(g => `
    <li class="${g.status === 'zatwierdzony' ? 'ok' : (g.status === 'odrzucony' ? 'nie' : '')}">
      <b>${escHtml(miesiacSlownie(g.okres))}</b>
      <span class="plakietka p-${escHtml(g.status)}">${escHtml(OPIS_STATUSU[g.status] || g.status)}</span>
      ${g.przebieg != null ? ' · ' + escHtml(kilometry(g.przebieg)) : ''}
      ${g.kierowca_imie ? ' · ' + escHtml(g.kierowca_imie) : ''}
      <button class="tekstowy" data-protokol="${g.id}">otwórz</button>
    </li>`).join('')}</ul>`;
}

function historiaOdczytow(lista) {
  if (!lista.length) return '<p class="slaby">Licznika jeszcze nikt nie spisał.</p>';
  return `<div class="tabela-przewijana"><table>
    <thead><tr><th>Data</th><th class="liczba">Licznik</th><th>Skąd</th><th>Kto</th></tr></thead>
    <tbody>${lista.map(o => `<tr>
      <td>${escHtml(polskaData(o.czas))}</td>
      <td class="liczba">${escHtml(kilometry(o.km))}</td>
      <td>${escHtml(opisKodu(OPIS_ZRODLA, o.zrodlo))}</td>
      <td>${escHtml(o.kierowca_imie || '—')}</td></tr>`).join('')}
    </tbody></table></div>`;
}

/* Historia przypisań: kto jeździł tym autem i od kiedy do kiedy. Biuro
   szuka tu odpowiedzi na „kto jechał 14 września" (mandat z fotoradaru,
   szkoda). Puste „od" to przypisanie sprzed zapisywania historii.          */
function historiaPrzypisan(lista) {
  if (!lista.length) return '<p class="slaby">Auto jeszcze nie miało kierowcy.</p>';
  const kiedy = (t) => t ? `${polskaData(t)} ${String(t).slice(11, 16)}` : '';
  return `<div class="tabela-przewijana"><table>
    <thead><tr><th>Kierowca</th><th>Od</th><th>Do</th><th>Zmienił</th></tr></thead>
    <tbody>${lista.map(h => `<tr>
      <td>${escHtml(h.kierowca_imie || '—')}</td>
      <td>${h.od ? escHtml(kiedy(h.od)) : '<span class="slaby">przed historią</span>'}</td>
      <td>${h.do ? escHtml(kiedy(h.do)) : '<b>teraz</b>'}</td>
      <td>${escHtml(h.zmienil_imie || '—')}</td></tr>`).join('')}
    </tbody></table></div>`;
}

/* Tankowania przychodzą z raportów dziennych kierowców w GK Trasy. Kwoty
   serwer zdejmuje kierowcy (jak koszty napraw), więc kolumna „Kwota" jest
   tylko wtedy, gdy któryś wiersz ją ma. Średnie spalanie liczy serwer —
   tu jest tylko do przeczytania, obok normy, jeśli biuro ją wpisało.      */
function historiaTankowan(lista, spalanie) {
  const zKwota = lista.some(t => t.kwota != null);
  const liczba = (w, miejsc) => w == null ? '—'
    : Number(w).toLocaleString('pl', { minimumFractionDigits: miejsc, maximumFractionDigits: miejsc });
  return `${spalanie ? `<p><b>Średnie spalanie:</b> ${escHtml(liczba(spalanie.l_na_100, 1))}
      l/100 km <span class="slaby male">(z ${spalanie.tankowan}
      ${odmiana(spalanie.tankowan, 'tankowania', 'tankowań', 'tankowań')},
      ${escHtml(kilometry(spalanie.km))})</span>${spalanie.norma
      ? ` · norma ${escHtml(liczba(spalanie.norma, 1))} l/100 km` : ''}</p>` : ''}
    <div class="tabela-przewijana"><table>
    <thead><tr><th>Data</th><th class="liczba">Litry</th>${zKwota
      ? '<th class="liczba">Kwota</th>' : ''}<th class="liczba">Licznik</th><th>Kto</th></tr></thead>
    <tbody>${lista.map(t => `<tr>
      <td>${escHtml(polskaData(t.data))}</td>
      <td class="liczba">${escHtml(liczba(t.litry, 1))}</td>
      ${zKwota ? `<td class="liczba">${t.kwota == null ? '—'
        : escHtml(liczba(t.kwota, 2)) + ' zł'}</td>` : ''}
      <td class="liczba">${escHtml(kilometry(t.przebieg) || '—')}</td>
      <td>${escHtml(t.kierowca_imie || '—')}</td></tr>`).join('')}
    </tbody></table></div>`;
}

/* ------------------------------------------------------- okna kartoteki */

function oknoPojazdu(p) {
  const nowy = !p;
  okno({
    tytul: nowy ? 'Nowe auto' : 'Auto ' + p.rejestracja,
    szkic: nowy ? 'auto-nowe' : 'auto-' + p.id,
    szerokie: true,
    tresc: `
      <div class="dwie-kolumny">
        <label class="pole">Numer rejestracyjny *
          <input id="w-rejestracja" maxlength="20" autocapitalize="characters"
                 value="${escHtml(p ? p.rejestracja : '')}"></label>
        <label class="pole">Rodzaj
          <select id="w-rodzaj">${RODZAJE_POJAZDU.map(r =>
            `<option value="${r}"${p && p.rodzaj === r ? ' selected' : ''}>${
              escHtml(NAZWY_RODZAJU[r])}</option>`).join('')}</select></label>
        <label class="pole">Marka<input id="w-marka" maxlength="60"
          value="${escHtml(p ? p.marka || '' : '')}"></label>
        <label class="pole">Model<input id="w-model" maxlength="60"
          value="${escHtml(p ? p.model || '' : '')}"></label>
        <label class="pole">Rok produkcji<input id="w-rok" type="number" inputmode="numeric"
          value="${p && p.rok ? p.rok : ''}"></label>
        <label class="pole">VIN<input id="w-vin" maxlength="20"
          value="${escHtml(p ? p.vin || '' : '')}"></label>
        <label class="pole">Przegląd co ile miesięcy
          <input id="w-co-mies" type="number" inputmode="numeric" min="1" max="24"
                 value="${p ? p.przeglad_co_mies || 1 : 1}"></label>
        ${nowy ? `<label class="pole">Stan licznika dziś
          <input id="w-przebieg" type="number" inputmode="numeric" placeholder="np. 184320">
          </label>` : ''}
      </div>
      <label class="pole">Uwagi<textarea id="w-uwagi" rows="2"
        maxlength="2000">${escHtml(p ? p.uwagi || '' : '')}</textarea></label>
      ${nowy ? `<p class="slaby male">Licznik można wpisać tylko przy zakładaniu karty.
        Później zmienia go przegląd kierowcy albo poprawka biura — dzięki temu
        zostaje ślad, kto i kiedy go zmienił.</p>` : ''}
      <p class="slaby male">Badanie techniczne, OC (z ubezpieczycielem i numerem polisy)
        i inne daty wpisuje się w <b>Terminach</b> — karta auta tylko je pokazuje.</p>`,
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Zapisz', klasa: 'glowny', klik: async (zamknij) => {
        const we = (id) => document.getElementById(id);
        const dane = {
          id: p ? p.id : null,
          rejestracja: we('w-rejestracja').value.trim().toUpperCase(),
          rodzaj: we('w-rodzaj').value,
          marka: we('w-marka').value.trim(),
          model: we('w-model').value.trim(),
          rok: we('w-rok').value ? Number(we('w-rok').value) : null,
          vin: we('w-vin').value.trim(),
          przeglad_co_mies: Number(we('w-co-mies').value) || 1,
          uwagi: we('w-uwagi').value.trim(),
          aktywny: p ? p.aktywny : 1,
        };
        if (nowy && we('w-przebieg').value.trim()) {
          dane.przebieg = Number(we('w-przebieg').value);
        }
        if (!dane.rejestracja) { komunikat('Podaj numer rejestracyjny', 'blad'); return; }
        // Nowy pojazd dostaje numer od programu — bez niego nie poczeka.
        const w = await sprobuj(() => (nowy ? API.post('/api/pojazdy', dane)
          : zapisBiura('POST', '/api/pojazdy', dane, {
            opis: 'auto ' + dane.rejestracja,
            zrodla: ['/api/pojazdy/' + p.id],
            popraw: (sciezka, d) => {
              if (!sciezka.startsWith('/api/pojazdy')) return;
              wPamieci(d, p.id, x => Object.assign(x, dane));
            },
          })), nowy ? 'Auto dopisane do kartoteki' : 'Zapisane');
        if (!w) return;
        zamknij();
        if (nowy) pokazEkran('pojazd', { id: w.id }); else odswiezEkran();
      } },
    ],
  });
}

async function oknoPrzypisania(p) {
  const kierowcy = await sprobuj(() => API.get('/api/kierowcy?z_biura=1')) || [];
  // D103: kierowcy (i osoby oznaczone jako jeżdżące) osobno od reszty biura — wybranie kogoś z biura oznacza go
  // jako kierowcę (dostaje „Moje auto”); żadna rola się nie zmienia.
  const opcje = u => `<option value="${u.id}"${p.kierowca === u.id ? ' selected' : ''}>${escHtml(u.imie)}</option>`;
  const jezdzacy = kierowcy.filter(u => u.grupa !== 'biuro');
  const zBiura = kierowcy.filter(u => u.grupa === 'biuro');
  okno({
    tytul: 'Kto jeździ ' + p.rejestracja,
    tresc: `<label class="pole">Kierowca
      <select id="w-kto">
        <option value="">— nikt —</option>
        ${jezdzacy.map(opcje).join('')}
        ${zBiura.length ? `<optgroup label="Z biura — dostanie ekran „Moje auto”">${zBiura.map(opcje).join('')}</optgroup>` : ''}
      </select></label>
      <p class="slaby male">Kierowca widzi w telefonie tylko to auto: swoje terminy,
      swój przegląd miesięczny i licznik. Nie widzi VIN-u, polisy ani kosztów.</p>`,
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Przypisz', klasa: 'glowny', klik: async (zamknij) => {
        const wybor = document.getElementById('w-kto');
        const kto = wybor.value;
        const imie = kto ? wybor.options[wybor.selectedIndex].text : null;
        // Zmiana kierowcy istniejącego auta może poczekać na program (zapisBiura); ekran od razu pokazuje nową osobę.
        const w = await sprobuj(() => zapisBiura('POST', `/api/pojazdy/${p.id}/przypisz`,
          { kierowca: kto ? Number(kto) : null }, {
            opis: 'kierowca auta ' + p.rejestracja,
            zrodla: ['/api/pojazdy/' + p.id],
            popraw: (sciezka, d) => {
              if (!sciezka.startsWith('/api/pojazdy')) return;
              wPamieci(d, p.id, x => Object.assign(x, { kierowca: kto ? Number(kto) : null, kierowca_imie: imie }));
            },
          }), 'Zapisane');
        if (!w) return;
        zamknij();
        odswiezEkran();
      } },
    ],
  });
}

async function wycofajPojazd(p) {
  const tak = await potwierdz('Wycofać ' + p.rejestracja + ' z floty?',
    'Auto zniknie z list i alarmów, ale zostaje w kartotece razem z przeglądami, '
    + 'zdjęciami i historią licznika. Nic nie jest kasowane.',
    { tak: 'Wycofaj', groznie: true });
  if (!tak) return;
  if (!await sprobuj(() => API.del('/api/pojazdy/' + p.id), 'Auto wycofane')) return;
  pokazEkran('pojazdy');
}

/* -------------------------------------------------------------- TERMINY */

EKRANY.terminy = {
  tytul: 'Terminy',
  tylkoBiuro: true,
  poSynchronizacji() { if (stan.ekran === 'terminy') odswiezEkran(); },

  /* JEDNA lista wszystkich pilnowanych dat (etap 2 poprawek UI, decyzja
     właściciela): badanie techniczne, OC z ubezpieczycielem i numerem polisy,
     AC, serwis, opony… Tylko tu się je dopisuje, poprawia („Popraw”)
     i odnawia („Załatwione”) — karta auta pokazuje je do odczytu i prowadzi
     tutaj. Dawny ekran „Badania techniczne” otwierał się na samych badaniach
     i biuro szukało OC w karcie auta; teraz domyślnie widać wszystko, a chipy
     stoją zawsze w tej samej kolejności (kolejność RODZAJE z serwera), żeby
     kciuk trafiał w to samo miejsce niezależnie od tego, co akurat wypada.

     Parametry ekranu: { pojazd, rodzaj } z karty auta zawężają listę do tego
     auta (i tego terminu). Filtr auta żyje w parametrach, a nie w pamięci
     filtra: wejście z menu pokazuje znów całą flotę.                         */
  async rysuj(pole, param) {
    const f = filtrOsoby('_filtrTerminow', { rodzaj: '', widok: 'lista', sortuj: '' });
    const p = param || {};
    const autoFiltra = Number(p.pojazd) || null;
    if (p.rodzaj !== undefined) {
      // Rodzaj z karty auta działa raz — potem chip zmienia go jak zwykle,
      // a odświeżenie ekranu (te same parametry) nie może go cofać.
      f.rodzaj = String(p.rodzaj || '');
      delete p.rodzaj;
    }
    const [ewidencja, flota] = await Promise.all([
      sprobuj(() => API.get('/api/terminy')),
      sprobuj(() => API.get('/api/pojazdy')),
    ]);
    const wszystkie = polaczTerminy(ewidencja || [], flota || [])
      .filter(t => !autoFiltra || t.pojazd === autoFiltra);
    const lista = posortujTerminy(f.rodzaj ? wszystkie.filter(t => t.rodzaj === f.rodzaj) : wszystkie, f.sortuj);
    const rodzaje = (stan.ustawienia && stan.ustawienia.rodzaje_terminow) || {};
    const chipy = chipyTerminow(rodzaje, wszystkie, f.rodzaj);
    const nazwaWidoku = f.rodzaj ? (rodzaje[f.rodzaj] || f.rodzaj) : 'Wszystkie terminy';
    const auto = autoFiltra ? (flota || []).find(a => a.id === autoFiltra) || null : null;

    pole.innerHTML = `
      ${autoFiltra ? `<div class="wstega info">Terminy auta
        <b>${escHtml(auto ? auto.rejestracja : '')}</b>
        <button class="tekstowy" id="t-cala-flota">Pokaż całą flotę</button>
        ${auto ? `<button class="tekstowy" id="t-karta">Karta auta</button>` : ''}</div>` : ''}
      <div class="pasek-narzedzi">
        <div class="chipy">
          <button class="chip${f.rodzaj === '' ? ' wybrany' : ''}" data-rodzaj="">wszystkie</button>
          ${chipy.map(kod => `<button class="chip${f.rodzaj === kod ? ' wybrany' : ''}"
            data-rodzaj="${escHtml(kod)}">${escHtml(rodzaje[kod] || kod)}</button>`).join('')}
        </div>
        <div class="chipy">
          <span class="slaby male" style="align-self:center">Widok:</span>
          <button class="chip${f.widok === 'lista' ? ' wybrany' : ''}" data-widok="lista">Lista</button>
          <button class="chip${f.widok === 'kalendarz' ? ' wybrany' : ''}"
                  data-widok="kalendarz">Kalendarz</button>
        </div>
        ${polaSortowania(f.sortuj, OPCJE_SORTOWANIA_TERMINOW)}
        <button class="glowny" id="t-nowy">+ Dodaj termin</button>
      </div>
      <h3>${escHtml(nazwaWidoku)} <span class="slaby male">— ${lista.length}
        ${odmiana(lista.length, 'pozycja', 'pozycje', 'pozycji')}</span></h3>
      ${f.widok === 'kalendarz' ? kalendarzTerminow(lista) : listaTerminow(lista)}`;

    pole.querySelectorAll('[data-rodzaj]').forEach(b => {
      b.onclick = () => { f.rodzaj = b.dataset.rodzaj; odswiezEkran(); };
    });

    pole.querySelector('#sortowanie').onchange = e => { f.sortuj = e.target.value; odswiezEkran(); };

    pole.querySelectorAll('[data-widok]').forEach(b => {
      b.onclick = () => { f.widok = b.dataset.widok; odswiezEkran(); };
    });
    // Zawężone do jednego auta: nowy termin od razu dla niego.
    pole.querySelector('#t-nowy').onclick = () => oknoTerminu(null, auto);
    const calaFlota = pole.querySelector('#t-cala-flota');
    if (calaFlota) calaFlota.onclick = () => pokazEkran('terminy');
    const karta = pole.querySelector('#t-karta');
    if (karta) karta.onclick = () => pokazEkran('pojazd', { id: autoFiltra });
    pole.querySelectorAll('[data-pojazd]').forEach(el => {
      el.onclick = () => pokazEkran('pojazd', { id: Number(el.dataset.pojazd) });
      if (el.tagName === 'DIV') {
        el.onkeydown = e => {
          if (e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.onclick(); }
        };
      }
    });
    const wpis = id => lista.find(t => t.id === id) || null;
    pole.querySelectorAll('[data-odnow]').forEach(b => {
      b.onclick = (e) => {
        e.stopPropagation();          // odnowienie, a nie przejście do karty auta
        const t = wpis(Number(b.dataset.odnow));
        oknoOdnowienia(Number(b.dataset.odnow), null, t && t.rodzaj, t);
      };
    });
    pole.querySelectorAll('[data-popraw]').forEach(b => {
      b.onclick = (e) => {
        e.stopPropagation();          // poprawka wpisu, a nie przejście do karty auta
        const t = wpis(Number(b.dataset.popraw));
        if (t) oknoTerminu(t, null);
      };
    });
  },
};

/* Chipy rodzajów w STAŁEJ kolejności — tej, w której serwer podaje słownik
   rodzaje_terminow (RODZAJE we flotex.py: badanie, OC, AC, serwis…). Badanie
   i OC stoją zawsze, bo bez nich auto nie wyjedzie; reszta tylko wtedy, gdy
   firma je prowadzi albo właśnie jest wybrana. Wcześniej kolejność brała się
   z kolejności dat na liście i chipy zamieniały się miejscami z dnia na dzień. */
function chipyTerminow(rodzaje, wpisy, wybrany) {
  const uzywane = new Set((wpisy || []).map(t => t.rodzaj));
  ['badanie', 'oc'].forEach(r => uzywane.add(r));
  if (wybrany) uzywane.add(wybrany);
  const kolejnosc = Object.keys(rodzaje || {});
  const znane = kolejnosc.filter(kod => uzywane.has(kod));
  // Rodzaj spoza słownika (stara baza) na końcu, żeby nie zniknął z widoku.
  return znane.concat([...uzywane].filter(kod => !kolejnosc.includes(kod)).sort());
}

function listaTerminow(lista) {
  if (!lista.length) {
    return `<div class="pusto"><span class="duza-ikona">${GKIkony.html('kalendarz', 38)}</span>
      Nie ma żadnych pilnowanych dat. Dodaj termin — badanie techniczne, OC
      i inne daty wpisuje się tutaj.</div>`;
  }
  /* Wiersz to <div>, a nie <button>: w środku siedzą przyciski „Popraw”
     i „Załatwione”, a przycisk w przycisku przeglądarka rozcina po swojemu
     (jak lista usterek w przeglady.js). Kliknięcie w wiersz dalej otwiera kartę auta. */
  return lista.map(t => `
    <div class="pozycja s-${escHtml(t.stan)}" data-pojazd="${t.pojazd}" role="button" tabindex="0">
      <span class="numer">${escHtml(t.rejestracja || '')}</span>
      <span class="srodek">
        <span class="nazwa">${escHtml(t.nazwa)} — ${escHtml(polskaData(t.termin))}</span>
        <span class="adres">${escHtml(t.rejestracja)} · ${escHtml(
          [t.marka, t.model].filter(Boolean).join(' ') || 'bez opisu')}</span>
        ${t.dokument || t.ubezpieczyciel ? `<span class="dopisek slaby">${
          [t.ubezpieczyciel, t.dokument ? 'nr ' + t.dokument : '']
            .filter(Boolean).map(escHtml).join(' · ')}</span>` : ''}
        ${t.uwagi ? `<span class="dopisek">${escHtml(t.uwagi)}</span>` : ''}
      </span>
      <span class="prawo">
        <span class="plakietka p-${escHtml(t.stan)}">${escHtml(opisTerminu(t.dni))}</span>
        ${t.id ? `<span class="uchwyty"><button data-popraw="${t.id}">Popraw</button>
          <button data-odnow="${t.id}">Załatwione</button></span>`
          : (t.czeka ? '<span class="slaby male">czeka na wysłanie do programu</span>'
            : '<span class="slaby male">data z karty auta</span>')}
      </span>
    </div>`).join('');
}

/* Kalendarz liczymy w przeglądarce z tej samej listy, którą pokazuje widok
   listowy — żeby oba widoki nie mogły pokazać różnych rzeczy. Miesiące bez
   terminów w ogóle się nie rysują: pusta siatka trzydziestu kratek nie niesie
   żadnej informacji, a zajmuje cały ekran.                                   */
function kalendarzTerminow(lista) {
  const zTerminem = lista.filter(t => /^\d{4}-\d{2}-\d{2}$/.test(t.termin || ''));
  if (!zTerminem.length) {
    return `<div class="pusto"><span class="duza-ikona">${GKIkony.html('kalendarz', 38)}</span>Brak dat do pokazania.</div>`;
  }
  const wgMiesiaca = {};
  zTerminem.forEach(t => {
    const m = t.termin.slice(0, 7);
    (wgMiesiaca[m] = wgMiesiaca[m] || []).push(t);
  });
  const MIESIACE = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec',
                    'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
  return Object.keys(wgMiesiaca).sort().map(m => {
    const [rok, mies] = m.split('-');
    return `<div class="karta">
      <div class="karta-gora"><h3>${MIESIACE[Number(mies) - 1]} ${rok}</h3>
        <span class="slaby male">${wgMiesiaca[m].length} ${odmiana(wgMiesiaca[m].length,
          'termin', 'terminy', 'terminów')}</span></div>
      <ul class="os-czasu">${wgMiesiaca[m]
        .sort((a, b) => a.termin.localeCompare(b.termin))
        .map(t => `<li class="${t.stan === 'po_terminie' ? 'nie' : (t.stan === 'ok' ? 'ok' : '')}">
          <b>${escHtml(t.termin.slice(8))}.</b> ${escHtml(t.nazwa)} —
          <button class="tekstowy" data-pojazd="${t.pojazd}">${escHtml(t.rejestracja)}</button>
          <span class="plakietka p-${escHtml(t.stan)}">${escHtml(opisTerminu(t.dni))}</span>
        </li>`).join('')}</ul></div>`;
  }).join('');
}

/* Wszystkie pilnowane daty w jednym miejscu.

   Do etapu 2 (2026-10-12) badanie i OC wpisywało się też wprost w karcie
   auta, a serwer liczył z obu miejsc naraz — i dlatego pulpit ostrzegał
   o badaniu, którego ekran „Terminy" nie pokazywał wcale, bo pytał wyłącznie
   o ewidencję. Od etapu 2 karta jest tylko do odczytu, a program przy starcie
   przenosi daty z kart do Terminów (przenies_daty_kart_do_terminow), więc
   data „z karty” zdarza się już tylko w kopii sprzed aktualizacji. Zostaje
   pokazana, żeby nie zniknęła z widoku.

   Gdy ten sam rodzaj jest w obu miejscach, wygrywa wpis z ewidencji — ma id,
   więc da się go odnowić jednym przyciskiem. Tę samą regułę stosuje
   stan_terminow() we flotex.py.                                              */
function polaczTerminy(ewidencja, flota) {
  const wynik = ewidencja.slice();
  const zEwidencji = new Set(ewidencja.map(t => `${t.pojazd}:${t.rodzaj}`));
  flota.forEach(p => {
    ((p.terminy && p.terminy.lista) || []).forEach(t => {
      if (t.id || zEwidencji.has(`${p.id}:${t.rodzaj}`)) return;
      wynik.push(Object.assign({}, t, {
        pojazd: p.id, rejestracja: p.rejestracja, marka: p.marka, model: p.model,
        zKarty: true,
      }));
    });
  });
  return wynik.sort((a, b) => String(a.termin || '').localeCompare(String(b.termin || '')));
}

/* ------------------------------------------- terminy bez programu (D10, 26.11)

   Poprawka i odnowienie terminu idą przez zapisBiura: bez programu czekają w tym komputerze, a ekran od razu
   pokazuje zmianę. Konflikt („ktoś to zmienił, gdy nie było połączenia”) sprawdzamy tylko na TYM wpisie i tylko
   na polach, które człowiek może zmienić — `dni` i `stan` liczy program względem dzisiejszej daty i zmieniają się
   o północy same (app.js → kluczZrodla, odciskWpisuZrodla). Endpointy i ich format bez zmian.               */
const POLA_TERMINU_DO_POROWNANIA = ['pojazd', 'rodzaj', 'termin', 'dokument', 'koszt', 'uwagi', 'zamkniete_o'];
function zrodloTerminu(t) {
  // Z zamkniętymi i z wycofanymi autami: zamknięty przez kogoś innego wpis ma być „zmieniony”, a nie „zniknął”.
  return { sciezka: `/api/terminy?stan=wszystkie&wszystkie=1&pojazd=${Number(t.pojazd)}`, id: t.id,
           pola: POLA_TERMINU_DO_POROWNANIA, dane: t };
}
/* Dni do daty liczone jak w programie (pozycja_terminu): względem dzisiejszego dnia, bez godzin. */
function dniDoTerminu(iso, dzis) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
  const [r, m, d] = iso.split('-').map(Number);
  const [r0, m0, d0] = (dzis || dzisiaj()).split('-').map(Number);
  return Math.round((Date.UTC(r, m - 1, d) - Date.UTC(r0, m0 - 1, d0)) / 86400000);
}
/* stan_z_dni z flotex.py: po_terminie / pilne (ćwierć okna ostrzegania) / blisko / ok. */
function stanTerminuZDni(dni, ostrzegaj) {
  const okno = Math.max(1, Math.min(365, Number(ostrzegaj) || 30));
  if (dni === null || dni === undefined) return 'ok';
  if (dni < 0) return 'po_terminie';
  if (dni <= Math.max(1, Math.floor(okno / 4))) return 'pilne';
  if (dni <= okno) return 'blisko';
  return 'ok';
}
/* przesun_miesiace z flotex.py: 31 stycznia + 1 miesiąc = ostatni dzień lutego, nigdy 1 marca. */
function przesunMiesiace(iso, ile) {
  const [r, m, d] = (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso : dzisiaj()).split('-').map(Number);
  const miesiace = m - 1 + Number(ile);
  const rok = r + Math.floor(miesiace / 12);
  const miesiac = ((miesiace % 12) + 12) % 12 + 1;
  const ostatni = new Date(Date.UTC(rok, miesiac, 0)).getUTCDate();
  return `${rok}-${String(miesiac).padStart(2, '0')}-${String(Math.min(d, ostatni)).padStart(2, '0')}`;
}
function ostrzegajDni() {
  return (stan.ustawienia && stan.ustawienia.ostrzegaj_dni) || 30;
}
/* Wpis listy po poprawce (to samo, co zrobi program w a_termin_zapisz). */
function poprawionyTermin(x, dane, rodzaje) {
  const dni = dniDoTerminu(dane.termin);
  const zmiany = { rodzaj: dane.rodzaj, nazwa: rodzaje[dane.rodzaj] || x.nazwa, termin: dane.termin,
    dokument: dane.dokument, koszt: dane.koszt, uwagi: dane.uwagi, dni,
    stan: x.zamkniete_o ? 'ok' : stanTerminuZDni(dni, ostrzegajDni()) };
  if (dane.rodzaj === 'oc' && 'ubezpieczyciel' in dane && !x.zamkniete_o) {
    zmiany.ubezpieczyciel = dane.ubezpieczyciel;
    zmiany.polisa_nr = dane.dokument;
  }
  return zmiany;
}
/* Lista terminów po odnowieniu (a_termin_odnow): stary zamknięty (na liście otwartych znika), nowy bez numeru —
   „czeka na wysłanie”, bez przycisków (Popraw/Załatwione potrzebują numeru od programu). Zwraca nową listę. */
function poOdnowieniu(sciezka, lista, id, dane, cyklDomyslny) {
  if (!Array.isArray(lista)) return undefined;
  const i = lista.findIndex(x => x && x.id === id);
  if (i < 0) return undefined;
  const stary = lista[i];
  const nowyTermin = dane.termin || przesunMiesiace(dane.zalatwiono || dzisiaj(), Number(dane.cykl_mies) || cyklDomyslny || 12);
  const dni = dniDoTerminu(nowyTermin);
  const nowy = Object.assign({}, stary, { id: null, czeka: true, termin: nowyTermin, dokument: '', koszt: null,
    uwagi: '', zamkniete_o: null, dni, stan: stanTerminuZDni(dni, ostrzegajDni()) });
  const zamkniety = Object.assign({}, stary, { zamkniete_o: czasTeraz(), stan: 'ok',
    koszt: dane.koszt != null ? dane.koszt : stary.koszt, dokument: dane.dokument || stary.dokument });
  const wstaw = /[?&]stan=zamkniete(&|$)/.test(sciezka) ? [zamkniety]
    : (/[?&]stan=wszystkie(&|$)/.test(sciezka) ? [zamkniety, nowy] : [nowy]);
  return lista.slice(0, i).concat(wstaw, lista.slice(i + 1));
}

/* `termin` podany = poprawka istniejącego wpisu (zła data, literówka w numerze
   polisy). Wysyłamy wtedy jego `id` — serwer nadpisuje wpis zamiast dopisywać
   drugi; „Załatwione” zamknęłoby termin i założyło następny, a to nie to samo.

   Wpis OC ma od etapu 2 pola „Numer polisy” i „Ubezpieczyciel” — to, co do
   etapu 2 wpisywało się w karcie auta. Serwer trzyma je dalej przy aucie
   (eksport floty), a numer polisy także jako numer dokumentu wpisu; pole
   podpowiada numer z karty, gdy wpis go jeszcze nie ma, żeby zapis okna
   niczego nie skasował.                                                     */
async function oknoTerminu(termin, pojazd) {
  const rodzaje = (stan.ustawienia && stan.ustawienia.rodzaje_terminow) || {};
  const pojazdy = pojazd ? [pojazd]
    : (await sprobuj(() => API.get('/api/pojazdy')) || []);
  const t = termin || {};
  // Terminu nie da się przenieść na inne auto (serwer odmawia), więc przy
  // poprawce auto jest zablokowane tak samo jak w karcie auta.
  const pojazdStaly = pojazd ? pojazd.id : (termin ? termin.pojazd : null);
  const polisaWpisu = t.dokument || (t.rodzaj === 'oc' ? t.polisa_nr || '' : '');
  okno({
    tytul: termin ? 'Popraw termin' : 'Nowy termin',
    szkic: termin ? 'termin-' + termin.id : 'termin-nowy' + (pojazd ? '-' + pojazd.id : ''),
    tresc: `
      <label class="pole">Auto
        <select id="t-pojazd"${pojazdStaly ? ' disabled' : ''}>
          ${pojazdy.map(p => `<option value="${p.id}">${escHtml(p.rejestracja)} — ${
            escHtml(nazwaPojazdu(p))}</option>`).join('')}
        </select></label>
      <div class="dwie-kolumny">
        <label class="pole">Czego dotyczy
          <select id="t-rodzaj-nowy">${Object.entries(rodzaje).map(([kod, nazwa]) =>
            `<option value="${escHtml(kod)}">${escHtml(nazwa)}</option>`).join('')}</select></label>
        <label class="pole">Ważny do<input id="t-data" type="date"
          value="${escHtml(t.termin || '')}"></label>
        <label class="pole"><span id="t-dokument-napis">Numer dokumentu</span><input id="t-dokument"
          maxlength="60" placeholder="nr polisy, zaświadczenia" value="${escHtml(polisaWpisu)}"></label>
        <label class="pole" id="t-ubezpieczyciel-pole">Ubezpieczyciel<input id="t-ubezpieczyciel"
          maxlength="60" placeholder="np. PZU, Warta" value="${escHtml(t.ubezpieczyciel || '')}"></label>
        <label class="pole">Koszt (zł)<input id="t-koszt" type="number" step="0.01"
          inputmode="decimal" value="${t.koszt != null ? escHtml(String(t.koszt)) : ''}"></label>
      </div>
      <label class="pole">Uwagi<textarea id="t-uwagi" rows="2" maxlength="2000">${
        escHtml(t.uwagi || '')}</textarea></label>`,
    poOtwarciu: (tresc) => {
      if (pojazdStaly) tresc.querySelector('#t-pojazd').value = String(pojazdStaly);
      if (termin && termin.rodzaj) tresc.querySelector('#t-rodzaj-nowy').value = termin.rodzaj;
      const wybor = tresc.querySelector('#t-rodzaj-nowy');
      const auto = tresc.querySelector('#t-pojazd');
      const dopasuj = () => {
        const oc = wybor.value === 'oc';
        tresc.querySelector('#t-ubezpieczyciel-pole').classList.toggle('ukryty', !oc);
        tresc.querySelector('#t-dokument-napis').textContent =
          ['oc', 'ac'].includes(wybor.value) ? 'Numer polisy' : 'Numer dokumentu';
        // Nowy wpis OC: podpowiedź z karty auta (to, co było tam wpisane do
        // etapu 2), ale tylko do pustych pól — wpisanego nie nadpisujemy.
        const p = pojazdy.find(x => String(x.id) === auto.value);
        if (oc && p) {
          const ub = tresc.querySelector('#t-ubezpieczyciel');
          const nr = tresc.querySelector('#t-dokument');
          if (!ub.value && p.ubezpieczyciel) ub.value = p.ubezpieczyciel;
          if (!nr.value && p.polisa_nr) nr.value = p.polisa_nr;
        }
      };
      wybor.onchange = dopasuj;
      auto.onchange = dopasuj;
      dopasuj();
    },
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Zapisz', klasa: 'glowny', klik: async (zamknij) => {
        const we = id => document.getElementById(id);
        const data = we('t-data').value;
        if (!data) { komunikat('Podaj datę, do kiedy termin jest ważny', 'blad'); return; }
        const dane = {
          pojazd: pojazdStaly || Number(we('t-pojazd').value),
          rodzaj: we('t-rodzaj-nowy').value,
          termin: data,
          dokument: we('t-dokument').value.trim(),
          koszt: we('t-koszt').value ? Number(we('t-koszt').value) : null,
          uwagi: we('t-uwagi').value.trim(),
        };
        // Tylko przy OC: serwer po obecności pola poznaje nowe okno i przepisuje
        // numer polisy oraz ubezpieczyciela do karty auta.
        if (dane.rodzaj === 'oc') dane.ubezpieczyciel = we('t-ubezpieczyciel').value.trim();
        if (termin && termin.id) dane.id = termin.id;
        // D10: poprawka istniejącego wpisu może poczekać na program (zapisBiura); nowy wpis — tylko z programem
        // (numer nadaje program, a „Załatwione” go potrzebuje).
        const w = await sprobuj(() => (dane.id
          ? zapisBiura('POST', '/api/terminy', dane, {
            opis: 'termin ' + (rodzaje[dane.rodzaj] || dane.rodzaj) + (termin.rejestracja ? ' ' + termin.rejestracja : ''),
            zrodla: [zrodloTerminu(termin)],
            popraw: (sciezka, d) => {
              if (!sciezka.startsWith('/api/terminy')) return;
              wPamieci(d, dane.id, x => Object.assign(x, poprawionyTermin(x, dane, rodzaje)));
            },
          })
          : API.post('/api/terminy', dane)),
          termin ? 'Termin poprawiony' : 'Termin dopisany');
        if (!w) return;
        zamknij();
        odswiezEkran();
      } },
    ],
  });
}

/* Odnowienie zamyka stary termin i zakłada następny. Data następnego liczy się
   od DZIŚ (albo od dnia, w którym rzecz naprawdę załatwiono), a nie od starego
   terminu — badanie zrobione dwa tygodnie po czasie ważne jest rok od badania,
   nie rok od daty, którą przegapiono.                                         */
function oknoOdnowienia(id, pojazd, rodzaj, wpis) {
  // Cykl podpowiada serwer dla rodzaju terminu (CYKLE_TERMINOW: opony 6,
  // tachograf 24) — sztywne 12 przesuwało wymianę opon o pół roku za daleko.
  // Człowiek dalej może wpisać własny.
  const cykle = (stan.ustawienia && stan.ustawienia.cykle_terminow) || {};
  const cykl = Number(cykle[rodzaj]) || 12;
  const rodzaje = (stan.ustawienia && stan.ustawienia.rodzaje_terminow) || {};
  okno({
    tytul: 'Termin załatwiony',
    szkic: 'odnowienie-' + id,
    tresc: `
      <div class="dwie-kolumny">
        <label class="pole">Kiedy załatwione
          <input id="o-zalatwiono" type="date" value="${dzisiaj()}"></label>
        <label class="pole">Co ile miesięcy wraca
          <input id="o-cykl" type="number" inputmode="numeric" min="1" max="120" value="${cykl}"></label>
        <label class="pole">Nowy termin (jeśli inny niż z cyklu)
          <input id="o-termin" type="date"></label>
        <label class="pole">Koszt (zł)<input id="o-koszt" type="number" step="0.01"
          inputmode="decimal"></label>
      </div>
      <label class="pole">Numer dokumentu<input id="o-dokument" maxlength="60"></label>
      <p class="slaby male">Stary wpis zostaje w historii auta jako załatwiony,
      a program od razu zakłada następny — żeby ten termin nie zniknął z kalendarza
      na rok i nie wrócił dopiero mandatem.</p>`,
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Zapisz', klasa: 'glowny', klik: async (zamknij) => {
        const we = i => document.getElementById(i);
        const dane = {
          zalatwiono: we('o-zalatwiono').value,
          cykl_mies: Number(we('o-cykl').value) || cykl,
          termin: we('o-termin').value,
          koszt: we('o-koszt').value ? Number(we('o-koszt').value) : null,
          dokument: we('o-dokument').value.trim(),
        };
        // D10: odnowienie może poczekać na program (zapisBiura). Ekran od razu pokazuje następny termin (bez numeru,
        // „czeka na wysłanie”), a stary znika z listy otwartych. Program sprawdza jeszcze raz, czy termin jest
        // otwarty (409 „już zamknięty” trafia na wstęgę z powodem — nic nie zakłada się podwójnie).
        const w = await sprobuj(() => zapisBiura('POST', `/api/terminy/${id}/odnow`, dane, {
          opis: 'odnowienie: ' + (rodzaje[rodzaj] || rodzaj || 'termin') + (wpis && wpis.rejestracja ? ' ' + wpis.rejestracja : ''),
          zrodla: wpis ? [zrodloTerminu(wpis)] : [],
          popraw: (sciezka, d) => (sciezka.startsWith('/api/terminy') ? poOdnowieniu(sciezka, d, id, dane, cykl) : undefined),
        }), 'Termin odnowiony');
        if (!w) return;
        zamknij();
        odswiezEkran();
      } },
    ],
  });
}
