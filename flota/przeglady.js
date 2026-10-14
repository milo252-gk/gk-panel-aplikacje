/* Przeglądy miesięczne i usterki.

   Przegląd jest jedyną rzeczą w tym programie, której nie da się odtworzyć zza
   biurka: termin badania przepisze się z dowodu, koszt naprawy z faktury, ale
   zdjęcie rysy na drzwiach z 14 września istnieje tylko dlatego, że ktoś wtedy
   stanął przy aucie. Stąd cała ostrożność tego ekranu — zdjęć nie kasujemy
   nigdy, także przy odrzuceniu przeglądu.                                     */

/* Token do <img src>. Sesyjnego tokenu nie da się wpisać w adres obrazka,
   więc zdjęcia chodzą na osobnym, półgodzinnym tokenie do odczytu.
   Trzymamy go w pamięci ekranu i odnawiamy, gdy się zestarzeje — inaczej
   biuro oglądające galerię dwadzieścia minut dostaje w połowie puste kafelki. */
const TokenZdjec = (() => {
  let token = null, wydany = 0;
  return {
    async daj() {
      // 20 minut, choć token żyje 30 — margines na otwartą galerię i na to,
      // że zegar przeglądarki bywa przesunięty względem serwera.
      if (token && Date.now() - wydany < 20 * 60 * 1000) return token;
      const w = await API.post('/api/eksport/token', { zakres: 'pliki' }).catch(() => null);
      if (!w || !w.token) return null;
      token = w.token;
      wydany = Date.now();
      return token;
    },
    zapomnij() { token = null; },
  };
})();

function adresZdjecia(plik, token) {
  // API_BAZA, bo zdjęcia leżą przy programie w biurze, a nie przy aplikacji
  // na GitHub Pages. Zwykły <img> nie wymaga zgody serwera na inny adres —
  // token w adresie wystarcza.
  return API_BAZA + '/pliki/' + plik + (token ? '?t=' + encodeURIComponent(token) : '');
}

const OPIS_STATUSU = {
  oczekuje: 'czeka na kierowcę',
  wykonany: 'do sprawdzenia',
  zatwierdzony: 'zatwierdzony',
  odrzucony: 'odrzucony',
  zalegly: 'zaległy',
};

/* ------------------------------------------------- LISTA / KOLEJKA PROTOKOŁÓW */

EKRANY.przeglady = {
  tytul: 'Przeglądy',
  poSynchronizacji() { if (stan.ekran === 'przeglady') odswiezEkran(); },

  async rysuj(pole) {
    const biuro = jestBiuro();
    // UI etap 3: biuro zaczyna od bieżącego miesiąca (obok stoi „Załóż przeglądy
    // na ten miesiąc”), a nie od pustego pola „---- ----”. Kierowca widzi
    // wszystkie swoje przeglądy, jak dawniej.
    const f = stan._filtrProtokolow
      || (stan._filtrProtokolow = { status: biuro ? 'wykonany' : '', okres: biuro ? okresDzis() : '' });
    const pyt = new URLSearchParams();
    if (f.status) pyt.set('status', f.status);
    if (f.okres) pyt.set('okres', f.okres);
    const lista = await sprobuj(() => API.get('/api/przeglady?' + pyt.toString())) || [];
    // Filtr miesiąca nie może schować zaległej roboty: przegląd z zeszłego
    // miesiąca, którego nikt nie sprawdził, dalej czeka. Liczymy go osobno
    // i pokazujemy wstęgę z jednym kliknięciem do „wszystkie miesiące”.
    let zInnych = 0;
    if (biuro && f.okres && f.status === 'wykonany') {
      const wszystkie = await API.get('/api/przeglady?status=wykonany').catch(() => []);
      zInnych = (wszystkie || []).filter(g => g.okres !== f.okres).length;
    }

    const stany = ['', 'wykonany', 'oczekuje', 'odrzucony', 'zatwierdzony', 'zalegly'];
    pole.innerHTML = `
      ${biuro ? `<div class="pasek-narzedzi">
        <div class="chipy">
          ${stany.map(s => `<button class="chip${f.status === s ? ' wybrany' : ''}"
            data-status="${s}">${s ? escHtml(OPIS_STATUSU[s] || s) : 'wszystkie'}</button>`).join('')}
        </div>
        <label>Miesiąc<select id="pr-okres">${opcjeMiesiecy(f.okres)}</select></label>
        <button id="pr-zaloz">Załóż przeglądy na ten miesiąc</button>
      </div>` : ''}
      ${zInnych ? `<div class="wstega uwaga">Z innych miesięcy na sprawdzenie czeka jeszcze
        ${zInnych} ${odmiana(zInnych, 'przegląd', 'przeglądy', 'przeglądów')}.
        <button class="tekstowy" id="pr-wszystkie">Pokaż wszystkie miesiące</button></div>` : ''}
      ${lista.length ? lista.map(g => pozycjaProtokolu(g, biuro)).join('') : `
        <div class="pusto"><span class="duza-ikona">🧾</span>
        ${biuro ? (f.status === 'wykonany'
            ? 'Nic nie czeka na sprawdzenie. Wszystkie przeglądy są rozpatrzone.'
            : 'Nie ma przeglądów spełniających te warunki.')
          : 'Nie masz jeszcze żadnego przeglądu.'}</div>`}`;

    if (biuro) {
      pole.querySelectorAll('[data-status]').forEach(b => {
        b.onclick = () => { f.status = b.dataset.status; odswiezEkran(); };
      });
      pole.querySelector('#pr-okres').onchange = e => { f.okres = e.target.value; odswiezEkran(); };
      pole.querySelector('#pr-zaloz').onclick = () => zalozProtokoly();
      const wszystkie = pole.querySelector('#pr-wszystkie');
      if (wszystkie) wszystkie.onclick = () => { f.okres = ''; odswiezEkran(); };
    }
    pole.querySelectorAll('[data-protokol]').forEach(el => {
      el.onclick = () => pokazEkran('protokol', { id: Number(el.dataset.protokol) });
    });
  },
};

/* Bieżący miesiąc „RRRR-MM” w czasie telefonu/komputera (nie UTC — inaczej
   w nocy z 31 na 1 pokazywałby jeszcze stary miesiąc). */
function okresDzis(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

/* Lista miesięcy zamiast <input type="month">: puste pole miesiąca rysowało
   się w Edge/Chrome jako „---- ----”, a Safari na iPhonie go nie ma wcale.
   Słowami („październik 2026”), ostatnie 12 miesięcy plus „wszystkie”.
   Miesiąc spoza listy (z wcześniejszego filtra) dokładamy, żeby nie zginął. */
function opcjeMiesiecy(wybrany, teraz = new Date()) {
  const okresy = [];
  for (let i = 0; i < 12; i++) {
    okresy.push(okresDzis(new Date(teraz.getFullYear(), teraz.getMonth() - i, 1)));
  }
  if (wybrany && !okresy.includes(wybrany)) okresy.push(wybrany);
  return `<option value=""${wybrany ? '' : ' selected'}>wszystkie miesiące</option>`
    + okresy.map(o => `<option value="${escHtml(o)}"${o === wybrany ? ' selected' : ''}>${
      escHtml(miesiacSlownie(o))}</option>`).join('');
}

/* Krótki miesiąc („paź 2026”) do tytułu wiersza na telefonie. */
const MIESIACE_KROTKO = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź',
  'lis', 'gru'];
function miesiacKrotko(okres) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(okres || ''));
  if (!m || +m[2] < 1 || +m[2] > 12) return String(okres || '');
  return `${MIESIACE_KROTKO[+m[2] - 1]} ${m[1]}`;
}

/* UI etap 4: tytuł wiersza to sam miesiąc — numer rejestracyjny stoi w całości
   w kółku po lewej. „październik 2026 · PO 7H312” łamał się na telefonie na
   trzy wiersze; teraz na telefonie jest „paź 2026”, na komputerze pełna nazwa. */
function pozycjaProtokolu(g, biuro) {
  return `
    <button class="pozycja s-${escHtml(g.status)}" data-protokol="${g.id}">
      <span class="numer">${escHtml(g.rejestracja || '')}</span>
      <span class="srodek">
        <span class="nazwa"><span class="miesiac-pelny">${escHtml(miesiacSlownie(g.okres))}</span><span
          class="miesiac-krotki">${escHtml(miesiacKrotko(g.okres))}</span></span>
        <span class="adres">${escHtml([g.marka, g.model].filter(Boolean).join(' ') || '')}${
          biuro && g.kierowca_imie ? ' · ' + escHtml(g.kierowca_imie) : ''}</span>
        ${g.przebieg != null ? `<span class="dopisek slaby">licznik ${
          escHtml(kilometry(g.przebieg))}${g.ile_zdjec != null
            ? ` · ${g.ile_zdjec} ` + odmiana(g.ile_zdjec, 'zdjęcie', 'zdjęcia', 'zdjęć')
            : ''}</span>` : ''}
        ${g.powod ? `<span class="dopisek">Powód odrzucenia: ${escHtml(g.powod)}</span>` : ''}
      </span>
      <span class="prawo">
        <span class="plakietka p-${escHtml(g.status)}">${
          escHtml(OPIS_STATUSU[g.status] || g.status)}</span>
      </span>
    </button>`;
}

async function zalozProtokoly() {
  const tak = await potwierdz('Założyć przeglądy na ten miesiąc?',
    'Każde czynne auto z przypisanym kierowcą dostanie pusty przegląd do zrobienia. '
    + 'Auta, które już go mają, zostają bez zmian. Program robi to również sam, '
    + 'pierwszego dnia miesiąca.', { tak: 'Załóż' });
  if (!tak) return;
  const w = await sprobuj(() => API.post('/api/przeglady/zaloz', {}));
  if (!w) return;
  komunikat(w.zalozone
    ? `Założono ${w.zalozone} ${odmiana(w.zalozone, 'przegląd', 'przeglądy', 'przeglądów')}`
    : 'Wszystkie przeglądy na ten miesiąc już były założone', 'ok');
  odswiezEkran();
}

/* ------------------------------------------- KARTA PROTOKOŁU I WERYFIKACJA */

EKRANY.protokol = {
  tytul: 'Przegląd',
  poSynchronizacji() { if (stan.ekran === 'protokol') odswiezEkran(); },

  async rysuj(pole, param) {
    const id = Number((param && param.id) || (stan.parametryEkranu || {}).id);
    if (!id) { pokazEkran('przeglady'); return; }
    const g = await sprobuj(() => API.get('/api/przeglady/' + id));
    if (!g || !g.id) {
      pole.innerHTML = '<div class="pusto">Nie udało się wczytać przeglądu.</div>';
      return;
    }
    const biuro = jestBiuro();
    const token = await TokenZdjec.daj();
    document.getElementById('tytul-ekranu').textContent =
      `${g.rejestracja || 'Przegląd'} · ${miesiacSlownie(g.okres)}`;

    pole.innerHTML = `
      ${g.status === 'odrzucony' ? `<div class="wstega blad">
        Przegląd odrzucony${g.odrzucil_imie ? ' przez ' + escHtml(g.odrzucil_imie) : ''}.
        Powód: ${escHtml(g.powod || 'nie podano')}</div>` : ''}
      ${g.status === 'zatwierdzony' ? `<div class="wstega ok">
        Zatwierdzony${g.zatwierdzil_imie ? ' przez ' + escHtml(g.zatwierdzil_imie) : ''}${
          g.zatwierdzono_o ? ' ' + escHtml(polskaData(g.zatwierdzono_o)) : ''}.</div>` : ''}

      <div class="karta">
        <div class="karta-gora">
          <div>
            <h2 style="margin:0">${escHtml(g.rejestracja || '')}</h2>
            <p class="slaby" style="margin:4px 0 0">
              ${escHtml([g.marka, g.model].filter(Boolean).join(' ') || '')}
              · przegląd za ${escHtml(miesiacSlownie(g.okres))}
              ${g.kierowca_imie ? '· ' + escHtml(g.kierowca_imie) : ''}</p>
          </div>
          <span class="plakietka p-${escHtml(g.status)}">${
            escHtml(OPIS_STATUSU[g.status] || g.status)}</span>
        </div>
        <div class="dwie-kolumny">
          <div>
            <p><b>Stan licznika:</b> ${g.przebieg != null
              ? escHtml(kilometry(g.przebieg)) : '<span class="slaby">nie podano</span>'}</p>
            ${g.poprzedni ? `<p class="slaby male">Poprzedni przegląd (${
              escHtml(miesiacSlownie(g.poprzedni.okres))}): ${escHtml(kilometry(g.poprzedni.przebieg))}${
              g.przejechane != null
                ? ` — przejechane <b>${escHtml(kilometry(g.przejechane))}</b>` : ''}</p>` : ''}
          </div>
          <div>
            ${g.wykonano_o ? `<p><b>Wykonany:</b> ${escHtml(polskaData(g.wykonano_o))}</p>` : ''}
          </div>
        </div>
        ${g.uwagi ? `<p class="dopisek"><b>Uwagi kierowcy:</b> ${escHtml(g.uwagi)}</p>` : ''}
      </div>

      ${(g.braki || []).length ? `<div class="wstega uwaga">Brakuje zdjęć:
        ${g.braki.map(b => escHtml(b.etykieta || b)).join(', ')}.</div>` : ''}

      <div class="karta">
        <h3>Zdjęcia</h3>
        ${galeriaKadrow(g.zdjecia || [], token)}
      </div>

      ${(g.punkty || []).length ? `<div class="karta">
        <div class="karta-gora"><h3>Przegląd wewnętrzny</h3>
          ${biuro ? '<button id="pr-checklista">Wykonaj przegląd wewnętrzny</button>' : ''}</div>
        ${checklistaOdczyt(g.punkty)}</div>`
      : (biuro ? `<div class="karta">
          <div class="karta-gora"><h3>Przegląd wewnętrzny</h3>
            <button id="pr-checklista">Wykonaj przegląd wewnętrzny</button></div>
          <p class="slaby">Checklista jeszcze nie została wypełniona.</p></div>` : '')}

      ${(g.usterki || []).length ? `<div class="karta"><h3>Usterki z tego przeglądu</h3>
        ${g.usterki.map(u => `<div class="brak">
          <span class="plakietka p-${escHtml(u.waga)}">${escHtml(opisKodu(OPIS_WAGI, u.waga))}</span>
          <span>${escHtml(u.opis)} <span class="plakietka p-${escHtml(u.status)}">${
            escHtml(opisKodu(OPIS_USTERKI, u.status))}</span></span></div>`).join('')}</div>` : ''}

      <div class="przyciski rozstaw">
        <button id="pr-wroc">← Wróć</button>
        ${biuro && (g.status === 'wykonany' || g.status === 'odrzucony')
          ? '<button class="glowny" id="pr-zatwierdz">Zatwierdź</button>' : ''}
        ${biuro && (g.status === 'wykonany' || g.status === 'zatwierdzony')
          ? '<button class="niszczacy" id="pr-odrzuc">Odrzuć</button>' : ''}
      </div>`;

    pole.querySelector('#pr-wroc').onclick = () => pokazEkran('przeglady');
    pole.querySelectorAll('[data-podglad]').forEach(b => {
      b.onclick = () => Zdjecia.podglad(b.dataset.podglad, b.dataset.opis);
    });
    const zatw = pole.querySelector('#pr-zatwierdz');
    if (zatw) zatw.onclick = () => zatwierdzProtokol(g);
    const odrzuc = pole.querySelector('#pr-odrzuc');
    if (odrzuc) odrzuc.onclick = () => oknoOdrzucenia(g);
    const lista = pole.querySelector('#pr-checklista');
    if (lista) lista.onclick = () => oknoChecklisty(g);
  },
};

/* Kadry w kolejności ustalonej przez serwer — biuro ogląda co miesiąc to samo
   w tej samej kolejności i wyłapuje brak jednym spojrzeniem, bez czytania.   */
function galeriaKadrow(grupy, token) {
  if (!grupy.length) return '<p class="slaby">W tym przeglądzie nie ma jeszcze żadnego zdjęcia.</p>';
  return `<div class="kadry">${grupy.map(gr => {
    const zdj = gr.zdjecia || [];
    if (!zdj.length) {
      return `<div class="kadr brak${gr.obowiazkowe ? ' wymagany' : ''}">
        <span class="mata">nie ma zdjęcia</span>
        <span class="etykieta">${escHtml(gr.etykieta)}</span></div>`;
    }
    return zdj.map(z => `
      <button class="kadr" data-podglad="${escHtml(adresZdjecia(z.plik, token))}"
              data-opis="${escHtml(gr.etykieta)}">
        <span class="mata"><img loading="lazy" src="${escHtml(adresZdjecia(z.plik, token))}"
              alt="${escHtml(gr.etykieta)}"></span>
        <span class="etykieta">${escHtml(gr.etykieta)}</span></button>`).join('');
  }).join('')}</div>`;
}

function checklistaOdczyt(punkty) {
  const wypelnione = punkty.filter(p => p.ocena && p.ocena !== 'brak');
  if (!wypelnione.length) return '<p class="slaby">Checklista jeszcze nie została wypełniona.</p>';
  return `<ul class="os-czasu">${punkty.map(p => `
    <li class="${p.ocena === 'ok' ? 'ok' : (p.ocena === 'usterka' ? 'nie' : '')}">
      <b>${escHtml(p.etykieta)}</b> — ${escHtml(p.ocena || 'nie sprawdzono')}
      ${p.uwaga ? `<br><span class="slaby">${escHtml(p.uwaga)}</span>` : ''}
    </li>`).join('')}</ul>`;
}

/* Zatwierdzenie bez pytania „na pewno?” — nic nie niszczy, a „Odrzuć” cofa je
   w każdej chwili. Pytanie przy każdym z kilkudziesięciu przeglądów w miesiącu
   uczyło klikać „Zatwierdź” dwa razy bez czytania. Po zatwierdzeniu od razu
   następny przegląd „do sprawdzenia” — biuro przechodzi kolejkę bez wracania
   do listy; gdy nic już nie czeka, wraca na listę.                          */
async function zatwierdzProtokol(g) {
  if (!await sprobuj(() => zapisBiura('POST', `/api/przeglady/${g.id}/zatwierdz`, {}, {
    opis: 'zatwierdzenie przeglądu za ' + miesiacSlownie(g.okres) + (g.rejestracja ? ' ' + g.rejestracja : ''),
    zrodla: ['/api/przeglady/' + g.id],
    popraw: (sciezka, d) => {
      if (!sciezka.startsWith('/api/przeglady')) return;
      wPamieci(d, g.id, x => Object.assign(x, { status: 'zatwierdzony', zatwierdzil: stan.uz.imie }));
    },
  }), 'Przegląd zatwierdzony')) return;
  const nastepny = await nastepnyDoSprawdzenia(g.id);
  if (nastepny) pokazEkran('protokol', { id: nastepny });
  else pokazEkran('przeglady');
}

/* Id następnego przeglądu „do sprawdzenia” (status wykonany) poza właśnie
   zatwierdzonym, albo null. Kolejność jak na liście — serwer układa ją sam.
   Bez programu w biurze lista bywa kopią sprzed zatwierdzenia, stąd `pomin`. */
async function nastepnyDoSprawdzenia(pomin) {
  const lista = await API.get('/api/przeglady?status=wykonany').catch(() => null);
  return wybierzNastepnyDoSprawdzenia(lista, pomin);
}
function wybierzNastepnyDoSprawdzenia(lista, pomin) {
  const nastepny = (Array.isArray(lista) ? lista : [])
    .find(x => x && x.status === 'wykonany' && x.id !== pomin);
  return nastepny ? nastepny.id : null;
}

/* Odrzucenie WYMAGA powodu i to nie jest formalność: ten tekst czyta kierowca
   w telefonie i tylko z niego dowiaduje się, po co ma wrócić do auta.
   Przycisk zostaje nieaktywny, dopóki powód jest za krótki — łatwiej dopisać
   trzy słowa teraz niż tłumaczyć przez telefon jutro.                        */
function oknoOdrzucenia(g) {
  const PODPOWIEDZI = ['Licznik nieczytelny na zdjęciu', 'Brakuje zdjęcia lewego boku',
                       'Zdjęcia z poprzedniego miesiąca', 'Zdjęcie za ciemne — nie widać nadwozia',
                       'Stan licznika nie zgadza się ze zdjęciem'];
  okno({
    tytul: 'Odrzucenie przeglądu za ' + miesiacSlownie(g.okres),
    tresc: `
      <p class="slaby">Powód zobaczy kierowca w telefonie — napisz konkret,
      a nie „źle". Zdjęcia zostają w przeglądzie, nic nie jest kasowane.</p>
      <div class="chipy">${PODPOWIEDZI.map(p =>
        `<button type="button" class="chip" data-podpowiedz="${escHtml(p)}">${
          escHtml(p)}</button>`).join('')}</div>
      <label class="pole">Powód odrzucenia *
        <textarea id="od-powod" rows="3" maxlength="500"
          placeholder="np. Na zdjęciu licznika nie widać cyfr — zrób je bez odbicia"></textarea>
      </label>`,
    poOtwarciu: (tresc) => {
      const powod = tresc.querySelector('#od-powod');
      tresc.querySelectorAll('[data-podpowiedz]').forEach(b => {
        b.onclick = () => {
          powod.value = powod.value.trim()
            ? powod.value.trim() + '. ' + b.dataset.podpowiedz
            : b.dataset.podpowiedz;
          powod.focus();
        };
      });
      powod.focus();
    },
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Odrzuć przegląd', klasa: 'glowny niszczacy', klik: async (zamknij) => {
        const powod = (document.getElementById('od-powod').value || '').trim();
        if (powod.length < 3) {
          komunikat('Napisz, co jest nie tak — kierowca ma z tego wiedzieć, po co wraca do auta',
                    'blad');
          return;
        }
        if (!await sprobuj(() => zapisBiura('POST', `/api/przeglady/${g.id}/odrzuc`, { powod }, {
          opis: 'odrzucenie przeglądu za ' + miesiacSlownie(g.okres) + (g.rejestracja ? ' ' + g.rejestracja : ''),
          zrodla: ['/api/przeglady/' + g.id],
          popraw: (sciezka, d) => {
            if (!sciezka.startsWith('/api/przeglady')) return;
            wPamieci(d, g.id, x => Object.assign(x, { status: 'odrzucony', powod, zatwierdzil: null }));
          },
        }), 'Przegląd odrzucony — kierowca zobaczy powód')) return;
        zamknij();
        odswiezEkran();
      } },
    ],
  });
}

/* Przegląd wewnętrzny biura: ta sama karta przeglądu, tylko wypełniana przez
   człowieka z biura, który obchodzi auto z listą punktów.                    */
function oknoChecklisty(g) {
  const punkty = (g.punkty && g.punkty.length) ? g.punkty : punktyPrzegladu();
  const OCENY = [['ok', 'w porządku'], ['uwaga', 'do obserwacji'], ['usterka', 'usterka']];
  okno({
    tytul: 'Przegląd wewnętrzny · ' + (g.rejestracja || ''),
    szerokie: true,
    tresc: `
      ${punkty.map((p, i) => `
        <div class="brak">
          <span style="flex:1"><b>${escHtml(p.etykieta || p.kod)}</b>
            <input class="ch-uwaga" data-kod="${escHtml(p.kod)}" placeholder="uwaga (opcjonalnie)"
                   maxlength="300" value="${escHtml(p.uwaga || '')}"></span>
          <span class="chipy">${OCENY.map(([kod, opis]) =>
            `<button type="button" class="chip ch-ocena${
              (p.ocena || 'ok') === kod ? ' wybrany' : ''}"
              data-punkt="${i}" data-kod="${escHtml(p.kod)}" data-ocena="${kod}">${
              escHtml(opis)}</button>`).join('')}</span>
        </div>`).join('')}
      <label class="pole">Uwagi do całego przeglądu
        <textarea id="ch-uwagi" rows="2" maxlength="2000">${escHtml(g.uwagi || '')}</textarea></label>
      <div id="ch-podpis"></div>`,
    poOtwarciu: (tresc) => {
      tresc.querySelectorAll('.ch-ocena').forEach(b => {
        b.onclick = () => {
          tresc.querySelectorAll(`.ch-ocena[data-punkt="${b.dataset.punkt}"]`)
            .forEach(x => x.classList.remove('wybrany'));
          b.classList.add('wybrany');
        };
      });
      stan._podpisPrzegladu = Podpis.wstawDo(tresc.querySelector('#ch-podpis'),
                                             'Podpis osoby wykonującej przegląd');
    },
    przyciski: [
      { napis: 'Anuluj', klik: z => { stan._podpisPrzegladu?.rozlacz(); z(); } },
      { napis: 'Zapisz przegląd', klasa: 'glowny', klik: async (zamknij) => {
        const tresc = document.getElementById('okno-tresc');
        const wybrane = {};
        tresc.querySelectorAll('.ch-ocena.wybrany').forEach(b => {
          wybrane[b.dataset.kod] = { kod: b.dataset.kod, ocena: b.dataset.ocena, uwaga: '' };
        });
        tresc.querySelectorAll('.ch-uwaga').forEach(i => {
          if (wybrane[i.dataset.kod]) wybrane[i.dataset.kod].uwaga = i.value.trim();
        });
        const podpis = stan._podpisPrzegladu;
        // `przeglad` wskazuje serwerowi dokładnie ten przegląd, który biuro
        // ma otwarty; pojazd i okres zostają dla starszego serwera.
        const paczka = {
          przeglad: g.id,
          pojazd: g.pojazd,
          okres: g.okres,
          przebieg: g.przebieg,
          punkty: Object.values(wybrane),
          uwagi: tresc.querySelector('#ch-uwagi').value.trim(),
        };
        if (podpis && !podpis.pusty()) paczka.zdjecia = { podpis: podpis.obraz() };
        if (!await sprobuj(() => API.post('/api/przeglady/zaloz', paczka),
                           'Przegląd wewnętrzny zapisany')) return;
        podpis?.rozlacz();
        stan._podpisPrzegladu = null;
        zamknij();
        odswiezEkran();
      } },
    ],
  });
}

/* ------------------------------------------------------------- USTERKI */

EKRANY.usterki = {
  tytul: 'Usterki',
  // Zaczętego zgłoszenia (opis, zdjęcie) nie przerysowujemy po wysyłce
  // kolejki — odświeżenie wyczyściłoby kierowcy formularz w pół zdania.
  poSynchronizacji() {
    if (stan.ekran === 'usterki' && !zgloszenieZaczete()) odswiezEkran();
  },

  async rysuj(pole) {
    const biuro = jestBiuro();
    // U kierowcy ta sama nazwa co zakładka w pasku dolnym i pozycja menu.
    if (!biuro) document.getElementById('tytul-ekranu').textContent = 'Usterka';
    const f = stan._filtrUsterek || (stan._filtrUsterek = { status: '' });
    const pyt = new URLSearchParams();
    if (f.status) pyt.set('status', f.status);
    const lista = await sprobuj(() => API.get('/api/usterki?' + pyt.toString())) || [];
    const stany = ['', 'zgloszona', 'w_naprawie', 'zamknieta'];
    // Zdjęcia kierowcy przy usterce (serwer daje je tylko biuru) — token do
    // <img> bierzemy tylko wtedy, gdy na liście jest choć jedno zdjęcie.
    const token = lista.some(u => (u.zdjecia || []).length) ? await TokenZdjec.daj() : null;

    // Kierowca: zakładka „Usterka” otwiera od razu formularz zgłoszenia, a pod
    // nim jego własne zgłoszenia (etap 2 poprawek UI). Wcześniej najpierw była
    // lista i przycisk „Zgłoś usterkę”, czyli jedno dotknięcie więcej przy
    // aucie, które właśnie stanęło.
    pole.innerHTML = `
      ${biuro ? '' : '<div id="us-formularz"></div><h3>Moje zgłoszenia</h3>'}
      <div class="pasek-narzedzi">
        <div class="chipy">
          ${stany.map(s => `<button class="chip${f.status === s ? ' wybrany' : ''}"
            data-status="${s}">${s ? escHtml(opisKodu(OPIS_USTERKI, s)) : 'wszystkie'}</button>`).join('')}
        </div>
      </div>
      ${lista.length ? lista.map(u => `
        <div class="pozycja s-${escHtml(u.status)}">
          <span class="numer">${escHtml(u.rejestracja || '')}</span>
          <span class="srodek">
            <span class="nazwa">${escHtml(u.opis)}</span>
            <span class="adres">${escHtml(u.rejestracja || '')}${u.zglosil_imie
              ? ' · zgłosił ' + escHtml(u.zglosil_imie) : ''} · ${
              escHtml(polskaData(u.utworzono))}</span>
            ${u.rozwiazanie ? `<span class="dopisek">${escHtml(u.rozwiazanie)}</span>` : ''}
          </span>
          ${(u.zdjecia || []).length ? `<button type="button" class="miniatura-usterki"
              data-podglad="${escHtml(adresZdjecia(u.zdjecia[0], token))}"
              data-opis="${escHtml('Usterka: ' + u.opis.slice(0, 60))}"
              aria-label="Zdjęcie usterki"><img loading="lazy" alt=""
              src="${escHtml(adresZdjecia(u.zdjecia[0], token))}">${u.zdjecia.length > 1
              ? `<span class="ile">+${u.zdjecia.length - 1}</span>` : ''}</button>` : ''}
          <span class="prawo">
            <span class="plakietka p-${escHtml(u.waga)}">${escHtml(opisKodu(OPIS_WAGI, u.waga))}</span>
            <span class="plakietka p-${escHtml(u.status)}">${
              escHtml(opisKodu(OPIS_USTERKI, u.status))}</span>
            ${biuro && u.status !== 'zamknieta'
              ? `<span class="uchwyty"><button data-zamknij="${u.id}">Zajmij się</button></span>`
              : ''}
          </span>
        </div>`).join('') : `<div class="pusto"><span class="duza-ikona">🔧</span>
          ${biuro ? 'Nic nie wisi na flocie.' : 'Nie masz zgłoszonych usterek.'}</div>`}`;

    pole.querySelectorAll('[data-status]').forEach(b => {
      b.onclick = () => { f.status = b.dataset.status; odswiezEkran(); };
    });
    pole.querySelectorAll('[data-zamknij]').forEach(b => {
      b.onclick = () => oknoUsterki(lista.find(u => u.id === Number(b.dataset.zamknij)), token);
    });
    pole.querySelectorAll('[data-podglad]').forEach(b => {
      b.onclick = () => Zdjecia.podglad(b.dataset.podglad, b.dataset.opis);
    });
    const formularz = pole.querySelector('#us-formularz');
    // Formularz zgłoszenia mieszka w kierowca.js — jest częścią telefonu,
    // a nie ekranu biura, i musi umieć zapisać usterkę bez zasięgu.
    if (formularz) await formularzUsterkiNaEkranie(formularz);
  },
};

/* Okno „Zajmij się”: na górze to, co zgłosił kierowca — pełny opis i jego
   zdjęcia — bo z tym biuro dzwoni do warsztatu. Zdjęcia są tu zwykłymi
   obrazkami z linkiem (pełny rozmiar w nowej karcie), a nie .miniatura:
   miniatura znaczy „zdjęcie zrobione w tym oknie” i przy zamknięciu
   pytałaby o porzucenie zdjęć, których nikt tu nie robił.                  */
function oknoUsterki(u, token) {
  if (!u) return;
  const zdjecia = u.zdjecia || [];
  okno({
    tytul: 'Usterka: ' + u.opis.slice(0, 60),
    tresc: `
      <div class="zgloszenie-usterki">
        <p class="slaby male">${escHtml(u.rejestracja || '')}${u.zglosil_imie
          ? ' · zgłosił ' + escHtml(u.zglosil_imie) : ''} · ${escHtml(polskaData(u.utworzono))}</p>
        <p class="opis-usterki">${escHtml(u.opis)}</p>
        ${zdjecia.length ? `<div class="zdjecia-usterki">${zdjecia.map((plik, i) => `
          <a href="${escHtml(adresZdjecia(plik, token))}" target="_blank" rel="noopener"
             title="Otwórz zdjęcie w pełnym rozmiarze"><img loading="lazy"
             src="${escHtml(adresZdjecia(plik, token))}" alt="Zdjęcie usterki ${i + 1}"></a>`).join('')}
          </div>` : '<p class="slaby male">Kierowca nie dołączył zdjęcia.</p>'}
      </div>
      <label class="pole">Co dalej
        <select id="us-status">
          <option value="w_naprawie"${u.status === 'w_naprawie' ? ' selected' : ''}>
            oddana do naprawy</option>
          <option value="zamknieta">naprawiona — zamknij</option>
        </select></label>
      <label class="pole">Co zrobiono
        <textarea id="us-rozwiazanie" rows="2" maxlength="500">${
          escHtml(u.rozwiazanie || '')}</textarea></label>
      <label class="pole">Koszt naprawy (zł)
        <input id="us-koszt" type="number" step="0.01" inputmode="decimal"
               value="${u.koszt != null ? u.koszt : ''}"></label>`,
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Zapisz', klasa: 'glowny', klik: async (zamknij) => {
        const koszt = document.getElementById('us-koszt').value;
        const zmiany = {
          status: document.getElementById('us-status').value,
          rozwiazanie: document.getElementById('us-rozwiazanie').value.trim(),
          koszt: koszt ? Number(koszt) : null,
        };
        if (!await sprobuj(() => zapisBiura('POST', `/api/usterki/${u.id}/zamknij`, zmiany, {
          opis: 'usterka ' + u.opis.slice(0, 40),
          popraw: (sciezka, d) => {
            if (!sciezka.startsWith('/api/usterki')) return;
            wPamieci(d, u.id, x => Object.assign(x, {
              status: zmiany.status, rozwiazanie: zmiany.rozwiazanie,
              koszt: zmiany.koszt != null ? zmiany.koszt : x.koszt }));
          },
        }), 'Zapisane')) return;
        zamknij();
        odswiezEkran();
      } },
    ],
  });
}
