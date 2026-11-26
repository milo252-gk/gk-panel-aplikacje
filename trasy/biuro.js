/* Ekrany biura: pulpit, planowanie tras, klienci, raporty, ustawienia. */

let trasaWEdycji = null;
let mapaBiura = null;

/* ================================================================ PULPIT */

EKRANY.pulpit = {
  tytul: 'Pulpit',
  tylkoBiuro: true,
  async rysuj(pole, param) {
    const data = param.data || dzisiaj();
    const p = await API.get('/api/pulpit?data=' + data);

    const razem = p.trasy.reduce((s, t) => ({
      ile: s.ile + t.ile, ok: s.ok + t.ile_ok, nie: s.nie + t.ile_nie,
    }), { ile: 0, ok: 0, nie: 0 });

    // Nowa wizyta na pulpicie zaczyna od pustych kafelków spraw — stare liczby z poprzedniego wejścia nie mogą
    // mignąć przed odpowiedziami serwera. „oczekiwane” = skąd jeszcze czekamy na odpowiedź (do chwili, gdy wszystkie
    // wrócą, nie piszemy „Wszystko w porządku”, bo to mogłoby być nieprawdą).
    const podglad = jestPodgladem();
    if (!podglad) await listaKierowcow().catch(() => []);       // lista do filtra „Kierowca”
    const nieudaneWidoczne = podglad ? p.nieudane
      : filtrujPulpit(p.nieudane, czytajFiltryPulpitu(), AKCESORIA_PULPITU.nieudane(p.trasy));
    pulpitSprawy = {
      alarmy: [], pilne: 0, zalegle: null, odrzucone: 0, braki: null,
      punkty: razem.ile, dostarczone: razem.ok, nieudane: razem.nie,
      // Lista „Do zatwierdzenia” obejmuje dostawy ze wszystkich dni, więc kafelek bierze liczbę z niej (niżej, po jej
      // wczytaniu). Konto „podgląd” tej listy nie dostaje — ma liczbę dnia z pulpitu.
      doPrzyjecia: podglad ? p.trasy.reduce((s, t) => s + (t.ile_do_przyjecia || 0), 0) : 0,
      uwagi: podglad ? 0 : p.trasy.reduce((s, t) => s + (t.ile_uwag || 0), 0),
      dzisiaj: data === dzisiaj(), podglad, data,
      // Trasa bez kierowcy to codzienna kontrola biura; w dniach minionych nie ma już czego przydzielać.
      bezKierowcy: data >= dzisiaj() ? p.trasy.filter(t => !t.kierowca_imie && t.status === 'planowana').length : 0,
      // konto „podgląd” nie ma dostępu do zaległych, odrzuconych i braków (serwer odpowiada 403) — nie pytamy
      oczekiwane: new Set(['zywo'].concat(podglad ? [] : ['przyjecie', 'zalegle', 'odrzucone', 'braki'],
        jestAdministratorem() ? ['alarmy'] : [])),
    };

    pole.innerHTML = `
      <div class="pasek-narzedzi">
        <label>Dzień<input type="date" id="p-data" value="${data}"></label>
        <button id="p-wczoraj">${ikonka('strzalka-lewo')}Poprzedni</button>
        <button id="p-dzis"${data === dzisiaj() ? ' aria-current="date"' : ''}>Dziś</button>
        <button id="p-jutro">Następny${ikonka('strzalka-prawo', 16, true)}</button>
        <button class="glowny" id="p-planuj">+ Nowa trasa</button>
      </div>

      <div id="p-kafelki" class="kafelki-liczb" aria-label="Najważniejsze liczby dnia"></div>

      ${podglad ? '' : htmlFiltrowPulpitu(czytajFiltryPulpitu())}

      <div id="p-do-przyjecia"></div>

      <div id="p-zywo"></div>

      ${p.nieudane.length ? `
        <h2 style="margin-top:20px" id="p-nieudane">Nieudane dostawy — do decyzji</h2>
        ${nieudaneWidoczne.length < p.nieudane.length ? `<p class="male slaby" style="margin:0 0 6px">Filtry ukrywają ${p.nieudane.length - nieudaneWidoczne.length} z ${p.nieudane.length}.</p>` : ''}
        ${nieudaneWidoczne.length ? '' : '<span id="p-nieudane-karta" hidden></span>'}
        <div class="karta" id="p-nieudane-karta"${nieudaneWidoczne.length ? '' : ' hidden'}>
          ${nieudaneWidoczne.map(n => `<div style="padding:9px 0;border-bottom:1px solid var(--ramka)" data-nieudany="${n.id}">
              <b>${escHtml(n.klient_nazwa)}</b>
              <span class="plakietka p-nieudane" style="margin-left:6px">${escHtml(n.powod)}</span>
              <div class="male slaby">${samaGodzina(n.zamkniete_o)} ${escHtml(n.notatka || '')}</div>
              <div class="nu-dowody"></div>
              <div class="przyciski" style="margin-top:6px"><button class="maly" data-do-trasy="${n.trasa}">Trasa</button>
                ${podglad ? '' : `<button class="maly" data-na-jutro="${n.id}" data-trasa-kierowcy="${n.trasa}">Przenieś na jutro</button>`}</div>
            </div>`).join('')}
        </div>` : ''}

      ${podglad ? '' : `<details class="zaawansowane" id="p-zatwierdzone">
        <summary><span class="znak-zwiniecia">${ikonka('szewron-prawo')}</span> Ostatnio zatwierdzone (24 h) <span class="filtry-licznik" id="p-zatwierdzone-licznik" hidden></span></summary>
        <div id="p-zatwierdzone-tresc" class="male slaby">Otwórz, żeby zobaczyć dostawy zatwierdzone w ostatniej dobie.</div>
      </details>`}

      <div class="gdzie-auta-gora">
        <h2 style="margin:0">Gdzie są auta
          <span class="male slaby" style="font-weight:400">
            ${p.ostatnie_pozycje.length ? '' : (p.ikol ? '— brak dziś pozycji z lokalizatorów' : '— żaden kierowca nie udostępnia teraz położenia')}</span>
        </h2>
        ${chipyAutHtml(p.auta_ikol)}
      </div>
      ${p.ostatnie_pozycje.length ? '' : `<div class="male slaby mapa-podpowiedz">${p.ikol
        ? 'Auta pojawią się na mapie, gdy lokalizator w aucie przekaże pozycję (Ustawienia → Lokalizatory w autach: przypisz lokalizator do kierowcy). Do tego czasu mapa jest zmniejszona.'
        : 'Auta pojawią się na mapie, gdy kierowca włączy udostępnianie położenia w „Mojej trasie”. Do tego czasu mapa jest zmniejszona.'}
        <button type="button" class="maly" id="p-mapa-rozmiar" aria-expanded="false">Powiększ mapę</button></div>`}
      <div class="mapa${p.ostatnie_pozycje.length ? '' : ' zwinieta'}" id="p-mapa"></div>`;

    pole.querySelector('#p-data').onchange = e => pokazEkran('pulpit', { data: e.target.value });
    pole.querySelector('#p-wczoraj').onclick = () => pokazEkran('pulpit', { data: przesunDate(data, -1) });
    pole.querySelector('#p-jutro').onclick = () => pokazEkran('pulpit', { data: przesunDate(data, 1) });
    pole.querySelector('#p-dzis').onclick = () => pokazEkran('pulpit', { data: dzisiaj() });
    pole.querySelector('#p-planuj').onclick = () => pokazEkran('trasy', { data });
    rysujKafelkiPulpitu();
    const ileDoPrzyjecia = await rysujDoPrzyjecia(pole.querySelector('#p-do-przyjecia'), () => pokazEkran('pulpit', { data }));
    if (!podglad) { pulpitSprawy.doPrzyjecia = ileDoPrzyjecia; pulpitSprawy.oczekiwane.delete('przyjecie'); rysujKafelkiPulpitu(); }
    await rysujZywo(pole.querySelector('#p-zywo'), data);
    odswiezajZywo(data);
    wzbogacNieudane(pole.querySelector('#p-nieudane-karta'), nieudaneWidoczne);
    podepnijPrzenosinyNaJutro(pole, p.trasy, () => pokazEkran('pulpit', { data }));
    if (!podglad) {
      podepnijFiltryPulpitu(pole, () => pokazEkran('pulpit', { data }));
      podepnijZatwierdzone(pole.querySelector('#p-zatwierdzone'));
    }

    // Alarmy (kopie, adres na Pages, tunel, dysk) — tylko administrator
    // może coś z nimi zrobić, więc tylko on je widzi.
    const gotowe = klucz => { pulpitSprawy.oczekiwane.delete(klucz); rysujKafelkiPulpitu(); };
    if (jestAdministratorem()) API.get('/api/alarmy').then(w => {
      pulpitSprawy.alarmy = w.alarmy || [];
    }).catch(() => {}).then(() => gotowe('alarmy'));

    // Zaległości są pierwszą rzeczą, o którą pyta klient przez telefon
    // („mieliście przywieźć wczoraj"), więc widać je od razu na pulpicie.
    if (!podglad) API.get('/api/zalegle').then(w => {
      pulpitSprawy.zalegle = w.zalegle.length ? w.zalegle : null;
    }).catch(() => {}).then(() => gotowe('zalegle'));

    // Dowody, których serwer nie przyjął — podpis odbiorcy czeka na decyzję biura.
    if (!podglad) API.get('/api/odrzucone').then(w => {
      pulpitSprawy.odrzucone = (w.odrzucone || []).length;
    }).catch(() => {}).then(() => gotowe('odrzucone'));

    // krótka zajawka listy braków — pełna jest przy raportach
    if (!podglad) API.get('/api/braki').then(w => {
      pulpitSprawy.braki = w.braki.length ? w : null;
    }).catch(() => {}).then(() => gotowe('braki'));

    const mapa = Mapa.zaloz(pole.querySelector('#p-mapa'));
    const przyciskRozmiaru = pole.querySelector('#p-mapa-rozmiar');
    if (przyciskRozmiaru) przyciskRozmiaru.onclick = () => {
      const mala = pole.querySelector('#p-mapa').classList.toggle('zwinieta');
      przyciskRozmiaru.textContent = mala ? 'Powiększ mapę' : 'Zmniejsz mapę';
      przyciskRozmiaru.setAttribute('aria-expanded', mala ? 'false' : 'true');
      if (mapa && mapa.invalidateSize) mapa.invalidateSize();
    };
    const punkty = [];
    // Najpierw NASZE miejsca (ciemne kwadraty), potem busy (zwykle pinezki).
    // Rozróżnienie jest po to, żeby na jednej mapie było widać, co jest
    // magazynem, a co jadącym samochodem.
    (kontoBiura() ? API.get('/api/lokalizacje') : Promise.resolve([])).then(lokalizacje => {
      stan.lokalizacje = lokalizacje;
      const dodatkowe = [];
      lokalizacje.filter(l => l.lat != null).forEach(l => {
        Mapa.znacznikFirmowy(mapa, l);
        dodatkowe.push([l.lat, l.lon]);
      });
      if (dodatkowe.length) Mapa.dopasujWidok(mapa, punkty.concat(dodatkowe));
    }).catch(() => {});
    if (p.baza && !punkty.length) punkty.push(p.baza);
    pulpitAuta = { mapa, znaczniki: {}, data, auta: p.auta_ikol || [], wybrane: null, podswietl: null };
    rysujAutaNaMapie(p.ostatnie_pozycje);
    podepnijChipyAut(pole);
    p.ostatnie_pozycje.forEach(poz => punkty.push([poz.lat, poz.lon]));
    Mapa.dopasujWidok(mapa, punkty);
  },
};

/* Auta na mapie pulpitu. Wołane raz przy rysowaniu i potem co 30 s z odświeżania
   „na żywo”: pinezka przesuwa się na nowe miejsce, nie znika i nie wraca. */
let pulpitAuta = null;   // { mapa, znaczniki: { kierowca: pinezka }, data }

function rysujAutaNaMapie(pozycje) {
  if (!pulpitAuta) return;
  const { mapa, znaczniki } = pulpitAuta;
  const widziane = new Set();
  pozycje.forEach(poz => {
    widziane.add(String(poz.kierowca));
    const dymek = `<b>${escHtml(poz.kierowca_imie)}</b><br>ostatnio: ${escHtml(poz.czas)}`
      + `<br><span style="opacity:.7">${poz.zrodlo === 'lokalizator' ? 'lokalizator w aucie' : 'telefon kierowcy'}</span>`;
    const jest = znaczniki[poz.kierowca];
    // przez moduł, nie przez Leaflet wprost — mapa może być od Google
    if (jest) Mapa.przesunZnacznik(jest, [poz.lat, poz.lon], dymek);
    else znaczniki[poz.kierowca] = Mapa.znacznikPozycji(mapa, [poz.lat, poz.lon], dymek);
  });
  Object.keys(znaczniki).forEach(k => {
    if (!widziane.has(k)) { Mapa.usunZnacznik(mapa, znaczniki[k]); delete znaczniki[k]; }
  });
}

async function odswiezAutaNaMapie() {
  if (!pulpitAuta) return;
  const p = await API.get('/api/pulpit?data=' + pulpitAuta.data);
  rysujAutaNaMapie(p.ostatnie_pozycje || []);
  pulpitAuta.auta = p.auta_ikol || [];
  odswiezChipyAut();                       // wybrane auto zostaje wybrane, mapa za nim podąża (bez zmiany powiększenia)
}

/* ---- Przyciski „gdzie jest auto” nad mapą Pulpitu (2026-11-18, decyzja właściciela)
   Źródło: wyłącznie lokalizatory IKOL (pole `auta_ikol` odpowiedzi /api/pulpit). Klik = mapa na aucie (powiększenie 14)
   z dymkiem: auto, kierowca, czas ostatniej pozycji, prędkość; mapa za nim podąża przy odświeżaniu co 30 s, ale zostawia
   powiększenie użytkownika. Ponowny klik = odpięcie i powrót do widoku całej floty. Auto bez pozycji — wyszarzone. */
function opisCzasuAuta(czas) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(czas || ''));
  if (!m) return '';
  const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const min = Math.round((Date.now() - t.getTime()) / 60000);
  const godz = `${m[4]}:${m[5]}`;
  if (min < 1) return 'przed chwilą';
  if (min < 60) return `${min} min temu`;
  const dzien = `${m[1]}-${m[2]}-${m[3]}`;
  const wczoraj = przesunDate(dzisiaj(), -1);
  if (dzien === dzisiaj()) return `dziś ${godz}`;
  if (dzien === wczoraj) return `ostatnia pozycja wczoraj ${godz}`;
  return `ostatnia pozycja ${polskaData(dzien)} ${godz}`;
}

function chipyAutHtml(auta) {
  if (!auta || !auta.length) return '';
  return `<div class="auta-chipy" id="p-auta-chipy" role="group" aria-label="Gdzie jest auto">${
    auta.map(a => `<button type="button" class="auto-chip" data-auto="${escHtml(a.klucz)}" aria-pressed="false"><span class="auto-kropka" aria-hidden="true"></span>${escHtml(a.nazwa)}</button>`).join('')}</div>`;
}

function dymekAuta(a) {
  const kmh = a.predkosc != null && Number.isFinite(Number(a.predkosc)) ? `<br>prędkość: ${Math.round(Number(a.predkosc))} km/h` : '';
  return `<b>${escHtml(a.nazwa)}</b>${a.kierowca_imie ? '<br>kierowca: ' + escHtml(a.kierowca_imie) : ''}`
    + `<br>${escHtml(opisCzasuAuta(a.czas))}${kmh}<br><span style="opacity:.7">lokalizator w aucie</span>`;
}

function odswiezChipyAut() {
  if (!pulpitAuta) return;
  const wiersz = document.getElementById('p-auta-chipy');
  const auta = pulpitAuta.auta || [];
  if (wiersz) wiersz.querySelectorAll('[data-auto]').forEach(b => {
    const a = auta.find(x => x.klucz === b.dataset.auto);
    const jest = !!(a && a.lat != null && a.lon != null);
    b.disabled = !jest;
    b.classList.toggle('wyszarzony', !jest);
    b.title = jest ? `${a.nazwa}${a.kierowca_imie ? ' · ' + a.kierowca_imie : ''} — ${opisCzasuAuta(a.czas)}. Kliknij, żeby pokazać na mapie.`
      : 'brak pozycji z lokalizatora';
    const wybrany = pulpitAuta.wybrane === b.dataset.auto;
    b.classList.toggle('wybrany', wybrany);
    b.setAttribute('aria-pressed', wybrany ? 'true' : 'false');
  });
  const a = pulpitAuta.wybrane && auta.find(x => x.klucz === pulpitAuta.wybrane);
  if (!pulpitAuta.wybrane) return;
  if (!a || a.lat == null) { odepnijAuto(false); return; }
  const punkt = [a.lat, a.lon];
  if (pulpitAuta.podswietl) Mapa.przesunZnacznik(pulpitAuta.podswietl, punkt, dymekAuta(a));
  else pulpitAuta.podswietl = Mapa.znacznikPozycji(pulpitAuta.mapa, punkt, dymekAuta(a));
  Mapa.przesunDo(pulpitAuta.mapa, punkt);
}

function odepnijAuto(wracaj) {
  const { mapa } = pulpitAuta;
  if (pulpitAuta.podswietl) { Mapa.usunZnacznik(mapa, pulpitAuta.podswietl); pulpitAuta.podswietl = null; }
  pulpitAuta.wybrane = null;
  if (wracaj && mapa._ostatnieDopasowanie) Mapa.dopasujWidok(mapa, mapa._ostatnieDopasowanie);
  odswiezChipyAut();
}

function podepnijChipyAut(pole) {
  const wiersz = pole.querySelector('#p-auta-chipy');
  if (!wiersz) return;
  odswiezChipyAut();
  wiersz.querySelectorAll('[data-auto]').forEach(b => b.onclick = () => {
    if (!pulpitAuta) return;
    if (pulpitAuta.wybrane === b.dataset.auto) { odepnijAuto(true); return; }      // drugi klik: cała flota
    const a = (pulpitAuta.auta || []).find(x => x.klucz === b.dataset.auto);
    if (!a || a.lat == null) return;
    const mapaEl = pole.querySelector('#p-mapa');
    if (mapaEl && mapaEl.classList.contains('zwinieta')) {                          // zwiniętą mapę rozwijamy
      mapaEl.classList.remove('zwinieta');
      const rozmiar = pole.querySelector('#p-mapa-rozmiar');
      if (rozmiar) { rozmiar.textContent = 'Zmniejsz mapę'; rozmiar.setAttribute('aria-expanded', 'true'); }
      if (pulpitAuta.mapa.invalidateSize) pulpitAuta.mapa.invalidateSize();
    }
    if (pulpitAuta.podswietl) { Mapa.usunZnacznik(pulpitAuta.mapa, pulpitAuta.podswietl); pulpitAuta.podswietl = null; }
    pulpitAuta.wybrane = b.dataset.auto;
    const punkt = [a.lat, a.lon];
    pulpitAuta.podswietl = Mapa.znacznikPozycji(pulpitAuta.mapa, punkt, dymekAuta(a));
    Mapa.przyblizDo(pulpitAuta.mapa, punkt, 14);
    Mapa.otworzDymek(pulpitAuta.podswietl);
    odswiezChipyAut();
  });
}

/* Pulpit: rząd kafelków liczb zamiast listy „Do zrobienia” (właściciel 2026-11-17: „upodobnij pulpity Tras i Panelu
   Kierownika”). Jak w Panelu: pokazujemy tylko kafelki z liczbą większą od zera, kolor mówi o wadze (czerwony =
   problem, żółty = czeka na decyzję, zielony = dobrze, zwykły = stan), a gdy nic nie czeka — jedno spokojne zdanie.
   Te same sprawy, te same warunki pokazywania i te same przejścia co dawna lista (alarmy tylko dla administratora);
   dopisane są liczby dnia (punkty, dostarczone, nieudane) i „do zatwierdzenia”. Każda odpowiedź serwera uzupełnia
   swoją część stanu i przerysowuje cały rząd, więc kolejność jest stała bez względu na to, która przyjdzie pierwsza. */
let pulpitSprawy = { alarmy: [], pilne: 0, zalegle: null, odrzucone: 0, braki: null, oczekiwane: new Set() };

/* Jeden filtr braków dla kafelka „Do sprawdzenia” na Pulpicie i dla listy po kliknięciu (ekran „Do sprawdzenia”):
   raport pracy powstaje sam z tras, a punkty z minionych tras („niezamknięty”) liczy kafelek „Zaległe dostawy” —
   tu ich nie powtarzamy, żeby liczba na kafelku zgadzała się z listą (recenzja 2026-11-18). */
function brakiDoSprawdzenia(lista) {
  return (lista || []).filter(b => b.rodzaj !== 'brak_raportu' && b.rodzaj !== 'niezamkniety');
}

/* ------------------------------------------------ filtry Pulpitu (2026-11-18)

   Jeden zwarty pasek nad sekcjami Pulpitu („Do zatwierdzenia”, „Nieudane — do decyzji”, „Ostatnio zatwierdzone”):
   kierowca, auto, klient (tekst), rodzaj zatwierdzenia (tylko dla zatwierdzonych), sortowanie i „Wyczyść”. Filtruje to,
   co już pobrano (żadnych nowych endpointów); kafelki z liczbami nadal liczą wszystko. Pamięć OSOBNO DLA KAŻDEJ OSOBY:
   NOWY klucz „filtry-pulpit-<id osoby>” (Pamiec, przedrostek gk-trasy.) — istniejących kluczy nie ruszamy. */
const FILTRY_PULPITU_POLA = ['kierowca', 'auto', 'klient', 'rodzaj', 'sort'];
const FILTRY_PULPITU_SORT = { nowe: 'Najnowsze → najstarsze', stare: 'Najstarsze → najnowsze', kierowca: 'Kierowca A–Z' };

function czytajFiltryPulpitu() {
  const f = { kierowca: '', auto: '', klient: '', rodzaj: '', sort: '' };
  try {
    const z = JSON.parse(Pamiec.czytaj('filtry-pulpit-' + (stan.uz && stan.uz.id != null ? stan.uz.id : 'x')) || '{}');
    if (z && typeof z === 'object') FILTRY_PULPITU_POLA.forEach(k => { if (typeof z[k] === 'string') f[k] = z[k]; });
  } catch (e) { /* uszkodzony zapis — jak pusty */ }
  if (f.sort && !FILTRY_PULPITU_SORT[f.sort]) f.sort = '';
  if (f.rodzaj !== 'reczne' && f.rodzaj !== 'auto') f.rodzaj = '';
  return f;
}

function zapiszFiltryPulpitu(f) {
  const z = { v: 1 };
  FILTRY_PULPITU_POLA.forEach(k => { if (f[k]) z[k] = f[k]; });
  Pamiec.zapisz('filtry-pulpit-' + (stan.uz && stan.uz.id != null ? stan.uz.id : 'x'), JSON.stringify(z));
}

function ileFiltrowPulpitu(f) { return FILTRY_PULPITU_POLA.filter(k => k !== 'sort' && f[k]).length + (f.sort ? 1 : 0); }

/* Czyste filtrowanie i sortowanie listy sekcji. `a`: kierowca(x), auto(x), klient(x), czas(x) i (tylko zatwierdzone)
   rodzaj(x) = 'reczne' | 'auto'. Pole, którego sekcja nie ma (np. rodzaj w „Nieudanych”), jest pomijane. */
function filtrujPulpit(lista, f, a) {
  const klient = String(f.klient || '').trim().toLowerCase();
  let w = (lista || []).filter(x =>
    (!f.kierowca || a.kierowca(x) === f.kierowca) && (!f.auto || a.auto(x) === f.auto)
    && (!klient || String(a.klient(x) || '').toLowerCase().includes(klient))
    && (!f.rodzaj || !a.rodzaj || a.rodzaj(x) === f.rodzaj));
  // Właściciel 2026-11-19: „Domyślnie” (pusta wartość) = od najnowszych (zamknięcie dostawy, zatwierdzenie, start trasy).
  const sort = f.sort || 'nowe';
  {
    const czas = x => String(a.czas(x) || '');
    w = w.map((x, i) => [x, i]).sort((p, q) => {
      if (sort === 'kierowca') {
        const r = String(a.kierowca(p[0]) || '~').localeCompare(String(a.kierowca(q[0]) || '~'), 'pl');
        if (r) return r;
      } else {
        const r = czas(p[0]).localeCompare(czas(q[0])) * (sort === 'nowe' ? -1 : 1);
        if (r) return r;
      }
      return p[1] - q[1];
    }).map(p => p[0]);
  }
  return w;
}

function htmlFiltrowPulpitu(f) {
  const ile = ileFiltrowPulpitu(f);
  const opcje = (lista, wybrany, wszystkie) => `<option value="">${wszystkie}</option>`
    + lista.map(n => `<option value="${escHtml(n)}"${n === wybrany ? ' selected' : ''}>${escHtml(n)}</option>`).join('');
  const kierowcy = (stan.kierowcy || []).map(k => k.imie).filter(Boolean).sort((p, q) => p.localeCompare(q, 'pl'));
  const auta = (stan.pojazdy || []).filter(b => b.aktywny).map(b => b.nazwa).filter(Boolean).sort((p, q) => p.localeCompare(q, 'pl'));
  const akt = k => (f[k] ? ' class="filtr-aktywny"' : '');
  return `<div class="filtry-listy${ile ? ' aktywne' : ''}" id="p-filtry" role="group" aria-label="Filtry i sortowanie Pulpitu">
      <div class="filtry-gora">
        <span class="filtry-podsumowanie" style="font-weight:700">Filtry dostaw i tras niżej</span>
        ${ile ? `<span class="filtry-plakietka" title="Włączone filtry">${ile} ${odmiana(ile, 'filtr', 'filtry', 'filtrów')}</span>` : ''}
        <button type="button" class="maly filtry-wyczysc" data-pf-wyczysc${ile ? '' : ' disabled'}>Wyczyść</button>
      </div>
      <div class="filtry-pasek">
        <label${akt('sort')}>Sortowanie<select data-pf="sort"><option value="">Domyślnie</option>
          ${Object.keys(FILTRY_PULPITU_SORT).map(k => `<option value="${k}"${f.sort === k ? ' selected' : ''}>${FILTRY_PULPITU_SORT[k]}</option>`).join('')}</select></label>
        <label${akt('kierowca')}>Kierowca<select data-pf="kierowca">${opcje(kierowcy, f.kierowca, 'Wszyscy')}</select></label>
        <label${akt('auto')}>Auto<select data-pf="auto">${opcje(auta, f.auto, 'Wszystkie auta')}</select></label>
        <label${akt('klient')}>Klient<input type="search" data-pf="klient" value="${escHtml(f.klient)}" placeholder="część nazwy" autocomplete="off"></label>
        <label${akt('rodzaj')}>Zatwierdzone<select data-pf="rodzaj"><option value="">Wszystkie</option>
          <option value="reczne"${f.rodzaj === 'reczne' ? ' selected' : ''}>ręcznie (biuro)</option>
          <option value="auto"${f.rodzaj === 'auto' ? ' selected' : ''}>automatycznie</option></select></label>
      </div>
    </div>`;
}

function podepnijFiltryPulpitu(pole, przerysuj) {
  const f = czytajFiltryPulpitu();
  pole.querySelectorAll('[data-pf]').forEach(el => el.onchange = () => {
    f[el.dataset.pf] = el.value;
    zapiszFiltryPulpitu(f); przerysuj();
  });
  pole.querySelectorAll('[data-pf-wyczysc]').forEach(b => b.onclick = () => {
    FILTRY_PULPITU_POLA.forEach(k => { f[k] = ''; });
    zapiszFiltryPulpitu(f); przerysuj();
  });
}

/* Dostęp do pól elementów poszczególnych sekcji Pulpitu. */
const AKCESORIA_PULPITU = {
  przyjecie: { kierowca: x => x.kierowca_imie, auto: x => x.pojazd_nazwa, klient: x => x.klient_nazwa, czas: x => x.zamkniete_o },
  zatwierdzone: { kierowca: x => x.kierowca_imie, auto: x => x.pojazd_nazwa, klient: x => x.klient_nazwa, czas: x => x.przyjeto_o,
                  rodzaj: x => (x.przyjete_auto ? 'auto' : 'reczne') },
  // „Trasy w toku”: element to wiersz z /api/tablica; klient — nazwy punktów, jeśli już je znamy (patrz klienciTrasZywo).
  zywo: { kierowca: t => t.kierowca, auto: t => t.pojazd, klient: t => klienciTrasZywo(t), czas: t => t.start_o || t.wyjazd || '' },
  nieudane: trasy => {
    const po = new Map((trasy || []).map(t => [t.id, t]));
    return { kierowca: n => (po.get(n.trasa) || {}).kierowca_imie, auto: n => (po.get(n.trasa) || {}).pojazd_nazwa,
             klient: n => n.klient_nazwa, czas: n => n.zamkniete_o };
  },
};

/* Czysta funkcja (testowana w przeglądarce bez okna): ze stanu pulpitu robi listę kafelków, w kolejności
   wagi — najpierw sprawy, potem liczby dnia. Nic nie dotyka strony. */
function kafelkiPulpitu(s) {
  const lista = [];
  // Raport pracy tworzy się sam z tras — brak ręcznego raportu kierowcy nie jest już sprawą do sprawdzenia.
  let braki = s.braki;
  if (braki && Array.isArray(braki.braki)) {
    braki = { ...braki, braki: brakiDoSprawdzenia(braki.braki) };
    if (!braki.braki.length && !(braki.spalanie || []).length) braki = null;
  }
  if (s.zalegle && s.zalegle.length) lista.push({
    kod: 'zalegle', etykieta: 'Zaległe dostawy', liczba: s.zalegle.length, klasa: 'pilne', idzie: 'zalegle',
    opis: s.zalegle.slice(0, 3).map(z => z.klient_nazwa).join(', ') + (s.zalegle.length > 3 ? '…' : '') + ' — wyznacz nadrobienie',
  });
  if (s.odrzucone) lista.push({
    kod: 'odrzucone', etykieta: 'Odrzucone zapisy z telefonów', liczba: s.odrzucone, klasa: 'pilne', idzie: 'odrzucone',
    opis: 'Przyjmij albo pobierz',
  });
  if (s.pilne) lista.push({
    kod: 'pilne', etykieta: 'Sprawy do decyzji na trasach', liczba: s.pilne, klasa: 'uwaga', idzie: 'zywo',
    opis: 'Szczegóły w sekcji „Trasy w toku” niżej.',
  });
  if (s.nieudane) lista.push({
    kod: 'nieudane', etykieta: 'Nieudane', liczba: s.nieudane, klasa: 'uwaga', idzie: 'nieudane',
    opis: 'Dostawy, których nie udało się zrobić — do decyzji niżej.',
  });
  if (s.uwagi) lista.push({
    kod: 'uwagi-trasy', etykieta: 'Uwagi w trasie', liczba: s.uwagi, klasa: 'uwaga', idzie: null,
    opis: 'Kierowcy zgłosili objazd, awarię albo dłuższy załadunek — szczegóły na karcie trasy.',
  });
  if (s.doPrzyjecia) lista.push({
    kod: 'do-zatwierdzenia', etykieta: 'Do zatwierdzenia', liczba: s.doPrzyjecia, klasa: 'uwaga',
    idzie: s.podglad ? null : 'przyjecie', opis: 'Dostawy zamknięte przez kierowców czekają na Twoją decyzję.',
  });
  if (s.bezKierowcy) lista.push({
    kod: 'bez-kierowcy', etykieta: 'Trasy bez kierowcy', liczba: s.bezKierowcy, klasa: 'uwaga',
    idzie: s.podglad ? null : 'bez-kierowcy', dzien: s.data, opis: 'Przydziel kierowcę — otwiera listę tych tras.',
  });
  if (braki) lista.push({
    kod: 'braki', etykieta: 'Do sprawdzenia', liczba: braki.braki.length,
    klasa: braki.braki.some(b => b.rodzaj === 'brak_raportu' || b.rodzaj === 'licznik') ? 'uwaga' : 'neutralne', idzie: 'braki',
    opis: braki.braki.slice(0, 2).map(b => b.opis).join('; ') + (braki.braki.length > 2 ? '…' : '') + ' — zobacz wszystko',
    od: braki.od, do: braki.do,
  });
  lista.push({ kod: 'punkty', etykieta: s.dzisiaj ? 'Punkty na dziś' : 'Punkty tego dnia', liczba: s.punkty || 0, klasa: 'neutralne' });
  lista.push({ kod: 'dostarczone', etykieta: 'Dostarczone', liczba: s.dostarczone || 0, klasa: 'dobrze' });
  // Alarmy administratora (kopie, tunel, dysk) pod liczbami dnia, jak w Panelu: liczby są tym, po co się otwiera Pulpit.
  (s.alarmy || []).forEach(a => lista.push({
    kod: 'alarm', etykieta: a.tytul, opis: a.tresc || '', liczba: 1, klasa: a.poziom === 'blad' ? 'pilne' : 'uwaga',
    doUstawien: a.kod || '',
  }));
  // Tak jak W.kafelkiDoPokazania w Panelu: zera to szum, w którym ginie jedyna ważna liczba.
  const widoczne = lista.filter(k => k.liczba > 0);
  // „Wszystko w porządku” dopiero, gdy wrócą wszystkie odpowiedzi — przed tym to byłoby zgadywanie.
  return { kafelki: widoczne, spokoj: !widoczne.length && !(s.oczekiwane && s.oczekiwane.size) };
}

function rysujKafelkiPulpitu() {
  const el = document.getElementById('p-kafelki');
  if (!el) return;
  const w = kafelkiPulpitu(pulpitSprawy);
  const klik = k => k.doUstawien !== undefined || !!k.idzie;
  el.innerHTML = w.spokoj ? ('<p class="spokoj">' + ikonka('haczyk') + 'Wszystko w porządku — nic nie czeka na decyzję</p>') : w.kafelki.map((k, i) => {
    // Alarm nie ma liczby: ikona stoi w linii z tytułem, a pod nim — pełny opis (dawniej tylko w dymku, kafelek wyglądał na pusty).
    const wnetrze = k.kod === 'alarm'
      ? `<span class="etykieta">${ikonka('ostrzezenie')}${escHtml(k.etykieta)}</span>${k.opis ? `<span class="kafel-opis">${escHtml(k.opis)}</span>` : ''}`
      : `<span class="etykieta">${escHtml(k.etykieta)}</span><b>${escHtml(k.liczba)}</b>`;
    const tytul = k.opis ? ` title="${escHtml(k.opis)}"` : '';
    return klik(k)
      ? `<button type="button" class="${escHtml(k.klasa + (k.kod === 'alarm' ? ' alarm' : ''))}" data-kafel="${i}"${tytul}>${wnetrze}</button>`
      : `<div class="${escHtml(k.klasa + (k.kod === 'alarm' ? ' alarm' : ''))}"${tytul}>${wnetrze}</div>`;
  }).join('');
  if (typeof MiaryTras !== 'undefined') MiaryTras.dolaczDoKafli(el, w.spokoj ? [] : w.kafelki);   // „i” z definicją (miary.js)

  el.querySelectorAll('[data-kafel]').forEach(b => {
    const k = w.kafelki[Number(b.dataset.kafel)];
    b.onclick = () => {
      const przewin = id => { const c = document.getElementById(id); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      if (k.doUstawien !== undefined) {
        // Prosto do sekcji, która alarm naprawia — leży pod zwiniętym „Zaawansowane”.
        pokazEkran('ustawienia', { sekcja: SEKCJA_ALARMU[k.doUstawien] });
      } else if (k.idzie === 'zywo') przewin('p-zywo');
      else if (k.idzie === 'nieudane') przewin('p-nieudane');
      else if (k.idzie === 'przyjecie') przewin('p-do-przyjecia');
      else if (k.idzie === 'zalegle') pokazEkran('zalegle');
      else if (k.idzie === 'odrzucone') pokazEkran('odrzucone');
      else if (k.idzie === 'bez-kierowcy') pokazTrasyBezKierowcy(k.dzien);
      // ten sam zakres, żeby liczba z pulpitu zgadzała się z listą po kliknięciu
      else if (k.idzie === 'braki') pokazEkran('raporty', { od: k.od, do: k.do });
    };
  });
}

/* Kafelek „Trasy bez kierowcy” → lista dnia z filtrem „Bez kierowcy” + „planowana” (te same trasy co w kafelku; zakończone i
   odwołane nie liczą się nigdzie). Filtr jest TYMCZASOWY: nie nadpisuje zapamiętanych filtrów osoby, pierwsza zmiana filtra
   na liście zapisuje już to, co widać. */
function pokazTrasyBezKierowcy(dzien) {
  pokazEkran('trasy', { data: dzien, widok: 'dzien', filtrTymczasowy: { kierowca: '-', status: 'planowana' } });
}

function kafelek(napis, wartosc, kolor) {
  return `<div class="karta" style="text-align:center">
      <div class="male slaby">${escHtml(napis)}</div>
      <div class="liczba-kafelka" style="font-size:30px;font-weight:800;color:${kolor || 'var(--tekst)'}">${wartosc}</div>
    </div>`;
}

function przesunDate(iso, oIle) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + oIle);
  return dataLokalna(d);
}

/* ================================================================= TRASY */

EKRANY.trasy = {
  tytul: 'Trasy',
  async rysuj(pole, param) {
    const admin = jestBiuro();
    const data = param.data || dzisiaj();
    const od = param.od || (admin ? data : przesunDate(dzisiaj(), -30));
    const doDnia = param.do || data;
    // Biuro widzi też zlecenia odwołane (na końcu, wyszarzone) — zostały
    // w historii, bo miały dowody albo czekające zapisy telefonu.
    const trasy = admin
      ? await API.get('/api/trasy?odwolane=1&data=' + data)
      : await API.get(`/api/trasy?od=${od}&do=${doDnia}`);
    if (admin) trasy.sort((a, b) => (a.status === 'odwolana') - (b.status === 'odwolana'));

    if (!admin) {
      pole.innerHTML = `
        <div class="pasek-narzedzi">
          <label>Od<input type="date" id="t-od" value="${od}"></label>
          <label>Do<input type="date" id="t-do" value="${doDnia}"></label>
        </div>
        ${trasy.length ? trasy.map(t => kartaTrasy(t)).join('')
          : '<div class="karta"><div class="pusto">Brak tras w tym okresie.</div></div>'}`;
      const odswiez = () => pokazEkran('trasy', {
        od: pole.querySelector('#t-od').value, do: pole.querySelector('#t-do').value,
      });
      pole.querySelector('#t-od').onchange = odswiez;
      pole.querySelector('#t-do').onchange = odswiez;
      pole.querySelectorAll('[data-trasa]').forEach(b =>
        b.onclick = () => pokazEkran('trasa', { id: Number(b.dataset.trasa) }));
      return;
    }

    const kierowcy = await listaKierowcow();
    // ZAWSZE świeżo — inaczej po skasowaniu magazynu zostaje on na liście wyboru.
    await odswiezLokalizacje();
    // Widok „Tydzień” (właściciel 2026-11-16): pn–nd pod sobą; wybór pamiętany na tym urządzeniu.
    const zapisanyWidok = Pamiec.czytaj('widok_tras');
    const widok = param.widok || (zapisanyWidok === 'tydzien' || zapisanyWidok === 'lista' ? zapisanyWidok : 'dzien');
    if (widok === 'tydzien') { await rysujTydzienTras(pole, data, kierowcy); return; }
    if (widok === 'lista') { await rysujListeTras(pole, data, kierowcy); return; }
    const filtr = await filtrAutaTras(trasy);
    const f = czytajFiltry('trasy');
    if (param.filtrTymczasowy) Object.assign(f, { status: '', kierowca: '', auto: '', miejsce: '', od: '', do: '' }, param.filtrTymczasowy);
    const def = defFiltrowTras('dzien', trasy, kierowcy, filtr);
    const widoczne = odwolaneNaKoniec(zastosujFiltry(trasy, f, def.pola, AKCESORIA_TRAS));
    const bezFiltrow = !aktywneFiltry(f, def.pola).length;
    pole.innerHTML = `
      <div class="pasek-narzedzi">
        ${przelacznikWidokuTras('dzien')}
        <label>Dzień<input type="date" id="t-data" value="${data}"></label>
        <button id="t-wczoraj">${ikonka('strzalka-lewo')}Poprzedni</button><button id="t-dzis"${data === dzisiaj() ? ' aria-current="date"' : ''}>Dziś</button><button id="t-jutro">Następny${ikonka('strzalka-prawo', 16, true)}</button>
        <button class="glowny" id="t-nowa">+ Nowa trasa</button>
        <button id="t-import">${ikonka('raporty')}Wczytaj z Excela</button>
        ${kontoBiura() ? `<button id="t-powtorz" title="Kopiuje trasy ostatniego dnia, w którym były, na ${polskaData(data)}">${ikonka('powtarzaj')}Powtórz wczoraj</button>` : ''}
      </div>
      ${htmlFiltrow(f, def, widoczne.length, trasy.length)}
      ${kierowcy.length ? '' : `<div class="wstega uwaga">
          Nie masz jeszcze żadnego konta kierowcy. Załóż je w ${jestAdministratorem() ? 'Administracji → Pracownicy' : 'Ustawieniach → Konta kierowców'}.</div>`}
      ${widoczne.length ? kartyTrasWgAuta(widoczne)
        : `<div class="karta"><div class="pusto"><span class="duza-ikona">${GKIkony.html('mapa', 38)}</span>
             ${!bezFiltrow && trasy.length ? `Na ${polskaData(data)} żadna trasa nie pasuje do wybranych filtrów.
               <div style="margin-top:8px"><button type="button" class="maly" data-filtr-wyczysc>Wyczyść filtry</button></div>`
               : `Na ${polskaData(data)} nie ma jeszcze trasy.`}
             <div class="male${jestPodgladem() ? ' ukryty' : ''}" style="margin-top:8px">Kliknij „+ Nowa trasa” albo „Wczytaj z Excela”.
               Powtarzalny kurs zrobisz jednym kliknięciem z zapisanej trasy (przełącznik „Zapisane trasy” nad listą).</div></div></div>`}`;

    podepnijPrzelacznikWidokuTras(pole, data);
    podepnijFiltry(pole, 'trasy', f, def, () => pokazEkran('trasy', { data, widok: 'dzien' }));
    pole.querySelector('#t-data').onchange = e => pokazEkran('trasy', { data: e.target.value });
    pole.querySelector('#t-wczoraj').onclick = () => pokazEkran('trasy', { data: przesunDate(data, -1) });
    pole.querySelector('#t-jutro').onclick = () => pokazEkran('trasy', { data: przesunDate(data, 1) });
    pole.querySelector('#t-dzis').onclick = () => pokazEkran('trasy', { data: dzisiaj() });
    pole.querySelector('#t-nowa').onclick = () => oknoNowejTrasy(data, kierowcy);
    pole.querySelector('#t-import').onclick = () => pokazEkran('import');
    const powtorz = pole.querySelector('#t-powtorz');
    if (powtorz) powtorz.onclick = async () => {
      powtorz.disabled = true;
      try { await powtorzPoprzedniDzien(data, trasy.filter(t => t.status !== 'odwolana').length); } finally { powtorz.disabled = false; }
    };
    pole.querySelectorAll('[data-trasa]').forEach(b =>
      b.onclick = () => pokazEkran('trasa', { id: Number(b.dataset.trasa) }));
  },
};

/* „Powtórz wczoraj”: kopiuje na `naDzien` wszystkie trasy ostatniego dnia, w którym były (w poniedziałek to zwykle piątek;
   szukamy do tygodnia wstecz). Każda trasa to osobna, zwykła kopia (`/kopiuj`, jak „Kopiuj na inny dzień”: punkty i kolejność,
   bez potwierdzeń dostaw), więc działa też przez kolejkę podczas aktualizacji serwera. Dzień docelowy nie jest czyszczony. */
let powtarzanieWToku = false;
async function powtorzPoprzedniDzien(naDzien, ileJuzJest) {
  if (powtarzanieWToku) return;           // podwójne kliknięcie nie robi drugiego kompletu kopii
  powtarzanieWToku = true;
  try { await powtorzTrasyZPoprzedniegoDnia(naDzien, ileJuzJest); } finally { powtarzanieWToku = false; }
}

async function powtorzTrasyZPoprzedniegoDnia(naDzien, ileJuzJest) {
  const lista = await sprobuj(() => API.get(`/api/trasy?od=${przesunDate(naDzien, -7)}&do=${przesunDate(naDzien, -1)}`));
  if (!lista) return;
  const zrodlowe = lista.filter(t => t.status !== 'odwolana');
  const dzien = zrodlowe.reduce((max, t) => (t.data > max ? t.data : max), '');
  if (!dzien) { komunikat('W ostatnim tygodniu przed tym dniem nie było tras', 'uwaga'); return; }
  const trasy = zrodlowe.filter(t => t.data === dzien);
  const ile = trasy.length;
  const ktory = dzien === przesunDate(naDzien, -1) ? 'wczorajszego dnia' : 'dnia ' + polskaData(dzien);
  if (!await potwierdz('Powtórzyć trasy?',
    `Skopiuję ${ile} ${odmiana(ile, 'trasę', 'trasy', 'tras')} z ${ktory} na ${polskaData(naDzien)}: punkty i kolejność, bez potwierdzeń dostaw.`
    + (ileJuzJest ? ` Ten dzień ma już ${ileJuzJest} ${odmiana(ileJuzJest, 'trasę', 'trasy', 'tras')} — kopie dojdą obok.` : ''),
    { tak: 'Skopiuj', nie: 'Anuluj' })) return;
  let zrobione = 0;
  for (const t of trasy) {
    const nowa = await sprobuj(() => zapisBiura('POST', `/api/trasy/${t.id}/kopiuj`, { data: naDzien }, {
      opis: `kopia trasy „${t.nazwa || polskaData(t.data)}” na ${polskaData(naDzien)}`,
    }));
    if (!nowa) { komunikat(`Skopiowano ${zrobione} z ${ile} tras — reszty nie udało się skopiować`, 'blad'); break; }
    zrobione++;
  }
  if (zrobione === ile) komunikat(`Skopiowano ${zrobione} ${odmiana(zrobione, 'trasę', 'trasy', 'tras')} na ${polskaData(naDzien)}`, 'ok');
  pokazEkran('trasy', { data: naDzien });
}

/* ------------------------------------------------------------ widok tygodnia */

const DNI_TYGODNIA = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'];

/* Poniedziałek tygodnia, w którym leży dzień `iso` (tydzień pn–nd). getDay(): 0 = niedziela. */
function poczatekTygodnia(iso) {
  const d = new Date(iso + 'T12:00:00');
  return przesunDate(iso, -((d.getDay() + 6) % 7));
}

function przelacznikWidokuTras(aktywny) {
  return `<span class="przelacznik-widoku" role="group" aria-label="Widok tras">
      <button type="button" id="t-widok-dzien" ${aktywny === 'dzien' ? 'class="glowny" aria-pressed="true"' : 'aria-pressed="false"'}>Dzień</button>
      <button type="button" id="t-widok-tydzien" ${aktywny === 'tydzien' ? 'class="glowny" aria-pressed="true"' : 'aria-pressed="false"'}>Tydzień</button>
      <button type="button" id="t-widok-lista" ${aktywny === 'lista' ? 'class="glowny" aria-pressed="true"' : 'aria-pressed="false"'}>Lista</button>${
      jestPodgladem() ? '' : `
      <button type="button" id="t-widok-zapisane" ${aktywny === 'zapisane' ? 'class="glowny" aria-pressed="true"' : 'aria-pressed="false"'}>Zapisane trasy</button>
      <button type="button" id="t-widok-kalendarz" ${aktywny === 'kalendarz' ? 'class="glowny" aria-pressed="true"' : 'aria-pressed="false"'}>Kalendarz</button>`}
    </span>`;
}

function podepnijPrzelacznikWidokuTras(pole, data) {
  pole.querySelector('#t-widok-dzien').onclick = () => { Pamiec.zapisz('widok_tras', 'dzien'); pokazEkran('trasy', { data, widok: 'dzien' }); };
  pole.querySelector('#t-widok-tydzien').onclick = () => { Pamiec.zapisz('widok_tras', 'tydzien'); pokazEkran('trasy', { data, widok: 'tydzien' }); };
  pole.querySelector('#t-widok-lista').onclick = () => { Pamiec.zapisz('widok_tras', 'lista'); pokazEkran('trasy', { data, widok: 'lista' }); };
  // E6: dawne pozycje menu „Zapisane trasy” i „Kalendarz” — te same ekrany, wejście z przełącznika (bez zmiany zapamiętanego widoku).
  const zapisane = pole.querySelector('#t-widok-zapisane'), kalendarz = pole.querySelector('#t-widok-kalendarz');
  if (zapisane) zapisane.onclick = () => pokazEkran('szablony');
  if (kalendarz) kalendarz.onclick = () => pokazEkran('miesiac', { miesiac: String(data).slice(0, 7) });
}

/* Filtr „Auto” w widoku dnia i tygodnia (właściciel 2026-11-17: zobaczyć i filtrować zlecenia, które realizowało dane auto).
   Wybór pamiętany na tym urządzeniu pod nowym kluczem 'filtr_auta' (id auta albo pusty = wszystkie). Filtruje po stronie
   przeglądarki to, co już pobrano — bez zmiany endpointów. Lista auta = wszystkie aktywne auta (gdy API ich nie poda,
   to te, które występują w pobranych trasach). */
let _autaDoFiltra = null;   // lista aut z API na czas sesji strony; kasowana po zapisie auta (D5)
async function filtrAutaTras(trasy) {
  let auta = _autaDoFiltra;
  if (!auta) {
    try { auta = await API.get('/api/pojazdy'); _autaDoFiltra = auta; } catch (e) { auta = []; }
  }
  const mapa = new Map();
  (Array.isArray(auta) ? auta : []).forEach(a => { if (a && a.id != null && a.aktywny !== 0 && a.aktywny !== false) mapa.set(String(a.id), a.nazwa || a.rejestracja || ('Auto ' + a.id)); });
  trasy.forEach(t => { if (t.pojazd && !mapa.has(String(t.pojazd))) mapa.set(String(t.pojazd), t.pojazd_nazwa || ('Auto ' + t.pojazd)); });
  let wybrane = String(Pamiec.czytaj('filtr_auta') || '');
  if (wybrane && wybrane !== '-' && !mapa.has(wybrane)) wybrane = '';   // '-' = „Bez auta”, nie ma go na liście aut
  const opcje = [...mapa.entries()].sort((a, b) => {
    const m = n => { const i = KOLEJNOSC_AUT.indexOf(String(n).trim().toLowerCase()); return i < 0 ? 100 : i; };
    return m(a[1]) - m(b[1]) || a[1].localeCompare(b[1], 'pl');
  });
  return {
    opcje,
    wybrane,
    nazwa: wybrane === '-' ? 'bez auta' : (mapa.get(wybrane) || ''),
    html: opcje.length ? `<label${wybrane ? ' class="filtr-aktywny"' : ''}>Auto<select id="t-filtr-auta">
        <option value="">Wszystkie auta</option>
        ${opcje.map(([id, nazwa]) => `<option value="${escHtml(id)}"${id === wybrane ? ' selected' : ''}>${escHtml(nazwa)}</option>`).join('')}
        <option value="-"${wybrane === '-' ? ' selected' : ''}>Bez auta</option>
      </select></label>${wybrane ? '<button type="button" class="maly" data-filtr-wszystkie>Pokaż wszystkie auta</button>' : ''}` : '',
    zastosuj: lista => !wybrane ? lista
      : lista.filter(t => wybrane === '-' ? !t.pojazd : String(t.pojazd || '') === wybrane),
    podepnij(pole, odswiez) {
      const s = pole.querySelector('#t-filtr-auta');
      if (s) s.onchange = () => { Pamiec.zapisz('filtr_auta', s.value); odswiez(); };
      pole.querySelectorAll('[data-filtr-wszystkie]').forEach(b =>
        b.onclick = () => { Pamiec.zapisz('filtr_auta', ''); odswiez(); });
    },
  };
}

/* ---------------------------------------------------------------- filtry list
   (właściciel 2026-11-17: więcej filtrowania i sortowania na listach tras, Zapisanych tras i Zaległych dostaw)

   Jeden zwijany blok „Filtry” nad listą: sortowanie (jak dotąd / najnowsze → najstarsze / najstarsze → najnowsze),
   zakres dat od–do, status, kierowca, auto, miejsce wyjazdu, „Wyczyść filtry” i licznik „N z M”. Filtruje po stronie
   przeglądarki to, co już pobrano — endpointy się nie zmieniają.

   Wybór pamiętany OSOBNO DLA KAŻDEJ OSOBY na tym urządzeniu: Pamiec z przedrostkiem gk-trasy., NOWE klucze
   „filtry-<lista>-<id osoby>” (lista: trasy, szablony, zalegle), wartość = JSON z samymi tekstami. Stary klucz
   „filtr_auta” zostaje nietknięty (jego wybór tylko podpowiada auto, dopóki osoba nie ma własnego zapisu). */
const FILTRY_POLA = ['sort', 'od', 'do', 'status', 'kierowca', 'auto', 'miejsce'];
const FILTRY_STATUSY = {
  trasy: [['planowana', 'planowana'], ['w_toku', 'w toku'], ['zakonczona', 'zakończona'], ['odwolana', 'odwołana'],
          ['do_zatwierdzenia', 'z dostawami do zatwierdzenia']],
  zalegle: [['oczekuje', 'oczekuje (nie zamknięta)'], ['nieudane', 'nieudana'], ['do_zatwierdzenia', 'do zatwierdzenia']],
};
const FILTRY_ETYKIETY = { sort: 'Sortowanie', od: 'Od', do: 'Do', status: 'Status', kierowca: 'Kierowca', auto: 'Auto',
  miejsce: 'Miejsce wyjazdu' };
const FILTRY_SORTOWANIA = { nowe: 'Najnowsze → najstarsze', stare: 'Najstarsze → najnowsze' };

function kluczFiltrow(lista) {
  return 'filtry-' + lista + '-' + (stan.uz && stan.uz.id != null ? stan.uz.id : 'x');
}

/* Zapisany stan filtrów tej osoby; uszkodzony albo obcy zapis = pusty (nic się nie psuje). */
function czytajFiltry(lista) {
  const f = { sort: '', od: '', do: '', status: '', kierowca: '', auto: '', miejsce: '', otwarte: '' };
  const surowy = Pamiec.czytaj(kluczFiltrow(lista));
  try {
    const z = JSON.parse(surowy || '{}');
    if (z && typeof z === 'object') {
      Object.keys(f).forEach(k => { if (typeof z[k] === 'string') f[k] = z[k]; });
    }
  } catch (e) { /* uszkodzony zapis — jak pusty */ }
  ['od', 'do'].forEach(k => { if (!/^\d{4}-\d{2}-\d{2}$/.test(f[k])) f[k] = ''; });
  if (f.sort !== 'nowe' && f.sort !== 'stare') f.sort = '';
  if (f.otwarte !== '1' && f.otwarte !== '0') f.otwarte = '';
  // Osoba bez własnego zapisu dostaje auto z dawnego wyboru urządzenia (klucz „filtr_auta”, tylko do odczytu).
  if (lista === 'trasy' && !surowy) f.auto = String(Pamiec.czytaj('filtr_auta') || '');
  return f;
}

function zapiszFiltry(lista, f) {
  const z = { v: 1 };
  FILTRY_POLA.concat(['otwarte']).forEach(k => { if (f[k]) z[k] = f[k]; });
  Pamiec.zapisz(kluczFiltrow(lista), JSON.stringify(z));   // zawsze zapis (nawet pusty), bo brak klucza = „nowa osoba”
}

/* Które z pól filtra są włączone na tej liście (pola, których lista nie ma, są ignorowane, choćby były zapisane). */
function aktywneFiltry(f, pola) {
  return pola.filter(k => f[k]);
}

/* Czyste filtrowanie i sortowanie. `a` mówi, jak z elementu listy wziąć pola:
   data(x) → „RRRR-MM-DD”, status(x) → tablica kluczy, kierowca(x), auto(x), miejsce(x) → id albo null, id(x). */
function zastosujFiltry(lista, f, pola, a) {
  const ma = k => pola.indexOf(k) >= 0 && f[k];
  const rowne = (wybor, wartosc) => wybor === '-'
    ? (wartosc == null || wartosc === '') : String(wartosc == null ? '' : wartosc) === wybor;
  let wynik = lista.filter(x => {
    if (ma('od') || ma('do')) {
      const d = String(a.data(x) || '').slice(0, 10);
      if (ma('od') && (!d || d < f.od)) return false;
      if (ma('do') && (!d || d > f.do)) return false;
    }
    if (ma('status') && (a.status(x) || []).indexOf(f.status) < 0) return false;
    if (ma('kierowca') && !rowne(f.kierowca, a.kierowca(x))) return false;
    if (ma('auto') && !rowne(f.auto, a.auto(x))) return false;
    if (ma('miejsce') && !rowne(f.miejsce, a.miejsce(x))) return false;
    return true;
  });
  // Właściciel 2026-11-19: listy rekordów domyślnie od najnowszych — „Domyślnie” (pusta wartość) bierze kierunek z
  // a.sortDomyslny ('nowe' dla tras i zaległych dostaw); lista bez niego (Zapisane: nazwa A–Z) zostaje w swojej kolejności.
  const kierunekSortu = pola.indexOf('sort') >= 0 ? (f.sort || a.sortDomyslny || '') : '';
  if (kierunekSortu) {
    const kierunek = kierunekSortu === 'nowe' ? -1 : 1;
    const klucz = x => [String(a.data(x) || '').slice(0, 10), Number(a.id(x)) || 0];
    wynik = wynik.map((x, i) => [x, i]).sort((p, q) => {
      const [d1, i1] = klucz(p[0]), [d2, i2] = klucz(q[0]);
      return (d1 < d2 ? -1 : d1 > d2 ? 1 : 0) * kierunek || (i1 - i2) * kierunek || (p[1] - q[1]);
    }).map(p => p[0]);
  }
  return wynik;
}

/* Opcje list wyboru: [[id, nazwa]]; osoby i auta, które są na liście, a nie ma ich w wykazie (np. wyłączone konto), też. */
function opcjeFiltra(wykaz, elementy, idDe, nazwaDe) {
  const mapa = new Map();
  (wykaz || []).forEach(o => { if (o && o.id != null) mapa.set(String(o.id), o.nazwa || o.imie || ('Nr ' + o.id)); });
  (elementy || []).forEach(x => {
    const id = idDe(x);
    if (id != null && id !== '' && !mapa.has(String(id))) mapa.set(String(id), nazwaDe(x) || ('Nr ' + id));
  });
  return [...mapa.entries()].sort((p, q) => String(p[1]).localeCompare(String(q[1]), 'pl'));
}

/* Blok „Filtry” NA WIERZCHU listy (właściciel 2026-11-18: filtrowanie i sortowanie mają być od razu widoczne, nie
   schowane w rozwijanym bloku). Górny wiersz: licznik „N z M”, plakietka liczby włączonych filtrów, krótkie podsumowanie
   i „Wyczyść filtry”; pod nim pola. Na komputerze pola układają się zwarcie w wierszach, na telefonie — w jednym,
   poziomo przewijanym rzędzie tuż nad listą. Logika, domyślne wartości i pamięć filtrów bez zmian.
   def: { lista, pola, statusy, kierowcy, auta, miejsca, sortDomyslny (opis „Domyślnie”) }. */
function htmlFiltrow(f, def, ile, razem) {
  const aktywne = aktywneFiltry(f, def.pola);
  const nazwaOpcji = (opcje, id) => { const o = (opcje || []).find(p => String(p[0]) === String(id)); return o ? o[1] : String(id); };
  const opis = k => {
    if (k === 'sort') return FILTRY_SORTOWANIA[f.sort].toLowerCase();
    if (k === 'od' || k === 'do') return polskaData(f[k]);
    if (k === 'status') return nazwaOpcji(def.statusy, f.status);
    if (k === 'kierowca') return f.kierowca === '-' ? 'bez kierowcy' : nazwaOpcji(def.kierowcy, f.kierowca);
    if (k === 'auto') return f.auto === '-' ? 'bez auta' : nazwaOpcji(def.auta, f.auto);
    return f.miejsce === '-' ? 'domyślne miejsce' : nazwaOpcji(def.miejsca, f.miejsce);
  };
  const podsumowanie = aktywne.length
    ? aktywne.map(k => `${FILTRY_ETYKIETY[k]}: ${escHtml(opis(k))}`).join(' · ') : 'bez filtrów';
  const wybor = (k, opcje, wszystkie, specjalna) => def.pola.indexOf(k) < 0 ? '' :
    `<label${f[k] ? ' class="filtr-aktywny"' : ''}>${FILTRY_ETYKIETY[k]}<select data-filtr="${k}">
        <option value="">${escHtml(wszystkie)}</option>
        ${opcje.map(([id, nazwa]) => `<option value="${escHtml(id)}"${String(id) === f[k] ? ' selected' : ''}>${escHtml(nazwa)}</option>`).join('')}
        ${specjalna ? `<option value="-"${f[k] === '-' ? ' selected' : ''}>${escHtml(specjalna)}</option>` : ''}
      </select></label>`;
  return `<div class="filtry-listy${aktywne.length ? ' aktywne' : ''}" data-filtry-lista="${def.lista}" role="group" aria-label="Filtry i sortowanie">
      <div class="filtry-gora">
        <span class="filtry-licznik" title="Tyle pozycji pasuje do filtrów">${ile} z ${razem}</span>
        ${aktywne.length ? `<span class="filtry-plakietka" title="Włączone filtry">${aktywne.length} ${odmiana(aktywne.length, 'filtr', 'filtry', 'filtrów')}</span>` : ''}
        <span class="slaby filtry-podsumowanie">${podsumowanie}</span>
        ${def.uwaga ? `<span class="male slaby filtry-uwaga">${escHtml(def.uwaga)}</span>` : ''}
        <button type="button" class="maly filtry-wyczysc" data-filtr-wyczysc${aktywne.length ? '' : ' disabled'}>Wyczyść filtry</button>
      </div>
      <div class="filtry-pasek">
        <label${f.sort ? ' class="filtr-aktywny"' : ''}>${FILTRY_ETYKIETY.sort}<select data-filtr="sort">
          <option value="">${escHtml(def.sortDomyslny || 'Domyślnie')}</option>
          <option value="nowe"${f.sort === 'nowe' ? ' selected' : ''}>${FILTRY_SORTOWANIA.nowe}</option>
          <option value="stare"${f.sort === 'stare' ? ' selected' : ''}>${FILTRY_SORTOWANIA.stare}</option>
        </select></label>
        ${def.pola.indexOf('od') < 0 ? '' : `<label${f.od ? ' class="filtr-aktywny"' : ''}>${def.etykietaOd || 'Od'}<input type="date" data-filtr="od" value="${escHtml(f.od)}"></label>
        <label${f.do ? ' class="filtr-aktywny"' : ''}>${def.etykietaDo || 'Do'}<input type="date" data-filtr="do" value="${escHtml(f.do)}"></label>`}
        ${wybor('status', def.statusy || [], 'Wszystkie')}
        ${wybor('kierowca', def.kierowcy || [], 'Wszyscy', 'Bez kierowcy')}
        ${wybor('auto', def.auta || [], 'Wszystkie auta', 'Bez auta')}
        ${wybor('miejsce', def.miejsca || [], 'Wszystkie miejsca', 'Domyślne miejsce')}
      </div>
    </div>`;
}

/* Podpięcie bloku: zmiana pola zapisuje wybór tej osoby i woła `przerysuj` (ekran rysuje listę od nowa).
   „Wyczyść filtry” zeruje tylko pola, które ta lista ma. Przewinięcie poziomego rzędu na telefonie zostaje przy
   przerysowaniu (zapamiętane w `przesuniecieFiltrow`), żeby wybór kolejnego pola nie cofał rzędu na początek. */
let przesuniecieFiltrow = 0;
function podepnijFiltry(pole, lista, f, def, przerysuj) {
  const blok = pole.querySelector('.filtry-listy');
  if (blok) {
    const pasek = blok.querySelector('.filtry-pasek');
    if (pasek) {
      pasek.scrollLeft = przesuniecieFiltrow;
      pasek.addEventListener('scroll', () => { przesuniecieFiltrow = pasek.scrollLeft; }, { passive: true });
    }
    blok.querySelectorAll('[data-filtr]').forEach(el => el.onchange = () => {
      f[el.dataset.filtr] = el.value;
      if ((el.dataset.filtr === 'od' || el.dataset.filtr === 'do') && f.od && f.do && f.od > f.do) {
        // Zakres od–do nie może się odwrócić: drugi koniec przesuwa się do właśnie wybranego dnia.
        if (el.dataset.filtr === 'od') f.do = f.od; else f.od = f.do;
      }
      zapiszFiltry(lista, f); przerysuj();
    });
  }
  pole.querySelectorAll('[data-filtr-wyczysc]').forEach(b => b.onclick = () => {
    def.pola.forEach(k => { f[k] = ''; });
    zapiszFiltry(lista, f); przerysuj();
  });
}

/* „Nic nie pasuje” z przyciskiem — wspólne dla trzech list. */
function pustoPoFiltrach(co) {
  return `<div class="karta"><div class="pusto">${co} nie pasuje do wybranych filtrów.
      <div style="margin-top:8px"><button type="button" class="maly" data-filtr-wyczysc>Wyczyść filtry</button></div></div></div>`;
}

/* Filtry listy tras (widoki Dzień, Tydzień i Lista). Pola trasy w tej liście: data, status (+ „z dostawami do
   zatwierdzenia”), kierowca (id), auto (pojazd), miejsce wyjazdu (baza = id miejsca, puste = baza domyślna). */
const AKCESORIA_TRAS = {
  data: t => t.data, id: t => t.id, sortDomyslny: 'nowe',      // „Domyślnie”: dzień malejąco, w dniu najpóźniej utworzone
  status: t => [t.status].concat(t.ile_do_przyjecia > 0 ? ['do_zatwierdzenia'] : []),
  kierowca: t => t.kierowca, auto: t => t.pojazd, miejsce: t => t.baza,
};

/* Odwołane trasy zostają na końcu (wyszarzone, jak dotąd) — także po zmianie sortowania. */
function odwolaneNaKoniec(lista) {
  return lista.filter(t => t.status !== 'odwolana').concat(lista.filter(t => t.status === 'odwolana'));
}

function defFiltrowTras(widok, trasy, kierowcy, filtrAuta) {
  const miejsca = (stan.lokalizacje || []).map(l => [String(l.id), l.nazwa]);
  const pola = ['sort', 'status', 'kierowca', 'auto'];
  if (widok === 'lista') pola.push('od', 'do');
  if (miejsca.length) pola.push('miejsce');
  return {
    lista: 'trasy', pola, statusy: FILTRY_STATUSY.trasy,
    kierowcy: opcjeFiltra((kierowcy || []).map(k => ({ id: k.id, nazwa: k.imie })), trasy, t => t.kierowca, t => t.kierowca_imie),
    auta: filtrAuta.opcje, miejsca,
    etykietaOd: 'Od dnia', etykietaDo: 'Do dnia',
    uwaga: widok === 'lista' ? 'Bez dat: 30 dni wstecz i 14 dni do przodu (najwyżej 366 dni).' : '',
  };
}

/* Widok „Lista”: trasy z zakresu dat jedna pod drugą, z dniami jako nagłówkami (domyślnie najnowszy dzień na górze). */
async function rysujListeTras(pole, data, kierowcy) {
  const f = czytajFiltry('trasy');
  const dzis = dzisiaj();
  let od = f.od || przesunDate(dzis, -30);
  let doDnia = f.do || przesunDate(dzis, 14);
  if (od > doDnia) { if (f.od) doDnia = od; else od = przesunDate(doDnia, -30); }
  const MAKS_DNI = 366;
  const dni = Math.round((new Date(doDnia + 'T12:00:00') - new Date(od + 'T12:00:00')) / 86400000);
  if (dni > MAKS_DNI) od = przesunDate(doDnia, -MAKS_DNI);
  // Odwołane też (jak w widoku dnia); zakres dat po stronie serwera, reszta filtrów w przeglądarce.
  const trasy = await API.get(`/api/trasy?odwolane=1&od=${od}&do=${doDnia}`);
  const filtr = await filtrAutaTras(trasy);
  const def = defFiltrowTras('lista', trasy, kierowcy, filtr);
  const widoczne = zastosujFiltry(trasy, f, def.pola, AKCESORIA_TRAS);
  const wg = {};
  widoczne.forEach(t => { (wg[t.data] = wg[t.data] || []).push(t); });
  const dniZTrasami = Object.keys(wg).sort();
  if (f.sort !== 'stare') dniZTrasami.reverse();                 // domyślnie i „najnowsze”: od najnowszego dnia
  const bezFiltrow = !aktywneFiltry(f, def.pola).length;
  pole.innerHTML = `
    <div class="pasek-narzedzi">
      ${przelacznikWidokuTras('lista')}
      <button class="glowny" id="t-nowa">+ Nowa trasa</button>
      <button id="t-import">${ikonka('raporty')}Wczytaj z Excela</button>
    </div>
    ${htmlFiltrow(f, def, widoczne.length, trasy.length)}
    <div class="male slaby" style="margin-bottom:10px">Trasy od ${polskaData(od)} do ${polskaData(doDnia)}</div>
    ${dniZTrasami.length ? dniZTrasami.map(dz => {
      const lista = odwolaneNaKoniec(wg[dz]);
      const nr = (new Date(dz + 'T12:00:00').getDay() + 6) % 7;
      return `<section class="dzien-tygodnia${dz === dzis ? ' dzisiaj' : ''}" aria-label="${DNI_TYGODNIA[nr]} ${polskaData(dz)}">
          <div class="dzien-tygodnia-gora">
            <span class="dzien-tygodnia-nazwa"><b>${DNI_TYGODNIA[nr]}</b> ${polskaData(dz)}${dz === dzis ? ' <span class="plakietka p-w_toku">dziś</span>' : ''}</span>
            <span class="male slaby dzien-tygodnia-podsumowanie">${podsumowanieDnia(lista)}</span>
          </div>
          ${kartyTrasWgAuta(lista)}
        </section>`;
    }).join('')
      : (!bezFiltrow && trasy.length ? pustoPoFiltrach('Żadna trasa')
        : `<div class="karta"><div class="pusto"><span class="duza-ikona">${GKIkony.html('mapa', 38)}</span>
             W tym okresie nie ma tras.</div></div>`)}`;
  podepnijPrzelacznikWidokuTras(pole, data);
  podepnijFiltry(pole, 'trasy', f, def, () => pokazEkran('trasy', { data, widok: 'lista' }));
  pole.querySelector('#t-nowa').onclick = () => oknoNowejTrasy(data, kierowcy);
  pole.querySelector('#t-import').onclick = () => pokazEkran('import');
  pole.querySelectorAll('[data-trasa]').forEach(b =>
    b.onclick = () => pokazEkran('trasa', { id: Number(b.dataset.trasa) }));
}

/* Podsumowanie dnia: ile tras, ile punktów dostarczonych z wszystkich i ile czeka na zatwierdzenie. */
function podsumowanieDnia(trasy) {
  const czynne = trasy.filter(t => t.status !== 'odwolana');
  if (!czynne.length) return 'brak tras';
  const ile = czynne.reduce((s, t) => s + t.ile, 0);
  const ok = czynne.reduce((s, t) => s + t.ile_ok, 0);
  const doPrzyjecia = czynne.reduce((s, t) => s + (t.ile_do_przyjecia || 0), 0);
  return `${czynne.length} ${odmiana(czynne.length, 'trasa', 'trasy', 'tras')} · ${ok} z ${ile} punktów dostarczone`
    + (doPrzyjecia ? ` · <b style="color:var(--zolty)">${ikonka('klepsydra')}${doPrzyjecia} do zatwierdzenia</b>` : '');
}

async function rysujTydzienTras(pole, data, kierowcy) {
  const pon = poczatekTygodnia(data);
  const niedz = przesunDate(pon, 6);
  // Biuro widzi też odwołane (na końcu dnia, wyszarzone) — jak w widoku dnia.
  const trasy = await API.get(`/api/trasy?odwolane=1&od=${pon}&do=${niedz}`);
  trasy.sort((a, b) => (a.status === 'odwolana') - (b.status === 'odwolana') || a.id - b.id);
  const filtr = await filtrAutaTras(trasy);
  const f = czytajFiltry('trasy');
  const def = defFiltrowTras('tydzien', trasy, kierowcy, filtr);
  const widoczne = zastosujFiltry(trasy, f, def.pola, AKCESORIA_TRAS);
  const wg = {};
  widoczne.forEach(t => { (wg[t.data] = wg[t.data] || []).push(t); });
  Object.keys(wg).forEach(d => { wg[d] = odwolaneNaKoniec(wg[d]); });
  const dzis = dzisiaj();
  const dni = Array.from({ length: 7 }, (_, i) => przesunDate(pon, i));
  pole.innerHTML = `
    <div class="pasek-narzedzi">
      ${przelacznikWidokuTras('tydzien')}
      <label>Dzień w tygodniu<input type="date" id="t-data" value="${data}"></label>
      <button id="t-wczoraj">${ikonka('strzalka-lewo')}Poprzedni tydzień</button><button id="t-jutro">Następny tydzień${ikonka('strzalka-prawo', 16, true)}</button>
      <button id="t-ten-tydzien">Ten tydzień</button>
      <button id="t-import">${ikonka('raporty')}Wczytaj z Excela</button>
    </div>
    ${htmlFiltrow(f, def, widoczne.length, trasy.length)}
    <div class="male slaby" style="margin-bottom:10px">Tydzień ${polskaData(pon)} – ${polskaData(niedz)}</div>
    ${dni.map((dz, i) => {
      const lista = wg[dz] || [];
      return `<section class="dzien-tygodnia${dz === dzis ? ' dzisiaj' : ''}" aria-label="${DNI_TYGODNIA[i]} ${polskaData(dz)}">
          <div class="dzien-tygodnia-gora">
            <span class="dzien-tygodnia-nazwa"><b>${DNI_TYGODNIA[i]}</b> ${polskaData(dz)}${dz === dzis ? ' <span class="plakietka p-w_toku">dziś</span>' : ''}</span>
            <span class="male slaby dzien-tygodnia-podsumowanie">${podsumowanieDnia(lista)}</span>
            <button type="button" class="maly" data-nowa-na="${dz}">+ Nowa trasa</button>
          </div>
          ${kartyTrasWgAuta(lista)}
        </section>`;
    }).join('')}`;
  podepnijPrzelacznikWidokuTras(pole, data);
  podepnijFiltry(pole, 'trasy', f, def, () => pokazEkran('trasy', { data, widok: 'tydzien' }));
  pole.querySelector('#t-data').onchange = e => e.target.value && pokazEkran('trasy', { data: e.target.value, widok: 'tydzien' });
  pole.querySelector('#t-wczoraj').onclick = () => pokazEkran('trasy', { data: przesunDate(pon, -7), widok: 'tydzien' });
  pole.querySelector('#t-jutro').onclick = () => pokazEkran('trasy', { data: przesunDate(pon, 7), widok: 'tydzien' });
  pole.querySelector('#t-ten-tydzien').onclick = () => pokazEkran('trasy', { data: dzis, widok: 'tydzien' });
  pole.querySelector('#t-import').onclick = () => pokazEkran('import');
  pole.querySelectorAll('[data-nowa-na]').forEach(b => b.onclick = () => oknoNowejTrasy(b.dataset.nowaNa, kierowcy));
  pole.querySelectorAll('[data-trasa]').forEach(b =>
    b.onclick = () => pokazEkran('trasa', { id: Number(b.dataset.trasa) }));
}

/* Przyjmowanie dostaw od kierowców (właściciel 2026-11-03: „niech działa jak w Panelu kierownika”): dostawa zamknięta na
   telefonie czeka na „Zatwierdź” albo „Zwróć” (powód — kierowca poprawia i zamyka jeszcze raz). Biuro może też zamknąć
   punkt za kierowcę (np. gdy padł telefon) — takie zamknięcie jest przyjęte od razu. */
async function przyjmijDostawe(id, poZmianie, trasaId) {
  const w = await sprobuj(() => zapisBiura('POST', `/api/przystanki/${id}/przyjmij-dostawe`, {}, {
    opis: 'zatwierdzenie dostawy', popraw: poprawDostawe(id, trasaId, 'przyjete'),
  }), 'Zatwierdzono');
  if (w && window.ReakcjeTras) ReakcjeTras.biuroZatwierdzilo();     // bez nakładki przy każdym kliknięciu — tylko „zero” (reakcje-trasy.js)
  if (w && poZmianie) poZmianie();
}

/* Poprawka zapamiętanych odpowiedzi po zapisie dostawy (przyjmij / zwróć / zamknij za kierowcę), gdy zapis czeka w
   komputerze, bo programu nie ma: ekran ma od razu pokazać, że dostawa zniknęła z „Do zatwierdzenia”, a punkt ma nowy
   stan. `jak`: 'przyjete' | 'zwrot' | 'dostarczone' | 'nieudane' (zamknięcie przez biuro). Serwer i tak zrobi swoje
   po powrocie — to tylko podgląd na czas bez połączenia. */
function poprawDostawe(idPunktu, trasaId, jak, dodatki) {
  const teraz = new Date().toISOString();
  return (sciezka, d) => {
    if (sciezka === '/api/do-przyjecia' && Array.isArray(d)) {
      if (!d.some(x => x && x.id === idPunktu)) return;
      return d.filter(x => !x || x.id !== idPunktu);
    }
    if (/^\/api\/trasy\/\d+$/.test(sciezka) && d && Array.isArray(d.przystanki)) {
      wPamieci(d.przystanki, idPunktu, x => {
        x.do_przyjecia = 0;
        if (jak === 'przyjete') { x.przyjeto_o = teraz; return; }
        if (jak === 'zwrot') { x.status = 'oczekuje'; x.przyjeto_o = null; x.zamkniete_o = null; x.powod = ''; return; }
        Object.assign(x, { status: jak, przyjeto_o: teraz, zamkniete_o: teraz }, dodatki || {});
      });
      return;
    }
    // Liczniki trasy na Pulpicie i w listach tras: „do zatwierdzenia” maleje, a zamknięcie biura dolicza dostarczoną/nieudaną.
    const trasy = sciezka.startsWith('/api/pulpit') && d && Array.isArray(d.trasy) ? d.trasy
      : (sciezka.startsWith('/api/trasy?') && Array.isArray(d) ? d : null);
    if (!trasy || trasaId == null) return;
    wPamieci(trasy, trasaId, t => {
      if (jak !== 'dostarczone' && jak !== 'nieudane') t.ile_do_przyjecia = Math.max(0, (t.ile_do_przyjecia || 0) - 1);
      if (jak === 'dostarczone') t.ile_ok = (t.ile_ok || 0) + 1;
      if (jak === 'nieudane') t.ile_nie = (t.ile_nie || 0) + 1;
    });
  };
}

/* „Do zatwierdzenia” pogrupowane po trasach (kolejność listy z serwera zostaje): biuro, które sprawdziło całą
   oddaną trasę, zatwierdza jej dostarczone punkty jednym ruchem. Nieudane (z powodem) i zwroty zostają do
   decyzji punkt po punkcie — to nie jest „zatwierdź wszystko”. */
function grupyDoPrzyjecia(lista) {
  const wg = new Map();
  lista.forEach(x => {
    if (!wg.has(x.trasa)) wg.set(x.trasa, {
      trasa: x.trasa, pozycje: [], dostarczone: [],
      // Data raz: bez własnej nazwy trasy zaczynamy od słowa „Trasa” (dawniej „Trasa 18.11.2026 · … · 18.11.2026”).
      nazwa: [x.trasa_nazwa || 'Trasa', x.kierowca_imie, polskaData(x.data)].filter(Boolean).join(' · '),
    });
    const g = wg.get(x.trasa);
    g.pozycje.push(x);
    if (x.status === 'dostarczone') g.dostarczone.push(x);
  });
  return [...wg.values()];
}

async function przyjmijDostawyTrasy(g, poZmianie) {
  const ile = g.dostarczone.length;
  if (!await potwierdz('Zatwierdzić dostarczone punkty?',
    `Zatwierdzisz ${ile} ${odmiana(ile, 'dostarczony punkt', 'dostarczone punkty', 'dostarczonych punktów')} z trasy „${g.nazwa}”. ` +
    (g.pozycje.length > ile ? `Pozostałe ${g.pozycje.length - ile} (nieudane) zostają do Twojej decyzji. ` : '') +
    'Sprawdziłeś zdjęcia i podpisy?')) return;
  let zrobione = 0, wKolejce = 0;
  for (const x of g.dostarczone) {
    const w = await sprobuj(() => zapisBiura('POST', `/api/przystanki/${x.id}/przyjmij-dostawe`, {}, {
      opis: 'zatwierdzenie dostawy ' + (x.klient_nazwa || ''), popraw: poprawDostawe(x.id, g.trasa, 'przyjete'),
    }));
    if (!w) break;                       // błąd pokazał już komunikat — reszta zostaje do zatwierdzenia
    zrobione++;
    if (w.wKolejce) wKolejce++;
  }
  if (zrobione && window.ReakcjeTras) ReakcjeTras.biuroZatwierdzilo();
  if (zrobione) komunikat(`Zatwierdzono ${zrobione} z ${ile}` + (wKolejce ? ' — zapisane w tym komputerze, wyślę, gdy program odpowie' : ''),
    zrobione === ile ? 'ok' : 'blad');
  if (poZmianie) poZmianie();
}

function oknoZwrotuDostawy(id, nazwa, poZmianie, trasaId) {
  okno({
    szkic: 'zwrot-' + id,
    tytul: 'Zwróć kierowcy: ' + nazwa,
    tresc: `<label>Co kierowca ma poprawić? <span style="color:var(--czerwony)">*</span>
        <textarea id="zw-powod" maxlength="200" placeholder="np. brak zdjęcia dokumentu, zły odbierający"></textarea></label>
      <p class="male slaby">Punkt wróci do kierowcy jako otwarty — dostanie powiadomienie i zamknie go jeszcze raz.
        Podpisy i zdjęcia, które już zrobił, zostają.</p>`,
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Zwróć', klasa: 'glowny', klik: async z => {
        const powod = val('zw-powod').trim();
        if (!powod) { komunikat('Napisz, co kierowca ma poprawić', 'blad'); return; }
        const w = await sprobuj(() => zapisBiura('POST', `/api/przystanki/${id}/zwroc-dostawe`, { powod }, {
          opis: 'zwrot dostawy: ' + nazwa, popraw: poprawDostawe(id, trasaId, 'zwrot'),
        }), 'Zwrócono kierowcy');
        if (w) { z(); if (poZmianie) poZmianie(); }
      } },
    ],
  });
}

async function oknoZamknieciaPrzezBiuro(p, poZmianie) {
  if (!(stan.ustawienia || {}).powody_nieudanych) {
    try { stan.ustawienia = await API.get('/api/ustawienia'); } catch (e) { /* bez listy powodów — wpis własny */ }
  }
  let powody = [];
  try { powody = powodyNieudanych(); } catch (e) { powody = []; }
  okno({
    szkic: 'zamkniecie-' + p.id,
    tytul: 'Zamknij za kierowcę: ' + p.klient_nazwa,
    tresc: `<div class="wstega info">Zamykasz ten punkt w imieniu kierowcy. W uwagach punktu zostanie ślad, kto to zrobił.</div>
      <label class="plaska"><input type="radio" name="zb-status" value="dostarczone" checked> ${ikonka('haczyk')}Dostarczone</label>
      <label class="plaska"><input type="radio" name="zb-status" value="nieudane"> ${ikonka('zamknij')}Nieudane</label>
      <div id="zb-powod-pole" hidden>
        <label>Powód <span style="color:var(--czerwony)">*</span>
          <select id="zb-powod"><option value="">— wybierz —</option>
            ${powody.map(x => `<option>${escHtml(x)}</option>`).join('')}</select></label>
        <label>Inny powód<input id="zb-inny" maxlength="80" placeholder="wpisz własny"></label>
      </div>
      <label>Odebrał <span class="slaby">(nieobowiązkowe)</span><input id="zb-odebral" maxlength="120"></label>
      <label>Notatka <span class="slaby">(nieobowiązkowe)</span><textarea id="zb-notatka" maxlength="2000"></textarea></label>`,
    poOtwarciu: pole => {
      const pokaz = () => { pole.querySelector('#zb-powod-pole').hidden =
        pole.querySelector('input[name="zb-status"]:checked').value !== 'nieudane'; };
      pole.querySelectorAll('input[name="zb-status"]').forEach(r => r.onchange = pokaz);
    },
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Zamknij punkt', klasa: 'glowny', klik: async z => {
        const status = document.querySelector('input[name="zb-status"]:checked').value;
        const powod = status === 'nieudane' ? (val('zb-inny').trim() || val('zb-powod')) : '';
        if (status === 'nieudane' && !powod) { komunikat('Przy nieudanej dostawie wybierz albo wpisz powód', 'blad'); return; }
        const dane = { status, powod, odebral: val('zb-odebral'), notatka: val('zb-notatka') };
        const w = await sprobuj(() => zapisBiura('POST', `/api/przystanki/${p.id}/zamknij-za-kierowce`, dane, {
          opis: 'zamknięcie punktu za kierowcę: ' + p.klient_nazwa,
          popraw: poprawDostawe(p.id, p.trasa, status, { powod, odebral: dane.odebral, notatka: dane.notatka }),
        }), 'Zamknięto punkt');
        if (w) { z(); if (poZmianie) poZmianie(); }
      } },
    ],
  });
}

/* „Do zatwierdzenia”: biuro ma ocenić dostawę bez otwierania punktu, więc przy każdej widzi to, co kierowca
   zebrał — kto odebrał, numer dokumentu, notatkę, podpis i zdjęcia (miniatury jak w Panelu Zarządczym GK,
   dotknięcie powiększa). Czego punkt wymaga, a kierowca nie dał, jest podpisane na czerwono. */
const WYMOGI_ETYKIETY = { odebral: 'kto odebrał', podpis: 'podpis', zdjecie: 'zdjęcie', notatka: 'notatka', dokument: 'numer dokumentu' };

/* Punkt zamknięty awaryjnie („Nie mogę zakończyć” w aplikacji kierowcy): notatka zaczyna się od „Bez dowodu: ” + powód.
   Nie jest to pełny dowód, więc biuro widzi czerwony znacznik i powód (nawet gdy sama notatka spełnia wymóg „notatka”). */
const PREFIKS_BEZ_DOWODU_BIURA = 'Bez dowodu: ';
function bezDowoduPowod(x) {
  const n = String((x && x.notatka) || '');
  return x && x.status === 'dostarczone' && n.startsWith(PREFIKS_BEZ_DOWODU_BIURA) ? n.slice(PREFIKS_BEZ_DOWODU_BIURA.length).trim() : '';
}

function brakiDowodow(x) {
  if (x.status !== 'dostarczone') return [];
  const wymogi = String(x.wymogi || '').split(',').filter(Boolean);
  const zal = x.zalaczniki || [];
  const ma = {
    odebral: !!(x.odebral || '').trim(),
    podpis: zal.some(z => z.typ === 'podpis'),
    zdjecie: zal.some(z => z.typ === 'zdjecie'),
    notatka: !!(x.notatka || '').trim(),
    dokument: !!(x.dokument || '').trim(),
  };
  return wymogi.filter(w => w in ma && !ma[w]).map(w => WYMOGI_ETYKIETY[w]);
}

function miniaturyDowodow(zal, typ, etykieta, token, podpis) {
  const lista = zal.filter(z => z.typ === typ);
  if (!lista.length || !token) return '';
  return `<div class="dp-zal"><span class="slaby">${etykieta}${lista.length > 1 ? ' (' + lista.length + ')' : ''}</span><div class="dp-rzad">${
    lista.map(z => `<button type="button" class="dp-miniatura${typ === 'podpis' ? ' dp-podpis' : ''}" data-powieksz="${
      escHtml(adresPliku(z.plik, token))}" data-podpis="${escHtml(podpis)}" aria-label="Powiększ: ${escHtml(etykieta)}">
      <img src="${escHtml(adresPliku(z.plik, token))}" alt="" loading="lazy" decoding="async"></button>`).join('')}</div></div>`;
}

/* Powiększenie zdjęcia to osobna nakładka, a nie okno(): okno() jest jedno i nadpisałoby otwartą kartę punktu
   (biuro straciłoby wpisaną notatkę). Zamyka się kliknięciem, Esc albo przyciskiem. */
function oknoPowiekszenia(adres, podpis) {
  const stare = document.getElementById('dp-lightbox');
  if (stare) stare.remove();
  const tlo = document.createElement('div');
  tlo.id = 'dp-lightbox';
  tlo.className = 'dp-lightbox';
  tlo.setAttribute('role', 'dialog');
  tlo.setAttribute('aria-label', podpis || 'Podgląd zdjęcia');
  tlo.innerHTML = `<div class="dp-lightbox-pasek"><span>${escHtml(podpis || '')}</span>
      <button type="button" class="maly" id="dp-lightbox-zamknij">Zamknij</button></div>
    <div class="dp-lightbox-ramka"><img src="${escHtml(adres)}" alt="${escHtml(podpis || '')}"></div>`;
  const zamknij = () => { tlo.remove(); document.removeEventListener('keydown', naKlawisz, true); };
  const naKlawisz = e => { if (e.key === 'Escape') { e.stopPropagation(); zamknij(); } };
  tlo.addEventListener('click', e => { if (e.target === tlo || e.target.closest('#dp-lightbox-zamknij') || e.target.closest('.dp-lightbox-ramka')) zamknij(); });
  document.addEventListener('keydown', naKlawisz, true);
  document.body.appendChild(tlo);
  const przycisk = tlo.querySelector('#dp-lightbox-zamknij');
  if (przycisk) przycisk.focus();
}

/* Wspólny blok „co kierowca zebrał”: pola, braki i miniatury. Ten sam na pulpicie („Do zatwierdzenia”)
   i na karcie punktu — dane na wierzchu, bez klikania w 📎. */
function htmlDowodow(x, token, bezOdebralNotatki) {
  const zal = x.zalaczniki || [];
  const pole = (nazwa, wartosc) => wartosc ? `<div class="dp-pole"><span class="slaby">${nazwa}</span> ${escHtml(wartosc)}</div>` : '';
  const braki = brakiDowodow(x);
  const podpis = [x.klient_nazwa, x.odebral].filter(Boolean).join(' · ');
  const miniatury = miniaturyDowodow(zal, 'podpis', 'Podpis odbierającego', token, podpis)
    + miniaturyDowodow(zal, 'zdjecie', 'Zdjęcia', token, x.klient_nazwa)
    + miniaturyDowodow(zal, 'zaladunek', 'Załadunek', token, x.klient_nazwa + ' · załadunek');
  // Karta punktu ma już „Odebrał” i notatkę w pasku statusu — tam nie powtarzamy.
  return `${bezOdebralNotatki ? '' : pole('Odebrał:', x.odebral)}${pole('Dokument:', x.dokument)}${pole('Towar:', x.towar)}${bezOdebralNotatki ? '' : pole('Notatka:', x.notatka)}
    ${bezDowoduPowod(x) ? `<div class="dp-pole dp-brak">${ikonka('ostrzezenie')}Zakończone bez pełnego dowodu — powód kierowcy: ${escHtml(bezDowoduPowod(x))}</div>` : ''}
    ${braki.length ? `<div class="dp-pole dp-brak">Brakuje: ${escHtml(braki.join(', '))}</div>` : ''}
    ${miniatury ? `<div class="dp-media">${miniatury}</div>` : ''}`;
}

/* „Przenieś na jutro” przy nieudanej dostawie: ta sama droga co „Zaległe dostawy → Przenieś zaznaczone” (zapisBiura, pyta
   o ryzyko przy zapisach czekających w telefonie), z kierowcą trasy, na której punkt zawiódł. Punkt wraca na „oczekuje”.
   Dzień to najbliższy dzień pracy zakładu po dzisiaj (Dni tygodnia, święta) — serwer go liczy; bez odpowiedzi: jutro. */
function podepnijPrzenosinyNaJutro(pole, trasy, poZapisie) {
  pole.querySelectorAll('[data-na-jutro]').forEach(b => b.onclick = async () => {
    const punkt = Number(b.dataset.naJutro);
    const trasa = (trasy || []).find(t => t.id === Number(b.dataset.trasaKierowcy)) || {};
    let data = jutro();
    try { data = (await API.get('/api/dzien-roboczy?po=' + dzisiaj())).data || data; } catch (e) { /* zostaje jutro */ }
    if (!await potwierdz(data === jutro() ? 'Przenieść na jutro?' : 'Przenieść na najbliższy dzień pracy?',
      `Punkt trafi na trasę ${polskaData(data)}${trasa.kierowca_imie ? ' — ' + trasa.kierowca_imie : ''}.`)) return;
    const w = await zRyzykiemKolejki(
      { punkty: [punkt], data, kierowca: trasa.kierowca || null },
      d => zapisBiura('POST', '/api/zalegle/przenies', d, {
        opis: 'przeniesienie nieudanej dostawy na ' + polskaData(data), zrodla: ['/api/zalegle'],
      }));
    if (!w) return;
    komunikat(w.wKolejce ? KOMUNIKAT_KOLEJKI_BIURA : 'Przeniesione na ' + polskaData(data), 'ok');
    poZapisie();
  });
}

/* „Nieudane dostawy — do decyzji” na Pulpicie: powód i notatka były gołym tekstem. Doładowujemy dowody punktu (miniatury
   zdjęć i podpisu — te same funkcje co „Do zatwierdzenia”), z kliknięciem do powiększenia. Bez tokenu albo błędu
   zostaje to, co było. */
async function wzbogacNieudane(el, lista) {
  if (!el || !(lista || []).length) return;
  el.querySelectorAll('[data-do-trasy]').forEach(bt => bt.onclick = () => pokazEkran('trasa', { id: Number(bt.dataset.doTrasy) }));
  if (jestPodgladem()) return;            // podgląd nie czyta załączników (serwer odmawia)
  let token = '';
  try { token = await tokenDoPlikow(); } catch (e) { return; }
  for (const n of lista) {
    let zal = [];
    try { zal = await API.get(`/api/przystanki/${n.id}/zalaczniki`); } catch (e) { zal = []; }
    const slot = el.querySelector(`[data-nieudany="${n.id}"] .nu-dowody`);
    if (slot) slot.innerHTML = htmlDowodow({ klient_nazwa: n.klient_nazwa, status: 'nieudane', zalaczniki: zal }, token, true);
  }
  el.querySelectorAll('[data-powieksz]').forEach(bt => bt.onclick = () => oknoPowiekszenia(bt.dataset.powieksz, bt.dataset.podpis));
}

/* „Ostatnio zatwierdzone (24 h)”: zwijana sekcja tylko do odczytu. Punkty z `przyjeto_o` w ostatniej dobie (`/api/zatwierdzone`; starszy serwer: trasy z dzisiaj i wczoraj) (ręcznie albo automatycznie), z dowodami po rozwinięciu. */
function sekcjaZatwierdzonychHtml(punkty, token) {
  if (!punkty.length) return '<div class="male slaby">Przez ostatnią dobę nic nie zostało zatwierdzone.</div>';
  return `<div class="karta">${punkty.map(x => `<div style="padding:9px 0;border-bottom:1px solid var(--ramka)">
      <b>${escHtml(x.klient_nazwa)}</b>
      ${x.status === 'dostarczone' ? ('<span class="plakietka p-dostarczone" style="margin-left:6px">' + ikonka('haczyk') + 'dostarczone</span>')
        : `<span class="plakietka p-nieudane" style="margin-left:6px">${ikonka('zamknij')}${escHtml(x.powod || 'nieudane')}</span>`}
      <span class="plakietka p-oczekuje" style="margin-left:6px">${x.przyjete_auto ? 'zatwierdzone automatycznie' : 'zatwierdzone przez biuro'}</span>
      ${x.zamkniete_auto ? '<span class="plakietka p-oczekuje" style="margin-left:6px">zamknięte automatycznie</span>' : ''}
      <div class="male slaby">${escHtml(x.kierowca_imie || '')} · ${escHtml(polskaData(x.data))} · zatwierdzono ${escHtml(polskaData(x.przyjeto_o))} ${escHtml(samaGodzina(x.przyjeto_o))}</div>
      ${x.notatka ? `<div class="male">${escHtml(x.notatka)}</div>` : ''}
      ${htmlDowodow(x, token, true)}
      <div class="przyciski" style="margin-top:6px"><button class="maly" data-do-trasy="${x.trasa}">Trasa</button></div>
    </div>`).join('')}</div>`;
}

async function punktyZatwierdzone() {
      // Nowy serwer: jedno lekkie zapytanie (punkty + nazwy plików dowodów). Starszy serwer (404) — stara droga przez trasy.
      try {
        const lekkie = await API.get('/api/zatwierdzone?godzin=24');
        if (Array.isArray(lekkie)) return lekkie;
      } catch (e) { /* stary serwer albo chwilowy błąd — próbujemy starą drogą poniżej */ }
      const teraz = new Date();
      const dwa = n => String(n).padStart(2, '0');
      const f = d => `${d.getFullYear()}-${dwa(d.getMonth() + 1)}-${dwa(d.getDate())} ${dwa(d.getHours())}:${dwa(d.getMinutes())}:${dwa(d.getSeconds())}`;
      const granica = f(new Date(teraz.getTime() - 24 * 3600 * 1000));
      const trasy = [].concat(...await Promise.all([dzisiaj(), przesunDate(dzisiaj(), -1)].map(d => API.get('/api/trasy?data=' + d))));
      const pelne = await Promise.all(trasy.map(t => API.get('/api/trasy/' + t.id).catch(() => null)));
      const punkty = [];
      pelne.filter(Boolean).forEach(t => (t.przystanki || []).forEach(p => {
        if (p.przyjeto_o && p.przyjeto_o >= granica && !p.do_przyjecia && (p.status === 'dostarczone' || p.status === 'nieudane')) {
          punkty.push(Object.assign({}, p, { data: t.data, kierowca_imie: t.kierowca_imie, pojazd_nazwa: t.pojazd_nazwa, trasa: t.id }));
        }
      }));
      punkty.sort((a, b) => String(b.przyjeto_o).localeCompare(String(a.przyjeto_o)));
      return punkty;
}

/* Sekcja jest zwinięta, ale z licznikiem (dane liczymy od razu, w tle); lista i dowody rysują się dopiero po rozwinięciu. */
function podepnijZatwierdzone(blok) {
  if (!blok) return;
  let punkty = null, rysowane = false;
  const licznik = blok.querySelector('#p-zatwierdzone-licznik');
  const wczytaj = punktyZatwierdzone().then(p => {
    punkty = p;
    const ile = filtrujPulpit(p, czytajFiltryPulpitu(), AKCESORIA_PULPITU.zatwierdzone).length;
    if (licznik) { licznik.textContent = ile === p.length ? String(p.length) : ile + ' z ' + p.length; licznik.hidden = false; }
  }).catch(() => { punkty = null; });
  blok.addEventListener('toggle', async () => {
    if (!blok.open || rysowane) return;
    rysowane = true;
    const cel = blok.querySelector('#p-zatwierdzone-tresc');
    cel.textContent = 'Wczytuję…';
    try {
      await wczytaj;
      if (!punkty) throw new Error('brak danych');
      let token = '';
      try { token = await tokenDoPlikow(); } catch (e) { token = ''; }
      const wszystkie = punkty;
      punkty = filtrujPulpit(wszystkie, czytajFiltryPulpitu(), AKCESORIA_PULPITU.zatwierdzone);
      for (const x of punkty) {
        if (Array.isArray(x.zalaczniki)) continue;      // nowy serwer podaje je od razu
        try { x.zalaczniki = await API.get(`/api/przystanki/${x.id}/zalaczniki`); } catch (e) { x.zalaczniki = []; }
      }
      cel.innerHTML = (punkty.length < wszystkie.length
        ? `<div class="male slaby" style="margin-bottom:6px">Filtry ukrywają ${wszystkie.length - punkty.length} z ${wszystkie.length}.</div>` : '')
        + sekcjaZatwierdzonychHtml(punkty, token);
      cel.querySelectorAll('[data-powieksz]').forEach(bt => bt.onclick = () => oknoPowiekszenia(bt.dataset.powieksz, bt.dataset.podpis));
      cel.querySelectorAll('[data-do-trasy]').forEach(bt => bt.onclick = () => pokazEkran('trasa', { id: Number(bt.dataset.doTrasy) }));
    } catch (e) {
      rysowane = false;
      cel.textContent = 'Nie udało się wczytać — zamknij i otwórz jeszcze raz.';
    }
  });
}

async function rysujDoPrzyjecia(el, poZmianie) {
  if (!el || jestPodgladem()) return 0;    // zatwierdzanie dostaw jest tylko dla biura
  let lista = [];
  try { lista = await API.get('/api/do-przyjecia'); } catch (e) { el.innerHTML = ''; return 0; }
  if (!lista.length) {
    el.innerHTML = '';
    // Lista spadła do zera zaraz po ręcznym „Zatwierdź” — jedna reakcja dziennie (nie po automacie serwera; reakcje-trasy.js).
    if (window.ReakcjeTras) { try { ReakcjeTras.biuroListaPusta(dzisiaj()); } catch (e2) { /* bez reakcji */ } }
    return 0;
  }
  // Filtry Pulpitu (kierowca, auto, klient, sortowanie) ograniczają tylko to, co widać; liczba dla kafelka zostaje pełna.
  const wszystkie = lista;
  const widoczna = filtrujPulpit(wszystkie, czytajFiltryPulpitu(), AKCESORIA_PULPITU.przyjecie);
  if (!widoczna.length) {
    el.innerHTML = `<h2 style="margin-top:20px">Do zatwierdzenia
      <span class="plakietka p-oczekuje" style="margin-left:6px">0 z ${wszystkie.length}</span></h2>
      <p class="male slaby">Filtry ukrywają wszystkie dostawy czekające na zatwierdzenie (${wszystkie.length}) — kliknij „Wyczyść”.</p>`;
    return wszystkie.length;
  }
  lista = widoczna;
  // Bez tokenu (np. serwer nie odpowiada na plikach) lista działa jak dotąd: liczba załączników zamiast miniatur.
  let token = '';
  try { token = await tokenDoPlikow(); } catch (e) { token = ''; }
  el.innerHTML = `<h2 style="margin-top:20px">Do zatwierdzenia
      <span class="plakietka p-oczekuje" style="margin-left:6px">${lista.length === wszystkie.length ? lista.length : lista.length + ' z ' + wszystkie.length}</span></h2>
    <p class="male slaby" style="margin:0 0 6px">Dostawy zatwierdzają się same 15 minut po zamknięciu całej trasy
      — do tego czasu możesz zwrócić kierowcy to, co trzeba poprawić.</p>
    <div class="karta">${grupyDoPrzyjecia(lista).map(g => `${g.pozycje.length > 1 ? `
      <div class="przyciski" style="justify-content:space-between;align-items:center;padding:8px 0 2px;border-bottom:2px solid var(--ramka)">
        <b>${escHtml(g.nazwa)} <span class="slaby male">· ${g.pozycje.length} ${odmiana(g.pozycje.length, 'dostawa czeka', 'dostawy czekają', 'dostaw czeka')}</span></b>
        ${g.dostarczone.length > 1 ? `<button class="maly glowny" data-przyjmij-trase="${g.trasa}">${ikonka('haczyk')}Zatwierdź dostarczone (${g.dostarczone.length})</button>` : ''}
      </div>` : ''}${g.pozycje.map(x => {
      return `<div style="padding:9px 0;border-bottom:1px solid var(--ramka)">
        <b>${escHtml(x.klient_nazwa)}</b>
        ${x.status === 'dostarczone' ? ('<span class="plakietka p-dostarczone" style="margin-left:6px">' + ikonka('haczyk') + 'dostarczone</span>')
          : `<span class="plakietka p-nieudane" style="margin-left:6px">${ikonka('zamknij')}${escHtml(x.powod)}</span>`}
        <div class="male slaby">${escHtml(x.kierowca_imie || '')}${x.pojazd_nazwa ? ' · ' + escHtml(x.pojazd_nazwa) + (x.rejestracja ? ' (' + escHtml(x.rejestracja) + ')' : '') : ''} · ${polskaData(x.data)} ${samaGodzina(x.zamkniete_o)}${
          !token && x.ile_zalacznikow ? (' · ' + ikonka('spinacz')) + x.ile_zalacznikow : ''}</div>
        ${htmlDowodow(x, token)}
        <div class="przyciski" style="margin-top:6px">
          <button class="maly glowny" data-przyjmij="${x.id}">${ikonka('haczyk')}Zatwierdź</button>
          <button class="maly" data-zwroc="${x.id}">${ikonka('cofnij')}Zwróć kierowcy</button>
          <button class="maly" data-do-trasy="${x.trasa}">Trasa</button></div>
      </div>`; }).join('')}`).join('')}</div>`;
  el.querySelectorAll('[data-przyjmij]').forEach(bt => bt.onclick = () => {
    const x = lista.find(y => y.id === Number(bt.dataset.przyjmij));
    przyjmijDostawe(Number(bt.dataset.przyjmij), poZmianie, x && x.trasa);
  });
  el.querySelectorAll('[data-przyjmij-trase]').forEach(bt => bt.onclick = () => {
    const g = grupyDoPrzyjecia(lista).find(y => y.trasa === Number(bt.dataset.przyjmijTrase));
    if (g) przyjmijDostawyTrasy(g, poZmianie);
  });
  el.querySelectorAll('[data-zwroc]').forEach(bt => bt.onclick = () => {
    const x = lista.find(y => y.id === Number(bt.dataset.zwroc));
    oknoZwrotuDostawy(x.id, x.klient_nazwa, poZmianie, x.trasa);
  });
  el.querySelectorAll('[data-do-trasy]').forEach(bt => bt.onclick = () => pokazEkran('trasa', { id: Number(bt.dataset.doTrasy) }));
  el.querySelectorAll('[data-powieksz]').forEach(bt => bt.onclick = () => oknoPowiekszenia(bt.dataset.powieksz, bt.dataset.podpis));
  return wszystkie.length;                // pulpit pokazuje tę liczbę jako kafelek „Do zatwierdzenia” (pełną, bez filtrów)
}

/* Plan podzielony na auta (właściciel 2026-11-16: „zamiast samochód duży/mały nazwa auta — mały to IVECO, duży to DAF”).
   Każde auto ma własną sekcję z nazwą auta; kolejność = DAF, IVECO, potem reszta alfabetycznie, na końcu trasy bez auta.
   Gdy żadna trasa nie ma auta — zwykła lista jak dotąd, bez nagłówków. */
const KOLEJNOSC_AUT = ['daf', 'iveco'];

function grupyTrasWgAuta(trasy) {
  const wg = new Map();
  trasy.forEach(t => {
    const klucz = t.pojazd ? String(t.pojazd) : '';
    if (!wg.has(klucz)) wg.set(klucz, { nazwa: t.pojazd_nazwa || '', trasy: [] });
    wg.get(klucz).trasy.push(t);
  });
  const miejsce = g => {
    if (!g.nazwa) return 1000;
    const i = KOLEJNOSC_AUT.indexOf(g.nazwa.trim().toLowerCase());
    return i < 0 ? 100 : i;
  };
  return [...wg.values()].sort((a, b) => miejsce(a) - miejsce(b) || a.nazwa.localeCompare(b.nazwa, 'pl'));
}

function kartyTrasWgAuta(trasy) {
  const grupy = grupyTrasWgAuta(trasy);
  // Bez nagłówków tylko gdy żadna trasa nie ma auta; jedno auto też dostaje nagłówek z nazwą.
  if (!grupy.length || (grupy.length === 1 && !grupy[0].nazwa)) return trasy.map(t => kartaTrasyZPrzydzialem(t)).join('');
  return grupy.map(g => `<div class="grupa-rozmiaru">
      <div class="grupa-rozmiaru-tytul">${escHtml(g.nazwa || 'Bez auta')} <span class="slaby">(${g.trasy.length})</span></div>
      ${g.trasy.map(t => kartaTrasyZPrzydzialem(t)).join('')}</div>`).join('');
}

/* Karta trasy na listach biura z listami „Kierowca” i „Auto” pod spodem: przydział jednym wyborem, bez wchodzenia w trasę
   (dawniej 4 kliknięcia). Zapis idzie tą samą drogą co „Zapisz zmiany” w trasie (zapisBiura, więc działa też w kolejce
   podczas aktualizacji serwera), a serwer zmienia tylko to jedno pole. Trasy zakończone i odwołane są bez list;
   konto „podgląd” też. */
function kartaTrasyZPrzydzialem(t) {
  const karta = kartaTrasy(t);
  if (!kontoBiura() || t.status === 'zakonczona' || t.status === 'odwolana') return karta;
  const auta = (stan.pojazdy || []).filter(b => b.aktywny || b.id === t.pojazd);
  const kierowcy = (stan.kierowcy || []).slice();
  if (t.kierowca && !kierowcy.some(k => k.id === t.kierowca)) kierowcy.push({ id: t.kierowca, imie: t.kierowca_imie || ('Konto nr ' + t.kierowca) });
  return `<div class="trasa-z-przydzialem">${karta}
      <div class="przydzial" data-przydzial="${t.id}" data-w-toku="${t.status === 'w_toku' ? '1' : ''}" data-zamkniete="${(t.ile_ok || 0) + (t.ile_nie || 0)}">
        <label>Kierowca<select data-przydziel="kierowca">
          <option value="">— nie przydzielono —</option>
          ${kierowcy.map(k => `<option value="${k.id}"${t.kierowca === k.id ? ' selected' : ''}>${escHtml(k.imie)}</option>`).join('')}
        </select></label>
        <label>Auto<select data-przydziel="pojazd">
          <option value="">— nie wybrano —</option>
          ${auta.map(b => opcjaBusa(b, t.pojazd === b.id)).join('')}
        </select></label>
        ${ostrzezenieCiezarowki(t.pojazd)}
      </div>
    </div>`;
}

/* Jeden słuchacz na całą stronę: listy tras rysują się od nowa przy każdym filtrze. */
document.addEventListener('change', e => {
  const wybor = e.target.closest && e.target.closest('[data-przydziel]');
  if (wybor) zmienPrzydzial(wybor);
});

async function zmienPrzydzial(wybor) {
  const wiersz = wybor.closest('[data-przydzial]');
  const id = Number(wiersz.dataset.przydzial);
  const pole = wybor.dataset.przydziel;
  const wartosc = wybor.value ? Number(wybor.value) : null;
  const wToku = !!wiersz.dataset.wToku;
  const zamkniete = Number(wiersz.dataset.zamkniete) || 0;
  // Zmiana kierowcy trasy z zamkniętymi punktami zeruje ich załadunek, a trasa w toku jedzie już u kogoś: pytamy jak przy ręcznym zapisie ryzyka.
  const ryzyko = pole === 'kierowca' ? (wToku || zamkniete > 0) : wToku;
  if (ryzyko && !await potwierdz(pole === 'kierowca' ? 'Zmienić kierowcę?' : 'Zmienić auto?',
    wToku ? 'Ta trasa już jedzie — zmiana przełączy ją na inną osobę lub auto w trakcie dnia.'
      : `Na tej trasie ${zamkniete} ${odmiana(zamkniete, 'punkt jest już zamknięty', 'punkty są już zamknięte', 'punktów jest już zamkniętych')} — zmiana kierowcy zeruje załadunek.`,
    { tak: 'Zmień mimo to', nie: 'Wróć', groznie: true })) { odswiezEkran(); return; }
  if (pole === 'pojazd' && wartosc && !await zgodaNaBus(wartosc)) { odswiezEkran(); return; }
  const w = await sprobuj(() => zapisBiura('POST', '/api/trasy', { id, [pole]: wartosc }, {
    opis: (pole === 'kierowca' ? 'zmiana kierowcy' : 'zmiana auta') + ' na trasie nr ' + id,
    zrodla: ['/api/trasy/' + id],
    popraw: (sciezka, d) => {
      if (sciezka !== '/api/trasy/' + id && !sciezka.startsWith('/api/trasy?')) return;
      const k = (stan.kierowcy || []).find(x => x.id === wartosc);
      const b = (stan.pojazdy || []).find(x => x.id === wartosc);
      wPamieci(d, id, x => Object.assign(x, pole === 'kierowca'
        ? { kierowca: wartosc, kierowca_imie: k ? k.imie : null }
        : { pojazd: wartosc, pojazd_nazwa: b ? b.nazwa : null, rejestracja: b ? b.rejestracja : null }));
    },
  }), 'Zapisano');
  odswiezEkran();
}

function kartaTrasy(t) {
  return `<button class="przystanek s-oczekuje" data-trasa="${t.id}" style="border-left-color:${
    t.status === 'zakonczona' ? 'var(--zielony)' : t.status === 'w_toku' ? 'var(--zolty)' : 'var(--akcent)'}">
      <span class="numer" title="${t.ile} ${odmiana(t.ile, 'punkt', 'punkty', 'punktów')} na trasie">${t.ile}</span>
      <span class="srodek">
        <span class="nazwa">${escHtml(t.nazwa || 'Trasa ' + polskaData(t.data))}</span>
        <span class="adres">${t.nazwa ? polskaData(t.data) + ' · ' : ''}${escHtml(t.kierowca_imie || 'bez kierowcy')}
          ${t.pojazd_nazwa ? ' · ' + escHtml(t.pojazd_nazwa) : ''}</span>
        <span class="dopisek">${t.ile_ok} ${odmiana(t.ile_ok, 'dostarczona', 'dostarczone', 'dostarczonych')}${
          t.ile_nie ? ', ' + t.ile_nie + ' ' + odmiana(t.ile_nie, 'nieudana', 'nieudane', 'nieudanych') : ''}
          z ${t.ile}${t.ile_uwag ? ` · <b style="color:var(--zolty)">${ikonka('ostrzezenie')}Uwagi w trasie: ${t.ile_uwag}</b>` : ''}${t.ile_do_przyjecia ? ` · <b style="color:var(--zolty)">${ikonka('klepsydra')}${t.ile_do_przyjecia + ' do zatwierdzenia'}</b>` : ''}</span>
      </span>
      <span class="prawo"><span class="plakietka p-${t.status}">${escHtml(etykietaStatusuTrasy(t.status))}</span></span>
    </button>`;
}

/* Biuro dopisuje uwagę za kierowcę (np. po telefonie): ten sam zapis co z telefonu kierowcy, ale od razu na serwerze. */
function oknoDopisaniaUwagi(t) {
  let powod = '';
  okno({
    tytul: 'Dopisz uwagę do trasy',
    ikona: 'ostrzezenie',
    tresc: `
      <div class="chipy">
        ${POWODY_UWAG_TRASY.map(x => `<button type="button" class="chip" data-powod="${x[0]}">${escHtml(x[1])}</button>`).join('')}
      </div>
      <label style="margin-top:10px">Punkt
        <select id="du-punkt"><option value="">— poza punktem —</option>
          ${t.przystanki.filter(p => p.status !== 'odwolany').map(p => `<option value="${p.id}">${escHtml(p.klient_nazwa)}</option>`).join('')}
        </select></label>
      <label>Notatka<textarea id="du-notatka" maxlength="500" placeholder="np. kierowca dzwonił: zamknięty most"></textarea></label>`,
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Dopisz', klasa: 'glowny', klik: async z => {
        if (!powod) { komunikat('Wybierz powód', 'blad'); return; }
        const punkt = document.getElementById('du-punkt').value;
        const w = await sprobuj(() => API.post(`/api/trasy/${t.id}/uwagi`, {
          powod, przystanek: punkt ? Number(punkt) : null, notatka: document.getElementById('du-notatka').value.trim(),
          czas: czasTeraz(),
        }), 'Uwaga dopisana');
        if (w) { z(); pokazEkran('trasa', { id: t.id }); }
      } },
    ],
    poOtwarciu: pole => pole.querySelectorAll('[data-powod]').forEach(b => b.onclick = () => {
      pole.querySelectorAll('[data-powod]').forEach(x => x.classList.remove('wybrany'));
      b.classList.add('wybrany');
      powod = b.dataset.powod;
    }),
  });
}

/* Wyłącznie osoby, które faktycznie jeżdżą. Konto biura na liście „Kierowca"
   kusi, żeby przypisać mu trasę — a taka trasa nie dojedzie do żadnego telefonu. */
async function listaKierowcow() {
  if (!jestBiuro()) return [];
  // Osobny, okrojony wykaz zamiast pełnej listy kont: konta widzi tylko
  // administrator, a trasy układa też biuro i musi wskazać kierowcę.
  if (!stan.kierowcy) stan.kierowcy = await API.get('/api/kierowcy');
  return stan.kierowcy;
}

/* ------------------------------------------- stan aut z GK Flota (GK Transport) */

/* GK Flota prowadzi przeglądy, terminy i usterki. GK Trasy tylko pokazuje jego
   zdanie o aucie: sprawne / uwagi / niesprawne. Bez pary w GK Flota (albo bez
   połączenia) pole flotex jest puste i nic się nie rysuje. Decyzja zostaje
   przy planiście — niesprawne auto da się przypisać, ale po pytaniu.       */
function znacznikFlotexu(f) {
  if (!f) return '';
  if (!f.sprawny) {
    return `<span class="plakietka p-nieudane" title="${escHtml((f.powody || []).join('\n'))}">`
      + (ikonka('ostrzezenie') + 'niesprawne</span>');
  }
  if ((f.uwagi || []).length) {
    return `<span class="plakietka p-w_toku" title="${escHtml(f.uwagi.join('\n'))}">! uwagi</span>`;
  }
  return ('<span class="plakietka p-dostarczone" title="GK Flota: bez zastrzeżeń">' + ikonka('haczyk') + 'sprawne</span>');
}

/* Powody drobnym drukiem pod znacznikiem — title nie działa na telefonie. */
function powodyFlotexu(f) {
  if (!f) return '';
  const lista = !f.sprawny ? (f.powody || []) : (f.uwagi || []);
  return lista.length ? `<div class="male slaby">${lista.map(escHtml).join('<br>')}</div>` : '';
}

/* Ciężarówkę liczymy profilem ciężarowym OpenRouteService; bez klucza mapa pokazuje trasę osobową, więc mówimy o tym
   wprost przy aucie (serwer ustawia `brak_klucza_ors` tylko przy aucie ciężarowym). */
const OSTRZEZENIE_BEZ_KLUCZA_ORS = 'Trasa liczona dla osobowego — brak klucza OpenRouteService; dla ciężarówki może być nieprawdziwa.';

function ostrzezenieCiezarowki(idAuta) {
  const b = idAuta && (stan.pojazdy || []).find(x => x.id === Number(idAuta));
  return b && b.brak_klucza_ors
    ? `<div class="wstega uwaga">${ikonka('ostrzezenie')}${OSTRZEZENIE_BEZ_KLUCZA_ORS}</div>` : '';
}

function wstegiOstrzezen(lista) {
  return (lista || []).map(o => `<div class="wstega uwaga">${ikonka('ostrzezenie')}${escHtml(o)}</div>`).join('');
}

function opcjaBusa(b, wybrany) {
  const zly = b.flotex && !b.flotex.sprawny;
  return `<option value="${b.id}" ${wybrany ? 'selected' : ''}>${zly ? 'Uwaga: ' : ''}${escHtml(b.nazwa)}${
    b.rejestracja ? ' · ' + escHtml(b.rejestracja) : ''}${zly ? ' — niesprawne' : ''}</option>`;
}

/* Pytanie przed przypisaniem auta, które GK Flota uznała za niesprawne.
   true = można zapisywać. Serwer niczego nie blokuje — to jest ostrzeżenie. */
async function zgodaNaBus(idBusa) {
  const b = stan.pojazdy.find(x => x.id === Number(idBusa));
  const f = b && b.flotex;
  if (!f || f.sprawny) return true;
  return potwierdz('Auto niesprawne',
    `GK Flota: auto ${b.rejestracja || b.nazwa} jest niesprawne — `
    + `${(f.powody || []).join('; ') || 'bez podanego powodu'}. Przypisać mimo to?`,
    { tak: 'Przypisz mimo to', nie: 'Wybiorę inne', groznie: true });
}

function oknoNowejTrasy(data, kierowcy) {
  const busy = stan.pojazdy.filter(p => p.aktywny);
  okno({
    szkic: 'nowa-trasa',
    tytul: 'Nowa trasa',
    tresc: `
      <label>Dzień<input type="date" id="nt-data" value="${data}"></label>
      <label>Kierowca
        <select id="nt-kierowca">
          <option value="">— przydzielę później —</option>
          ${kierowcy.map(k => `<option value="${k.id}">${escHtml(k.imie)}</option>`).join('')}
        </select>
      </label>
      <label>Auto
        <select id="nt-pojazd">
          <option value="">— nie wybrano —</option>
          ${busy.map(b => opcjaBusa(b, false)).join('')}
        </select>
      </label>
      <label>Nazwa <span class="slaby">(np. „Wschód”, „Poranna”)</span>
        <input id="nt-nazwa" placeholder="nieobowiązkowa">
      </label>
      <label>Układ trasy
        <select id="nt-uklad">${opcjeUkladu('baza_baza')}</select></label>
      <p class="male slaby">Między naszymi magazynami wybierz „Bez bazy”. Zmienisz to później.</p>`,
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Utwórz', klasa: 'glowny', klik: async z => {
        if (!await zgodaNaBus(document.getElementById('nt-pojazd').value)) return;
        const nowa = await sprobuj(() => API.post('/api/trasy', {
          uklad: document.getElementById('nt-uklad').value,
          data: document.getElementById('nt-data').value,
          kierowca: document.getElementById('nt-kierowca').value || null,
          pojazd: document.getElementById('nt-pojazd').value || null,
          nazwa: document.getElementById('nt-nazwa').value.trim(),
        }));
        if (nowa) { z(); pokazEkran('trasa', { id: nowa.id }); }
      } },
    ],
  });
}

/* ------------------------------------------------- jedna trasa: edytor */

EKRANY.trasa = {
  tytul: 'Trasa',
  async rysuj(pole, param) {
    const id = param.id || (trasaWEdycji && trasaWEdycji.id);
    if (!id) return pokazEkran('trasy');
    trasaWEdycji = await API.get('/api/trasy/' + id);
    const t = trasaWEdycji;
    const admin = kontoBiura();      // podgląd tras dostaje ten sam widok co kierowca: bez pól i przycisków zmian
    document.getElementById('tytul-ekranu').textContent =
      (t.nazwa || 'Trasa') + ' · ' + polskaData(t.data);

    const kierowcy = await listaKierowcow();
    // Świeży stan aut: GK Flota mogła od rana uznać któreś za niesprawne.
    if (admin) stan.pojazdy = await API.get('/api/pojazdy').catch(() => stan.pojazdy);
    const busy = stan.pojazdy.filter(p => p.aktywny || p.id === t.pojazd);
    ETA.policz(t);

    pole.innerHTML = `
      <button class="tekstowy" id="tr-wroc">${ikonka('strzalka-lewo')}Wszystkie trasy</button>
      ${t.status === 'odwolana' ? `<div class="wstega uwaga">Trasa odwołana — nie ma jej
        w planie ani w telefonie kierowcy. Zostaje w historii razem z dowodami.</div>` : ''}

      ${admin ? `<div class="karta">
        ${t.flotex && !t.flotex.sprawny ? `<div class="wstega blad">${ikonka('ostrzezenie')}GK Flota: auto
          ${escHtml(t.rejestracja || t.pojazd_nazwa || '')} jest niesprawne —
          ${escHtml((t.flotex.powody || []).join('; ') || 'bez podanego powodu')}.</div>` : ''}
        ${ostrzezenieCiezarowki(t.pojazd)}
        <!-- UI etap 3: na wierzchu tylko to, co biuro zmienia co dzień (dzień,
             kierowca, auto) — punkty trasy mają być widać bez przewijania.
             Reszta (nazwa, godzina, baza, układ, uwagi, rzadkie przyciski) leży
             pod zwijanym „${ikonka('szewron-prawo')}Dane trasy”; pola zostają w DOM-ie, więc „Zapisz
             zmiany” zapisuje je tak samo, jak przedtem.                        -->
        <div class="trzy">
          <label>Dzień<input type="date" id="tr-data" value="${t.data}"></label>
          <label>Kierowca
            <select id="tr-kierowca">
              <option value="">— nie przydzielono —</option>
              ${kierowcy.map(k => `<option value="${k.id}" ${t.kierowca === k.id ? 'selected' : ''}>${escHtml(k.imie)}</option>`).join('')}
            </select>
          </label>
          <label>Auto
            <select id="tr-pojazd">
              <option value="">— nie wybrano —</option>
              ${busy.map(b => opcjaBusa(b, t.pojazd === b.id)).join('')}
            </select>
          </label>
        </div>
        <div class="przyciski">
          <button class="glowny" id="tr-zapisz">Zapisz zmiany</button>
          <button class="maly" id="tr-mapa-link">${ikonka('mapa')}Wyślij do Google Maps</button>
          <button class="maly" id="tr-os-akcji">Przebieg trasy — kto i co</button>
        </div>
        <details class="zaawansowane wiecej-trasy" id="tr-wiecej" open>
          <summary><span class="znak-zwiniecia">${ikonka('szewron-prawo')}</span> Dane trasy
            ${t.uwagi ? ('<span class="slaby">' + ikonka('pinezka') + 'są uwagi</span>') : ''}</summary>
          <div class="dwie">
            <label>Nazwa<input id="tr-nazwa" value="${escHtml(t.nazwa || '')}"></label>
            <label>Godzina wyjazdu
              <input type="time" id="tr-wyjazd" value="${escHtml(t.wyjazd_o || '')}"
                     placeholder="${escHtml(t.wyjazd || '07:00')}"></label>
            <label>Miejsce wyjazdu na tej trasie
              <select id="tr-baza">
                <option value="">— ${escHtml(t.baza_nazwa || 'domyślne miejsce')} —</option>
                ${(stan.lokalizacje || []).filter(l => l.aktywna !== 0).map(l =>
                  `<option value="${l.id}" ${t.baza === l.id ? 'selected' : ''}>${escHtml(l.nazwa)}</option>`).join('')}
              </select></label>
            <label>Układ trasy
              <select id="tr-uklad">
                ${opcjeUkladu(t.uklad)}
              </select></label>
          </div>
          <p class="male slaby" style="margin:-6px 0 10px">Między naszymi magazynami wybierz
            „Bez bazy”. Pusta godzina = z Ustawień (${escHtml(stan.ustawienia.godzina_wyjazdu || '07:00')}).</p>
          <label>Uwagi dla kierowcy <span class="slaby">(widzi je na górze ekranu)</span>
            <textarea id="tr-uwagi">${escHtml(t.uwagi || '')}</textarea>
          </label>
          <div class="przyciski">
            <button class="maly" id="tr-szablon">Dodaj do zapisanych tras</button>
            <button class="maly" id="tr-kopiuj">Kopiuj na inny dzień</button>
            ${t.status === 'odwolana' ? '' : '<button class="maly" id="tr-odwolaj">Odwołaj trasę</button>'}
            ${jestAdministratorem() ? '<button class="maly" id="tr-usun">Usuń trasę</button>' : ''}
          </div>
        </details>
      </div>` : `<div class="karta scisla">
        <b>${escHtml(t.kierowca_imie || '')}</b> · ${escHtml(t.pojazd_nazwa || 'bez auta')}
        ${t.uwagi ? `<div class="wstega info" style="margin:10px 0 0">${ikonka('pinezka')}${escHtml(t.uwagi)}</div>` : ''}
      </div>`}

      ${(t.uwagi_trasy || []).length || admin ? `<div class="karta" id="tr-uwagi">
        <div class="karta-gora"><h2>Uwagi w trasie (${(t.uwagi_trasy || []).length})</h2>
          ${admin ? '<button class="maly" id="tr-uwaga-dopisz">' + ikonka('plus') + 'Dopisz uwagę</button>' : ''}
        </div>
        ${(t.uwagi_trasy || []).map(u => `<div class="wstega uwaga" style="margin:6px 0">
          <b>${escHtml(samaGodzina(u.czas_serwera))} · ${escHtml(u.powod_nazwa || u.powod)}</b>${
            u.klient_nazwa ? ' · ' + escHtml(u.klient_nazwa) : ''}${u.notatka ? '<br>' + escHtml(u.notatka) : ''}${
            u.autor_imie && u.autor_imie !== t.kierowca_imie ? `<br><span class="male slaby">dopisał(a): ${escHtml(u.autor_imie)}</span>` : ''}${
            u.zdjecie ? ` <a href="#" data-uwaga-zdjecie="${escHtml(u.zdjecie)}">${ikonka('aparat')}zdjęcie</a>` : ''}</div>`).join('')
          || '<div class="pusto">Kierowca nie zgłosił uwag na tej trasie.</div>'}
        <div class="male slaby">Informacja dla biura — plan i godziny trasy same się nie zmieniają.</div>
      </div>` : ''}

      <div class="karta">
        <div class="karta-gora">
          <h2>Punkty (${t.przystanki.length})</h2>
          ${admin ? `<div class="przyciski">
            <button class="maly glowny" id="tr-dodaj">+ Dodaj punkty</button>
            <button class="maly" id="tr-optymalizuj">Zaproponuj kolejność</button>
          </div>` : ''}
        </div>
        <div id="tr-lista">
          ${t.przystanki.length ? t.przystanki.map((p, i) => wierszPrzystanku(p, i, t.przystanki.length, admin)).join('')
            : '<div class="pusto">Brak punktów. Dodaj klientów albo nasze miejsca, żeby ułożyć trasę.</div>'}
        </div>
      </div>

      ${t.szacunek ? `<div class="karta scisla">
        <div class="karta-gora"><h2 style="margin:0">Przewidywany czas realizacji</h2>
          <span class="plakietka ${t.szacunek.doba_przekroczona
            || t.szacunek.limit_jazdy_przekroczony || t.szacunek.po_koncu_zmiany ? 'p-nieudane' : 'p-dostarczone'}">
            ${godzinyMinuty(t.szacunek.minuty)}</span></div>
        <div class="kafelki">
          <div><span class="etykieta">${t.szacunek.start_w_bazie ? 'Wyjazd z bazy' : 'Start'}</span>
            <b>${escHtml(t.szacunek.wyjazd)}</b></div>
          <div><span class="etykieta">${t.szacunek.powrot_do_bazy
            ? 'Powrót ok.' : 'Koniec ok.'}</span><b>${escHtml(t.szacunek.powrot || '—')}</b></div>
          <div><span class="etykieta">Trasa</span><b>${liczbaPl(t.szacunek.km)} km</b></div>
          <div><span class="etykieta">Punktów</span><b>${t.szacunek.punktow}</b></div>
        </div>
        <p class="male slaby" style="margin-top:10px">
          Jazda ${godzinyMinuty(t.szacunek.minuty_jazdy)} ·
          postoje ${godzinyMinuty(t.szacunek.minuty_postojow)}
          (${t.szacunek.postoj_na_punkt} min na punkt${t.szacunek.z_historii
            ? ' — <b>policzone z waszych dostaw</b>' : ' — z Ustawień'})${
            t.szacunek.minuty_zaladunkow ? ` · w tym załadunki u nas
            ${godzinyMinuty(t.szacunek.minuty_zaladunkow)}` : ''}${
            t.szacunek.minuty_przerw ? ` · przerwy kierowcy
            ${godzinyMinuty(t.szacunek.minuty_przerw)} (${t.szacunek.ile_przerw})` : ''}.
          ${t.pojazd_typ === 'ciezarowe' ? '<br><span class="slaby">Czas i kilometry liczone średnią prędkością '
            + 'i linią prostą, nie profilem ciężarowym.</span>' : ''}
          ${t.szacunek.powrot_do_bazy ? '' : '<br><span class="slaby">Trasa kończy się '
            + 'u ostatniego punktu — powrotu do bazy nie doliczam.</span>'}
          ${t.szacunek.start_w_bazie ? '' : '<br><span class="slaby">Liczę od pierwszego '
            + 'punktu — dojazdu z bazy nie doliczam.</span>'}
          ${t.szacunek.przepisy ? '' : '<br><span class="slaby">Przy tym aucie '
            + 'przerw nie doliczamy (ustawienie przy aucie).</span>'}
          ${t.szacunek.limit_jazdy_przekroczony
            ? `<br><span style="color:var(--czerwony)"><b>Sama jazda przekracza
              ${godzinyMinuty(Number(stan.ustawienia.dobowy_limit_jazdy_min) || 540)}</b>
              — próg ustawiacie w Ustawieniach. Rozważ podział na dwie trasy.</span>` : ''}
          ${t.szacunek.doba_przekroczona
            ? `<br><span style="color:var(--czerwony)"><b>Cały dzień przekracza
              ${godzinyMinuty(Number(stan.ustawienia.doba_pracy_min) || 780)}</b>
              od wyjazdu do powrotu.</span>` : ''}
          ${t.szacunek.po_koncu_zmiany
            ? `<br><span style="color:var(--czerwony)"><b>Trasa kończy się po końcu zmiany</b>
              (${escHtml(t.szacunek.koniec_zmiany)}) — rozważ wcześniejszy wyjazd albo podział na dwie trasy.</span>` : ''}
          ${t.szacunek.bez_mapy ? `<br><span style="color:var(--zolty)">
            ${t.szacunek.bez_mapy} ${odmiana(t.szacunek.bez_mapy, 'punkt nie ma', 'punkty nie mają',
              'punktów nie ma')} odnalezionego adresu — szacunek ich nie obejmuje.</span>` : ''}
        </p>
      </div>` : ''}

      <div class="karta">
        <div class="karta-gora"><h2>Mapa</h2>
          <button class="maly" id="tr-przebieg">Pokaż przebieg po drogach</button>
        </div>
        <div class="mapa wysoka" id="tr-mapa"></div>
        <div class="male slaby" style="margin-top:8px" id="tr-info-mapa">
          Przerywana linia to odcinki w linii prostej — tylko podgląd kolejności.
        </div>
      </div>`;

    pole.querySelector('#tr-wroc').onclick = () => pokazEkran('trasy', { data: t.data });
    pole.querySelectorAll('[data-uwaga-zdjecie]').forEach(a => a.onclick = async e => {
      e.preventDefault();
      window.open(adresPliku(a.dataset.uwagaZdjecie, await tokenDoPlikow()), '_blank', 'noopener');
    });
    const btnDopisz = pole.querySelector('#tr-uwaga-dopisz');
    if (btnDopisz) btnDopisz.onclick = () => oknoDopisaniaUwagi(t);

    if (admin) {
      // Szkic formularza trasy (dzień, kierowca, auto, nazwa, uwagi…) — wraca po odświeżeniu strony / powrocie programu.
      Szkice.przypnij(pole, 'trasa-' + t.id, { filtr: /^tr-(data|kierowca|pojazd|nazwa|uwagi|wyjazd|baza|uklad)$/ });
      pole.querySelector('#tr-zapisz').onclick = async () => {
        // Pytamy tylko przy ZMIANIE auta — o tym już przypisanym mówi wstęga
        // na górze, a pytanie przy każdej poprawce uwag nauczyłoby klikać „tak".
        const bus = pole.querySelector('#tr-pojazd').value;
        if (Number(bus) !== Number(t.pojazd || 0) && !await zgodaNaBus(bus)) return;
        const zmiany = {
          id: t.id,
          data: pole.querySelector('#tr-data').value,
          kierowca: pole.querySelector('#tr-kierowca').value || null,
          pojazd: pole.querySelector('#tr-pojazd').value || null,
          nazwa: pole.querySelector('#tr-nazwa').value.trim(),
          uwagi: pole.querySelector('#tr-uwagi').value.trim(),
          wyjazd_o: pole.querySelector('#tr-wyjazd').value || '',
          baza: pole.querySelector('#tr-baza').value || null,
          uklad: pole.querySelector('#tr-uklad').value,
        };
        const w = await sprobuj(() => zapisBiura('POST', '/api/trasy', zmiany, {
          opis: 'zmiana trasy ' + (t.nazwa || polskaData(t.data)),
          zrodla: ['/api/trasy/' + t.id],
          popraw: (sciezka, d) => {
            if (sciezka !== '/api/trasy/' + t.id && !sciezka.startsWith('/api/trasy?')) return;
            const kierowca = zmiany.kierowca ? Number(zmiany.kierowca) : null;
            const pojazd = zmiany.pojazd ? Number(zmiany.pojazd) : null;
            const k = (stan.kierowcy || []).find(x => x.id === kierowca);
            const b = (stan.pojazdy || []).find(x => x.id === pojazd);
            wPamieci(d, t.id, x => Object.assign(x, {
              data: zmiany.data, nazwa: zmiany.nazwa, uwagi: zmiany.uwagi, wyjazd_o: zmiany.wyjazd_o,
              uklad: zmiany.uklad, kierowca, kierowca_imie: k ? k.imie : (kierowca ? x.kierowca_imie : null),
              pojazd, rejestracja: b ? b.rejestracja : (pojazd ? x.rejestracja : null),
              baza: zmiany.baza ? Number(zmiany.baza) : null,
            }));
          },
        }), 'Zapisano');
        if (w) { Szkice.usun('trasa-' + t.id); pokazEkran('trasa', { id: t.id }); }
      };
      // R11 (2026-11-09): „Odwołaj trasę” — biuro i administrator (miękko: trasa znika z planu i z telefonu kierowcy,
      // zostaje w historii razem z dowodami). „Usuń trasę” (kasowanie) — tylko administrator; biuro tego przycisku
      // nie ma, a serwer i tak odmówi.
      const przyciskOdwolaj = pole.querySelector('#tr-odwolaj');
      if (przyciskOdwolaj) przyciskOdwolaj.onclick = async () => {
        if (!await potwierdz('Odwołać całą trasę?',
          'Trasa zniknie z planu i z telefonu kierowcy (dostanie powiadomienie), ale zostanie na liście '
          + 'tego dnia razem ze zdjęciami i historią. Tego nie cofniesz tym przyciskiem.')) return;
        const w = await sprobuj(() => API.del('/api/trasy/' + t.id + '?odwolaj=1'));
        if (!w) return;
        komunikat('Trasa odwołana', 'ok');
        pokazEkran('trasy', { data: t.data });
      };
      const przyciskUsun = pole.querySelector('#tr-usun');
      if (przyciskUsun) przyciskUsun.onclick = async () => {
        if (!await potwierdz('Usunąć całą trasę?',
          'Trasa z załadunkiem, zdjęciami albo czekającymi zapisami telefonu '
          + 'zostanie tylko odwołane — dowody zostają w historii.')) return;
        const w = await sprobuj(() => API.del('/api/trasy/' + t.id));
        if (!w) return;
        komunikat(w.odwolana ? `Trasa odwołana, nie skasowana — ${w.dlaczego}`
          : 'Trasa usunięta', 'ok');
        pokazEkran('trasy', { data: t.data });
      };
      pole.querySelector('#tr-kopiuj').onclick = () => oknoKopiowania(t);
      pole.querySelector('#tr-mapa-link').onclick = () => oknoLinkuDoMap(t.id, false);
      pole.querySelector('#tr-os-akcji').onclick = () => oknoPrzebiegu(t);
      pole.querySelector('#tr-szablon').onclick = () => okno({
        szkic: 'zapisana-z-trasy-' + t.id,
        tytul: 'Dodaj do zapisanych tras',
        tresc: `<p class="male slaby">Zapamiętam klientów i ich kolejność. Bez dat,
            bez potwierdzeń — żeby dało się z tego robić kolejne dni.</p>
          <label>Nazwa zapisanej trasy<input id="zs-nazwa"
            value="${escHtml(t.nazwa || 'Trasa ' + polskaData(t.data))}"></label>`,
        przyciski: [
          { napis: 'Anuluj', klik: z => z() },
          { napis: 'Zapisz', klasa: 'glowny', klik: async z => {
            const w = await sprobuj(() => zapisBiura('POST', `/api/trasy/${t.id}/szablon`,
              { nazwa: val('zs-nazwa') }, { opis: 'zapisana trasa „' + val('zs-nazwa') + '”' }), 'Trasa dodana do zapisanych');
            if (w) { z(); pokazEkran('szablony'); }
          } },
        ],
      });
      pole.querySelector('#tr-dodaj').onclick = () => oknoDodawaniaKlientow(t);
      pole.querySelector('#tr-optymalizuj').onclick = () => zaproponujKolejnosc(t);

      pole.querySelectorAll('[data-gora]').forEach(b =>
        b.onclick = () => przestaw(t, Number(b.dataset.gora), -1));
      pole.querySelectorAll('[data-dol]').forEach(b =>
        b.onclick = () => przestaw(t, Number(b.dataset.dol), 1));
      pole.querySelectorAll('[data-usun-przystanek]').forEach(b => b.onclick = async () => {
        const punkt = t.przystanki.find(x => x.id === Number(b.dataset.usunPrzystanek)) || {};
        const ruszyla = t.status !== 'planowana';
        if (!await potwierdz(
          `Zdjąć z trasy: ${punkt.klient_nazwa || 'ten punkt'}?`,
          ruszyla
            ? 'Trasa już ruszyła, więc punkt zostanie na niej oznaczony jako zdjęty — '
              + 'gdyby kierowca zdążył go potwierdzić bez zasięgu, jego podpis nie przepadnie.'
            : 'Punkt zniknie z trasy. Jeśli ma załadunek albo telefon kierowcy ma '
              + 'czekające zapisy, zostanie tylko zdjęty — dowody nie przepadną.')) return;
        const idPunktu = Number(b.dataset.usunPrzystanek);
        const w = await sprobuj(() => zapisBiura('DELETE', '/api/przystanki/' + idPunktu, undefined, {
          opis: 'zdjęcie punktu ' + (punkt.klient_nazwa || ''),
          zrodla: ['/api/trasy/' + t.id],
          popraw: (sciezka, d) => {
            if (sciezka !== '/api/trasy/' + t.id || !d || !Array.isArray(d.przystanki)) return;
            if (d.status === 'planowana') d.przystanki = d.przystanki.filter(x => x.id !== idPunktu);
            else d.przystanki.forEach(x => { if (x.id === idPunktu) x.status = 'odwolany'; });
          },
        }));
        if (!w) return;
        if (w.wKolejce) { komunikat(KOMUNIKAT_KOLEJKI_BIURA, 'ok'); pokazEkran('trasa', { id: t.id }); return; }
        komunikat(w.zdjety_nie_skasowany
          ? 'Punkt zdjęty z trasy — zostaje widoczny razem z dowodami'
          : 'Punkt usunięty z trasy', 'ok');
        pokazEkran('trasa', { id: t.id });
      });
    }
    pole.querySelectorAll('[data-szczegoly]').forEach(b =>
      b.onclick = () => oknoSzczegolowPunktu(t, Number(b.dataset.szczegoly)));

    mapaBiura = Mapa.zaloz(pole.querySelector('#tr-mapa'));
    // Baza bierze sie z trasy (moze byc inna dla kazdego kierowcy), a nie
    // juz z jednego ustawienia na cala firme.
    const baza = t.baza_lat != null ? [t.baza_lat, t.baza_lon]
      : (stan.ustawienia.baza_lat
         ? [Number(stan.ustawienia.baza_lat), Number(stan.ustawienia.baza_lon)] : null);
    // Mapa rysuje dokładnie to, co program liczy: bazę jako start tylko wtedy,
    // gdy zlecenie stamtąd wyjeżdża, i jako metę tylko wtedy, gdy tam wraca.
    const bazaStart = ukladStart(t.uklad) ? baza : null;
    const bazaKoniec = ukladPowrot(t.uklad) ? baza : null;
    const ile = Mapa.rysujTrase(mapaBiura, t.przystanki,
      { bazaStart, bazaKoniec, bazaNazwa: t.baza_nazwa });
    if (ile < t.przystanki.length) {
      pole.querySelector('#tr-info-mapa').innerHTML =
        `<span style="color:var(--zolty)">Część klientów nie ma jeszcze odnalezionego adresu —
         popraw adres w kartotece albo kliknij „Znajdź na mapie” przy kliencie.</span>`;
    }
    const przyciskPrzebieg = pole.querySelector('#tr-przebieg');
    przyciskPrzebieg.onclick = async () => {
      const info = pole.querySelector('#tr-info-mapa');
      przyciskPrzebieg.disabled = true;
      przyciskPrzebieg.textContent = 'Liczę przebieg…';
      info.innerHTML = '<span class="slaby">Pytam o przejazd po drogach…</span>';
      try {
        let w = await sprobuj(() => API.post(`/api/trasy/${t.id}/przebieg`));
        if (!w) return;
        const ostrzezenia = wstegiOstrzezen(w.ostrzezenia);
        // Ciężarówka, a ORS nie dał trasy: osobowej nie podstawiamy — mapa zostaje przy liniach prostych.
        if (w.zrodlo === 'brak') { info.innerHTML = ostrzezenia; return; }
        // Bez klucza OpenRouteService serwer odsyła same punkty, a kształt po
        // drogach dorysowuje przeglądarka — dzięki temu działa to bez żadnej
        // rejestracji i tak samo na Macu jak na Windowsie.
        if (w.zrodlo === 'przegladarka') w = await Mapa.przebiegPoDrogach(w.punkty);
        if (!w) return;
        Mapa.rysujTrase(mapaBiura, t.przystanki,
          { bazaStart, bazaKoniec, bazaNazwa: t.baza_nazwa, linia: w.linia });
        info.innerHTML = ostrzezenia +
          `Po drogach: <b>${liczbaPl(w.km)} km</b> · około <b>${w.minuty} min</b> jazdy (bez postojów u klientów).`;
      } catch (e) {
        info.innerHTML = '<span style="color:var(--zolty)">Nie udało się pobrać przebiegu po drogach '
          + `(${escHtml(poLudzku(e))}). Mapa pokazuje odcinki w linii prostej.</span>`;
      } finally {
        przyciskPrzebieg.disabled = false;
        przyciskPrzebieg.textContent = 'Pokaż przebieg po drogach';
      }
    };
  },
};

function wierszPrzystanku(p, indeks, ile, admin) {
  const status = p.status === 'dostarczone' ? ('<span class="plakietka p-dostarczone">' + ikonka('haczyk') + '</span>')
    : p.status === 'nieudane' ? `<span class="plakietka p-nieudane">${ikonka('zamknij')}${escHtml(p.powod)}</span>`
    : p.status === 'odwolany' ? '<span class="plakietka p-odwolany">Zdjęte z trasy</span>' : '';
  const dopiski = [];
  if (p.do_przyjecia) dopiski.push(('<span style="color:var(--zolty)">' + ikonka('klepsydra') + 'do zatwierdzenia</span>'));
  if (p.zwrot_powod && p.status === 'oczekuje') dopiski.push(('<span style="color:var(--czerwony)">' + ikonka('cofnij') + 'zwrócone kierowcy</span>'));
  // Przy naszym miejscu nie ma zamowienia ani kontroli zaladunku — czerwone
  // ostrzezenie o niezgodnym numerze byloby tu falszywym alarmem.
  const nasze = !!p.nasze;
  if (p.z_dnia) dopiski.push(('<span style="color:var(--czerwony)">' + ikonka('zegar') + 'zaległe z ')
    + escHtml(p.z_dnia) + '</span>');
  if (p.zaladowano_o && !nasze) {
    // Niezgodny numer to najwazniejsza informacja na tym ekranie — znaczy,
    // ze kierowca wzial spod rampy cos innego, niz mowi zamowienie.
    dopiski.push(p.zaladunek_zgodny
      ? (ikonka('haczyk') + 'załadunek OK') + (p.dokument ? '' : ' · numer ' + escHtml(p.numer_kierowcy || ''))
      : p.zaladunek_zwolniony
        ? ('<span style="color:var(--zolty)">' + ikonka('ostrzezenie') + 'numer niezgodny — zwolnione przez biuro</span>')
        : ('<span style="color:var(--czerwony)">' + ikonka('stop') + 'WYJAZD WSTRZYMANY: kierowca wpisał ')
          + escHtml(p.numer_kierowcy || '—') + ', a zamówienie ma inny numer</span>');
  }
  if (p.towar) dopiski.push(ikonka('paczka') + escHtml(p.towar));
  if (p.dokument) dopiski.push(ikonka('raporty') + escHtml(p.dokument));
  if (p.okno_od || p.okno_do) dopiski.push(`${ikonka('zegar')}${escHtml(p.okno_od || '…')}–${escHtml(p.okno_do || '…')}`);
  // Co kierowca zostawił przy zamkniętym punkcie — widać w wierszu, bez wchodzenia w „Szczegóły”.
  if (p.status === 'dostarczone' || p.status === 'nieudane') {
    if (p.odebral) dopiski.push((ikonka('osoba') + 'odebrał: ') + escHtml(p.odebral));
    if (p.notatka) dopiski.push(ikonka('notatka') + escHtml(String(p.notatka).length > 90 ? String(p.notatka).slice(0, 90) + '…' : p.notatka));
    if (p.ile_zalacznikow) dopiski.push(ikonka('spinacz') + p.ile_zalacznikow);
    const bezDow = bezDowoduPowod(p);
    const wymaganeBezZal = String(p.wymogi || '').split(',').filter(w => w === 'zdjecie' || w === 'podpis');
    if (bezDow) dopiski.push(('<span style="color:var(--czerwony)">' + ikonka('ostrzezenie') + 'bez dowodu — powód: ' + escHtml(bezDow) + '</span>'));
    else if (p.status === 'dostarczone' && !p.ile_zalacznikow && wymaganeBezZal.length) {
      // Punkt wymagał zdjęcia i/lub podpisu, a nie ma żadnego załącznika (od 26.11 u klienta zdjęcie i podpis) — czerwony znacznik.
      dopiski.push(('<span style="color:var(--czerwony)">' + ikonka('ostrzezenie') + 'brak dowodu: '
        + wymaganeBezZal.map(w => WYMOGI_ETYKIETY[w]).join(', ') + '</span>'));
    } else if (p.status === 'dostarczone' && !p.ile_zalacznikow && !nasze) dopiski.push(('<span style="color:var(--zolty)">' + ikonka('ostrzezenie') + 'bez podpisu i zdjęcia</span>'));
  }
  if (p.eta) dopiski.push(ETA.opis(p));
  if (p.mapa_lat == null) dopiski.push(('<span style="color:var(--zolty)">' + ikonka('ostrzezenie') + 'brak adresu na mapie</span>'));

  return `<div class="przystanek s-${p.status}" style="cursor:default">
      <span class="numer">${indeks + 1}</span>
      <span class="srodek">
        <span class="nazwa">${nasze ? ikonka('fabryka') : ''}${escHtml(p.klient_nazwa)}</span>
        <span class="adres">${adresHtml(p)}</span>
        ${dopiski.length ? `<span class="dopisek">${dopiski.join(' &nbsp;·&nbsp; ')}</span>` : ''}
      </span>
      <span class="prawo">
        ${nasze && p.rodzaj ? `<span class="plakietka p-nasze">${escHtml(napisRodzaju(p.rodzaj))}</span>` : ''}
        ${status}
        <span class="przyciski">
          <button class="maly" data-szczegoly="${p.id}">Szczegóły</button>
          ${admin && p.status === 'oczekuje' ? `
            <span class="uchwyty">
              <button data-gora="${p.id}" ${indeks === 0 ? 'disabled' : ''} title="Wyżej" aria-label="Wyżej">${ikonka('szewron-gora')}</button>
              <button data-dol="${p.id}" ${indeks === ile - 1 ? 'disabled' : ''} title="Niżej" aria-label="Niżej">${ikonka('szewron-dol')}</button>
            </span>
            <button class="maly" data-usun-przystanek="${p.id}" title="Zdejmij z trasy" aria-label="Zdejmij z trasy">${ikonka('zamknij')}</button>` : ''}
        </span>
      </span>
    </div>`;
}

/* Kolejność punktów bez programu: lista punktów w zapamiętanej trasie
   układa się tak, jak ją ustawiono. */
function opcjeKolejnosci(t, kolejnosc) {
  return {
    opis: 'kolejność punktów ' + (t.nazwa || polskaData(t.data)),
    zrodla: ['/api/trasy/' + t.id],
    popraw: (sciezka, d) => {
      if (sciezka !== '/api/trasy/' + t.id || !d || !Array.isArray(d.przystanki)) return;
      const miejsce = id => { const i = kolejnosc.indexOf(id); return i < 0 ? kolejnosc.length : i; };
      d.przystanki.sort((a, b) => miejsce(a.id) - miejsce(b.id));
    },
  };
}

async function przestaw(t, przystanekId, kierunek) {
  const kolejnosc = t.przystanki.map(p => p.id);
  const i = kolejnosc.indexOf(przystanekId);
  const j = i + kierunek;
  if (j < 0 || j >= kolejnosc.length) return;
  [kolejnosc[i], kolejnosc[j]] = [kolejnosc[j], kolejnosc[i]];
  // Ekran rysuje się od nowa, więc bez tego lista skakałaby na samą górę
  // po każdym przesunięciu punktu — a przesuwa się je zwykle seriami.
  const gdzieBylem = window.scrollY;
  const w = await sprobuj(() => zapisBiura('POST', `/api/trasy/${t.id}/kolejnosc`, { kolejnosc },
                                           opcjeKolejnosci(t, kolejnosc)));
  if (!w) return;
  await pokazEkran('trasa', { id: t.id });
  window.scrollTo(0, gdzieBylem);
}

/* --------------------------------------------- dodawanie klientow do trasy */

/* Wspólna lista wyboru punktów: klienci na górze (to nimi biuro układa dzień), nasze miejsca pod spodem.

   Jedno okno, nie dwa przyciski — biuro ma jedno miejsce, w które klika,
   a rozróżnienie widać w środku. Klucz NIESIE TYP („L3" / „K3"), bo klienci
   i lokalizacje mają niezależne numery: klient 3 i magazyn 3 istnieją naraz.
   Kolejność zaznaczania jest kolejnością dopisania punktów — doładunek ma
   trafić w środek dnia, a nie na koniec.                                    */
/* Punkt już będący na trasie NIE jest zablokowany: ponowny załadunek w naszym miejscu (np. Rostarzewo po punkcie ABS)
   albo druga dostawa do tego samego klienta to normalny dzień. Serwer nigdy nie odrzucał duplikatów — blokowało je tylko to okno. */
function listaPunktowDoWyboru({ juz, wybrane, szukaj }) {
  const pasuje = (x) => !szukaj
    || ((x.nazwa || '') + ' ' + (x.miasto || '') + ' ' + (x.ulica || ''))
       .toLowerCase().includes(szukaj);

  const wiersz = (x, klucz, nasze) => `
    <label class="plaska" style="padding:9px 4px;border-bottom:1px solid var(--ramka)">
      <input type="checkbox" value="${klucz}" ${wybrane.includes(klucz) ? 'checked' : ''}>
      <span style="flex:1">
        <b>${nasze ? ikonka('fabryka') : ''}${escHtml(x.nazwa)}</b>
        <span class="male slaby" style="display:block">${escHtml(adresJednymCiagiem(x)) || 'brak adresu'}
          ${nasze ? ' · nasze miejsce, nie dostawa' : ''}
          ${juz.has(klucz) ? ' · już na trasie · można dodać ponownie' : ''}
          ${x.lat == null ? ' · <span style="color:var(--zolty)">brak punktu na mapie</span>' : ''}</span>
      </span>
    </label>`;

  const nasze = (stan.lokalizacje || []).filter(l => l.aktywna).filter(pasuje);
  const klienci = (stan.klienci || []).filter(k => k.aktywny).filter(pasuje);
  const czesci = [];
  if (klienci.length) {
    czesci.push('<div class="male slaby" style="margin:6px 0 2px"><b>KLIENCI</b></div>'
      + klienci.map(k => wiersz(k, 'K' + k.id, false)).join(''));
  }
  if (nasze.length) {
    czesci.push('<div class="male slaby" id="dk-nasze" style="margin:12px 0 2px"><b>NASZE MIEJSCA</b></div>'
      + nasze.map(l => wiersz(l, 'L' + l.id, true)).join(''));
  }
  return czesci.join('') || '<div class="pusto">Nic nie pasuje.</div>';
}

/* „L3" / „K3" -> {typ, id} dla serwera. */
function punktZKlucza(klucz) {
  return { typ: klucz[0] === 'L' ? 'lokalizacja' : 'klient', id: Number(klucz.slice(1)) };
}

/* Przed dodaniem punktów: klienci, którzy mają już dostawę tego dnia na innej trasie. Pytanie, nie blokada —
   dwa auta do jednego klienta bywają celowe (duży towar). Gdy nie da się zapytać (brak programu), dodajemy jak dotąd. */
async function potwierdzDubleNaTrasie(idTrasy, wybrane) {
  const klienci = wybrane.filter(k => k[0] === 'K').map(k => k.slice(1));
  if (!klienci.length) return true;
  let duble = [];
  try { duble = (await API.get(`/api/trasy/${idTrasy}/duble?klienci=${klienci.join(',')}`)).duble || []; } catch (e) { return true; }
  if (!duble.length) return true;
  const opis = duble.map(d => `${d.klient_nazwa} — trasa „${d.trasa_nazwa || 'bez nazwy'}”${d.kierowca_imie ? ' (' + d.kierowca_imie + ')' : ''}`).join('; ');
  return potwierdz('Klient już ma dostawę tego dnia',
    `${opis}. Dodać na tę trasę mimo to?`, { tak: 'Dodaj mimo to', nie: 'Wróć' });
}

function kluczPunktu(p) {
  return p.nasze ? 'L' + p.lokalizacja : 'K' + p.klient;
}

async function oknoDodawaniaKlientow(t) {
  // Pobieramy tuż przed otwarciem okna: to jedyny moment, w którym ta lista
  // naprawdę musi być aktualna.
  await odswiezLokalizacje();
  const juz = new Set(t.przystanki.map(kluczPunktu));
  const wybrane = [];          // tablica, nie zbiór — trzymamy kolejność

  okno({
    tytul: 'Dodaj punkty do trasy',
    szerokie: true,
    tresc: `<input id="dk-szukaj" placeholder="Szukaj po nazwie, mieście, ulicy…" autocomplete="off">
            <button type="button" class="tekstowy" id="dk-do-naszych" style="display:none">${ikonka('strzalka-dol')}Miejsca wyjazdu</button>
            <div id="dk-lista" style="margin-top:12px">${
              listaPunktowDoWyboru({ juz, wybrane, szukaj: '' })}</div>
            <label style="margin-top:10px">Wstaw
              <select id="dk-gdzie">
                <option value="">na końcu trasy</option>
                ${t.przystanki.filter(x => x.status !== 'odwolany').map((x, i) =>
                  `<option value="${x.id}">zaraz po: ${i + 1}. ${
                    escHtml(x.klient_nazwa)}</option>`).join('')}
              </select></label>
            <div id="dk-rodzaj-blok" style="display:none;margin-top:10px">
              <label>Miejsca wyjazdu — co kierowca tam robi
                <select id="dk-rodzaj">${opcjeRodzajuNaszych('')}</select></label>
              <div class="male slaby" style="margin-top:8px">Kierowca ma podać:</div>
              <div id="dk-wymogi">${checkboxyWymogow('dk', 'zdjecie,notatka')}</div>
            </div>
            <p class="male slaby">Domyślnie kierowca u klienta robi zdjęcie i bierze podpis, a u nas robi zdjęcie i pisze notatkę
              (bez nich nie zakończy punktu). Wymogi zmienisz potem w szczegółach punktu.</p>
            <p class="male slaby">Punkty dopiszą się w takiej kolejności, w jakiej je
              zaznaczysz. Pilną dostawę możesz wstawić w środek dnia — wybierz,
              po którym punkcie ma stanąć.</p>`,
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Dodaj zaznaczone', klasa: 'glowny', klik: async z => {
        if (!wybrane.length) { komunikat('Nic nie jest zaznaczone', 'blad'); return; }
        // Wartości pól czytamy PRZED zamknięciem okna, bo potem pól już nie ma.
        const rodzajNaszych = (document.getElementById('dk-rodzaj') || {}).value || '';
        const wymogiNaszych = wymogiZPola(document, 'dk');
        if (!await potwierdzDubleNaTrasie(t.id, wybrane)) return;
        z();
        const po = (document.getElementById('dk-gdzie') || {}).value || '';
        const tresc = po ? { punkty: wybrane.map(punktZKlucza), po: Number(po) }
          : { punkty: wybrane.map(punktZKlucza) };
        // Rodzaj i wymogi dopisujemy tylko wtedy, gdy coś wybrano i jest wśród punktów nasze miejsce —
        // domyślne dodanie wygląda dla serwera dokładnie jak dotąd.
        if (wybrane.some(k => k[0] === 'L')) {
          if (rodzajNaszych) tresc.rodzaj = rodzajNaszych;
          // Domyślne (zdjęcie i notatka) nie wysyłamy: serwer sam da klientowi zdjęcie i podpis, a naszemu miejscu zdjęcie i notatkę
          // (przy mieszanym wyborze to ważne). Zmienione albo puste (biuro świadomie odznaczyło wszystko) idzie do wszystkich dodawanych.
          if (wymogiNaszych !== 'zdjecie,notatka') tresc.wymogi = wymogiNaszych;
        }
        const w = await sprobuj(() => API.post(`/api/trasy/${t.id}/przystanki`, tresc),
          `Dodano ${wybrane.length} punktów`);
        if (w) pokazEkran('trasa', { id: t.id });
      } },
    ],
    poOtwarciu: pole => {
      const przypnij = () => pole.querySelectorAll('#dk-lista input').forEach(w => {
        w.onchange = () => {
          const klucz = w.value;
          if (w.checked) { if (!wybrane.includes(klucz)) wybrane.push(klucz); }
          else wybrane.splice(wybrane.indexOf(klucz), 1);
          pokazRodzaj();
        };
      });
      // Nasze miejsca stoją pod długą listą klientów — odnośnik skacze do nich
      // i pokazuje się tylko wtedy, gdy ta sekcja jest na liście (po szukaniu może jej nie być).
      const doNaszych = pole.querySelector('#dk-do-naszych');
      const pokazDoNaszych = () => {
        doNaszych.style.display = pole.querySelector('#dk-nasze') ? '' : 'none';
      };
      // Pola rodzaju/wymogów mają sens dopiero, gdy zaznaczono nasze miejsce.
      const pokazRodzaj = () => {
        pole.querySelector('#dk-rodzaj-blok').style.display = wybrane.some(k => k[0] === 'L') ? '' : 'none';
      };
      doNaszych.onclick = () => {
        const sekcja = pole.querySelector('#dk-nasze');
        if (sekcja) sekcja.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      przypnij();
      pokazDoNaszych();
      pole.querySelector('#dk-szukaj').oninput = e => {
        pole.querySelector('#dk-lista').innerHTML = listaPunktowDoWyboru(
          { juz, wybrane, szukaj: e.target.value.trim().toLowerCase() });
        przypnij();
        pokazDoNaszych();
      };
    },
  });
}

/* ------------------------------------------------- propozycja kolejnosci */

async function zaproponujKolejnosc(t) {
  const w = await sprobuj(() => API.post(`/api/trasy/${t.id}/optymalizuj`));
  if (!w) return;
  const wgId = Object.fromEntries(t.przystanki.map(p => [p.id, p]));
  const zmiana = w.kolejnosc.some((id, i) => t.przystanki[i] && t.przystanki[i].id !== id);

  okno({
    tytul: 'Propozycja kolejności',
    tresc: `
      <p class="male slaby">Policzone na podstawie: ${escHtml(w.podstawa)}${
        // Brak bazy w rachunku bywa ŚWIADOMYM wyborem układu, a nie brakiem
        // ustawienia — dawny tekst sugerował błąd konfiguracji.
        w.z_bazy && w.z_powrotem ? ', ze startem i powrotem do bazy'
        : w.z_bazy ? ', ze startem w bazie, bez powrotu'
        : w.z_powrotem ? ', bez startu w bazie, z powrotem do bazy'
        : ', bez bazy — same punkty'}.</p>
      ${wstegiOstrzezen(w.ostrzezenia)}
      ${w.km != null ? `<div class="wstega info">Szacunkowo <b>${liczbaPl(w.km)} km</b>${
        w.minuty != null ? `, około <b>${w.minuty} min</b> jazdy` : ''}${
        w.z_powrotem ? ' — razem z powrotem do bazy' : ''}.</div>` : ''}
      ${!zmiana ? '<div class="wstega info">Twoja obecna kolejność jest już taka sama.</div>' : ''}
      <ol style="padding-left:22px;line-height:2">
        ${w.kolejnosc.map(id => `<li><b>${escHtml(wgId[id] ? wgId[id].klient_nazwa : '?')}</b>
          <span class="male slaby">${escHtml(wgId[id] ? adresJednymCiagiem(wgId[id]) : '')}</span></li>`).join('')}
      </ol>
      ${w.bez_mapy.length ? `<div class="wstega uwaga">Na końcu doklejam punkty bez adresu na mapie:
        ${w.bez_mapy.map(b => escHtml(b.nazwa)).join(', ')}.</div>` : ''}
      <p class="male slaby">To tylko propozycja — możesz ją odrzucić albo poprawić strzałkami po zastosowaniu.</p>`,
    przyciski: [
      { napis: 'Zostaw po mojemu', klik: z => z() },
      { napis: 'Zastosuj kolejność', klasa: 'glowny', klik: async z => {
        z();
        const zamkniete = t.przystanki.filter(p => p.status !== 'oczekuje').map(p => p.id);
        const pelna = zamkniete.concat(w.kolejnosc.filter(id => !zamkniete.includes(id)));
        const ok = await sprobuj(() => zapisBiura('POST', `/api/trasy/${t.id}/kolejnosc`,
          { kolejnosc: pelna }, opcjeKolejnosci(t, pelna)), 'Kolejność ustawiona');
        if (ok) pokazEkran('trasa', { id: t.id });
      } },
    ],
  });
}

function oknoKopiowania(t) {
  okno({
    szkic: 'kopiowanie-' + t.id,
    tytul: 'Kopiuj trasę na inny dzień',
    tresc: `<p class="male slaby">Powstanie nowa trasa z tą samą listą klientów i kolejnością.
              Potwierdzenia dostaw nie są kopiowane.</p>
            <label>Nowy dzień<input type="date" id="kp-data" value="${przesunDate(t.data, 1)}"></label>`,
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Kopiuj', klasa: 'glowny', klik: async z => {
        const dzien = document.getElementById('kp-data').value;
        // Bez programu kopia czeka w tym komputerze (numer nowej trasy nada program), więc po zapisie wracamy do planu
        // tego dnia zamiast otwierać trasę, której jeszcze nie ma.
        const nowa = await sprobuj(() => zapisBiura('POST', `/api/trasy/${t.id}/kopiuj`, { data: dzien }, {
          opis: 'kopia trasy na ' + polskaData(dzien),
        }), 'Skopiowano');
        if (!nowa) return;
        z();
        pokazEkran(nowa.wKolejce ? 'trasy' : 'trasa', nowa.wKolejce ? { data: dzien } : { id: nowa.id });
      } },
    ],
  });
}

/* -------------------------------------------- szczegoly punktu w biurze */

/* ---------------------------------------- panel zamówienia (postęp pracy) */

/* Jedno zdanie o tym, co się z tym zamówieniem właśnie dzieje. Biuro odbiera
   telefon „gdzie mój towar" i ma odpowiedzieć od razu, a nie składać obraz
   z pięciu miejsc na ekranie. */
function stanPunktu(t, p) {
  const godz = x => String(x || '').slice(11, 16);
  if (p.status === 'dostarczone') {
    return ['haczyk', 'Dostarczone' + (p.zamkniete_o ? ' o ' + godz(p.zamkniete_o) : '')];
  }
  if (p.status === 'nieudane') return ['zamknij', 'Nieudane — ' + (p.powod || 'bez podanego powodu')];
  if (p.status === 'odwolany') return ['', 'Zdjęte z trasy'];
  if (t.status === 'zakonczona') return ['ostrzezenie', 'Trasa zamknięta, a ten punkt został otwarty'];
  if (t.status === 'w_toku') {
    return ['ciezarowka', p.eta ? 'Kierowca w trasie — u klienta ok. ' + p.eta : 'Kierowca w trasie'];
  }
  if (p.zaladowano_o) return ['paczka', 'Załadowane, czeka na wyjazd'];
  return ['zegar', 'Zaplanowane' + (t.data ? ' na ' + t.data : '')];
}

/* Rodzaj czynności i wymogi dla kierowcy w NASZYCH punktach. Puste = jak dotąd (zwykły postój/doładunek).
   Klucze te same co RODZAJE_PUNKTU / WYMOGI_PUNKTU w trasex.py. */
const RODZAJE_NASZYCH = [['', 'Bez określenia'], ['dostawa', 'Dostawa'], ['odbior', 'Odbiór'],
  ['oba', 'Dostawa i odbiór']];
const WYMOGI_NASZYCH = [['odebral', 'Kto odebrał'], ['podpis', 'Podpis'], ['zdjecie', 'Zdjęcie'],
  ['notatka', 'Notatka'], ['dokument', 'Numer dokumentu']];
// Od 2026-11-25 wymogi (domyślnie zdjęcie i notatka) ma KAŻDY punkt; u klienta „numer dokumentu” podaje biuro, więc go tam nie ma.
const WYMOGI_U_KLIENTA = WYMOGI_NASZYCH.filter(x => x[0] !== 'dokument');

function napisRodzaju(r) {
  const w = RODZAJE_NASZYCH.find(x => x[0] === r);
  return w && r ? w[1] : '';
}
function napisWymogow(lista) {
  const ustawione = String(lista || '').split(',');
  return WYMOGI_NASZYCH.filter(x => ustawione.includes(x[0])).map(x => x[1].toLowerCase()).join(', ');
}
function opcjeRodzajuNaszych(wybrany) {
  return RODZAJE_NASZYCH.map(([k, n]) =>
    `<option value="${k}"${k === (wybrany || '') ? ' selected' : ''}>${n}</option>`).join('');
}
function checkboxyWymogow(prefiks, lista, uKlienta) {
  const ustawione = String(lista || '').split(',');
  return (uKlienta ? WYMOGI_U_KLIENTA : WYMOGI_NASZYCH).map(([k, n]) => `<label class="plaska" style="display:inline-flex;gap:6px;margin:4px 14px 4px 0">
      <input type="checkbox" data-wymog="${prefiks}" value="${k}"${ustawione.includes(k) ? ' checked' : ''}> ${n}</label>`).join('');
}
function wymogiZPola(pole, prefiks) {
  return Array.from(pole.querySelectorAll(`input[data-wymog="${prefiks}"]:checked`)).map(x => x.value).join(',');
}

function naglowekPunktu(t, p) {
  const nr = t.przystanki.indexOf(p) + 1;
  const l = t.licznik || {};
  const wszystkie = l.wszystkie || 0;
  // Licznik trasy nie ma pola "zamkniete" — sklada sie z dostarczonych
  // i nieudanych. Jedno i drugie to punkt, ktorego kierowca juz nie ma na glowie.
  const zrobione = (l.dostarczone || 0) + (l.nieudane || 0);
  const proc = wszystkie ? Math.round(zrobione / wszystkie * 100) : 0;
  return `<div class="karta scisla" style="margin:0 0 14px">
    <div class="male slaby">Punkt ${nr} z ${t.przystanki.length}${
      t.kierowca_imie ? ' · ' + escHtml(t.kierowca_imie) : ''}${
      t.pojazd_nazwa ? ' · ' + escHtml(t.pojazd_nazwa) : ''}${
      t.data ? ' · ' + escHtml(polskaData(t.data)) : ''}</div>
    <div style="font-weight:700;margin:5px 0 2px">${(([ik, tx]) => (ik ? ikonka(ik) : '') + escHtml(tx))(stanPunktu(t, p))}${
      p.nasze && p.rodzaj ? ' · ' + escHtml(napisRodzaju(p.rodzaj)) : ''}</div>
    ${wszystkie ? `<div class="postep"><i class="ok" style="width:${proc}%"></i></div>
      <div class="male slaby">Cała trasa: ${zrobione} z ${wszystkie} zamkniętych${
        l.nieudane ? ` (w tym ${l.nieudane} ${odmiana(l.nieudane, 'nieudana', 'nieudane', 'nieudanych')})` : ''}</div>` : ''}
  </div>`;
}

/* Oś czasu zdarzeń. Wiersz powstaje TYLKO wtedy, gdy dane naprawdę są —
   lista pustych myślników niczego nie mówi, a zajmuje pół ekranu. */
function osCzasuPunktu(t, p, d) {
  const kiedy = x => czasNaEkran(x);
  const godz = x => String(x || '').slice(11, 16);
  const zdarzenia = [];
  const zrodlo = d || {};

  if (zrodlo.utworzono || p.utworzono) {
    zdarzenia.push({ klasa: '', tekst: 'Wstawione do trasy przez biuro',
      czas: kiedy(zrodlo.utworzono || p.utworzono) });
  }
  if (p.z_dnia) {
    zdarzenia.push({ klasa: 'nie', tekst: 'Nadrobienie zaległości z ' + escHtml(p.z_dnia), czas: '' });
  }
  if (p.zaladowano_o) {
    zdarzenia.push({
      klasa: p.zaladunek_zgodny ? 'ok' : 'nie',
      tekst: p.zaladunek_zgodny
        ? 'Załadunek potwierdzony, numer zgodny'
        : (ikonka('ostrzezenie') + 'Załadunek potwierdzony, ale numer NIE zgadzał się z zamówieniem'),
      czas: kiedy(p.zaladowano_o),
    });
    if (p.zaladunek_prob > 1) {
      zdarzenia.push({ klasa: 'nie',
        tekst: `Kierowca wpisywał numer ${p.zaladunek_prob} razy`, czas: '' });
    }
  }
  if (t.start_o) {
    zdarzenia.push({ klasa: '', tekst: 'Kierowca rozpoczął trasę', czas: kiedy(t.start_o) });
  }
  (zrodlo.zalaczniki || []).forEach(z => {
    if (z.typ === 'zaladunek') return;      // pokazane wyżej razem z załadunkiem
    zdarzenia.push({ klasa: '', czas: kiedy(z.utworzono),
      tekst: z.typ === 'podpis' ? 'Podpis odbierającego' : 'Zdjęcie z dostawy' });
  });
  if (p.zamkniete_o) {
    zdarzenia.push({
      klasa: p.status === 'dostarczone' ? 'ok' : 'nie',
      tekst: p.status === 'dostarczone'
        ? 'Dostarczone' + (p.odebral ? ' — odebrał: ' + escHtml(p.odebral) : '')
        : 'Nieudane — ' + escHtml(p.powod || 'bez podanego powodu'),
      czas: kiedy(p.zamkniete_o),
    });
  }
  if (!zdarzenia.length) return '';
  return `<div class="male slaby" style="margin:0 0 4px">Przebieg</div>
    <ol class="os-czasu">${zdarzenia.map(z => `<li class="${z.klasa}">
      ${z.tekst}${z.czas ? ` <span class="slaby">· ${escHtml(z.czas)}</span>` : ''}</li>`).join('')}
    </ol>`;
}

/* Przebieg z dziennika zdarzeń (2026-11-16): „kto · co · godzina” + skąd jest godzina. Dane z
   GET /api/trasy/<id>/zdarzenia — wpisy dziennika (od wdrożenia) i znaczniki sprzed dziennika. */
function klasaZdarzenia(z) {
  if (z.typ === 'zaladunek') return z.szczegoly && z.szczegoly.zgodny === false ? 'nie' : 'ok';
  if (['dostarczone', 'przyjete', 'koniec_trasy'].includes(z.typ)) return 'ok';
  if (['nieudane', 'zwrocone', 'cofniete', 'trasa_odwolana', 'trasa_skasowana', 'punkt_zdjety', 'punkt_usuniety']
    .includes(z.typ)) return 'nie';
  return '';
}

/* Skąd jest godzina: z telefonu kierowcy (chwila dotknięcia przycisku, także bez zasięgu) albo z programu
   (chwila zapisu na serwerze). Gdy zapis na serwerze był później o ponad 2 min — pokazujemy też, kiedy dotarł. */
function opisZrodlaCzasu(z) {
  const godz = x => String(x || '').slice(11, 16);
  const dzien = x => String(x || '').slice(0, 10);
  let s;
  if (z.czas_z === 'telefon') {
    s = 'godzina z telefonu';
    if (z.zrodlo === 'dziennik' && z.zapisano_pozniej && z.czas_serwera) {
      s += ', zapisano w biurze o ' + (dzien(z.czas_serwera) === dzien(z.czas) ? godz(z.czas_serwera)
        : czasNaEkran(z.czas_serwera));
    }
  } else {
    s = 'godzina zapisu w programie';
  }
  return s + (z.zegar_rozjechany ? ' · zegar telefonu rozjechany' : '')
    + (z.zrodlo === 'znacznik' ? ' · wpis sprzed dziennika' : '');
}

function osZDziennika(lista, opcje) {
  const o = opcje || {};
  if (!lista || !lista.length) return '';
  return `<ol class="os-czasu">${lista.map(z => {
    const kto = z.kto_imie
      ? escHtml(z.kto_imie) + (z.rola && nazwaRoliKonta(z).toLowerCase() !== String(z.kto_imie).toLowerCase()
        ? ' (' + escHtml(nazwaRoliKonta(z)) + ')' : '')
        + (z.kto_przypuszczalnie ? ' — prawdopodobnie' : '')
      : 'wykonawca nieznany';
    return `<li class="${klasaZdarzenia(z)}">
      ${o.klient && z.klient ? '<b>' + escHtml(z.klient) + '</b> — ' : ''}${escHtml(z.opis)}
      <div class="male slaby">${kto} · ${escHtml(czasNaEkran(z.czas))} · ${escHtml(opisZrodlaCzasu(z))}</div></li>`;
  }).join('')}</ol>`;
}

/* Ekran trasy: wszystkie akcje na trasie w kolejności czasu. */
function oknoPrzebiegu(t) {
  okno({
    tytul: 'Przebieg trasy — kto i co',
    szerokie: true,
    tresc: '<div id="pt-tresc" class="male slaby">Wczytuję…</div>',
    przyciski: [{ napis: 'Zamknij', klik: z => z() }],
    poOtwarciu: pole => {
      const cel = pole.querySelector('#pt-tresc');
      API.get(`/api/trasy/${t.id}/zdarzenia`).then(d => {
        cel.innerHTML = `<p class="male slaby">Godzina „z telefonu” to chwila dotknięcia przycisku przez kierowcę; podpis i zdjęcia mają godzinę zapisu w programie.</p>${osZDziennika(d.zdarzenia, { klient: true }) || '<div class="pusto">Brak zapisanych akcji.</div>'}`;
      }).catch(() => { cel.textContent = 'Nie udało się wczytać przebiegu trasy.'; });
    },
  });
}

/* Gdzie jest bus. Doładowywane po otwarciu okna, bo wymaga zapytania do
   serwera — samo okno musi otworzyć się natychmiast i także bez zasięgu. */
function panelPostepu(t, p, d) {
  if (!d) return '';
  const godz = x => String(x || '').slice(11, 16);
  const wiersze = [];
  const poz = d.ostatnia_pozycja;
  if (poz) {
    wiersze.push(`${ikonka('znacznik-miejsca')}Ostatnia pozycja auta: ${escHtml(godz(poz.czas))}${
      poz.km_do_punktu != null ? ` · ok. ${liczbaPl(poz.km_do_punktu)} km od tego punktu` : ''}${
      poz.zrodlo === 'lokalizator' ? ' (lokalizator)' : ''}`);
  }
  if (d.ostatni_zapis) {
    wiersze.push(`${ikonka('zaproszenie')}Ostatni zapis z telefonu: ${escHtml(czasNaEkran(d.ostatni_zapis))}`);
  }
  if (d.gdzie_potwierdzil) {
    wiersze.push((ikonka('znacznik-miejsca') + 'Potwierdzenie zapisane z lokalizacji kierowcy'));
  }
  if (!wiersze.length && !poz) {
    wiersze.push('<span class="slaby">Telefon kierowcy jeszcze się dziś nie odezwał.</span>');
  }
  return `<div class="karta scisla" style="margin:0 0 14px">
    ${wiersze.map(w => `<div class="male">${w}</div>`).join('')}
  </div>`;
}

function oknoSzczegolowPunktu(t, id) {
  const p = t.przystanki.find(x => x.id === id);
  if (!p) return;
  const admin = kontoBiura();      // podgląd tras: tylko odczyt punktu
  const zamkniety = p.status !== 'oczekuje';

  okno({
    tytul: p.klient_nazwa, ikona: p.nasze ? 'fabryka' : '',
    tresc: `
      ${naglowekPunktu(t, p)}
      <div class="karta scisla" style="margin:0 0 14px">
        <div>${escHtml(adresJednymCiagiem(p)) || '<i>brak adresu</i>'}</div>
        ${p.telefon ? `<div class="male">${ikonka('telefon-sluchawka')}${escHtml(p.telefon)}</div>` : ''}
        ${p.osoba ? `<div class="male slaby">${ikonka('osoba')}${escHtml(p.osoba)}</div>` : ''}
      </div>
      ${zamkniety ? `<div class="wstega ${p.status === 'dostarczone' ? 'info' : 'uwaga'}">
          ${p.status === 'dostarczone' ? (ikonka('haczyk') + 'Dostarczone') : (ikonka('zamknij') + 'Nieudane — ') + escHtml(p.powod)}
          ${p.zamkniete_o ? ' · ' + escHtml(p.zamkniete_o) : ''}
          ${p.odebral ? '<br>Odebrał: <b>' + escHtml(p.odebral) + '</b>' : ''}
          ${p.notatka ? '<br>' + escHtml(p.notatka) : ''}
          ${p.ile_zalacznikow ? `<br><span class="male" id="sp-licznik">${ikonka('spinacz')}${p.ile_zalacznikow}
            ${odmiana(p.ile_zalacznikow, 'załącznik', 'załączniki', 'załączników')}</span>` : ''}
          <div id="sp-dowody"></div>
        </div>` : ''}
      ${admin && zamkniety && p.do_przyjecia ? ('<div class="wstega uwaga">' + ikonka('klepsydra') + 'Czeka na zatwierdzenie przez biuro.</div>') : ''}
      ${admin && zamkniety && !p.do_przyjecia && p.przyjeto_o && p.przyjete_auto ? ('<div class="wstega info">' + ikonka('haczyk') + 'Zatwierdzone automatycznie (po 15 minutach od ostatniego dowodu) — możesz jeszcze zwrócić dostawę kierowcy.</div>') : ''}
      ${p.zwrot_powod && !zamkniety ? `<div class="wstega uwaga">${ikonka('cofnij')}Zwrócone kierowcy do poprawy: ${escHtml(p.zwrot_powod)}
          ${p.zwrocono_o ? ' · ' + escHtml(p.zwrocono_o) : ''}</div>` : ''}
      <div id="sp-os">${osCzasuPunktu(t, p, null)}</div>
      <div id="sp-postep"></div>
      <div class="przyciski" style="margin:0 0 14px">
        ${admin && zamkniety && p.do_przyjecia ? `<button class="maly glowny" id="sp-przyjmij">${ikonka('haczyk')}Zatwierdź</button>
          <button class="maly" id="sp-zwroc">${ikonka('cofnij')}Zwróć kierowcy</button>` : ''}
        ${admin && !zamkniety && p.status === 'oczekuje' ? ('<button class="maly" id="sp-zamknij-biuro">' + ikonka('haczyk') + 'Zamknij za kierowcę</button>') : ''}
        ${p.ile_zalacznikow ? `<button class="maly${zamkniety && !p.do_przyjecia ? ' glowny' : ''}" id="sp-dowod">${ikonka('spinacz')}${
          p.nasze ? 'Zdjęcia z tego postoju' : zamkniety ? 'Zobacz dowód dostawy' : 'Zdjęcia z załadunku'}</button>` : ''}
        ${zamkniety && !p.nasze ? `<button class="maly" id="sp-druk">${ikonka('drukuj')}Wydrukuj potwierdzenie</button>` : ''}
        ${p.nasze ? '' : '<button class="maly" id="sp-historia">Historia tego klienta</button>'}
        ${admin && !zamkniety && !p.nasze ? ('<button class="maly" id="sp-powiadom">' + ikonka('poczta') + 'Powiadom klienta</button>') : ''}
        ${admin && !zamkniety ? ('<button class="maly" id="sp-przenies">' + ikonka('strzalka-prawo') + 'Przenieś na inną trasę</button>') : ''}
        ${admin && !p.nasze && p.zaladowano_o && !p.zaladunek_zgodny && !p.zaladunek_zwolniony
          ? ('<button class="maly czerwony" id="sp-zwolnij">' + ikonka('stop') + 'Zwolnij mimo niezgodnego numeru</button>')
          : ''}
      </div>
      ${admin && !zamkniety ? `
        <label>Towar / zawartość
          <input id="sp-towar" value="${escHtml(p.towar || '')}" placeholder="np. 2 palety płyty">
        </label>
        ${p.nasze ? `<p class="male slaby">To nasze miejsce — doładunek albo odbiór,
          nie dostawa do klienta. Numeru zamówienia się tu nie podaje, a kierowca
          nie musi potwierdzać przy nim załadunku.</p>
          <label>Rodzaj czynności w tym miejscu
            <select id="sp-rodzaj">${opcjeRodzajuNaszych(p.rodzaj)}</select></label>
          <div class="male slaby" style="margin-top:8px">Kierowca ma przy tym punkcie podać:</div>
          <div id="sp-wymogi">${checkboxyWymogow('sp', p.wymogi)}</div>`
          : `<label>Numer dokumentu (WZ, zamówienie)
          <input id="sp-dokument" value="${escHtml(p.dokument || '')}">
        </label>
          <div class="male slaby" style="margin-top:8px">Kierowca ma przy tym punkcie podać:</div>
          <div id="sp-wymogi">${checkboxyWymogow('sp', p.wymogi, true)}</div>`}
        <div class="dwie">
          <label>Okno czasowe od<input type="time" id="sp-od" value="${escHtml(p.okno_od || '')}"></label>
          <label>Okno czasowe do<input type="time" id="sp-do" value="${escHtml(p.okno_do || '')}"></label>
        </div>
        <label>Uwagi dla kierowcy
          <textarea id="sp-uwagi" placeholder="np. wjazd od podwórza, zadzwonić 15 min wcześniej">${escHtml(p.uwagi || '')}</textarea>
        </label>` : `
        ${p.towar ? `<p><b>Towar:</b> ${escHtml(p.towar)}</p>` : ''}
        ${p.nasze && p.rodzaj ? `<p><b>Rodzaj:</b> ${escHtml(napisRodzaju(p.rodzaj))}</p>` : ''}
        ${p.wymogi ? `<p><b>Kierowca podaje:</b> ${escHtml(napisWymogow(p.wymogi))}</p>` : ''}
        ${p.uwagi ? `<p><b>Uwagi:</b> ${escHtml(p.uwagi)}</p>` : ''}`}`,
    przyciski: (admin && !zamkniety) ? [
      { napis: 'Zamknij', klik: z => z() },
      { napis: 'Zapisz', klasa: 'glowny', klik: async z => {
        const zmiany = {
          towar: document.getElementById('sp-towar').value,
          dokument: (document.getElementById('sp-dokument') || {}).value || '',
          okno_od: document.getElementById('sp-od').value,
          okno_do: document.getElementById('sp-do').value,
          uwagi: document.getElementById('sp-uwagi').value,
        };
        // Rodzaj i wymogi tylko dla naszych punktów — u klienta pól nie ma, więc nie wysyłamy nic nowego.
        if (p.nasze) zmiany.rodzaj = document.getElementById('sp-rodzaj').value;
        zmiany.wymogi = wymogiZPola(document, 'sp');       // od 2026-11-25 także u klienta
        const w = await sprobuj(() => zapisBiura('POST', '/api/przystanki/' + p.id, zmiany, {
          opis: 'punkt ' + (p.klient_nazwa || ''),
          zrodla: ['/api/trasy/' + t.id],
          popraw: (sciezka, d) => {
            if (sciezka !== '/api/trasy/' + t.id || !d || !Array.isArray(d.przystanki)) return;
            wPamieci(d.przystanki, p.id, x => Object.assign(x, zmiany));
          },
        }), 'Zapisano');
        if (w) { z(); pokazEkran('trasa', { id: t.id }); }
      } },
    ] : [{ napis: 'Zamknij', klik: z => z() }],
    poOtwarciu: pole => {
      const podepnij = (id, akcja) => {
        const przycisk = pole.querySelector(id);
        if (przycisk) przycisk.onclick = akcja;
      };
      const odswiez = () => { zamknijOkno(); pokazEkran('trasa', { id: t.id }); };
      podepnij('#sp-przyjmij', () => przyjmijDostawe(p.id, odswiez, t.id));
      podepnij('#sp-zwroc', () => { zamknijOkno(); oknoZwrotuDostawy(p.id, p.klient_nazwa, () => pokazEkran('trasa', { id: t.id }), t.id); });
      podepnij('#sp-zamknij-biuro', () => { zamknijOkno(); oknoZamknieciaPrzezBiuro(p, () => pokazEkran('trasa', { id: t.id })); });
      podepnij('#sp-dowod', () => oknoZalacznikow(p.id, p.klient_nazwa));
      podepnij('#sp-druk', () => wydrukPotwierdzenia(p.id));
      podepnij('#sp-historia', () => oknoHistoriiKlienta(p.klient, p.klient_nazwa));
      podepnij('#sp-powiadom', () => oknoPowiadomienia(p));
      podepnij('#sp-przenies', () => oknoPrzeniesienia(t, p));
      podepnij('#sp-zwolnij', async () => {
        if (!await potwierdz('Zwolnić ten punkt?',
          `Kierowca wpisał numer „${p.numer_kierowcy || '—'}", a zamówienie ma `
          + `„${p.dokument || '—'}". Zwolnienie puszcza auto w trasę i zostaje `
          + 'zapisane w uwagach punktu z Twoim imieniem.')) return;
        const w = await sprobuj(() => API.post('/api/przystanki/' + p.id + '/zwolnij-zaladunek'),
          'Zwolnione — kierowca może jechać');
        if (w) { zamknijOkno(); pokazEkran('trasa', { id: t.id }); }
      });

      // Doładowanie postępu. Okno MUSI otworzyć się bez tego: kierowca wchodzi
      // w nie z „Historii tras" na telefonie, często bez zasięgu.
      if (!kontoBiura() || !navigator.onLine) return;
      // Dowody od kierowcy od razu na karcie zamkniętego punktu (podpis, zdjęcia, dokument, braki).
      if (zamkniety) {
        Promise.all([API.get('/api/przystanki/' + p.id + '/zalaczniki'), tokenDoPlikow()]).then(([zal, token]) => {
          const cel = pole.querySelector('#sp-dowody');
          if (!cel) return;
          cel.innerHTML = htmlDowodow({ ...p, zalaczniki: zal }, token, true);
          cel.querySelectorAll('[data-powieksz]').forEach(bt => bt.onclick = () => oknoPowiekszenia(bt.dataset.powieksz, bt.dataset.podpis));
          const licznik = pole.querySelector('#sp-licznik');
          if (licznik) licznik.hidden = true;
        }).catch(() => { /* zostaje licznik załączników i przycisk dowodu */ });
      }
      API.get('/api/przystanki/' + p.id + '/postep').then(dodatki => {
        const cel = pole.querySelector('#sp-postep');
        const os = pole.querySelector('#sp-os');
        if (cel) cel.innerHTML = panelPostepu(t, p, dodatki);
        if (os && !os.dataset.dziennik) os.innerHTML = osCzasuPunktu(t, p, dodatki);
      }).catch(() => { /* brak postepu nie moze zepsuc calego okna */ });
      // Przebieg z dziennika zdarzeń: kto, co i o której (+ skąd godzina). Gdy się nie uda, zostaje stary przebieg.
      API.get('/api/trasy/' + t.id + '/zdarzenia?przystanek=' + p.id).then(d => {
        const os = pole.querySelector('#sp-os');
        if (!os || !d || !(d.zdarzenia || []).length) return;
        os.dataset.dziennik = '1';
        os.innerHTML = `<div class="male slaby" style="margin:0 0 4px">Przebieg — kto, co i o której</div>
          ${osZDziennika(d.zdarzenia)}
          <details id="sp-cala" style="margin:0 0 12px"><summary class="male">Cała trasa — wszystkie akcje</summary>
            <div id="sp-cala-tresc" class="male slaby" style="margin-top:6px">Wczytuję…</div></details>`;
        const szczegoly = os.querySelector('#sp-cala');
        szczegoly.addEventListener('toggle', () => {
          if (!szczegoly.open || szczegoly.dataset.wczytane) return;
          szczegoly.dataset.wczytane = '1';
          const cel = os.querySelector('#sp-cala-tresc');
          API.get('/api/trasy/' + t.id + '/zdarzenia').then(c => {
            cel.innerHTML = osZDziennika(c.zdarzenia, { klient: true }) || 'Brak zapisanych akcji.';
          }).catch(() => { cel.textContent = 'Nie udało się wczytać przebiegu trasy.'; szczegoly.dataset.wczytane = ''; });
        });
      }).catch(() => { /* brak dziennika nie moze zepsuc okna — zostaje przebieg ze znacznikow */ });
    },
  });
}

/* Cztery układy zlecenia. Nazwa mówi, gdzie start i gdzie koniec — te same
   klucze co UKLADY w trasex.py. */
const UKLADY_ZLECENIA = [
  ['baza_baza', 'Z bazy i z powrotem do bazy'],
  ['baza_punkt', 'Z bazy, koniec u ostatniego klienta'],
  ['punkt_baza', 'Start u pierwszego klienta, powrót do bazy'],
  ['punkt_punkt', 'Bez bazy — tylko punkty'],
];

function opcjeUkladu(wybrany) {
  const teraz = wybrany || 'baza_baza';
  return UKLADY_ZLECENIA.map(([klucz, napis]) =>
    `<option value="${klucz}"${klucz === teraz ? ' selected' : ''}>${napis}</option>`).join('');
}

function ukladStart(uklad) { return (uklad || 'baza_baza').startsWith('baza_'); }
function ukladPowrot(uklad) { return (uklad || 'baza_baza').endsWith('_baza'); }

/* ============================================================== NA ŻYWO */

/* Tablica dla biura: co się dzieje w tej chwili z każdą trasą.
   Odpowiada na pytanie, które biuro zadaje dziesięć razy dziennie: „gdzie jest
   Piotr i o której będzie u Nowaka". Wszystko liczy serwer — tutaj tylko
   rysujemy i odświeżamy. */
let zegarTablicy = null;

function kartaNaZywo(t) {
  const l = t.licznik || {};
  const zrobione = (l.dostarczone || 0) + (l.nieudane || 0);
  const proc = l.wszystkie ? Math.round(zrobione / l.wszystkie * 100) : 0;
  const zostalo = (l.wszystkie || 0) - zrobione;
  const b = t.biezacy;
  const kolor = { pilne: 'var(--czerwony)', uwaga: 'var(--zolty)', info: 'var(--tekst-slaby)' };

  const dokad = b ? `
    <div style="margin:10px 0 2px"><b>${b.nasze ? (ikonka('fabryka') + 'jedzie po towar do:') : (ikonka('ciezarowka') + 'jedzie do:')}
      ${escHtml(b.klient)}</b>${b.miasto ? ' <span class="slaby">· ' + escHtml(b.miasto) + '</span>' : ''}</div>
    <div class="male slaby">punkt ${b.kolejnosc} z ${l.wszystkie || '?'}${
      b.dokument ? (' · ' + ikonka('raporty')) + escHtml(b.dokument) : ''}${
      b.towar ? (' · ' + ikonka('paczka')) + escHtml(b.towar) : ''}</div>
    <div style="margin-top:6px">${b.eta
      ? `<b style="font-size:17px;${b.minelo ? 'color:var(--czerwony)' : ''}">${ikonka('zegar')}${
          escHtml(b.eta)}</b>` + (b.minelo
            ? `<span style="color:var(--czerwony)"> — minęło ${godzinyMinuty(b.minelo)}
               bez potwierdzenia</span>` : '') + (
          b.spoznienie
            ? `<span style="color:var(--czerwony)"> — po oknie (zamykają ${escHtml(b.okno_do)})</span>`
            : b.okno_do
              ? `<span class="slaby"> · okno ${escHtml(b.okno_od || '…')}–${escHtml(b.okno_do)} ${ikonka('haczyk')}</span>`
              : '')
        + (b.przerwa_przed ? `<span class="slaby"> · po drodze przerwa ${b.przerwa_przed} min</span>` : '')
      : '<span class="slaby">godziny nie policzę — punkt nie ma adresu na mapie</span>'}</div>`
    : `<div style="margin:10px 0"><b>${t.status === 'zakonczona'
        ? (ikonka('haczyk') + 'Trasa zakończona') : 'Brak punktów do zrobienia'}</b></div>`;

  const slady = [];
  if (t.ostatni) {
    slady.push(`${t.ostatni.status === 'dostarczone' ? ikonka('haczyk') : ikonka('zamknij')} ostatnio:
      ${escHtml(t.ostatni.klient)}, ${escHtml(t.ostatni.o)}${
      t.ostatni.powod ? ' (' + escHtml(t.ostatni.powod) + ')' : ''}${
      t.ostatni.odebral ? ' · odebrał: ' + escHtml(t.ostatni.odebral) : ''}${
      t.ostatni.status === 'dostarczone' ? (t.ostatni.ile_zalacznikow
        ? (t.ostatni.id ? ` · <button type="button" class="maly dowody-zywo" data-dowody-zywo="${t.ostatni.id}" data-klient="${escHtml(t.ostatni.klient)}" title="Pokaż zdjęcia i podpis">${ikonka('spinacz')}${t.ostatni.ile_zalacznikow}</button>`
          : (' · ' + ikonka('spinacz')) + t.ostatni.ile_zalacznikow)
        : (t.ostatni.nasze ? '' : (' · ' + ikonka('ostrzezenie') + 'bez podpisu i zdjęcia'))) : ''}`);
  }
  if (t.pozycja) {
    slady.push(`${ikonka('znacznik-miejsca')}auto ${escHtml(String(t.pozycja.czas).slice(11, 16))}${
      t.pozycja.km_do_celu != null ? ` · ok. ${liczbaPl(t.pozycja.km_do_celu)} km od celu` : ''}`);
  }
  // Kontakt sprzed dzisiaj z datą — sama godzina „14:05” z wczoraj wyglądała
  // jak telefon, który odezwał się przed chwilą.
  const kontakt = String(t.ostatni_kontakt || '');
  slady.push(t.ostatni_kontakt
    ? `${ikonka('zaproszenie')}telefon ${kontakt.slice(0, 10) === dzisiaj() ? '' : escHtml(polskaData(kontakt)) + ' '}${
      escHtml(kontakt.slice(11, 16))}`
    : ('<span class="slaby">' + ikonka('zaproszenie') + 'telefon jeszcze się dziś nie odezwał</span>'));

  return `<div class="karta scisla">
    <div class="karta-gora">
      <div>
        <h2 style="margin:0">${escHtml(t.kierowca || 'bez kierowcy')}</h2>
        <div class="male slaby">${escHtml(t.pojazd || 'bez auta')}${
          t.rejestracja ? ' · ' + escHtml(t.rejestracja) : ''}${
          t.start_o ? ' · start ' + escHtml(t.start_o) : ' · wyjazd ' + escHtml(t.wyjazd || '')}${
          t.status === 'zakonczona' && t.koniec_o
            ? ' · koniec pracy ' + escHtml(samaGodzina(t.koniec_o)) + (t.koniec_klik ? '' : ' (wg ostatniego punktu — kierowca nie kliknął w bazie)')
            : ''}</div>
      </div>
      <span class="plakietka p-${t.status}">${escHtml(etykietaStatusuTrasy(t.status))}</span>
    </div>
    <div class="male"><b>${zrobione}</b> z <b>${l.wszystkie || 0}</b>
      ${odmiana(l.wszystkie || 0, 'punktu', 'punktów', 'punktów')}${
      l.nieudane ? ` · <span style="color:var(--czerwony)">${l.nieudane} nieudane</span>` : ''}${
      zostalo > 0 && t.status !== 'zakonczona' ? ` · <b>zostało ${zostalo}</b>` : ''}</div>
    <div class="postep"><i class="ok" style="width:${proc}%"></i></div>
    ${dokad}
    <div class="male slaby" style="margin-top:8px">${slady.join(' &nbsp;·&nbsp; ')}</div>
    ${(t.alerty || []).map(a => `<div class="male" style="margin-top:6px;color:${
      kolor[a.waga] || 'inherit'}"><b>${a.waga === 'pilne' ? ikonka('stop') : a.waga === 'uwaga' ? ikonka('ostrzezenie') : 'ℹ'}</b>
      ${escHtml(a.tekst)}</div>`).join('')}
    <details class="zaawansowane zywo-punkty" data-zywo-punkty="${t.id}">
      <summary><span class="znak-zwiniecia">${ikonka('szewron-prawo')}</span> Punkty trasy (${l.wszystkie || 0})</summary>
      <div class="zywo-punkty-tresc male slaby">Wczytuję…</div>
    </details>
    <div class="przyciski" style="margin-top:10px">
      <button class="maly" data-trasa-zywo="${t.id}">Otwórz trasę</button>
      ${b ? `<button class="maly" data-punkt-zywo="${b.id}" data-trasa="${t.id}">Szczegóły punktu</button>` : ''}
    </div>
  </div>`;
}

/* Wstawiane W PULPIT, a nie na osobny ekran: zlecenia mają swoją zakładkę,
   a pulpit ma odpowiadać na pytanie „co się teraz dzieje". Odświeżamy tylko
   ten kawałek — przerysowanie całego pulpitu co pół minuty zabijałoby mapę
   i przewijanie pod palcem. */
async function rysujZywo(cel, data) {
  const dane = await API.get('/api/tablica' + (data ? '?data=' + data : ''));
  const pilne = dane.trasy.reduce((s, t) =>
    s + (t.alerty || []).filter(a => a.waga === 'pilne').length, 0);
  // Filtry Pulpitu (kierowca, auto, klient, sortowanie) ograniczają tylko widok; liczba pilnych (kafelek) zostaje pełna.
  const wszystkieTrasy = dane.trasy;
  const fz = jestPodgladem() ? null : czytajFiltryPulpitu();
  if (fz && fz.klient) await wczytajKlientowTras(wszystkieTrasy);
  dane.trasy = fz ? filtrujPulpit(wszystkieTrasy, fz, AKCESORIA_PULPITU.zywo) : wszystkieTrasy;
  cel.innerHTML = `
    <h2 style="margin-top:20px">Trasy w toku${dane.trasy.length < wszystkieTrasy.length
      ? ` <span class="plakietka p-oczekuje" style="margin-left:6px">${dane.trasy.length} z ${wszystkieTrasy.length}</span>` : ''}
      <span class="male slaby" style="font-weight:400">— stan na ${escHtml(dane.teraz)},
        odświeża się co 30 s</span></h2>
    ${dane.trasy.length ? dane.trasy.map(kartaNaZywo).join('')
      : wszystkieTrasy.length ? `<p class="male slaby">Filtry ukrywają wszystkie trasy (${wszystkieTrasy.length}) — kliknij „Wyczyść”.</p>`
      : `<div class="karta"><div class="pusto"><span class="duza-ikona">${GKIkony.html('kalendarz', 38)}</span>
           Na ten dzień nie ma jeszcze żadnej trasy.
           <div style="margin-top:12px"><button class="glowny" id="p-planuj-2">+ Nowa trasa</button></div>
         </div></div>`}`;

  // Liczba spraw do decyzji jest kafelkiem nad tą sekcją, nie wstęgą w niej.
  pulpitSprawy.pilne = pilne;
  pulpitSprawy.oczekiwane.delete('zywo');
  rysujKafelkiPulpitu();

  cel.querySelectorAll('[data-trasa-zywo]').forEach(b =>
    b.onclick = () => pokazEkran('trasa', { id: Number(b.dataset.trasaZywo) }));
  cel.querySelectorAll('[data-dowody-zywo]').forEach(b =>
    b.onclick = () => oknoZalacznikow(Number(b.dataset.dowodyZywo), b.dataset.klient || 'Dowody'));
  cel.querySelectorAll('[data-punkt-zywo]').forEach(b =>
    b.onclick = async () => {
      const t = await API.get('/api/trasy/' + b.dataset.trasa);
      ETA.policz(t);
      oknoSzczegolowPunktu(t, Number(b.dataset.punktZywo));
    });
  podepnijPunktyZywo(cel, data);
  const planuj2 = cel.querySelector('#p-planuj-2');
  if (planuj2) planuj2.onclick = () => pokazEkran('trasy', { data: dane.data });
}

/* ---- Rozwijana lista punktów trasy w toku (2026-11-18, decyzja właściciela)
   Zwinięta domyślnie; które trasy rozwinięto, pamięta NOWY klucz „zywo-rozwiniete-<id osoby>” (Pamiec, przedrostek
   gk-trasy.) — istniejących kluczy nie ruszamy. Dane punktów są w /api/trasy/<id>, dowody (miniatury) doładowują się
   dopiero po rozwinięciu z /api/przystanki/<id>/zalaczniki — te same funkcje co „Do zatwierdzenia” (htmlDowodow).
   Zamknięty punkt czekający na biuro ma tu „Zatwierdź” i „Zwróć kierowcy” (zapisBiura — działa też w kolejce).
   Konto „podgląd” widzi tylko stan punktów: bez dowodów i bez przycisków. */
const klienciTras = new Map();            // id trasy -> nazwy klientów punktów (dla filtra „Klient”)
const dowodyZywo = new Map();             // id punktu -> załączniki (zamknięty punkt zmienia się rzadko)

function klienciTrasZywo(t) {
  return klienciTras.get(t.id) || [t.biezacy && t.biezacy.klient, t.ostatni && t.ostatni.klient].filter(Boolean).join(' ');
}

async function wczytajKlientowTras(trasy) {
  await Promise.all(trasy.map(async t => {
    try {
      const pelna = await API.get('/api/trasy/' + t.id);
      klienciTras.set(t.id, (pelna.przystanki || []).map(x => x.klient_nazwa).filter(Boolean).join(' '));
    } catch (e) { /* zostają nazwy bieżącego i ostatniego punktu */ }
  }));
}

function kluczRozwinietychZywo() { return 'zywo-rozwiniete-' + (stan.uz && stan.uz.id != null ? stan.uz.id : 'x'); }

function czytajRozwinieteZywo() {
  try {
    const z = JSON.parse(Pamiec.czytaj(kluczRozwinietychZywo()) || '[]');
    return new Set(Array.isArray(z) ? z.filter(Number.isInteger) : []);
  } catch (e) { return new Set(); }
}

function zapiszRozwinieteZywo(zbior) { Pamiec.zapisz(kluczRozwinietychZywo(), JSON.stringify([...zbior].slice(-40))); }

function htmlPunktuZywo(x, token, podglad) {
  const zamkniety = x.status === 'dostarczone' || x.status === 'nieudane';
  const czeka = !!x.do_przyjecia && zamkniety;
  const status = x.status === 'dostarczone' ? ('<span class="plakietka p-dostarczone">' + ikonka('haczyk') + 'dostarczone</span>')
    : x.status === 'nieudane' ? `<span class="plakietka p-nieudane">${ikonka('zamknij')}${escHtml(x.powod || 'nieudane')}</span>`
    : x.status === 'odwolany' ? '<span class="plakietka p-oczekuje">odwołany</span>'
    : '<span class="plakietka p-oczekuje">do zrobienia</span>';
  const zatw = czeka ? '<span class="plakietka p-oczekuje">czeka na zatwierdzenie</span>'
    : (zamkniety && x.przyjeto_o ? `<span class="plakietka p-oczekuje">${x.przyjete_auto ? 'zatwierdzone automatycznie' : 'zatwierdzone przez biuro'}</span>` : '')
    + (x.zamkniete_auto ? ' <span class="plakietka p-oczekuje">zamknięte automatycznie</span>' : '');
  return `<div class="zywo-punkt" data-zywo-punkt="${x.id}">
      <div><b>${escHtml(x.klient_nazwa || 'punkt')}</b> ${status} ${zatw}</div>
      <div class="male slaby">${zamkniety && x.zamkniete_o ? escHtml(samaGodzina(x.zamkniete_o)) : ''}${
        x.odebral && !podglad ? ' · odebrał: ' + escHtml(x.odebral) : ''}</div>
      ${x.notatka && !podglad ? `<div class="male">${escHtml(x.notatka)}</div>` : ''}
      ${zamkniety && !podglad ? htmlDowodow(x, token, true) : ''}
      ${czeka && !podglad ? `<div class="przyciski" style="margin-top:6px">
        <button class="maly glowny" data-zywo-przyjmij="${x.id}">${ikonka('haczyk')}Zatwierdź</button>
        <button class="maly" data-zywo-zwroc="${x.id}">${ikonka('cofnij')}Zwróć kierowcy</button></div>` : ''}
    </div>`;
}

async function wypelnijPunktyZywo(det, data) {
  const id = Number(det.dataset.zywoPunkty);
  const cel = det.querySelector('.zywo-punkty-tresc');
  const podglad = jestPodgladem();
  try {
    const t = await API.get('/api/trasy/' + id);
    let token = '';
    if (!podglad) { try { token = await tokenDoPlikow(); } catch (e) { token = ''; } }
    const punkty = (t.przystanki || []).slice().sort((a, b) => (a.kolejnosc || 0) - (b.kolejnosc || 0));
    if (!podglad) {
      for (const x of punkty) {
        if (x.status !== 'dostarczone' && x.status !== 'nieudane') continue;
        if (!dowodyZywo.has(x.id)) {
          try { dowodyZywo.set(x.id, await API.get(`/api/przystanki/${x.id}/zalaczniki`)); } catch (e) { dowodyZywo.set(x.id, []); }
        }
        x.zalaczniki = dowodyZywo.get(x.id);
      }
    }
    cel.classList.remove('male', 'slaby');
    cel.innerHTML = punkty.length ? punkty.map(x => htmlPunktuZywo(x, token, podglad)).join('')
      : '<div class="male slaby">Trasa nie ma jeszcze punktów.</div>';
    cel.querySelectorAll('[data-powieksz]').forEach(bt => bt.onclick = () => oknoPowiekszenia(bt.dataset.powieksz, bt.dataset.podpis));
    const przerysuj = () => { dowodyZywo.clear(); pokazEkran('pulpit', { data }); };
    cel.querySelectorAll('[data-zywo-przyjmij]').forEach(bt => bt.onclick = () =>
      przyjmijDostawe(Number(bt.dataset.zywoPrzyjmij), przerysuj, id));
    cel.querySelectorAll('[data-zywo-zwroc]').forEach(bt => bt.onclick = () => {
      const x = punkty.find(y => y.id === Number(bt.dataset.zywoZwroc));
      if (x) oknoZwrotuDostawy(x.id, x.klient_nazwa, przerysuj, id);
    });
  } catch (e) {
    cel.textContent = 'Nie udało się wczytać punktów — zamknij i otwórz jeszcze raz.';
  }
}

function podepnijPunktyZywo(cel, data) {
  const otwarte = czytajRozwinieteZywo();
  cel.querySelectorAll('[data-zywo-punkty]').forEach(det => {
    const id = Number(det.dataset.zywoPunkty);
    det.addEventListener('toggle', () => {
      const z = czytajRozwinieteZywo();
      if (det.open) z.add(id); else z.delete(id);
      zapiszRozwinieteZywo(z);
      if (det.open) wypelnijPunktyZywo(det, data);
    });
    if (otwarte.has(id)) det.open = true;     // po podpięciu zdarzenia — „toggle” samo wczyta punkty
  });
}

function odswiezajZywo(data) {
  clearInterval(zegarTablicy);
  zegarTablicy = setInterval(async () => {
    // Sam się wyłącza, gdy biuro zejdzie z pulpitu. Przy otwartym oknie
    // nie przerysowujemy — inaczej znikałoby komuś sprzed nosa.
    if (stan.ekran !== 'pulpit') { clearInterval(zegarTablicy); zegarTablicy = null; return; }
    const okno = document.getElementById('okno-tlo');
    if (okno && !okno.classList.contains('ukryty')) return;
    if (!navigator.onLine) return;
    const cel = document.getElementById('p-zywo');
    if (!cel) { clearInterval(zegarTablicy); zegarTablicy = null; return; }
    try { await rysujZywo(cel, data); } catch (e) { /* następna próba za 30 s */ }
    try { await odswiezAutaNaMapie(); } catch (e) { /* jw. */ }
  }, 30000);
}

/* =============================================================== KLIENCI */

EKRANY.klienci = {
  tytul: 'Klienci',
  async rysuj(pole, param) {
    const admin = jestBiuro();
    // Domyślnie POKAZUJEMY TYLKO CZYNNYCH. Wpisy przeniesione do naszych
    // lokalizacji zostają w bazie (trzyma je historia dostaw), ale w kartotece
    // wyglądały jak duplikaty — dwa razy ta sama nazwa, jedna wyszarzona.
    const zUkrytymi = !!param.ukryci;
    if (navigator.onLine) {
      try {
        stan.klienci = await API.get('/api/klienci' + (zUkrytymi ? '?wszyscy=1' : ''));
        stan.ukryciKlienci = kontoBiura() ? await API.get('/api/klienci/ukryci').catch(() => null) : null;
      } catch (e) { /* zostaje kopia */ }
    }
    const szukaj = (param.szukaj || '').toLowerCase();

    const rysujListe = (fraza) => {
      const wynik = stan.klienci.filter(k =>
        !fraza || (k.nazwa + ' ' + k.miasto + ' ' + k.ulica + ' ' + (k.telefon || ''))
          .toLowerCase().includes(fraza));
      if (!wynik.length) return '<div class="pusto">Nic nie znalazłem.</div>';
      return wynik.map(k => `<button class="przystanek s-oczekuje" data-klient="${k.id}"
          style="${k.aktywny ? '' : 'opacity:.55'}">
          <span class="numer">${escHtml(k.nazwa[0] || '?')}</span>
          <span class="srodek">
            <span class="nazwa">${escHtml(k.nazwa)}${k.aktywny ? ''
              : (k.przeniesiony_do
                 ? ' <span class="male slaby">— przeniesiony do naszych lokalizacji</span>'
                 : ' <span class="male slaby">(ukryty)</span>')}</span>
            <span class="adres">${escHtml(adresJednymCiagiem(k)) || 'brak adresu'}</span>
            ${k.telefon || k.osoba ? `<span class="dopisek">${escHtml([k.osoba, k.telefon].filter(Boolean).join(' · '))}</span>` : ''}
          </span>
          <span class="prawo">${k.lat == null
            ? '<span class="plakietka p-nieudane">brak na mapie</span>'
            : '<span class="plakietka p-dostarczone">na mapie</span>'}</span>
        </button>`).join('');
    };

    pole.innerHTML = `
      <div class="pasek-narzedzi">
        <label style="flex:1">Szukaj<input id="k-szukaj" value="${escHtml(param.szukaj || '')}"
          placeholder="nazwa, miasto, ulica, telefon" autocomplete="off"></label>
        ${admin ? `<button class="glowny" id="k-nowy">+ Nowy klient</button>
                   <button id="k-plik">${ikonka('raporty')}Wczytaj z pliku</button>` : ''}
      </div>
      <div class="male slaby" style="margin-bottom:10px">
        ${stan.klienci.filter(k => k.aktywny).length} klientów w kartotece
        ${(stan.ukryciKlienci && stan.ukryciKlienci.ukryci) ? `·
          <a href="#" id="k-przelacz-ukrytych">${zUkrytymi ? 'ukryj schowane'
            : `pokaż schowane (${stan.ukryciKlienci.ukryci})`}</a>
          ${stan.ukryciKlienci.przeniesieni
            ? `<span class="slaby">— w tym ${stan.ukryciKlienci.przeniesieni}
               ${odmiana(stan.ukryciKlienci.przeniesieni, 'przeniesiony', 'przeniesione',
                         'przeniesionych')} do naszych lokalizacji</span>` : ''}` : ''}
      </div>
      <div id="k-lista">${rysujListe(szukaj)}</div>`;

    const przypnij = () => pole.querySelectorAll('[data-klient]').forEach(b =>
      b.onclick = () => oknoKlienta(stan.klienci.find(k => k.id === Number(b.dataset.klient))));
    przypnij();
    const przelacz = pole.querySelector('#k-przelacz-ukrytych');
    if (przelacz) przelacz.onclick = e => {
      e.preventDefault();
      pokazEkran('klienci', { szukaj: param.szukaj, ukryci: !zUkrytymi });
    };
    pole.querySelector('#k-szukaj').oninput = e => {
      pole.querySelector('#k-lista').innerHTML = rysujListe(e.target.value.trim().toLowerCase());
      przypnij();
    };
    if (admin) {
      pole.querySelector('#k-nowy').onclick = () => oknoKlienta(null);
      pole.querySelector('#k-plik').onclick = oknoImportuPliku;
    }
  },
};

/* Wczytanie kartoteki wprost z pliku CSV albo Excela.

   Wklejanie przez schowek zostaje, bo bywa najszybsze przy trzech wierszach,
   ale kartoteki nikt nie wkleja recznie. Program pokazuje najpierw, JAK
   zrozumial plik — ktora kolumna jest czym i ile wierszy juz zna — bo import
   robiony w ciemno konczy sie kartoteka do recznego sprzatania.            */
function oknoImportuPliku() {
  let plikBase64 = '', nazwaPliku = '', podglad = null;

  const rysujTresc = () => {
    if (!podglad) {
      return `<label>Plik z klientami
          <input type="file" id="ip-plik" accept=".csv,.txt,.xlsx,.xlsm"></label>
        <p class="male slaby">Przyjmuję CSV (średnik, przecinek albo tabulator) i Excel .xlsx, także z polskimi znakami.
          Kolumny rozpoznaję po zawartości — także w pliku <b>bez nagłówka</b>, z <b>adresem w jednej kolumnie</b>
          albo z kartoteką na <b>innej zakładce</b>. Zanim cokolwiek zapiszę, pokażę, co zrozumiałem.</p>`;
    }
    const opcje = (wybrane) => podglad.naglowek.map((h, i) =>
      `<option value="${i}" ${wybrane === i ? 'selected' : ''}>${escHtml(
        (podglad.ma_naglowek ? h : 'kolumna ' + (i + 1)) || 'kolumna ' + (i + 1))}</option>`).join('');
    return `
      <div class="wstega ${podglad.wierszy ? 'info' : 'uwaga'}">
        Widzę <b>${podglad.wierszy}</b> ${odmiana(podglad.wierszy, 'wiersz', 'wiersze', 'wierszy')}
        ${podglad.duplikatow ? `· <b>${podglad.duplikatow}</b> już
          ${odmiana(podglad.duplikatow, 'jest', 'są', 'jest')} w kartotece` : '· bez powtórek'}
        ${podglad.pustych ? `· ${podglad.pustych} pustych pominę` : ''}
        <div class="male" style="font-weight:400; margin-top:6px">
          ${podglad.ma_naglowek
            ? `Nagłówek znalazłem w wierszu ${podglad.wiersz_naglowka + 1}.`
            : 'Nagłówka nie ma — kolumny rozpoznałem po tym, co w nich jest.'}
          ${podglad.rozbijac_adres
            ? ' Adres jest sklejony w jednej kolumnie — rozbijam go na ulicę, kod i miasto.'
            : ''}
        </div>
      </div>
      <p class="male slaby">Sprawdź, czy program dobrze zrozumiał kolumny
        <span class="slaby">(${ikonka('podpowiedz')}= rozpoznane po zawartości, bez nagłówka)</span>:</p>
      <div class="dwie">
        ${podglad.pola.map(pole => `
          <label>${escHtml(NAZWY_POL_KLIENTA[pole] || pole)}${
            (podglad.zrodlo || {})[pole] === 'zawartość' ? (' ' + ikonka('podpowiedz')) : ''}
            <select data-mapuj="${pole}">
              <option value="-1">— nie ma —</option>
              ${opcje(podglad.mapowanie[pole])}
            </select></label>`).join('')}
      </div>
      <p class="male slaby" style="margin-top:12px">Pierwsze wiersze z pliku:</p>
      <div class="tabela-przewijana"><table><thead><tr>
        <th>Nazwa</th><th>Adres</th><th>Miasto</th><th>Telefon</th></tr></thead><tbody>
        ${podglad.podglad.map(w => `<tr style="${w.duplikat ? 'opacity:.5' : ''}">
          <td>${escHtml(w.nazwa)}${w.duplikat ? ' <span class="male slaby">(już jest)</span>' : ''}</td>
          <td>${escHtml(w.ulica)}</td><td>${escHtml(w.miasto)}</td><td>${escHtml(w.telefon)}</td>
        </tr>`).join('')}
      </tbody></table></div>
      <label class="plaska" style="margin-top:10px">
        <input type="checkbox" id="ip-pomijaj" checked> Pomiń klientów, którzy już są w kartotece</label>`;
  };

  const otworz = () => okno({
    tytul: 'Wczytaj klientów z pliku',
    szerokie: true,
    tresc: rysujTresc(),
    poOtwarciu: () => {
      const wejscie = document.getElementById('ip-plik');
      if (!wejscie) return;
      wejscie.onchange = async () => {
        const plik = wejscie.files[0];
        if (!plik) return;
        nazwaPliku = plik.name;
        plikBase64 = await new Promise((zwroc, odrzuc) => {
          const czytnik = new FileReader();
          czytnik.onload = () => zwroc(czytnik.result);
          czytnik.onerror = () => odrzuc(new Error('Nie udało się odczytać pliku'));
          czytnik.readAsDataURL(plik);
        });
        const w = await sprobuj(() => API.post('/api/klienci/plik-podglad',
          { plik: plikBase64, nazwa: nazwaPliku }));
        if (!w) return;
        podglad = w;
        zamknijOkno();
        otworz();
      };
    },
    przyciski: podglad ? [
      { napis: 'Inny plik', klik: () => { podglad = null; zamknijOkno(); otworz(); } },
      { napis: `Wczytaj ${podglad.wierszy}`, klasa: 'glowny', klik: async z => {
        const mapowanie = {};
        document.querySelectorAll('[data-mapuj]').forEach(s => {
          mapowanie[s.dataset.mapuj] = Number(s.value);
        });
        if (mapowanie.nazwa < 0) return komunikat('Wskaż kolumnę z nazwą klienta', 'blad');
        const w = await sprobuj(() => API.post('/api/klienci/plik-wykonaj', {
          plik: plikBase64, nazwa: nazwaPliku, ma_naglowek: podglad.ma_naglowek,
          rozbijac_adres: podglad.rozbijac_adres, mapowanie,
          pomijaj_duble: document.getElementById('ip-pomijaj').checked,
        }));
        if (!w) return;
        z();
        komunikat(`Dodano ${w.dodane}${w.pominiete ? `, pominięto ${w.pominiete}` : ''}`, 'ok');
        if (w.geokodowanych) {
          komunikat(`Adresy ${w.geokodowanych} klientów program znajduje w tle — `
            + 'to potrwa około minuty.', 'ok');
        }
        stan.klienci = [];      // wymus ponowne pobranie kartoteki
        pokazEkran('klienci');
      } },
    ] : [{ napis: 'Anuluj', klik: z => z() }],
  });
  otworz();
}

const NAZWY_POL_KLIENTA = {
  nazwa: 'Nazwa klienta', ulica: 'Ulica i numer', kod: 'Kod pocztowy', miasto: 'Miasto',
  osoba: 'Osoba kontaktowa', telefon: 'Telefon', email: 'E-mail', nip: 'NIP',
  godziny: 'Godziny przyjęć', uwagi: 'Uwagi',
};

function oknoKlienta(k) {
  const admin = jestBiuro();
  const nowy = !k;
  k = k || { nazwa: '', ulica: '', kod: '', miasto: '', osoba: '', telefon: '', email: '',
    nip: '', godziny: '', uwagi: '', aktywny: 1 };

  if (!admin) {
    return okno({
      tytul: k.nazwa,
      tresc: `<p><b>${escHtml(adresJednymCiagiem(k)) || 'brak adresu'}</b></p>
        ${k.osoba ? `<p>${ikonka('osoba')}${escHtml(k.osoba)}</p>` : ''}
        ${k.telefon ? `<p><a href="tel:${escHtml(k.telefon.replace(/\s/g, ''))}">${ikonka('telefon-sluchawka')}${escHtml(k.telefon)}</a></p>` : ''}
        ${k.godziny ? `<p>${ikonka('zegar')}${escHtml(k.godziny)}</p>` : ''}
        ${k.uwagi ? `<div class="wstega uwaga">${escHtml(k.uwagi)}</div>` : ''}`,
      przyciski: [{ napis: 'Zamknij', klik: z => z() }],
    });
  }

  okno({
    szkic: 'klient-' + (nowy ? 'nowy' : k.id),
    tytul: nowy ? 'Nowy klient' : k.nazwa,
    tresc: `
      <label>Nazwa <span style="color:var(--czerwony)">*</span>
        <input id="kl-nazwa" value="${escHtml(k.nazwa)}" autocapitalize="words"></label>
      <label>Ulica i numer<input id="kl-ulica" value="${escHtml(k.ulica)}"></label>
      <div class="dwie">
        <label>Kod pocztowy<input id="kl-kod" value="${escHtml(k.kod)}" placeholder="00-000"></label>
        <label>Miasto<input id="kl-miasto" value="${escHtml(k.miasto)}"></label>
      </div>
      <div class="dwie">
        <label>Osoba kontaktowa<input id="kl-osoba" value="${escHtml(k.osoba)}"></label>
        <label>Telefon<input id="kl-telefon" value="${escHtml(k.telefon)}" inputmode="tel"></label>
      </div>
      <div class="dwie">
        <label>E-mail<input id="kl-email" value="${escHtml(k.email)}" inputmode="email"></label>
        <label>NIP<input id="kl-nip" value="${escHtml(k.nip)}"></label>
      </div>
      <label>Godziny przyjęć<input id="kl-godziny" value="${escHtml(k.godziny)}"
        placeholder="np. 7:00–15:00, w piątki do 13:00"></label>
      <label>Uwagi <span class="slaby">(kierowca zobaczy je przy dostawie)</span>
        <textarea id="kl-uwagi" placeholder="np. wjazd od podwórza, brama na kod 1234, wózek widłowy tylko do 14">${escHtml(k.uwagi)}</textarea>
      </label>
      ${nowy ? '' : `<label class="plaska"><input type="checkbox" id="kl-aktywny" ${k.aktywny ? 'checked' : ''}>
        Klient aktywny (odznacz, żeby schować z listy)</label>
        <div class="male slaby">Punkt na mapie: ${k.lat == null ? '<b>nie znaleziony</b>' : `${k.lat.toFixed(5)}, ${k.lon.toFixed(5)}`}</div>
        <button class="maly" id="kl-geo" style="margin-top:6px">${ikonka('jakosc')}Znajdź adres na mapie</button>`}`,
    przyciski: [
      ...(nowy ? [] : [{ napis: 'Historia', klik: () => oknoHistoriiKlienta(k.id, k.nazwa) }]),
      ...(nowy ? [] : [{ napis: 'Przenieś do lokalizacji', ikona: 'fabryka', klik: async z => {
        if (!await potwierdz('Przenieść do naszych lokalizacji?',
          'Ten wpis przestanie być odbiorcą, a stanie się naszym miejscem, z którego '
          + 'wyjeżdżamy. Adres, telefon i uwagi idą razem z nim. Jeśli był już na jakiejś '
          + 'trasie, zostanie w historii jako ukryty klient.')) return;
        const w = await sprobuj(() => API.post(`/api/klienci/${k.id}/na-lokalizacje`));
        if (!w) return;
        z();
        komunikat(w.schowany
          ? 'Przeniesione. Stary wpis został schowany, bo trzyma go historia dostaw — '
            + 'nie ma go już na liście klientów.'
          : 'Przeniesione do naszych lokalizacji', 'ok');
        stan.klienci = []; await odswiezLokalizacje();
        pokazEkran('lokalizacje');
      } }]),
      // R11: kasowanie klientów tylko administrator (biuro chowa klienta odznaczeniem „Klient aktywny”).
      ...(nowy || !jestAdministratorem() ? [] : [{ napis: 'Usuń', klasa: 'niszczacy', klik: async z => {
        if (!await potwierdz('Usunąć klienta?',
          'Jeśli był na jakiejś trasie, zostanie tylko ukryty — historia dostaw musi się zgadzać.')) return;
        const w = await sprobuj(() => API.del('/api/klienci/' + k.id));
        if (!w) return;
        z();
        // Wcześniej program mówił po prostu „Gotowe", a wpis zostawał na liście —
        // wyglądało to, jakby przycisk nie działał. Teraz tłumaczy dlaczego.
        if (w.schowany) {
          komunikat(`Wpis został schowany, nie skasowany — trzyma go `
            + `${w.dostaw} ${odmiana(w.dostaw, 'dostawa', 'dostawy', 'dostaw')} w historii.`
            + (w.przeniesiony ? ' Samo miejsce jest w „Miejsca wyjazdu”.' : ''), 'ok');
        } else {
          komunikat('Klient usunięty', 'ok');
        }
        stan.klienci = [];
        pokazEkran('klienci');
      } }]),
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Zapisz', klasa: 'glowny', klik: async z => {
        const dane = {
          id: k.id, nazwa: val('kl-nazwa'), ulica: val('kl-ulica'), kod: val('kl-kod'),
          miasto: val('kl-miasto'), osoba: val('kl-osoba'), telefon: val('kl-telefon'),
          email: val('kl-email'), nip: val('kl-nip'), godziny: val('kl-godziny'),
          uwagi: val('kl-uwagi'),
          aktywny: nowy ? 1 : (document.getElementById('kl-aktywny').checked ? 1 : 0),
        };
        if (!dane.nazwa) { komunikat('Podaj nazwę klienta', 'blad'); return; }
        // Edycja istniejącego klienta może poczekać w komputerze; nowy — nie (numer nadaje program).
        const w = await sprobuj(() => nowy ? API.post('/api/klienci', dane)
          : zapisBiura('POST', '/api/klienci', dane, {
            opis: 'klient „' + dane.nazwa + '”', zrodla: ['/api/klienci'],
            popraw: (sciezka, d) => { if (sciezka === '/api/klienci') wPamieci(d, k.id, x => Object.assign(x, dane)); },
          }), 'Zapisano');
        if (!w) return;
        z();
        if (dane.ulica || dane.miasto) {
          sprobuj(() => nowy ? API.post(`/api/klienci/${w.id}/geokoduj`)
            : zapisBiura('POST', `/api/klienci/${k.id}/geokoduj`, {}, { opis: 'adres klienta „' + dane.nazwa + '” na mapie' }))
            .then(() => pokazEkran('klienci'));
        } else {
          pokazEkran('klienci');
        }
      } },
    ],
    poOtwarciu: pole => {
      const geo = pole.querySelector('#kl-geo');
      if (geo) geo.onclick = async () => {
        const w = await sprobuj(() => API.post(`/api/klienci/${k.id}/geokoduj`), 'Znaleziono na mapie');
        if (w) { zamknijOkno(); pokazEkran('klienci'); }
      };
    },
  });
}

function val(id) { return (document.getElementById(id).value || '').trim(); }

/* =============================================================== RAPORTY */

/* Raport pracy (2026-11-16): dzień po dniu ze ZLECEŃ (każdy dzień, w którym kierowca miał trasę) + ręczny raport
   kierowcy, jeśli jest. Dawny widok pokazywał tylko ręczne raporty, więc dzień bez wpisu kierowcy po prostu znikał. */
function kafelekZPodpisem(napis, wartosc, podpis) {
  return `<div class="karta" style="text-align:center">
      <div class="male slaby">${escHtml(napis)}</div>
      <div class="liczba-kafelka" style="font-size:26px;font-weight:800">${wartosc}</div>
      <div class="male slaby">${podpis}</div>
    </div>`;
}

/* Raport pracy biura (decyzje właściciela 2026-11-23). Szef Sprzedaży i Menedżer: godziny, kilometry i paliwo wszystkich
   kierowców oraz sekcja „Terminowość planowania” (wynik pracy biura). Biuro: tylko „Do sprawdzenia” (praca operacyjna)
   i dostawy do Excela — serwer odmawia reszty (403), tu tych widoków po prostu nie ma. */
async function rysujRaportyBiura(pole, param) {
  if (!jestAdministratorem()) return rysujDoSprawdzenia(pole, param);
  const planowanie = param.sekcja === 'planowanie';
  pole.innerHTML = `
    <div class="chipy" id="rb-sekcje" role="group" aria-label="Sekcja raportu">
      <button type="button" class="chip${planowanie ? '' : ' wybrany'}" aria-pressed="${!planowanie}" data-sekcja="praca">Godziny i kilometry</button>
      <button type="button" class="chip${planowanie ? ' wybrany' : ''}" aria-pressed="${planowanie}" data-sekcja="planowanie">Terminowość planowania</button>
    </div>
    <div id="rb-sekcja"></div>`;
  pole.querySelectorAll('#rb-sekcje [data-sekcja]').forEach(b => b.onclick = () => {
    if ((b.dataset.sekcja === 'planowanie') !== planowanie) pokazEkran('raporty', { sekcja: b.dataset.sekcja });
  });
  const sekcja = pole.querySelector('#rb-sekcja');
  return planowanie ? rysujTerminowoscPlanowania(sekcja) : rysujPraceKierowcow(sekcja, param);
}

/* Adres pobrania trafia do historii przeglądarki, więc nie wkładamy w niego tokenu sesji — bierzemy osobny, ważny
   pięć minut i tylko do pobierania. adresDanych(): z GitHub Pages plik CSV wydaje program w biurze, nie Pages. */
async function pobierzCsv(nazwa, od, doDnia, kierowcaId) {
  const w = await sprobuj(() => API.post('/api/eksport/token', { zakres: 'eksport' }));
  if (!w) return;
  const link = document.createElement('a');
  link.href = adresDanych(`/api/eksport/${nazwa}.csv?od=${od}&do=${doDnia}`
    + (nazwa === 'raport-pracy-pelny' && kierowcaId ? '&kierowca=' + kierowcaId : '')
    + `&t=${encodeURIComponent(w.token)}`);
  link.download = '';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function rysujDoSprawdzenia(pole, param) {
  const od = param.od || przesunDate(dzisiaj(), -13);
  const doDnia = param.do || dzisiaj();
  pole.innerHTML = `
    <div class="pasek-narzedzi">
      <label>Od<input type="date" id="rb-od" value="${od}"></label>
      <label>Do<input type="date" id="rb-do" value="${doDnia}"></label>
      <button id="rb-14">Ostatnie 14 dni</button>
      <button id="rb-miesiac">Ten miesiąc</button>
      <button data-eksport="dostawy">${ikonka('pobierz')}Dostawy do Excela</button>
    </div>
    <div class="wstega info" style="margin-bottom:12px">Godziny, kilometry i paliwo wszystkich kierowców oglądają
      Szef Sprzedaży i Menedżer.</div>
    <div id="rb-braki"></div>`;
  pole.querySelector('[data-eksport]').onclick = () => pobierzCsv('dostawy', od, doDnia);
  rysujBraki(pole.querySelector('#rb-braki'), od, doDnia);
  const odswiez = (o, d) => pokazEkran('raporty', { od: o, do: d });
  pole.querySelector('#rb-od').onchange = () => odswiez(pole.querySelector('#rb-od').value, pole.querySelector('#rb-do').value);
  pole.querySelector('#rb-do').onchange = () => odswiez(pole.querySelector('#rb-od').value, pole.querySelector('#rb-do').value);
  pole.querySelector('#rb-14').onclick = () => odswiez(przesunDate(dzisiaj(), -13), dzisiaj());
  pole.querySelector('#rb-miesiac').onclick = () => {
    const d = new Date();
    odswiez(dataLokalna(new Date(d.getFullYear(), d.getMonth(), 1)), dzisiaj());
  };
}

async function rysujPraceKierowcow(pole, param) {
  const od = param.od || przesunDate(dzisiaj(), -13);
  const doDnia = param.do || dzisiaj();
  const kierowcaId = param.kierowca ? String(param.kierowca) : '';
  const kierowcy = await listaKierowcow();
  const wynik = await API.get(`/api/raporty/pelne?od=${od}&do=${doDnia}${kierowcaId ? '&kierowca=' + kierowcaId : ''}`);
  const dni = wynik.dni || [];
  const sumy = wynik.sumy || {};
  const odrzucone = wynik.odrzucone_raporty || [];
  const dlugosc = Math.round((new Date(doDnia + 'T12:00:00') - new Date(od + 'T12:00:00')) / 86400000) + 1;
  const godz = h => (h == null ? '—' : godzinyMinuty(h * 60));

  const wiersz = d => {
    const r = d.raport;
    const roznica = d.roznica_godzin;
    return `<tr>
      <td>${polskaData(d.data)}</td>
      <td><b>${escHtml(d.kierowca_imie)}</b></td>
      <td>${escHtml(d.auta.join(', ') || (r && r.pojazd_nazwa) || '')}</td>
      <td>${d.tras ? `${d.tras} ${odmiana(d.tras, 'trasa', 'trasy', 'tras')} · ${d.punkty} ${
        odmiana(d.punkty, 'punkt', 'punkty', 'punktów')}<br>
        <span class="male">${ikonka('haczyk')}${d.dostarczone}${d.nieudane ? ` · ${ikonka('zamknij')}${d.nieudane}` : ''}${
          d.otwarte ? ` · otwarte ${d.otwarte}` : ''}</span>`
        : '<span class="slaby">brak tras</span>'}</td>
      <td>${d.start_zlecen ? `${escHtml(d.start_zlecen)}–${escHtml(d.koniec_zlecen || '?')}<br>
        <b>${godz(d.godziny_zlecen)}</b>
        <span class="male slaby" style="display:block">${escHtml(d.zrodlo_godzin || '')}${
          d.najdluzsza_przerwa_min != null ? ` · najdłuższa przerwa między zamknięciami ${
            godzinyMinuty(d.najdluzsza_przerwa_min)}` : ''}</span>` : '—'}</td>
      <td>${d.podzial && !d.podzial.brak && d.podzial.razem_min != null ? `<span class="male">dzień ${escHtml(d.podzial.start)}–${
        escHtml(d.podzial.koniec)}: <b>${godzinyMinuty(d.podzial.razem_min)}</b></span><br><span class="male slaby">trasy ${
        godzinyMinuty(d.podzial.trasy_min)} · inna praca ${godzinyMinuty(d.podzial.inna_min)} · pozostały ${
        godzinyMinuty(d.podzial.pozostale_min)}</span><br>` : ''}${r ? `${escHtml(r.start_o || '—')}–${escHtml(r.koniec_o || '—')}<br>
        <span class="male">przerwa ${r.przerwa_min || 0} min</span><br><b>${godz(r.godziny)}</b>`
        : d.bez_startu ? '<span class="slaby">trasa bez startu</span>'
        : d.w_toku ? '<span class="plakietka p-w_toku">w toku</span>'
        : '<span class="male slaby">bez raportu kierowcy — dane z tras</span>'}</td>
      <td>${roznica == null ? '—' : `<span style="${Math.abs(roznica) >= 1 ? 'color:var(--czerwony);font-weight:700' : ''}">${
        roznica > 0 ? '+' : ''}${liczbaPl(roznica.toFixed(1))} h</span>`}</td>
      <td>${d.km_auto != null ? `<b>${liczbaPl(d.km_auto)} km</b><br><span class="male slaby">${escHtml(d.zrodlo_km_auto || '')}</span>`
        : (r && r.km != null ? liczbaPl(r.km) + ' km' : '—')}${
        r && r.km != null && d.zrodlo_km_auto !== 'raport kierowcy' ? `<br><span class="male slaby">raport: ${liczbaPl(r.km)} km</span>` : ''}${
        d.km_gps != null && d.zrodlo_km_auto !== 'ślad GPS' ? `<br><span class="male slaby">GPS ok. ${liczbaPl(d.km_gps)} km</span>` : ''}</td>
      <td>${r && r.paliwo_l != null ? r.paliwo_l + ' l' : ''}
          ${r && r.paliwo_pln != null ? '<br>' + liczbaPl(r.paliwo_pln.toFixed(2)) + ' zł' : ''}</td>
      <td class="male">${r && r.usterki ? ('<b style="color:var(--czerwony)">' + ikonka('ostrzezenie')) + escHtml(r.usterki) + '</b><br>' : ''}
          ${r ? escHtml(r.uwagi || '') : ''}
          ${(d.uwagi_trasy || []).map(u => `<br><span style="color:var(--zolty)">${ikonka('ostrzezenie')}${escHtml(u.godzina)} ${
            escHtml(u.powod_nazwa)}${u.klient_nazwa ? ' · ' + escHtml(u.klient_nazwa) : ''}${u.notatka ? ': ' + escHtml(u.notatka) : ''}</span>`).join('')}
          ${(d.podzial && d.podzial.wpisy || []).map(x => `<br><span class="slaby">${escHtml(x.nazwa)} ${escHtml(x.od)}–${escHtml(x.do)}${
            x.notatka ? ' · ' + escHtml(x.notatka) : ''}</span>`).join('')}
          ${d.trasy && d.trasy.length ? `<br><a href="#" data-trasa-raport="${d.trasy[0]}">trasa</a>` : ''}</td>
    </tr>`;
  };

  pole.innerHTML = `
    <div class="pasek-narzedzi">
      <label>Od<input type="date" id="rb-od" value="${od}"></label>
      <label>Do<input type="date" id="rb-do" value="${doDnia}"></label>
      ${kierowcy.length ? `<label>Kierowca<select id="rb-kierowca">
        <option value="">— wszyscy —</option>
        ${kierowcy.map(k => `<option value="${k.id}"${String(k.id) === kierowcaId ? ' selected' : ''}>${
          escHtml(k.imie)}</option>`).join('')}</select></label>` : ''}
      <button id="rb-14">Ostatnie 14 dni</button>
      <button id="rb-miesiac">Ten miesiąc</button>
      <button class="glowny" data-eksport="raport-pracy-pelny">${ikonka('pobierz')}Raport pracy do Excela</button>
      <button data-eksport="raporty">${ikonka('pobierz')}Same raporty kierowców</button>
      <button data-eksport="dostawy">${ikonka('pobierz')}Dostawy do Excela</button>
    </div>

    <div class="wstega info" style="margin-bottom:12px">Zakres: <b>${polskaData(od)} – ${polskaData(doDnia)}</b>
      (${dlugosc} ${odmiana(dlugosc, 'dzień', 'dni', 'dni')}) · dni z pracą: ${sumy.dni || 0}.
      Dni liczone z tras, więc widać też te, w których kierowca nie wypełnił raportu.</div>

    <div class="trzy" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
      ${kafelekZPodpisem('Dni pracy', sumy.dni || 0, `${sumy.dni_bez_raportu || 0} bez raportu kierowcy`)}
      ${kafelekZPodpisem('Godziny pracy', godz(sumy.godziny != null ? sumy.godziny : (sumy.godziny_raportow || sumy.godziny_zlecen || 0)),
        `raporty kierowców: ${godz(sumy.godziny_raportow || 0)} · reszta z tras`)}
      ${kafelekZPodpisem('Kilometry', liczbaPl(sumy.km != null ? sumy.km : (sumy.km_raportow || 0)),
        `raporty ${liczbaPl(sumy.km_raportow || 0)} · GPS ${liczbaPl(sumy.km_z_gps || 0)} · szacunek z tras ${liczbaPl(sumy.km_z_trasy || 0)}`)}
      ${kafelekZPodpisem('Dostawy', sumy.dostarczone || 0, `${sumy.nieudane || 0} nieudanych`)}
    </div>

    ${sumy.dni_bez_raportu ? `<div class="wstega info" style="margin-top:12px">
      ${sumy.dni_bez_raportu} ${odmiana(sumy.dni_bez_raportu, 'dzień nie ma', 'dni nie mają', 'dni nie ma')}
      raportu kierowcy — raport powstaje sam: godziny z tras i zamknięć punktów, kilometry z GPS albo z szacunku tras.
      ${odrzucone.length ? `<br>W „Odrzuconych” leży ${odrzucone.length} ${
        odmiana(odrzucone.length, 'raport', 'raporty', 'raportów')} z tego zakresu (telefon go wysłał, ale
        program go nie przyjął): ${odrzucone.slice(0, 5).map(o => escHtml(`${polskaData(o.data)} ${o.kierowca}${
          o.powod ? ' — ' + o.powod : ''}`)).join('; ')}.
        <button class="maly" id="rb-odrzucone">Otwórz „Odrzucone”</button>` : ''}</div>` : ''}

    <div id="rb-braki"></div>

    <div class="karta" style="margin-top:16px">
      <div class="tabela-przewijana">
        <table>
          <thead><tr>
            <th>Dzień</th><th>Kierowca</th><th>Auto</th><th>Trasy</th><th>Godziny wg tras</th>
            <th>Raport kierowcy</th><th>Różnica</th><th>km</th><th>Paliwo</th><th>Usterki / uwagi</th>
          </tr></thead>
          <tbody>${dni.length ? dni.map(wiersz).join('')
    : '<tr><td colspan="10"><div class="pusto">W tym okresie nie ma ani tras, ani raportów.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="male slaby">Raport pracy tworzy się sam z każdego dnia (trasy, zamknięcia punktów, ślad GPS); jeśli kierowca
      wypełni własny raport, jego godziny i kilometry mają pierwszeństwo. Różnica to rozpiętość dnia z raportu
      (od startu do końca, bez odejmowania przerwy) minus rozpiętość z tras (start trasy do końca trasy albo
      ostatniego zamknięcia punktu). Kilometry z GPS są liczone ze śladu w linii prostej, więc wychodzą nieco niższe
      niż z licznika; ślad starszy niż ${wynik.retencja_gps_dni || 30} dni program kasuje.</div>`;

  pole.querySelectorAll('[data-eksport]').forEach(przycisk =>
    przycisk.onclick = () => pobierzCsv(przycisk.dataset.eksport, od, doDnia, kierowcaId));

  rysujBraki(pole.querySelector('#rb-braki'), od, doDnia);

  pole.querySelectorAll('[data-trasa-raport]').forEach(a => a.onclick = e => {
    e.preventDefault();
    pokazEkran('trasa', { id: Number(a.dataset.trasaRaport) });
  });
  const przyciskOdrzuconych = pole.querySelector('#rb-odrzucone');
  if (przyciskOdrzuconych) przyciskOdrzuconych.onclick = () => pokazEkran('odrzucone');

  const odswiez = () => pokazEkran('raporty', {
    od: pole.querySelector('#rb-od').value, do: pole.querySelector('#rb-do').value,
    kierowca: (pole.querySelector('#rb-kierowca') || {}).value || '',
  });
  pole.querySelector('#rb-od').onchange = odswiez;
  pole.querySelector('#rb-do').onchange = odswiez;
  const wybor = pole.querySelector('#rb-kierowca');
  if (wybor) wybor.onchange = odswiez;
  pole.querySelector('#rb-14').onclick = () => pokazEkran('raporty', {
    od: przesunDate(dzisiaj(), -13), do: dzisiaj(), kierowca: kierowcaId,
  });
  pole.querySelector('#rb-miesiac').onclick = () => {
    const d = new Date();
    pokazEkran('raporty', {
      // Pierwszy dzień miesiąca o północy CZASU LOKALNEGO — przez UTC wychodził
      // ostatni dzień poprzedniego miesiąca.
      od: dataLokalna(new Date(d.getFullYear(), d.getMonth(), 1)),
      do: dzisiaj(),
      kierowca: kierowcaId,
    });
  };
}

/* Minuty na czytelne „6 h 40 min" — biuro planuje dzien, a nie liczy w glowie. */
function godzinyMinuty(minuty) {
  const m = Math.max(0, Math.round(minuty || 0));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/* ============================================================ USTAWIENIA */

/* Nazwy ról jak w Moim koncie (NAZWA_ROLI w app.js, NAZWY_ROL w trasex.py; decyzja właściciela 2026-11-19). Kody ról
   bez zmian. Rola programu `admin` = Szef Sprzedaży (z roli huba trasy_admin) albo Menedżer (admin całego GK) — uprawnienia
   te same, ale konto Menedżera z Panelu serwer opisuje `etykieta_roli` = „Menedżer” („Rozróżnij w Trasach”,
   2026-11-19). Bez tego pola (starszy serwer) — nazwa roli z tej listy, jak dotąd. */
const OPIS_ROLI = { admin: 'Szef Sprzedaży', biuro: 'Biuro', kierowca: 'Kierowca GK Trasy', podglad: 'Podgląd' };
function nazwaRoliKonta(x) {
  return (x && x.etykieta_roli) || OPIS_ROLI[x && x.rola] || (x && x.rola) || '';
}

function kartaFirmyUst(ustawienia) {
  return `
      <div class="karta">
        <h2>Firma i baza</h2>
        <label>Nazwa firmy<input id="u-firma" value="${escHtml(ustawienia.firma || '')}"></label>
        <label>Adres bazy / magazynu <span class="slaby">(punkt startu i powrotu przy liczeniu tras)</span>
          <input id="u-baza" value="${escHtml(ustawienia.baza_adres || '')}"
                 placeholder="np. ul. Przemysłowa 10, 62-800 Kalisz"></label>
        <div class="male slaby">${ustawienia.baza_lat
          ? `Znaleziona na mapie: ${escHtml(ustawienia.baza_lat)}, ${escHtml(ustawienia.baza_lon)}`
          : 'Jeszcze nie odnaleziona na mapie — zapisz adres, spróbuję go znaleźć.'}</div>
        <label style="margin-top:14px">Powody nieudanych dostaw
          <span class="slaby">(jeden w każdej linii — kierowca wybiera z tej listy)</span>
          <textarea id="u-powody" style="min-height:140px">${escHtml(ustawienia.powody_nieudanych || '')}</textarea>
        </label>
        <button class="glowny zapisz-ustawienia">Zapisz ustawienia</button>
      </div>`;
}

const DNI_USTAWIEN = [[1, 'Poniedziałek'], [2, 'Wtorek'], [3, 'Środa'], [4, 'Czwartek'], [5, 'Piątek'], [6, 'Sobota'], [7, 'Niedziela']];

/* Dni tygodnia (tylko Szef): czy pracujemy, o której domyślnie ruszają trasy i kiedy kończy się zmiana. Pusta godzina =
   „jak dotąd” (wyjazd z pola wyżej, brak końca zmiany); bez zmian w tabeli ustawienie zostaje puste. */
function kartaDniTygodniaUst(ustawienia) {
  let plan = {};
  try { plan = JSON.parse(ustawienia.dni_tygodnia || '{}') || {}; } catch (e) { plan = {}; }
  return `<fieldset class="dni-tygodnia"><legend>Dni tygodnia</legend>
      <p class="male slaby">Dzień pracy decyduje o propozycjach dat przy imporcie, o kalendarzu i o terminie układania tras.
        Święta zostają wolne. Ostrzeżenie „po końcu zmiany” pokazuje się na trasie, gdy szacowany powrót wypada po tej godzinie.</p>
      <table class="tabela-dni"><thead><tr><th>Dzień</th><th>Pracujemy</th><th>Wyjazd</th><th>Koniec zmiany</th></tr></thead><tbody>
      ${DNI_USTAWIEN.map(([nr, nazwa]) => {
        const wpis = plan[nr] || {};
        const praca = typeof wpis.praca === 'boolean' ? wpis.praca : nr < 6;
        return `<tr><th scope="row">${nazwa}</th>
          <td><input type="checkbox" id="u-dt-praca-${nr}" aria-label="${nazwa}: pracujemy"${praca ? ' checked' : ''}></td>
          <td><input type="time" id="u-dt-wyjazd-${nr}" aria-label="${nazwa}: godzina wyjazdu" value="${escHtml(wpis.wyjazd || '')}"></td>
          <td><input type="time" id="u-dt-koniec-${nr}" aria-label="${nazwa}: koniec zmiany" value="${escHtml(wpis.koniec || '')}"></td></tr>`;
      }).join('')}
      </tbody></table></fieldset>`;
}

/* Z tabeli do zapisu: tylko odstępstwa od domyślnych (pracują pn–pt, godziny puste); same domyślne = puste ustawienie. */
function zbierzDniTygodnia() {
  const plan = {};
  DNI_USTAWIEN.forEach(([nr]) => {
    const wpis = {};
    const praca = document.getElementById('u-dt-praca-' + nr).checked;
    if (praca !== (nr < 6)) wpis.praca = praca;
    const wyjazd = document.getElementById('u-dt-wyjazd-' + nr).value;
    const koniec = document.getElementById('u-dt-koniec-' + nr).value;
    if (wyjazd) wpis.wyjazd = wyjazd;
    if (koniec) wpis.koniec = koniec;
    if (Object.keys(wpis).length) plan[nr] = wpis;
  });
  return Object.keys(plan).length ? JSON.stringify(plan) : '';
}

function kartaGodzinUst(ustawienia) {
  return `
      ${zwin('Godziny dojazdu', '', `
        <p class="male slaby">Z tego program liczy, o której auto będzie u każdego klienta,
          i ostrzega, gdy nie zdąży przed zamknięciem. Liczy w przeglądarce, więc działa
          też w telefonie bez zasięgu. To szacunek, nie nawigacja: odległość w linii prostej
          razy 1,35, bo drogi nie są proste.</p>
        <div class="trzy">
          <label>Godzina wyjazdu z bazy
            <input type="time" id="u-wyjazd" value="${escHtml(ustawienia.godzina_wyjazdu || '07:00')}"></label>
          <label>Średnia prędkość (km/h)
            <input type="number" id="u-predkosc" min="20" max="120"
                   value="${escHtml(ustawienia.srednia_predkosc || '50')}"></label>
          <label>Rozładunek u klienta (min)
            <input type="number" id="u-rozladunek" min="0" max="240"
                   value="${escHtml(ustawienia.czas_rozladunku_min || '15')}"></label>
        </div>
        <div class="dwie">
          <label>Załadunek w naszym magazynie (min)
            <input type="number" id="u-zaladunek" min="0" max="240"
                   value="${escHtml(ustawienia.czas_zaladunku_min || '30')}"></label>
          <label>Cisza telefonu — alarm po (min)
            <input type="number" id="u-cisza" min="15" max="480"
                   value="${escHtml(ustawienia.cisza_alarm_min || '90')}"></label>
        </div>
        <p class="male slaby">Po tylu minutach bez kontaktu z telefonem kierowcy
          ekran „Na żywo" zapali ostrzeżenie. Brak kontaktu zwykle znaczy brak
          zasięgu, a nie brak pracy — ale biuro ma o tym wiedzieć.</p>
        <label class="plaska"><input type="checkbox" id="u-push-zatw"
          ${String(ustawienia.push_do_zatwierdzenia || '1') === '0' ? '' : 'checked'}>
          Powiadom biuro, gdy kierowca zamknie dostawę i czeka ona na zatwierdzenie</label>
        <p class="male slaby">Jedno powiadomienie na trasę (po minucie, żeby nie dzwoniło przy każdym punkcie);
          nic, jeśli dostawę zdążono już zatwierdzić. Dotyka telefonów z włączonymi powiadomieniami.</p>
        <p class="male slaby">W ciągu dnia godziny liczą się od ostatniej zamkniętej dostawy,
          a nie od porannego planu — po pierwszym opóźnieniu reszta i tak byłaby nieprawdziwa.</p>
        ${jestAdministratorem() ? kartaDniTygodniaUst(ustawienia) : ''}
        ${jestAdministratorem() ? `<label>Terminowość planowania — termin (pełna godzina, 0–23)
            <input type="number" id="u-plan-termin" min="0" max="23" step="1"
                   value="${escHtml(ustawienia.plan_termin_godz || '17')}">
            <span class="male slaby">Sekcja „Terminowość planowania” w Raporcie pracy: trasa jest w terminie, gdy zaplanowano ją
              najpóźniej o tej godzinie poprzedniego dnia roboczego przed dniem jazdy. Zmienia i ogląda tylko Szef Sprzedaży
              albo Menedżer.</span></label>` : ''}
        <button class="glowny zapisz-ustawienia">Zapisz ustawienia</button>`)}`;
}

function kartaPrzerwUst(ustawienia) {
  return `
      ${zwin('Przerwy kierowcy', String(ustawienia.przerwy_wlaczone || '1') === '0'
        ? '<span class="plakietka p-oczekuje">wyłączone</span>'
        : ('<span class="plakietka p-dostarczone">' + ikonka('haczyk') + 'doliczane</span>'), `
        <p class="male slaby">Do czasu trasy program dolicza <b>przerwy kierowcy</b>.
          Kluczowa różnica wobec postoju: <b>rozładunek u klienta nie jest przerwą</b> —
          kierowca wtedy pracuje, więc licznik jazdy leci dalej. Przerwa wypada
          w drodze, w chwili wyczerpania limitu.</p>
        <p class="male slaby">Wszystkie liczby poniżej ustawiacie sami, tak samo jak
          czas załadunku. Domyślne wartości wzięliśmy z rozporządzenia 561/2006
          i ustawy o czasie pracy kierowców — jako rozsądny punkt wyjścia,
          nie dlatego, że coś je narzuca.</p>
        <label class="plaska"><input type="checkbox" id="u-przepisy"
          ${String(ustawienia.przerwy_wlaczone || '1') === '0' ? '' : 'checked'}>
          Doliczaj przerwy do czasu trasy</label>
        <p class="male slaby">Można to wyłączyć osobno dla każdego auta — przełącznik
          jest przy nim na liście poniżej.</p>
        <div class="dwie">
          <label>Po ilu minutach jazdy przerwa
            <input type="number" id="u-jazda-przerwa" min="30" max="900"
                   value="${escHtml(ustawienia.jazda_do_przerwy_min || '270')}"></label>
          <label>Ile trwa ta przerwa (min)
            <input type="number" id="u-przerwa" min="0" max="240"
                   value="${escHtml(ustawienia.przerwa_min || '45')}"></label>
        </div>
        <div class="dwie">
          <label>Po ilu minutach pracy przerwa
            <input type="number" id="u-praca-przerwa" min="30" max="900"
                   value="${escHtml(ustawienia.praca_do_przerwy_min || '360')}"></label>
          <label>Ile trwa ta przerwa (min)
            <input type="number" id="u-przerwa-praca" min="0" max="240"
                   value="${escHtml(ustawienia.przerwa_pracownicza_min || '30')}"></label>
        </div>
        <p class="male slaby">Praca to jazda razem z postojami. Przerwy z jazdy
          zaliczają się do tego wymiaru — dokładamy tylko brakującą różnicę.</p>
        <div class="dwie">
          <label>Długi dzień: powyżej ilu minut pracy
            <input type="number" id="u-dluga-praca" min="60" max="900"
                   value="${escHtml(ustawienia.dluga_praca_min || '540')}"></label>
          <label>...tyle przerwy łącznie (min)
            <input type="number" id="u-przerwa-dluga" min="0" max="240"
                   value="${escHtml(ustawienia.przerwa_dlugiej_pracy_min || '45')}"></label>
        </div>
        <div class="dwie">
          <label>Ostrzegaj powyżej (min jazdy dziennie)
            <input type="number" id="u-limit-jazdy" min="60" max="1200"
                   value="${escHtml(ustawienia.dobowy_limit_jazdy_min || '540')}"></label>
          <label>Ostrzegaj powyżej (min całego dnia)
            <input type="number" id="u-doba" min="60" max="1440"
                   value="${escHtml(ustawienia.doba_pracy_min || '780')}"></label>
        </div>
        <button class="glowny zapisz-ustawienia">Zapisz ustawienia</button>`)}`;
}

/* Ustawienia dla biura („kierownika GK Trasy"): tylko wymogi operacyjne. Nie
   pytamy o konta, IKOL ani kopie — te endpointy są tylko dla administratora
   i 403 zepsułby cały ekran. Serwer i tak odrzuci każdy inny klucz. */
/* Konta kierowców dla biura (2026-11-03: „admin i biuro mogą tworzyć konta kierowców”). To samo okno co u administratora
   (oknoKontaZespolu) — konto powstaje w Panelu, jedno dla osoby we wszystkich aplikacjach GK — ale tylko kierowcy:
   biura i administratorów prowadzi administrator (serwer i Panel pilnują tego samego). */
function kartaKontKierowcow(ustawienia, konta) {
  const mozna = kontaZespolu(ustawienia);
  const powod = (ustawienia.konta_zespolu || {}).powod;
  return `<div class="karta">
    <div class="karta-gora"><h2>Konta kierowców</h2>
      ${mozna ? '<button class="maly glowny" id="u-nowy-kierowca">+ Dodaj kierowcę</button>' : ''}</div>
    <div class="wstega info">${mozna
      ? 'Kierowcę zakładasz tutaj — konto powstaje w <b>Panelu Zarządczym GK</b>, jedno dla osoby we wszystkich aplikacjach GK. Hasło startowe: <b>haslo123</b>.'
      : powod === 'awaryjny' ? 'Kierowców zakłada osoba z kontem z Panelu — zaloguj się swoim kontem z Panelu.'
        : 'Teraz kierowców zakłada się w <b>Panelu → Administracja</b> (brak połączenia z Panelem).'}</div>
    ${blokKierowcowZablokowanych(konta)}
    <div class="tabela-przewijana"><table>
      <thead><tr><th>Imię</th><th>Login</th><th>Telefon</th><th></th></tr></thead>
      <tbody>${(konta || []).map(x => `<tr style="${x.aktywny ? '' : 'opacity:.5'}">
        <td><b>${escHtml(x.imie)}</b>${x.aktywny ? '' : ' <span class="male">(wyłączone)</span>'}
          ${x.aktywny && (x.haslo_do_zmiany || x.pin_do_zmiany)
            ? `<br><span class="male slaby">${x.haslo_do_zmiany ? 'hasło startowe — ustawi przy pierwszym logowaniu'
              : 'PIN startowy 1234 — ustawi nowy przy logowaniu'}</span>` : ''}</td>
        <td>${escHtml(x.login)}</td><td>${escHtml(x.telefon || '')}</td>
        <td>${x.mozna_zmienic && mozna ? `<button class="maly" data-kierowca-konto="${x.id}">${ikonka('edytuj')}Zmień</button>` : ''}</td>
      </tr>`).join('') || '<tr><td colspan="4" class="slaby">Nie ma jeszcze kierowców.</td></tr>'}</tbody>
    </table></div></div>`;
}

/* „Kierowcy zablokowani” (2026-11-09, jak w GK Flota): kto z kierowców czeka albo jest zablokowany przy logowaniu
   z internetu, z przyciskiem „Odblokuj”. Biuro odblokowuje tylko kierowców (serwer pilnuje tego samego); administrator
   ma „Odblokuj” przy każdym koncie w Administracji → Konta. Z firmowego wifi kierowca wchodzi normalnie. */
function blokKierowcowZablokowanych(konta) {
  const zablokowani = (konta || []).filter(x => (x.z_internetu || {}).blokada);
  if (!zablokowani.length) return '<p class="male slaby" style="margin:8px 0">Nikt z kierowców nie jest zablokowany przy logowaniu z internetu.</p>';
  return `<div class="wstega blad" id="u-kierowcy-zablokowani"><b>Kierowcy zablokowani</b> przy logowaniu z internetu
    (z firmowego wifi wchodzą normalnie):
    ${zablokowani.map(x => `<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:6px">
      <span><b>${escHtml(x.imie)}</b>${opisBlokadyZInternetu(x.z_internetu)}</span>
      <button class="maly glowny" data-odblokuj="${x.id}">Odblokuj</button></div>`).join('')}</div>`;
}

async function rysujUstawieniaBiura(pole) {
  const chipy = `<div class="chipy" role="group" aria-label="Skróty">
      <button type="button" class="chip" id="u-miejsca">Miejsca wyjazdu</button>
      <button type="button" class="chip" id="u-zapros">Zaproś kierowcę</button>
    </div>`;
  const podepnijChipy = () => {
    pole.querySelector('#u-miejsca').onclick = () => pokazEkran('lokalizacje');
    pole.querySelector('#u-zapros').onclick = () => pokazEkran('zaproszenie');
  };
  let ustawienia, konta;
  try {
    [ustawienia, konta] = await Promise.all([API.get('/api/ustawienia'), API.get('/api/konta-kierowcow')]);
    stan.ustawienia = ustawienia;
    await odswiezLokalizacje();
  } catch (e) {
    // Skróty (Miejsca wyjazdu, Zaproś kierowcę) były pozycjami menu i otwierały się bez tego zapytania — przy braku serwera zostają.
    pole.innerHTML = `${chipy}<div class="karta"><h2>Nie udało się wczytać</h2><p class="slaby">${escHtml(poLudzku(e))}</p>
      <button class="glowny" onclick="pokazEkran('ustawienia')">Spróbuj ponownie</button></div>`;
    podepnijChipy();
    return;
  }
  pole.innerHTML = `
    ${chipy}
    <p class="male slaby" style="margin:0 0 10px">Tu ustawiasz, jak program liczy trasy
      i pilnuje kierowców oraz zakładasz konta kierowców. Klucze, pocztę, kopie zapasowe
      i konta biura zmienia Szef Sprzedaży.</p>
    ${kartaFirmyUst(ustawienia)}
    ${kartaGodzinUst(ustawienia)}
    ${kartaPrzerwUst(ustawienia)}
    ${kartaKontKierowcow(ustawienia, konta)}`;
  const nowyKierowca = pole.querySelector('#u-nowy-kierowca');
  if (nowyKierowca) nowyKierowca.onclick = () => oknoKontaZespolu(null);
  podepnijChipy();
  pole.querySelectorAll('[data-kierowca-konto]').forEach(b =>
    b.onclick = () => oknoKontaZespolu(konta.find(x => x.id === Number(b.dataset.kierowcaKonto))));
  pole.querySelectorAll('[data-odblokuj]').forEach(b => b.onclick = async () => {
    const w = await sprobuj(() => API.post(`/api/uzytkownicy/${b.dataset.odblokuj}/odblokuj`), 'Odblokowano');
    if (w) wrocDoUstawien();
  });
  const zapisz = async () => {
    // Tylko pola, które są na tym ekranie — i tylko klucze operacyjne.
    const dane = {
      firma: val('u-firma'), baza_adres: val('u-baza'),
      baza_lat: '', baza_lon: '',
      powody_nieudanych: document.getElementById('u-powody').value,
      godzina_wyjazdu: val('u-wyjazd'),
      srednia_predkosc: val('u-predkosc'),
      czas_rozladunku_min: val('u-rozladunek'),
      czas_zaladunku_min: val('u-zaladunek'),
      cisza_alarm_min: val('u-cisza'),
      push_do_zatwierdzenia: document.getElementById('u-push-zatw')
        && !document.getElementById('u-push-zatw').checked ? '0' : '1',
      przerwy_wlaczone: document.getElementById('u-przepisy')
        && !document.getElementById('u-przepisy').checked ? '0' : '1',
      jazda_do_przerwy_min: val('u-jazda-przerwa'),
      przerwa_min: val('u-przerwa'),
      praca_do_przerwy_min: val('u-praca-przerwa'),
      przerwa_pracownicza_min: val('u-przerwa-praca'),
      dluga_praca_min: val('u-dluga-praca'),
      przerwa_dlugiej_pracy_min: val('u-przerwa-dluga'),
      dobowy_limit_jazdy_min: val('u-limit-jazdy'),
      doba_pracy_min: val('u-doba'),
    };
    zajety(true);
    let w = null;
    // Ustawienia operacyjne (bez kluczy, haseł i tokenów — tych nie kolejkujemy) mogą poczekać w komputerze.
    try {
      w = await sprobuj(() => zapisBiura('POST', '/api/ustawienia', dane, {
        opis: 'ustawienia firmy', zrodla: ['/api/ustawienia'],
        popraw: (sciezka, d) => {
          if (sciezka !== '/api/ustawienia' || !d || typeof d !== 'object') return;
          Object.keys(dane).forEach(k => { if (k !== 'baza_lat' && k !== 'baza_lon') d[k] = dane[k]; });
        },
      }), 'Zapisano');
    }
    finally { zajety(false); }
    if (w) wrocDoUstawien();
  };
  pole.querySelectorAll('.zapisz-ustawienia').forEach(p => p.onclick = zapisz);
  const otwarte = stan.otwarteUstawienia || (stan.otwarteUstawienia = new Set());
  pole.querySelectorAll('details[id]').forEach(d => {
    if (otwarte.has(d.id)) d.open = true;
    d.addEventListener('toggle', () => { if (d.open) otwarte.add(d.id); else otwarte.delete(d.id); });
  });
}

EKRANY.ustawienia = {
  get tytul() { return jestAdministratorem() ? 'Ustawienia' : 'Ustawienia firmy'; },
  // Biuro widzi ten ekran, ale tylko trzy sekcje operacyjne (wymogi wobec tras
  // i kierowców) — reszta zostaje administratorowi. Osobny znacznik zamiast
  // `tylkoAdministrator`, żeby reguła dla innych ekranów się nie zmieniła.
  dlaBiura: true,
  async rysuj(pole, param) {
    if (!jestAdministratorem()) { await rysujUstawieniaBiura(pole); return; }
    // Administrator ma ten ekran w Administracji → Ustawienia (pokazEkran przekierowuje stary adres).
    await rysujUstawieniaAdmina(pole, param, 'ustawienia');
  },
};

/* Po zapisie, odblokowaniu, kopii itp. wracamy tam, skąd przyszliśmy: administrator na tę samą zakładkę
   Administracji (Konta albo Ustawienia — nie na pierwszą), biuro na „Ustawienia firmy”. */
function wrocDoUstawien() {
  if (stan.ekran === 'administracja') pokazEkran('administracja', { zakladka: stan.adminZakladka });
  else pokazEkran('ustawienia');
}

/* Ustawienia i Konta administratora to jedno miejsce wyrenderowane z jednego zestawu danych, w dwóch zakładkach
   Administracji (zakladka: 'ustawienia' | 'konta'). Dane i endpointy bez zmian — dotychczasowy ekran Ustawienia
   został rozdzielony, nic nie jest kopiowane. */
async function rysujUstawieniaAdmina(pole, param, zakladka) {
  const naKontach = zakladka === 'konta';
  const [u, ustawienia] = await Promise.all([
    API.get('/api/uzytkownicy'), API.get('/api/ustawienia'),
  ]);
  await odswiezLokalizacje();
  stan._lokalizatory = ustawienia.ikol_ustawiony
    ? await API.get('/api/ikol/lokalizatory').catch(() => []) : [];
  stan.ustawienia = ustawienia;
  stan._kierowcy = u.filter(x => x.aktywny);
  stan.pojazdy = await API.get('/api/pojazdy');


  // Zakładka „Konta” (Administracja): ta sama tabela kont i ta sama karta „Konta GK (Panel Zarządczy GK)”, co dotąd
  // w Ustawieniach (Konta + Zaawansowane → Konta GK) — ten sam render i te same endpointy, tylko wejście na wierzchu.
  if (naKontach) {
    pole.innerHTML = `
    ${kartaKontAdmina(ustawienia, u)}
    ${kartaKontGK(ustawienia)}`;
  } else pole.innerHTML = `
    ${wstegiAlarmow(ustawienia.alarmy, true)}
    ${kartaFirmyUst(ustawienia)}

    ${kartaGodzinUst(ustawienia)}

    ${kartaPrzerwUst(ustawienia)}

    <div class="karta">
      <div class="karta-gora"><h2>Auta</h2>
        <div class="przyciski">
          ${(ustawienia.flotex_stan || {}).polaczony
            ? '<button class="maly" id="u-flotex-import">Pobierz auta z GK Flota</button>' : ''}
          <button class="maly glowny" id="u-nowy-bus">+ Nowe auto</button></div></div>
      <div class="tabela-przewijana"><table>
        <thead><tr><th>Nazwa</th><th>Rejestracja</th>
          ${(ustawienia.flotex_stan || {}).polaczony ? '<th>GK Flota</th>' : ''}<th>Uwagi</th><th></th></tr></thead>
        <tbody>${stan.pojazdy.length ? stan.pojazdy.map(b => `<tr style="${b.aktywny ? '' : 'opacity:.5'}">
          <td><b>${escHtml(b.nazwa)}</b>${b.typ === 'ciezarowe' ? ' <span class="plakietka p-planowana">ciężarowe</span>' : ''}</td><td>${escHtml(b.rejestracja || '')}</td>
          ${(ustawienia.flotex_stan || {}).polaczony ? `<td>${b.flotex
            ? znacznikFlotexu(b.flotex) + powodyFlotexu(b.flotex)
            : '<span class="male slaby">nie ma w GK Flota</span>'}</td>` : ''}
          <td class="male">${escHtml(b.uwagi || '')}</td>
          <td><button class="maly" data-bus="${b.id}">${ikonka('edytuj')}Zmień</button></td>
        </tr>`).join('') : '<tr><td colspan="5"><div class="pusto">Nie ma jeszcze aut.</div></td></tr>'}</tbody>
      </table></div>
    </div>

    <details class="zaawansowane" id="u-zaawansowane">
      <summary><span class="znak-zwiniecia">${ikonka('szewron-prawo')}</span> Ustawienia
        <span class="slaby">— połączenia, kopie, tunel, poczta, przechowywanie danych</span></summary>
      <p class="male slaby">Rzadko zmieniane ustawienia techniczne. Na co dzień nie trzeba
        tu zaglądać — program sam pokaże wstęgę, gdy coś stąd wymaga uwagi.</p>

    ${zwin('Ślad GPS i przechowywanie danych', '', `
      <p class="male slaby">Położenie kierowcy to dana osobowa. Program kasuje stare punkty sam,
         a kierowca sam włącza i wyłącza udostępnianie w swoim telefonie.</p>
      <div class="dwie">
        <label>Trzymaj ślad GPS przez (dni)
          <input type="number" id="u-retencja" min="1" max="730"
                 value="${escHtml(ustawienia.retencja_pozycji_dni || '30')}">
          <span class="male slaby">Ślad służy do pokazania, gdzie jest auto. Dłuższe
            trzymanie nikomu nie służy, a rozdmuchuje kopie zapasowe.</span></label>
        <label>Trzymaj zdjęcia i podpisy przez (miesiące)
          <input type="number" id="u-retencja-zal" min="0" max="120"
                 value="${escHtml(ustawienia.retencja_zalacznikow_mies || '0')}">
          <span class="male slaby">0 = trzymaj bez końca. Podpisy też są danymi osobowymi,
            ale bywają jedynym dowodem w sporze — kasuj świadomie.</span></label>
      </div>
      <p class="male slaby">Sprzątanie odbywa się przy każdym uruchomieniu programu.</p>
      <button class="glowny zapisz-ustawienia">Zapisz ustawienia</button>`)}

    ${zwin('Powiadamianie klienta', ustawienia.poczta_ustawiona
      ? ('<span class="plakietka p-dostarczone">' + ikonka('haczyk') + 'gotowe</span>')
      : '<span class="plakietka p-oczekuje">nieustawione</span>', `
      <p class="male slaby">Program potrafi wysłać klientowi e-mail: „planujemy dostawę
        w środę, orientacyjnie 12:30". Wysyłasz Ty, przyciskiem przy punkcie —
        <b>nic nie rozsyła się samo</b>. Potrzebne są dane Waszego serwera pocztowego,
        te same co w programie pocztowym.</p>
      <div class="dwie">
        <label>Serwer SMTP
          <input id="u-poczta-serwer" value="${escHtml(ustawienia.poczta_serwer || '')}"
                 placeholder="np. smtp.nazwa.pl"></label>
        <label>Port
          <input type="number" id="u-poczta-port" value="${escHtml(ustawienia.poczta_port || '587')}"></label>
        <label>Szyfrowanie
          <select id="u-poczta-szyfrowanie">
            <option value="starttls" ${ustawienia.poczta_szyfrowanie === 'starttls' ? 'selected' : ''}>STARTTLS (port 587)</option>
            <option value="ssl" ${ustawienia.poczta_szyfrowanie === 'ssl' ? 'selected' : ''}>SSL (port 465)</option>
            <option value="brak" ${ustawienia.poczta_szyfrowanie === 'brak' ? 'selected' : ''}>bez szyfrowania</option>
          </select></label>
        <label>Adres nadawcy
          <input id="u-poczta-nadawca" value="${escHtml(ustawienia.poczta_nadawca || '')}"
                 placeholder="np. biuro@twojafirma.pl"></label>
        <label>Login <span class="slaby">(zwykle ten sam co adres)</span>
          <input id="u-poczta-login" value="${escHtml(ustawienia.poczta_login || '')}"></label>
        <label>Hasło
          <input id="u-poczta-haslo" type="password" autocomplete="new-password"
                 placeholder="${ustawienia.poczta_ustawiona ? 'hasło zapisane — wpisz nowe, żeby zmienić' : ''}"></label>
      </div>
      <label>Stopka wiadomości
        <textarea id="u-poczta-stopka" placeholder="np. Pozdrawiamy, GK Factory · tel. 62 000 00 00">${escHtml(ustawienia.poczta_stopka || '')}</textarea></label>
      <fieldset class="szablony-poczty">
        <legend>Treść wiadomości do klienta</legend>
        <p class="male slaby">Wiadomość składa się sama z tych szablonów. W tekście wpisz zmienne w nawiasach
          klamrowych — program podstawi dane punktu: <code>{adres}</code> adres klienta,
          <code>{data}</code> dzień słownie z dniem tygodnia („16 listopada 2026 (poniedziałek)”),
          <code>{data_krotka}</code> 16.11.2026, <code>{okno}</code> godziny, <code>{towar}</code>,
          <code>{dokument}</code>, <code>{firma}</code>, <code>{klient}</code>, <code>{osoba}</code>,
          <code>{odebral}</code>. Linia „Towar: {towar}” znika, gdy towaru nie ma.
          Nieznana zmienna zostaje w tekście bez zmian.</p>
        ${[['poczta_temat_plan', 'Temat — plan dostawy', 2], ['poczta_szablon_plan', 'Treść — plan dostawy', 8],
           ['poczta_temat_dostawa', 'Temat — dostawa zrealizowana', 2], ['poczta_szablon_dostawa', 'Treść — dostawa zrealizowana', 6]]
          .map(([klucz, nazwa, wiersze]) => `
        <label>${nazwa}
          <textarea id="u-${klucz}" rows="${wiersze}">${escHtml(ustawienia[klucz] || '')}</textarea></label>
        <button type="button" class="maly" data-przywroc="${klucz}">Przywróć domyślny</button>`).join('')}
      </fieldset>
      <div class="przyciski">
        <button class="glowny zapisz-ustawienia">Zapisz ustawienia</button>
        <button id="u-poczta-test">Wyślij wiadomość próbną</button>
      </div>
      <p class="male slaby">Hasło do poczty zapisuje się w pliku <code>dane.db</code>
        w folderze programu — tak samo jak reszta danych firmy.</p>`)}

    ${kartaKopii(ustawienia)}
    ${kartaTunelu(ustawienia)}
    ${kartaPages(ustawienia)}
    ${kartaIkol(ustawienia)}
    ${kartaFlotexu(ustawienia)}

    ${zwin('Trasy po drogach', ustawienia.ors_klucz_ustawiony ? 'klucz zapisany' : 'działa bez klucza', `
      <p class="male slaby">Przycisk „Pokaż przebieg po drogach” na mapie trasy działa
        <b>bez żadnego klucza</b> — rysuje przejazd po prawdziwych drogach wraz z kilometrami
        i czasem, korzystając z darmowego routera OpenStreetMap. Wymaga tylko internetu.</p>
      <p class="male slaby">Klucz poniżej jest nieobowiązkowy i zmienia co innego: <b>kolejność</b>
        punktów układana przy „Ułóż trasę”. Bez klucza kolejność liczy się w linii prostej —
        dla dostaw do 100 km to zwykle wystarcza. Darmowy klucz z openrouteservice.org
        układa ją po realnych drogach.</p>
      <label>Klucz OpenRouteService
        <input id="u-ors" placeholder="${ustawienia.ors_klucz_ustawiony
          ? 'klucz jest zapisany — wpisz nowy, żeby zmienić' : 'wklej klucz'}"></label>
      <div class="male ${ustawienia.ors_klucz_ustawiony ? '' : 'slaby'}">
        ${ustawienia.ors_klucz_ustawiony ? (ikonka('haczyk') + 'Klucz zapisany') : 'Klucz nie jest ustawiony'}</div>
      <button class="glowny zapisz-ustawienia" style="margin-top:12px">Zapisz ustawienia</button>`)}

    ${zwin('Jak wejść z telefonu', '', `
      <p class="male">Najprościej: ${jestAdministratorem() ? 'Administracja' : 'Ustawienia'} → <b>${ikonka('zaproszenie')}Zaproś kierowcę</b> — kierowca skanuje kod QR
        aparatem telefonu. Adres to stały adres aplikacji na GitHub Pages
        (<code>${escHtml(((ustawienia.pages || {}).adres) || 'https://milo252-gk.github.io/gk-panel-aplikacje/trasy/')}</code>),
        a gdy Panel Zarządczy GK jeszcze jej tam nie wysłał — adres tunelu albo firmowego wifi.</p>
      <p class="male">Kierowca loguje się imieniem i nazwiskiem (albo loginem) i PIN-em,
        a potem w przeglądarce wybiera <b>„Dodaj do ekranu głównego”</b>. Od tej pory
        aplikacja otwiera się z ikony jak zwykły program i działa również bez zasięgu.</p>`)}
    </details>`;

  // Pola są na różnych zakładkach Administracji (Konta: adres i klucz Panelu; Ustawienia: reszta), więc do
  // zapisu idą tylko te, które są teraz na ekranie — brakujące pole nie może wyzerować ustawienia, którego nie widać.
  const zapiszWszystko = async () => {
    const daneUstawien = {};
    const jest = id => !!document.getElementById(id);
    if (jest('u-baza')) {
      daneUstawien.baza_adres = val('u-baza');
      daneUstawien.baza_lat = ''; daneUstawien.baza_lon = '';
    }
    if (jest('u-powody')) daneUstawien.powody_nieudanych = document.getElementById('u-powody').value;
    [['firma', 'u-firma'],
      ['retencja_pozycji_dni', 'u-retencja'], ['retencja_zalacznikow_mies', 'u-retencja-zal'],
      ['godzina_wyjazdu', 'u-wyjazd'], ['srednia_predkosc', 'u-predkosc'], ['czas_rozladunku_min', 'u-rozladunek'],
      ['czas_zaladunku_min', 'u-zaladunek'], ['cisza_alarm_min', 'u-cisza'],
      ['jazda_do_przerwy_min', 'u-jazda-przerwa'], ['przerwa_min', 'u-przerwa'],
      ['praca_do_przerwy_min', 'u-praca-przerwa'], ['przerwa_pracownicza_min', 'u-przerwa-praca'],
      ['dluga_praca_min', 'u-dluga-praca'], ['przerwa_dlugiej_pracy_min', 'u-przerwa-dluga'],
      ['dobowy_limit_jazdy_min', 'u-limit-jazdy'], ['doba_pracy_min', 'u-doba'],
      ['plan_termin_godz', 'u-plan-termin'],
      ['poczta_serwer', 'u-poczta-serwer'], ['poczta_port', 'u-poczta-port'],
      ['poczta_nadawca', 'u-poczta-nadawca'], ['poczta_login', 'u-poczta-login'],
      ['poczta_haslo', 'u-poczta-haslo'], ['poczta_stopka', 'u-poczta-stopka'], ['ors_klucz', 'u-ors'],
      ['poczta_temat_plan', 'u-poczta_temat_plan'], ['poczta_szablon_plan', 'u-poczta_szablon_plan'],
      ['poczta_temat_dostawa', 'u-poczta_temat_dostawa'], ['poczta_szablon_dostawa', 'u-poczta_szablon_dostawa'],
      ['tunel_token', 'u-tunel-token'], ['tunel_adres', 'u-tunel-adres'],
      ['ikol_login', 'u-ikol-login'], ['ikol_haslo', 'u-ikol-haslo'], ['ikol_appkey', 'u-ikol-appkey'],
      ['flotex_adres', 'u-flotex-adres'], ['flotex_klucz', 'u-flotex-klucz'],
      ['hub_adres', 'u-hub-adres'], ['hub_klucz', 'u-hub-klucz'], ['kopia_folder', 'u-kopia-folder'],
    ].forEach(([klucz, id]) => { if (jest(id)) daneUstawien[klucz] = val(id); });
    if (jest('u-push-zatw')) daneUstawien.push_do_zatwierdzenia = document.getElementById('u-push-zatw').checked ? '1' : '0';
    if (jest('u-przepisy')) daneUstawien.przerwy_wlaczone = document.getElementById('u-przepisy').checked ? '1' : '0';
    if (jest('u-dt-praca-1')) daneUstawien.dni_tygodnia = zbierzDniTygodnia();
    if (jest('u-poczta-szyfrowanie')) daneUstawien.poczta_szyfrowanie = document.getElementById('u-poczta-szyfrowanie').value;
    if (jest('u-tunel-token')) {
      daneUstawien.tunel_tryb = (document.querySelector('input[name=tunel]:checked') || {}).value || 'brak';
    }
    if (jest('u-ikol-wlaczony')) daneUstawien.ikol_wlaczony = document.getElementById('u-ikol-wlaczony').checked ? '1' : '';
    // Serwer odpowiada 409, gdy zapis skasowałby podpisy i zdjęcia przez
    // retencję. Wtedy pytamy człowieka i dopiero po zgodzie ponawiamy —
    // to jedyne miejsce w programie, które kasuje dowody dostaw bezpowrotnie.
    let w = null;
    zajety(true);
    try {
      w = await API.post('/api/ustawienia', daneUstawien);
      komunikat('Zapisano', 'ok');
    } catch (e) {
      zajety(false);
      if (e.kod === 409 && await potwierdz('Na pewno skasować?', e.message)) {
        w = await sprobuj(() => API.post('/api/ustawienia',
          Object.assign({}, daneUstawien, { potwierdzam_kasowanie: true })), 'Zapisano');
      } else if (e.kod !== 409) {
        komunikat(poLudzku(e), 'blad');
      }
      zajety(true);
    } finally {
      zajety(false);
    }
    if (w) {
      if (zmienionoTunel(ustawienia)) {
        komunikat('Zamknij i uruchom program ponownie, żeby tunel się przestawił', 'ok');
      }
      wrocDoUstawien();
    }
  };
  // Kazda karta ma wlasny przycisk zapisu — inaczej trzeba by pamietac
  // o zjechaniu na sam gorny przycisk, a tego nikt nie robi.
  pole.querySelectorAll('.zapisz-ustawienia').forEach(p => p.onclick = zapiszWszystko);

  // Otwarte sekcje (także „Zaawansowane”) zostają otwarte po zapisie i po
  // każdym „Zrób kopię teraz”, „Sprawdź połączenie” — ekran rysuje się wtedy
  // od nowa i bez tego administrator lądował przed zwiniętym nagłówkiem.
  const otwarte = stan.otwarteUstawienia || (stan.otwarteUstawienia = new Set());
  pole.querySelectorAll('details[id]').forEach(d => {
    if (otwarte.has(d.id)) d.open = true;
    d.addEventListener('toggle', () => { if (d.open) otwarte.add(d.id); else otwarte.delete(d.id); });
  });
  if (param && param.sekcja) otworzSekcjeUstawien(pole, param.sekcja);
  pole.querySelectorAll('[data-do-ustawien]').forEach(e => e.onclick = () =>
    otworzSekcjeUstawien(pole, SEKCJA_ALARMU[e.dataset.doUstawien]));

  podepnijKopie(pole);

  // Karty techniczne są tylko na zakładce Ustawienia — na zakładce Konta tych przycisków nie ma.
  if (!naKontach) {
    // Przycisk najpierw zapisuje to, co wpisano w pola obok, a dopiero potem
    // pyta IKOL. Inaczej sprawdzalby dane z bazy, a nie te z ekranu — i mowilby
    // "nie podano loginu i hasla", mimo ze pola sa wypelnione.
    pole.querySelector('#u-ikol-sprawdz').onclick = async () => {
      const login = val('u-ikol-login');
      const haslo = val('u-ikol-haslo');
      if (!login) { komunikat('Wpisz login do IKOL-a', 'blad'); return; }
      if (!haslo && !ustawienia.ikol_ustawiony) {
        komunikat('Wpisz hasło do IKOL-a', 'blad');
        return;
      }
      const zapisane = await sprobuj(() => API.post('/api/ustawienia', {
        ikol_login: login,
        ikol_haslo: haslo,
        ikol_appkey: val('u-ikol-appkey'),
        ikol_wlaczony: document.getElementById('u-ikol-wlaczony').checked ? '1' : '',
      }));
      if (!zapisane) return;

      const w = await sprobuj(() => API.post('/api/ikol/sprawdz'));
      if (!w) { wrocDoUstawien(); return; }
      komunikat(`IKOL odpowiedział — znaleziono ${w.znaleziono} ${
        odmiana(w.znaleziono, 'lokalizator', 'lokalizatory', 'lokalizatorów')}`, 'ok');
      if (!document.getElementById('u-ikol-wlaczony').checked) {
        komunikat('Połączenie działa, ale pobieranie pozycji jest wyłączone — '
          + 'zaznacz „Pobieraj pozycje z IKOL-a”', 'blad');
      }
      wrocDoUstawien();
    };
    const pobierzTeraz = pole.querySelector('#u-ikol-pobierz');
    if (pobierzTeraz) pobierzTeraz.onclick = async () => {
      if (val('u-ikol-haslo')) {
        await sprobuj(() => API.post('/api/ustawienia', { ikol_haslo: val('u-ikol-haslo') }));
      }
      const w = await sprobuj(() => API.post('/api/ikol/pobierz'));
      if (w) komunikat(`Zapisano ${w.pobrano} ${
        odmiana(w.pobrano, 'pozycję', 'pozycje', 'pozycji')}`, 'ok');
    };
    const zapomnij = pole.querySelector('#u-ikol-zapomnij');
    if (zapomnij) zapomnij.onclick = async () => {
      if (!await potwierdz('Usunąć zapisane dane do IKOL-a?',
        'Program zapomni login, hasło i listę lokalizatorów. Pobieranie pozycji '
        + 'z IKOL-a przestanie działać, dopóki nie wpiszesz ich ponownie.')) return;
      const w = await sprobuj(() => API.post('/api/ikol/zapomnij'), 'Dane usunięte');
      if (w) wrocDoUstawien();
    };
    pole.querySelectorAll('[data-lokalizator]').forEach(b =>
      b.onclick = () => oknoLokalizatora(b.dataset.lokalizator));

    // GK Flota: jak przy IKOL-u — najpierw zapis tego, co wpisano obok,
    // dopiero potem pytanie, inaczej sprawdzalibysmy stary klucz z bazy.
    pole.querySelector('#u-flotex-sprawdz').onclick = async () => {
      if (!val('u-flotex-klucz') && !ustawienia.flotex_klucz_ustawiony) {
        komunikat('Wklej klucz z GK Flota (Ustawienia → Połączenie z GK Trasy)', 'blad');
        return;
      }
      const zapisane = await sprobuj(() => API.post('/api/ustawienia', {
        flotex_adres: val('u-flotex-adres'), flotex_klucz: val('u-flotex-klucz'),
      }));
      if (!zapisane) return;
      const w = await sprobuj(() => API.post('/api/flotex/sprawdz'));
      if (w) komunikat(w.komunikat, 'ok');
      wrocDoUstawien();
    };
    const flotexPonow = pole.querySelector('#u-flotex-ponow');
    if (flotexPonow) flotexPonow.onclick = async () => {
      const w = await sprobuj(() => API.post('/api/flotex/ponow'),
        'Wysyłam jeszcze raz — odśwież ekran za chwilę');
      if (w) setTimeout(() => { if (stan.ekran === 'ustawienia' || stan.ekran === 'administracja') wrocDoUstawien(); }, 2500);
    };
    const flotexOdlacz = pole.querySelector('#u-flotex-zapomnij');
    if (flotexOdlacz) flotexOdlacz.onclick = async () => {
      if (!await potwierdz('Odłączyć GK Trasy od GK Flota?',
        'GK Trasy zapomni klucz. Kierowcy stracą „Moje auto”, a raporty przestaną iść do '
        + 'GK Flota, dopóki nie wkleisz klucza ponownie.')) return;
      const w = await sprobuj(() => API.post('/api/flotex/zapomnij'), 'Odłączono');
      if (w) wrocDoUstawien();
    };
    const flotexImport = pole.querySelector('#u-flotex-import');
    if (flotexImport) flotexImport.onclick = async () => {
      const w = await sprobuj(() => API.post('/api/flotex/import-pojazdow'));
      if (!w) return;
      komunikat(w.dodane
        ? `Dodano ${w.dodane} ${odmiana(w.dodane, 'auto', 'auta', 'aut')} z GK Flota`
        : 'Wszystkie auta z GK Flota już są w programie GK Trasy', 'ok');
      wrocDoUstawien();
    };

    const kopiuj = pole.querySelector('#u-kopiuj-adres');
    if (kopiuj) kopiuj.onclick = () => {
      navigator.clipboard.writeText((ustawienia.tunel || {}).adres || '')
        .then(() => komunikat('Adres skopiowany — wyślij go kierowcom', 'ok'))
        .catch(() => komunikat('Skopiuj adres ręcznie', 'blad'));
    };
    pole.querySelectorAll('[data-przywroc]').forEach(b => b.onclick = () => {
      const klucz = b.dataset.przywroc;
      document.getElementById('u-' + klucz).value = (ustawienia.poczta_szablony_domyslne || {})[klucz] || '';
    });
    pole.querySelector('#u-poczta-test').onclick = async () => {
      const zapisane = await sprobuj(() => API.post('/api/ustawienia', {
        poczta_serwer: val('u-poczta-serwer'), poczta_port: val('u-poczta-port'),
        poczta_szyfrowanie: document.getElementById('u-poczta-szyfrowanie').value,
        poczta_nadawca: val('u-poczta-nadawca'), poczta_login: val('u-poczta-login'),
        poczta_haslo: val('u-poczta-haslo'), poczta_stopka: val('u-poczta-stopka'),
      }));
      if (!zapisane) return;
      okno({
        tytul: 'Wiadomość próbna',
        tresc: `<label>Wyślij na adres
            <input id="pt-adres" value="${escHtml(val('u-poczta-nadawca'))}"></label>
          <p class="male slaby">Sprawdź ustawienia zanim cokolwiek pójdzie do klienta.</p>`,
        przyciski: [
          { napis: 'Anuluj', klik: z => z() },
          { napis: 'Wyślij', klasa: 'glowny', klik: async z => {
            const w = await sprobuj(() => API.post('/api/poczta/test',
              { adres: val('pt-adres') }), 'Wysłane — sprawdź skrzynkę');
            if (w) { z(); wrocDoUstawien(); }
          } },
        ],
      });
    };
  }
  const noweKonto = pole.querySelector('#u-nowe-konto');
  if (noweKonto) noweKonto.onclick = () => oknoKonta_admin(null);
  podepnijKontaGK(pole, ustawienia);
  pole.querySelectorAll('[data-konto]').forEach(b =>
    b.onclick = () => oknoKonta_admin(u.find(x => x.id === Number(b.dataset.konto))));
  pole.querySelectorAll('[data-odblokuj]').forEach(b => b.onclick = async () => {
    const w = await sprobuj(() => API.post(`/api/uzytkownicy/${b.dataset.odblokuj}/odblokuj`),
      'Odblokowano');
    if (w) wrocDoUstawien();
  });
  if (!naKontach) {
    pole.querySelector('#u-nowy-bus').onclick = () => oknoBusa(null);
    pole.querySelectorAll('[data-bus]').forEach(b =>
      b.onclick = () => oknoBusa(stan.pojazdy.find(x => x.id === Number(b.dataset.bus))));
  }
}

/* Tabela kont administratora (dawniej karta „Konta” w Ustawieniach) — teraz zakładka Administracja → Konta. */
function kartaKontAdmina(ustawienia, u) {
  return `
      <div class="karta">
        <div class="karta-gora"><h2>Pracownicy</h2>
          ${!ustawienia.konta_z_panelu
            ? '<button class="maly glowny" id="u-nowe-konto">+ Dodaj osobę</button>'
            : kontaZespolu(ustawienia) ? '<button class="maly glowny" id="u-nowe-konto">+ Dodaj osobę</button>' : ''}</div>
        ${!ustawienia.konta_z_panelu ? '' : kontaZespolu(ustawienia) ? `<div class="wstega info">Kierowców
          i biuro zakładasz tutaj — konto powstaje w <b>Panelu Zarządczym GK</b>, jedno dla osoby
          we wszystkich aplikacjach GK. Kierowników, Menedżerów i osoby z innymi rolami zmienia się
          w <b>Panelu → Administracja</b>. Konta tutejsze (np. awaryjne „admin”) działają dalej.</div>`
          : `<div class="wstega info">Konta zakłada się teraz
          w <b>Panelu → Administracja</b> — jedno konto osoby we wszystkich
          aplikacjach GK. Tutaj ustawisz tylko bazę wyjazdową. Konta tutejsze (np. awaryjne
          „admin”) działają dalej.${(ustawienia.konta_zespolu || {}).powod === 'awaryjny'
            ? ' Kierowców i biuro może tu zakładać Szef Sprzedaży z kontem z Panelu — zaloguj się nim.' : ''}</div>`}
        ${wstegaLogowaniaZInternetu(ustawienia.logowanie_z_internetu)}
        <div class="tabela-przewijana"><table>
          <thead><tr><th>Imię</th><th>Login</th><th>Rola</th><th>Telefon</th><th></th></tr></thead>
          <tbody>${u.map(x => `<tr style="${x.aktywny ? '' : 'opacity:.5'}">
            <td><b>${escHtml(x.imie)}</b>${x.aktywny ? '' : ' <span class="male">(wyłączone)</span>'}
              ${x.zrodlo === 'gk' ? ' <span class="plakietka p-planowana">z Panelu</span>' : ''}
              ${x.zrodlo === 'gk' && x.pin_w_panelu && x.aktywny
                ? '<br><span class="male slaby">PIN do ustawienia w Panelu</span>' : ''}
              ${x.zrodlo === 'gk' && x.aktywny && (x.haslo_do_zmiany || x.pin_do_zmiany)
                ? `<br><span class="male slaby">${x.haslo_do_zmiany ? 'hasło startowe — ustawi przy pierwszym logowaniu'
                  : 'PIN startowy 1234 — ustawi nowy przy logowaniu'}</span>` : ''}
              ${opisBlokadyZInternetu(x.z_internetu)}</td>
            <td>${escHtml(x.login)}</td>
            <td>${escHtml(nazwaRoliKonta(x))}${x.baza_nazwa
                  ? `<br><span class="male slaby">${ikonka('fabryka')}${escHtml(x.baza_nazwa)}</span>` : ''}</td>
            <td>${escHtml(x.telefon || '')}</td>
            <td><div class="przyciski"><button class="maly" data-konto="${x.id}">${ikonka('edytuj')}Zmień</button>
              ${(x.z_internetu || {}).blokada
                ? `<button class="maly glowny" data-odblokuj="${x.id}">Odblokuj</button>` : ''}</div></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>`;
}

/* ===================================================== ADMINISTRACJA (administrator)

   Jedna pozycja menu administratora, wszędzie ta sama nazwa i ikona (STYL-GK §8), a w środku zakładki-pigułki jak w Panelu
   Kierownika → Administracja: Konta · Dane i czyszczenie · Kody QR · Ustawienia. To jest nowe WEJŚCIE do istniejących
   funkcji, nie nowe funkcje: Konta i Ustawienia rysuje ten sam kod co dotąd (rysujUstawieniaAdmina), czyszczenie tras to
   to samo okno (oknoCzyszczeniaTras, /api/czyszczenie-tras), kody QR — to samo okno co w „Moje konto”. Stare wejścia
   (#ustawienia, wstęgi alarmów) trafiają tu przez pokazEkran. Biuro nie ma tego ekranu — ma swoje „Ustawienia firmy”. */
const ZAKLADKI_ADMINISTRACJI = [
  { id: 'konta', napis: 'Pracownicy' },
  { id: 'dane', napis: 'Dane i czyszczenie' },
  { id: 'kody', napis: 'Kody QR' },
  // Unifikacja E7 (2026-11-23): „Role i uprawnienia” jako chip-drzwi administratora (jak w Panelu) — otwiera to samo okno co „Moje konto”.
  { id: 'role', napis: 'Role i uprawnienia', drzwi: true },
  { id: 'ustawienia', napis: 'Ustawienia' },
  // E6 (2026-11-24): dawne pozycje menu — chipy-drzwi do tych samych ekranów (widzi je całe biuro, jak dotąd).
  { id: 'lokalizacje', napis: 'Miejsca wyjazdu', drzwi: true, ekran: 'lokalizacje' },
  { id: 'zaproszenie', napis: 'Zaproś kierowcę', drzwi: true, ekran: 'zaproszenie' },
];

function kartaKodowQRAdmina() {
  return `<div class="karta" id="a-kody-qr-karta">
    <h2>Kody QR aplikacji</h2>
    <p class="male slaby">Kody do zeskanowania aparatem telefonu: aplikacje hali, Panel Zarządczy SP i GK Flota, z drukiem arkusza A4.
      To samo okno co w „Moje konto” — tu jest na wierzchu.</p>
    ${maKodyQR()
      ? `<div class="przyciski"><button class="glowny" id="a-kody-qr">${napisKodowQR()}</button></div>`
      : `<div class="wstega info">Kody QR są dla kont z Panelu Zarządczego GK. Zalogowano kontem awaryjnym tego programu —
          zaloguj się swoim kontem z Panelu (imię i nazwisko), żeby je zobaczyć.</div>`}
  </div>`;
}

EKRANY.administracja = {
  tytul: 'Administracja',
  tylkoAdministrator: true,
  async rysuj(pole, param) {
    const zakladka = ZAKLADKI_ADMINISTRACJI.some(z => !z.drzwi && z.id === (param || {}).zakladka) ? param.zakladka : 'konta';
    stan.adminZakladka = zakladka;
    pole.innerHTML = `<div class="chipy" role="tablist" aria-label="Administracja">
        ${ZAKLADKI_ADMINISTRACJI.map(z => `<button type="button" class="chip ${z.id === zakladka ? 'wybrany' : ''}"
          role="tab" aria-selected="${z.id === zakladka}" data-zakladka="${z.id}">${z.napis}</button>`).join('')}
      </div>
      <div id="admin-tresc"><div class="pusto">Wczytuję…</div></div>`;
    pole.querySelectorAll('[data-zakladka]').forEach(b =>
      b.onclick = () => {
        const drzwi = ZAKLADKI_ADMINISTRACJI.find(z => z.id === b.dataset.zakladka && z.ekran);
        if (drzwi) { pokazEkran(drzwi.ekran); return; }
        if (b.dataset.zakladka === 'role') {       // drzwi: okno, bez zmiany zakładki; „Wróć” i zamknięcie zostają na tej samej zakładce
          otworzRole(() => pokazEkran('administracja', { zakladka: stan.adminZakladka })).catch(e => komunikat(poLudzku(e), 'blad'));
          return;
        }
        if (b.dataset.zakladka !== stan.adminZakladka) pokazEkran('administracja', { zakladka: b.dataset.zakladka });
      });
    const tresc = pole.querySelector('#admin-tresc');
    if (zakladka === 'dane') {
      tresc.innerHTML = kartaCzyszczeniaTras();
      podepnijCzyszczenieTras(tresc);
    } else if (zakladka === 'kody') {
      tresc.innerHTML = kartaKodowQRAdmina();
      const b = tresc.querySelector('#a-kody-qr');
      if (b) b.onclick = oknoKodowAplikacji;
    } else {
      await rysujUstawieniaAdmina(tresc, param || {}, zakladka);
    }
  },
};


/* Logowanie z internetu (tunel): po 10 złych PIN-ach w 15 min konto czeka minutę
   (od 2026-11-03 nie ma już blokady do „Odblokuj”; dawne wpisy blokad dobowych
   serwer ignoruje, a poniższe opisy stanu zostają dla zgodności). Z firmowego
   wifi ta osoba wchodzi cały czas. */
function opisBlokadyZInternetu(s) {
  s = s || {};
  const godzina = String(s.do || '').slice(11, 16);
  let wynik = '';
  if (s.blokada === 'zablokowane') {
    wynik = `<br><span class="plakietka p-nieudane">zablokowane z internetu</span>
      <span class="male slaby">do odblokowania (najpóźniej ${escHtml(czasNaEkran(s.do))})</span>`;
  } else if (s.blokada === 'czeka') {
    wynik = `<br><span class="plakietka p-oczekuje">z internetu czeka do ${escHtml(godzina)}</span>`;
  }
  if (s.zle_godzina) {
    wynik += `<br><span class="male slaby">złe PIN-y z internetu w ostatniej godzinie: ${Number(s.zle_godzina)}</span>`;
  }
  return wynik;
}

function wstegaLogowaniaZInternetu(s) {
  if (!s) return '';
  const zablokowane = (s.zablokowane || []).filter(x => x.blokada === 'zablokowane');
  const zle = Number(s.zle_godzina || 0);
  if (!zablokowane.length && !zle) return '';
  return `<div class="wstega ${zablokowane.length ? 'blad' : 'uwaga'}">
    Złe PIN-y z internetu w ostatniej godzinie: <b>${zle}</b>.
    ${zablokowane.length ? `Zablokowane z internetu: <b>${zablokowane.map(x => escHtml(x.imie)).join(', ')}</b>
      — z firmowego wifi wchodzą normalnie; „Odblokuj” przy koncie zdejmuje blokadę.` : ''}</div>`;
}

/* D49 (GK-KONTA.md §3.5): zalogowany administrator ma konto z Panelu i połączenie
   z Panelem działa — wtedy kierowców i biuro zakłada i zmienia tutaj (przez hub). */
function kontaZespolu(ustawienia) {
  return !!((ustawienia || stan.ustawienia || {}).konta_zespolu || {}).mozna;
}

function oknoKonta_admin(k) {
  const nowe = !k;
  const zespol = kontaZespolu();
  // Nowe konto przy działającym Panelu i konto z Panelu, które Panel pozwala zmienić
  // w programie (same role GK Trasy) — formularz konta GK, zapis przez hub.
  if (zespol && (nowe || (k.zrodlo === 'gk' && k.edycja_w_programie))) return oknoKontaZespolu(k);
  k = k || { imie: '', login: '', rola: 'kierowca', telefon: '', aktywny: 1 };
  // Konto z Panelu: imię, rolę, telefon, PIN i aktywność prowadzi Panel →
  // Administracja. Pola są widoczne, ale zablokowane — tutaj tylko baza wyjazdowa.
  const zPanelu = !nowe && k.zrodlo === 'gk' && !!(stan.ustawienia || {}).konta_z_panelu;
  const blok = zPanelu ? 'disabled' : '';
  okno({
    tytul: nowe ? 'Dodaj osobę' : 'Konto: ' + k.imie,
    tresc: `
      ${zPanelu ? `<div class="wstega info">Konto z Panelu Zarządczego GK. Imię, rolę,
        telefon, PIN i wyłączenie konta zmienia się w <b>Panelu → Administracja</b>.${zespol
          ? ' Ta osoba ma też role spoza Panelu Zarządczego SP (np. kierownik albo Menedżer) — dlatego nie tutaj.' : ''}</div>` : ''}
      <label>Imię i nazwisko<input id="ko-imie" value="${escHtml(k.imie)}" autocapitalize="words" ${blok}></label>
      <label>Login ${nowe ? '' : '<span class="slaby">(nie da się zmienić)</span>'}
        <input id="ko-login" value="${escHtml(k.login)}" ${nowe ? '' : 'disabled'}
               autocapitalize="none" placeholder="np. marek"></label>
      <label>Rola
        <select id="ko-rola" ${blok}>
          <option value="kierowca" ${k.rola === 'kierowca' ? 'selected' : ''}>Kierowca GK Trasy — tylko swoje trasy i swój raport pracy</option>
          <option value="biuro" ${k.rola === 'biuro' ? 'selected' : ''}>Biuro — cała codzienna robota, bez Ustawień i kont</option>
          <option value="admin" ${k.rola === 'admin' ? 'selected' : ''}>Szef Sprzedaży — to co biuro, plus konta i Ustawienia</option>
          <option value="podglad" ${k.rola === 'podglad' ? 'selected' : ''}>Podgląd — tylko ogląda plan, niczego nie zmienia</option>
        </select></label>
      <div class="male slaby" style="margin:-4px 0 10px">
        Biuro widzi trasy, klientów, dowody dostaw, ślady GPS i raporty pracy — może więc
        sprawdzać kierowców. Nie wejdzie do Ustawień, nie założy konta i nie skasuje
        klienta ani trasy.</div>
      <label>Telefon<input id="ko-telefon" value="${escHtml(k.telefon || '')}" inputmode="tel" ${blok}></label>
      <label>Domyślna baza wyjazdowa
        <select id="ko-baza">
          <option value="">— domyślne miejsce wyjazdu —</option>
          ${(stan.lokalizacje || []).map(l =>
            `<option value="${l.id}" ${k.baza === l.id ? 'selected' : ''}>${escHtml(l.nazwa)}</option>`).join('')}
        </select></label>
      <p class="male slaby" style="margin:-4px 0 10px">Stąd program liczy kilometry i czas
        tras tego kierowcy, jeśli na samej trasie nie wskazano innego miejsca.</p>
      ${zPanelu ? '' : `<label>${nowe ? 'PIN kierowcy (4 cyfry) albo hasło biura i Podglądu (min. 8 znaków)'
          : 'Nowy PIN / hasło — zostaw puste, żeby nie zmieniać'}
        <input id="ko-pin" type="text" autocomplete="off"></label>`}
      ${nowe ? '' : `<label class="plaska"><input type="checkbox" id="ko-aktywny" ${k.aktywny ? 'checked' : ''} ${blok}>
        Konto aktywne</label>
        <p class="male slaby">Zmiana PIN-u wylogowuje tę osobę ze wszystkich urządzeń.</p>`}`,
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Zapisz', klasa: 'glowny', klik: async z => {
        const dane = {
          id: k.id, imie: val('ko-imie'), login: val('ko-login'),
          rola: document.getElementById('ko-rola').value, telefon: val('ko-telefon'),
          pin: zPanelu ? '' : val('ko-pin'),
          aktywny: nowe ? 1 : (document.getElementById('ko-aktywny').checked ? 1 : 0),
        };
        dane.baza = (document.getElementById('ko-baza') || {}).value || null;
        const w = await sprobuj(() => API.post('/api/uzytkownicy', dane), 'Zapisano');
        if (w) { stan.kierowcy = null; z(); wrocDoUstawien(); }
      } },
    ],
  });
}

/* Konto kierowcy albo biura zakładane i zmieniane przez Panel (D49, GK-KONTA.md §3.5).
   Tylko imię i nazwisko, role, telefon i aktywność — żadnego pola hasła ani PIN-u:
   nowa osoba dostaje w Panelu hasło startowe haslo123, a „Ustaw hasło startowe”
   i „Resetuj PIN” to te same przyciski co w Panelu. Usunięcia nie ma (tylko
   administrator Panelu) — tutaj konto się wyłącza. Baza wyjazdowa jest tylko nasza. */
function oknoKontaZespolu(k) {
  const nowe = !k;
  k = k || { imie: '', telefon: '', aktywny: 1, role_zespolu: ['trasy_kierowca'] };
  const role = (stan.ustawienia.konta_zespolu || {}).role
    || [{ kod: 'trasy_kierowca', nazwa: 'Kierowca GK Trasy' }, { kod: 'trasy_biuro', nazwa: 'Biuro' },
        { kod: 'trasy_podglad', nazwa: 'Podgląd' }];
  const opisRoli = {
    trasy_kierowca: 'swoje trasy i raport pracy',
    trasy_biuro: 'cała codzienna robota, bez Ustawień i kont',
    trasy_podglad: 'tylko ogląda plan tras (Pulpit i Trasy), niczego nie zmienia',
  };
  const zaznaczone = new Set(k.role_zespolu || []);
  const imie = escHtml(k.imie || '');
  okno({
    tytul: nowe ? 'Dodaj osobę' : 'Konto: ' + k.imie,
    tresc: `
      <div class="wstega info">${nowe
        ? 'Konto powstaje w Panelu Zarządczym GK — to samo we wszystkich aplikacjach GK.'
        : 'Konto z Panelu — zmiana zapisuje się w Panelu i we wszystkich aplikacjach GK.'}</div>
      <div class="wstega blad" id="kz-blad" hidden></div>
      <label>Imię i nazwisko<input id="kz-imie" value="${imie}" autocapitalize="words"
             autocomplete="off" placeholder="np. Jan Kowalski"></label>
      <fieldset class="role-zespolu"><legend>Rola</legend>
        ${role.map(r => `<label class="plaska" style="align-items:flex-start"><input type="checkbox"
            style="margin-top:2px" data-rola-zespolu="${escHtml(r.kod)}"
            ${zaznaczone.has(r.kod) ? 'checked' : ''}> <span><b>${escHtml(r.nazwa)}</b>${opisRoli[r.kod]
              ? ` <span class="slaby">— ${opisRoli[r.kod]}</span>` : ''}</span></label>`).join('')}
      </fieldset>
      <label>Telefon<input id="kz-telefon" value="${escHtml(k.telefon || '')}" inputmode="tel"
             autocomplete="off" placeholder="np. 600 100 200"></label>
      <label>Domyślna baza wyjazdowa
        <select id="kz-baza">
          <option value="">— domyślne miejsce wyjazdu —</option>
          ${(stan.lokalizacje || []).map(l =>
            `<option value="${l.id}" ${k.baza === l.id ? 'selected' : ''}>${escHtml(l.nazwa)}</option>`).join('')}
        </select></label>
      ${nowe ? `<p class="male slaby">Hasło startowe: <b>haslo123</b> — przy pierwszym logowaniu osoba
          ustawi własne hasło i PIN.</p>`
        : `<label class="plaska"><input type="checkbox" id="kz-aktywny" ${k.aktywny ? 'checked' : ''}>
          Konto aktywne</label>
        <p class="male slaby" style="margin:-4px 0 12px">Usuwa Menedżer w Panelu → Administracja —
          tu możesz wyłączyć konto.</p>
        <fieldset><legend>Hasło i PIN</legend>
          <p class="male slaby" style="margin:0 0 10px">Nikt nie zna niczyjego hasła ani PIN-u — możesz tylko
            przywrócić startowe. Osoba ustawi własne przy następnym logowaniu.</p>
          <div class="przyciski-konta">
            <button type="button" data-akcja-konta="resetuj_konto" title="Hasło haslo123 i PIN 1234 — osoba ustawi nowe przy logowaniu">Resetuj hasło</button>
            <button type="button" data-akcja-konta="haslo_startowe">Ustaw hasło startowe</button>
            <button type="button" data-akcja-konta="resetuj_pin">Resetuj PIN</button>
            <button type="button" data-akcja-konta="wyloguj_wszedzie">Wyloguj wszędzie</button>
          </div>
        </fieldset>`}`,
    poOtwarciu: pole => {
      const pokazBlad = tekst => {
        const b = pole.querySelector('#kz-blad');
        if (!b) return;
        b.textContent = tekst || '';
        b.hidden = !tekst;
        if (tekst) b.scrollIntoView({ block: 'nearest' });
      };
      // Pytania jak w Panelu → Administracja: kto co dostanie i co przepada.
      const PYTANIA = {
        haslo_startowe: [`Ustawić hasło startowe?`,
          `${k.imie} dostanie hasło „haslo123”, PIN zostanie skasowany, a wszystkie urządzenia wylogowane. `
          + 'Przy pierwszym logowaniu ustawi nowe hasło i PIN.', 'Ustaw hasło startowe'],
        resetuj_konto: [`Zresetować hasło i PIN?`,
          `${k.imie} dostanie hasło „haslo123” i PIN 1234, wszystkie urządzenia zostaną wylogowane, `
          + 'a blokada logowania w systemie zdjęta. Przy logowaniu ustawi nowe.', 'Resetuj hasło'],
        resetuj_pin: [`Zresetować PIN?`,
          `${k.imie} dostanie PIN startowy 1234 — przy pierwszym logowaniu ustawi nowy. Hasło się nie zmienia.`,
          'Resetuj PIN'],
        wyloguj_wszedzie: [`Wylogować wszędzie?`,
          `Wszystkie urządzenia osoby ${k.imie} (Panel Zarządczy SP i inne aplikacje GK) zostaną wylogowane — `
          + 'następne logowanie hasłem.',
          'Wyloguj wszędzie'],
      };
      pole.querySelectorAll('[data-akcja-konta]').forEach(b => b.onclick = async () => {
        const akcja = b.dataset.akcjaKonta;
        const [pytanie, opis, tak] = PYTANIA[akcja];
        if (!await potwierdz(pytanie, opis, { tak, nie: 'Anuluj' })) return;
        pokazBlad('');
        try {
          zajety(true);
          const w = await API.post('/api/konta-gk/osoba', { akcja, id: k.id });
          komunikat(akcja === 'resetuj_konto' ? `${k.imie}: hasło „haslo123” i PIN 1234 — przy logowaniu ustawi nowe.`
            : akcja === 'resetuj_pin' ? `PIN startowy ${w.pin || '1234'} — ${k.imie} ustawi nowy przy logowaniu`
            : akcja === 'haslo_startowe' ? `Hasło startowe haslo123 — ${k.imie} ustawi nowe przy logowaniu`
              : `Wylogowano ${k.imie} ze wszystkich urządzeń`, 'ok');
          if (w.uwaga) komunikat(w.uwaga, 'blad');
          zamknijOkno();
          wrocDoUstawien();
        } catch (e) {
          pokazBlad(poLudzku(e));
        } finally {
          zajety(false);
        }
      });
    },
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: nowe ? 'Dodaj osobę' : 'Zapisz', klasa: 'glowny', klik: async z => {
        const pole = document.getElementById('okno-tresc');
        const blad = pole.querySelector('#kz-blad');
        const pokazBlad = tekst => { blad.textContent = tekst; blad.hidden = !tekst; };
        const wybrane = [...pole.querySelectorAll('[data-rola-zespolu]')]
          .filter(x => x.checked).map(x => x.dataset.rolaZespolu);
        const dane = {
          akcja: 'zapisz', id: k.id, nazwa: val('kz-imie'), role: wybrane, telefon: val('kz-telefon'),
          baza: (document.getElementById('kz-baza') || {}).value || null,
        };
        if (!dane.nazwa) { pokazBlad('Podaj imię i nazwisko.'); return; }
        if (!wybrane.length) { pokazBlad('Zaznacz rolę: Kierowca GK Trasy albo Biuro.'); return; }
        if (!nowe) dane.aktywny = document.getElementById('kz-aktywny').checked;
        // Zmieniona sama baza wyjazdowa — Panel nie ma tu nic do zapisania.
        const tylkoBaza = !nowe && dane.nazwa === k.imie && dane.telefon === (k.telefon || '')
          && dane.aktywny === !!k.aktywny
          && wybrane.slice().sort().join() === (k.role_zespolu || []).slice().sort().join();
        pokazBlad('');
        try {
          zajety(true);
          const w = tylkoBaza
            ? await API.post('/api/uzytkownicy', { id: k.id, imie: k.imie, login: k.login, rola: k.rola,
              telefon: k.telefon || '', aktywny: k.aktywny ? 1 : 0, baza: dane.baza })
            : await API.post('/api/konta-gk/osoba', dane);
          komunikat(nowe ? `Dodano konto ${dane.nazwa} — hasło startowe haslo123` : 'Zapisano', 'ok');
          if (w && w.uwaga) komunikat(w.uwaga, 'blad');
          stan.kierowcy = null;
          z();
          wrocDoUstawien();
        } catch (e) {
          pokazBlad(poLudzku(e));
        } finally {
          zajety(false);
        }
      } },
    ],
  });
}

function oknoBusa(b) {
  const nowy = !b;
  b = b || { nazwa: '', rejestracja: '', uwagi: '', aktywny: 1, czas_pracy: 1 };
  okno({
    szkic: 'auto-' + (nowy ? 'nowe' : b.id),
    tytul: nowy ? 'Nowe auto' : b.nazwa,
    tresc: `
      <label>Nazwa <span class="slaby">(np. „Ducato”, „Auto 1”)</span>
        <input id="bu-nazwa" value="${escHtml(b.nazwa)}"></label>
      <label>Rejestracja<input id="bu-rej" value="${escHtml(b.rejestracja || '')}"></label>
      <label>Rodzaj auta
        <select id="bu-typ">
          ${[['osobowe', 'Osobowe'], ['dostawcze', 'Dostawcze'], ['ciezarowe', 'Ciężarowe']].map(([k, n]) =>
            `<option value="${k}" ${(b.typ || 'osobowe') === k ? 'selected' : ''}>${n}</option>`).join('')}
        </select></label>
      <div id="bu-wymiary" ${b.typ === 'ciezarowe' ? '' : 'class="ukryty"'}>
        <p class="male slaby" style="margin:0 0 8px">Trasy tego auta liczymy dla ciężarówki. Wymiary nie są obowiązkowe —
          z nimi mapa omija miejsca, w których auto się nie zmieści (niskie wiadukty, mosty z limitem masy).</p>
        <div class="dwie">
          ${[['bu-wys', 'wys_m', 'Wysokość (m)'], ['bu-masa', 'masa_t', 'Masa całkowita (t)'],
             ['bu-dlug', 'dlug_m', 'Długość (m)'], ['bu-szer', 'szer_m', 'Szerokość (m)'],
             ['bu-os', 'os_t', 'Nacisk na oś (t)']].map(([id, pole, n]) =>
            `<label>${n}<input id="${id}" inputmode="decimal" value="${b[pole] != null ? escHtml(String(b[pole]).replace('.', ',')) : ''}"></label>`).join('')}
        </div>
      </div>
      <label>Uwagi<textarea id="bu-uwagi">${escHtml(b.uwagi || '')}</textarea></label>
      <label class="plaska"><input type="checkbox" id="bu-czas-pracy"
        ${b.czas_pracy == null || Number(b.czas_pracy) ? 'checked' : ''}>
        Doliczaj przerwy kierowcy do tras tego auta</label>
      <p class="male slaby" style="margin:-4px 0 10px">Odznacz tam, gdzie przerwy
        nie mają sensu — np. przy osobówce na krótkich kursach. Inaczej każda jej
        trasa wyjdzie dłuższa, niż wychodzi naprawdę.</p>
      ${nowy ? '' : `<label class="plaska"><input type="checkbox" id="bu-aktywny" ${b.aktywny ? 'checked' : ''}>
        Auto w użyciu</label>`}`,
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Zapisz', klasa: 'glowny', klik: async z => {
        const dane = {
          id: b.id, nazwa: val('bu-nazwa'), rejestracja: val('bu-rej'), uwagi: val('bu-uwagi'),
          aktywny: nowy ? 1 : (document.getElementById('bu-aktywny').checked ? 1 : 0),
          czas_pracy: document.getElementById('bu-czas-pracy').checked ? 1 : 0,
          typ: val('bu-typ'), wys_m: val('bu-wys'), masa_t: val('bu-masa'), dlug_m: val('bu-dlug'),
          szer_m: val('bu-szer'), os_t: val('bu-os'),
        };
        // Edycja istniejącego auta może poczekać w komputerze; nowe auto — nie (numer nadaje program).
        const w = await sprobuj(() => nowy ? API.post('/api/pojazdy', dane)
          : zapisBiura('POST', '/api/pojazdy', dane, {
            opis: 'auto „' + dane.nazwa + '”', zrodla: ['/api/pojazdy'],
            popraw: (sciezka, d) => { if (sciezka === '/api/pojazdy') wPamieci(d, b.id, x => Object.assign(x, dane)); },
          }), 'Zapisano');
        if (w) { _autaDoFiltra = null; z(); wrocDoUstawien(); }
      } },
    ],
    poOtwarciu: pole => {
      const typ = pole.querySelector('#bu-typ');
      typ.onchange = () => pole.querySelector('#bu-wymiary').classList.toggle('ukryty', typ.value !== 'ciezarowe');
    },
  });
}


/* --------------------------------------------- alarmy dla administratora */

/* Wstęgi alarmów (ETAP 2): kopia, adres na Pages (wpisuje go hub), tunel, dysk.
   Klikalne — na pulpicie prowadzą do Ustawień, w Ustawieniach otwierają
   sekcję pod „Zaawansowane”, która alarm naprawia (data-do-ustawien = kod). */
function wstegiAlarmow(alarmy, doUstawien) {
  return (alarmy || []).map(a => `<div class="wstega ${a.poziom === 'blad' ? 'blad' : 'uwaga'}"
      style="margin-bottom:10px${doUstawien ? ';cursor:pointer' : ''}"
      ${doUstawien ? `data-do-ustawien="${escHtml(a.kod || '')}"` : ''}>
      <b>${ikonka('ostrzezenie')}${escHtml(a.tytul)}</b><br><span class="male">${escHtml(a.tresc)}</span></div>`).join('');
}


/* ------------------------------------------------------- kopie zapasowe */

function rozmiarCzytelnie(bajty) {
  const b = Number(bajty) || 0;
  if (b >= 1024 * 1024 * 1024) return (b / 1024 / 1024 / 1024).toFixed(1) + ' GB';
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB';
  return Math.max(1, Math.round(b / 1024)) + ' KB';
}

function kartaKopii(u) {
  const k = u.kopie || {};
  const l = k.lokalne || {};
  const kiedy = t => escHtml(czasNaEkran(t));
  const plakietka = !k.folder ? '<span class="plakietka p-oczekuje">tylko na tym dysku</span>'
    : (k.blad ? ('<span class="plakietka p-nieudane">' + ikonka('zamknij') + 'błąd</span>')
      : k.ostatnia_udana ? ('<span class="plakietka p-dostarczone">' + ikonka('haczyk') + 'działa</span>')
        : '<span class="plakietka p-w_toku">czeka na pierwszą kopię</span>');
  const stare = l.stare_archiwum || {};
  return zwin('Kopie zapasowe', plakietka, `
    <p class="male slaby">Program sam robi kopię raz na dobę: bazę i wszystkie zdjęcia
      i podpisy. Folder <code>kopie/</code> obok programu chroni przed pomyłką, ale leży na tym
      samym dysku — dlatego druga kopia idzie <b>poza ten komputer</b>.</p>

    ${k.blad ? `<div class="wstega blad">Ostatnia kopia poza komputerem (${kiedy(k.blad_kiedy)})
        nie udała się: ${escHtml(k.blad)}</div>` : ''}
    ${k.ten_sam_dysk ? `<div class="wstega uwaga">Ten folder leży na tym samym dysku co program.
        Ma to sens tylko wtedy, gdy to folder OneDrive (albo inny synchronizowany z chmurą) —
        zwykły folder na tym dysku przepadnie razem z nim.</div>` : ''}
    ${(k.pominiete || []).length ? `<div class="wstega uwaga">W folderze kopii są starsze, pełniejsze
        archiwa zdjęć niż tutaj (${escHtml(k.pominiete.join(', '))}) — zostawiam je bez zmian.
        To normalne po przeniesieniu programu na nowy komputer; brakujące zdjęcia przywróci
        <code>--przywroc</code> (instrukcja, punkt 15).</div>` : ''}
    ${l.blad ? `<div class="wstega blad">${escHtml(l.blad)}</div>` : ''}
    ${(l.uszkodzone || []).map(x => `<div class="wstega uwaga">${escHtml(x)}
        <span class="slaby">(${kiedy(l.uszkodzone_kiedy)})</span></div>`).join('')}
    ${stare.uszkodzone ? `<div class="wstega uwaga">Stare archiwum <code>kopie/pliki.zip</code>
        (sprzed podziału na miesiące) jest uszkodzone. Nowe kopie idą do archiwów miesięcznych
        i to im nie przeszkadza — stary plik możesz skasować.</div>` : ''}
    ${stare.nazwa && !stare.uszkodzone && Number(u.retencja_zalacznikow_mies) > 0
      ? `<div class="wstega uwaga">Stare archiwum <code>kopie/pliki.zip</code> nie podlega
        retencji — trzyma podpisy starsze niż ustawiony okres. Wszystko, co program jeszcze
        przechowuje, jest już w archiwach miesięcznych, więc ten plik możesz skasować.</div>` : ''}

    <table class="male" style="margin-bottom:10px">
      <tr><td class="slaby">Ostatnia kopia poza komputerem</td>
          <td><b>${k.ostatnia_udana ? kiedy(k.ostatnia_udana) : (k.folder ? 'jeszcze żadna' : '—')}</b>${
            k.plik ? ` · <code>${escHtml(k.plik)}</code> (${rozmiarCzytelnie(k.rozmiar)})` : ''}</td></tr>
      <tr><td class="slaby">Kopia w folderze kopie/</td>
          <td>${l.kiedy ? kiedy(l.kiedy) : '—'}${(l.archiwa || []).length
            ? ` · archiwa zdjęć: ${l.archiwa.length}` : ''}</td></tr>
    </table>

    <label>Folder kopii poza komputerem
      <input id="u-kopia-folder" value="${escHtml(k.folder || '')}" autocapitalize="none"
             placeholder="np. E:\\GK-kopie albo C:\\Users\\biuro\\OneDrive\\GK-kopie"></label>
    <div class="male slaby">Drugi dysk, pendrive na stałe w komputerze albo folder OneDrive.
      <b>Tylko na kopie — nigdy nie przenoś tam samego programu ani żywej bazy</b>
      (synchronizacja w chmurze psuje otwartą bazę). Kopie idą do podfolderu
      <code>GK-Trasy</code> (baza i pliki — jak w Panelu i GK Flota). Trzymamy 7 kopii dziennych,
      4 tygodniowe i 12 miesięcznych. W kopii nie ma haseł ani kluczy (tokeny GitHuba
      i tunelu, klucze GK Flota i Panelu, hasła poczty i IKOL-a) — po przywróceniu wpisuje
      się je od nowa.</div>

    <div class="przyciski" style="margin-top:12px">
      <button class="glowny zapisz-ustawienia">Zapisz ustawienia</button>
      <button id="u-kopia-teraz">Zrób kopię teraz</button>
    </div>
    <p class="male slaby" style="margin-top:8px">Brak udanej kopii przez ponad dobę albo
      niedostępny folder włącza alarm: wstęgę na pulpicie i powiadomienie na telefonie
      administratora (najwyżej raz na 6 godzin). Jak przywrócić dane z kopii — instrukcja,
      punkt 15.</p>`, 'u-kopie');
}

/* Czyszczenie tras (administrator, 2026-11-04): jak „Czyszczenie zleceń” w Panelu Zarządczym GK — wybór konkretnych tras
   z listy i usunięcie ich na stałe (z punktami, zdjęciami i podpisami). Serwer przed usunięciem robi kopię bazy. */
function kartaCzyszczeniaTras() {
  // Zakładka Administracja → Dane i czyszczenie: przycisk na wierzchu (nie w zwijanej sekcji pod „Zaawansowane”).
  return `<div class="karta" id="u-czyszczenie-tras">
    <h2>Czyszczenie tras</h2>
    <p class="male slaby">Usuwa wybrane trasy <b>na stałe</b> — razem z punktami, zdjęciami i podpisami.</p>
    <ul class="male slaby" style="margin:6px 0 12px;padding-left:20px">
      <li>Przed usunięciem program robi pełną kopię bazy w folderze <code>kopie/</code> i trzyma ją 30 dni.</li>
      <li><b>Kopia bazy nie zawiera zdjęć ani podpisów.</b> Usunięte pliki znikają też z archiwów zdjęć (<code>kopie/pliki-*.zip</code>)
        i z kopii poza komputerem — nie da się ich odzyskać.</li>
      <li>Zwykłe „Usuń trasę” przy trasie dalej tylko odwołuje trasy, które już ruszyły.</li>
    </ul>
    <div class="przyciski"><button class="glowny" id="u-czysc-wybierz">Wybierz trasy do usunięcia…</button></div>
  </div>`;
}

function podepnijCzyszczenieTras(pole) {
  const b = pole.querySelector('#u-czysc-wybierz');
  if (!b) return;
  b.onclick = async () => {
    const w = await sprobuj(() => API.post('/api/czyszczenie-tras', { lista: true }));
    if (w) oknoCzyszczeniaTras(w.trasy || [], !!w.ucieto);
  };
}

function oknoCzyszczeniaTras(trasy, ucieto) {
  const wiersz = t => `<label class="plaska" style="display:flex;gap:8px;align-items:flex-start;padding:4px 0">
      <input type="checkbox" data-trasa="${t.id}"> <span>${escHtml(t.data)} · ${escHtml(t.nazwa || 'bez nazwy')}
      <span class="slaby">· ${escHtml(t.kierowca_imie || 'bez kierowcy')} · ${t.ile_punktow} pkt · ${escHtml(etykietaStatusuTrasy(t.status))}</span></span></label>`;
  okno({
    tytul: 'Czyszczenie tras',
    szerokie: true,
    tresc: trasy.length
      ? `<label class="plaska"><input type="checkbox" id="cz-wszystkie"> <b>Zaznacz wszystkie (${trasy.length})</b></label>
         <div style="max-height:50vh;overflow:auto">${trasy.map(wiersz).join('')}</div>
         ${ucieto ? '<p class="male slaby">Pokazuję 500 najnowszych tras.</p>' : ''}`
      : '<p class="slaby">Nie ma tras do wyboru.</p>',
    przyciski: [
      { napis: 'Zamknij', klik: z => z() },
      ...(trasy.length ? [{ napis: 'Usuń zaznaczone', klasa: 'czerwony', klik: async z => {
        const ids = [...document.querySelectorAll('#okno-tresc [data-trasa]:checked')].map(x => Number(x.dataset.trasa));
        if (!ids.length) { komunikat('Zaznacz trasy do usunięcia', 'blad'); return; }
        if (!await potwierdz('Usunąć zaznaczone trasy?', `${ids.length} tras zniknie na stałe, razem ze zdjęciami i podpisami. Pliki znikną też z archiwów zdjęć w folderze kopie/ i z kopii poza komputerem; kopia bazy ich nie zawiera, więc nie wrócą. Program najpierw robi pełną kopię bazy (trzyma ją 30 dni).`, { tak: 'Usuń', groznie: true })) return;
        const w = await sprobuj(() => API.post('/api/czyszczenie-tras', { ids, potwierdz: true }));
        if (w) {
          z();
          const a = w.archiwa || {};
          // Dysk poza komputerem niedostępny albo kopia w toku: program dokończy oczyszczanie przy najbliższej kopii.
          const dopisek = (a.oczekuje || a.zewnetrzne === 'niedostepna')
            ? ' Kopia poza komputerem oczyści się przy najbliższej kopii (dysk musi być podłączony).' : '';
          komunikat(`Usunięto ${w.liczba} tras. Pliki zniknęły też z archiwów zdjęć; kopia bazy ich nie zawiera.` + dopisek, 'ok');
        }
      } }] : []),
    ],
    poOtwarciu: pole => {
      const wszystkie = pole.querySelector('#cz-wszystkie');
      // „Usuń zaznaczone (N)” — licznik przy przycisku rośnie z każdym zaznaczeniem (STYL-GK §8).
      const licznik = () => {
        const n = pole.querySelectorAll('[data-trasa]:checked').length;
        const przycisk = document.querySelector('#okno-stopka button.czerwony');
        if (przycisk) przycisk.textContent = n ? `Usuń zaznaczone (${n})` : 'Usuń zaznaczone';
      };
      pole.querySelectorAll('[data-trasa]').forEach(x => { x.onchange = licznik; });
      if (wszystkie) wszystkie.onchange = () => {
        pole.querySelectorAll('[data-trasa]').forEach(x => { x.checked = wszystkie.checked; });
        licznik();
      };
    },
  });
}

function podepnijKopie(pole) {
  const teraz = pole.querySelector('#u-kopia-teraz');
  if (!teraz) return;
  teraz.onclick = async () => {
    // Najpierw zapis folderu wpisanego obok — inaczej kopia poszłaby do starego.
    const zapisane = await sprobuj(() => API.post('/api/ustawienia',
      { kopia_folder: val('u-kopia-folder') }));
    if (!zapisane) return;
    const w = await sprobuj(() => API.post('/api/kopie/teraz'));
    if (!w) return;
    if (w.trwa) komunikat('Kopia w toku — wynik zobaczysz tu za chwilę (odśwież Ustawienia)', 'ok');
    else if (w.blad) komunikat(w.blad, 'blad');
    else komunikat(w.folder ? `Kopia zrobiona: ${w.plik}` : 'Kopia zrobiona w folderze kopie/', 'ok');
    wrocDoUstawien();
  };
}


/* ------------------------------------------------- dostęp z internetu */

/* Strażnik tunelu: „✓ działa” znaczy tylko, że program tunelu żyje. Czy adres
   naprawdę prowadzi do programu, sprawdza strażnik co 2 minuty — tak jak telefon. */
function straznikTunelu(s) {
  if (!s || !s.opis) return '';
  return s.odpowiada === false
    ? `<div class="wstega uwaga">${escHtml(s.opis)}</div>`
    : `<p class="male slaby">${escHtml(s.opis)}</p>`;
}

function kartaTunelu(u) {
  const tunel = u.tunel || {};
  const tryb = u.tunel_tryb || 'brak';
  const stanPlakietka = {
    dziala: ('<span class="plakietka p-dostarczone">' + ikonka('haczyk') + 'działa</span>'),
    uruchamiam: '<span class="plakietka p-w_toku">łączy się…</span>',
    blad: ('<span class="plakietka p-nieudane">' + ikonka('zamknij') + 'błąd</span>'),
    wylaczony: '<span class="plakietka p-oczekuje">wyłączony</span>',
  }[tunel.stan] || '';

  return zwin('Dostęp z internetu', stanPlakietka, `
    <p class="male slaby">Bez tunelu aplikacja działa tylko w firmowym wifi, a przeglądarki
      nie włączają wtedy pełnego trybu offline. Tunel daje adres <code>https://</code>
      bez stałego IP i bez otwierania portów w routerze.</p>

    ${tunel.adres ? `<div class="wstega info">
        Adres dla kierowców:<br><b style="font-size:15px;word-break:break-all">${escHtml(tunel.adres)}</b>
        <button class="maly" id="u-kopiuj-adres" style="margin-top:8px">Kopiuj adres</button>
      </div>` : ''}
    ${tunel.blad ? `<div class="wstega uwaga">${escHtml(tunel.blad)}</div>` : ''}
    ${straznikTunelu(tunel.straznik)}

    <label class="plaska"><input type="radio" name="tunel" value="brak" ${tryb === 'brak' ? 'checked' : ''}>
      <span><b>Wyłączony</b><br><span class="male slaby">Tylko firmowe wifi.
        Kierowca musi otworzyć aplikację na placu przed wyjazdem.</span></span></label>

    <label class="plaska"><input type="radio" name="tunel" value="szybki" ${tryb === 'szybki' ? 'checked' : ''}>
      <span><b>Szybki</b><br><span class="male slaby">Działa od razu, bez konta i bez
        domeny. <b>Adres zmienia się po każdym uruchomieniu programu</b> — dlatego
        telefony otwierają stały adres aplikacji na GitHub Pages, a Panel Zarządczy GK
        (na tym komputerze) sam wpisuje tam bieżący adres tunelu (karta niżej).</span></span></label>

    <label class="plaska"><input type="radio" name="tunel" value="staly" ${tryb === 'staly' ? 'checked' : ''}>
      <span><b>Stały — do codziennej pracy</b><br><span class="male slaby">Własny, niezmienny
        adres (np. <code>trasy.twojafirma.pl</code>). Wymaga darmowego konta Cloudflare
        i domeny firmy dodanej do Cloudflare.</span></span></label>

    <label style="margin-top:12px">Token tunelu stałego
      <input id="u-tunel-token" placeholder="${u.tunel_token_ustawiony
        ? 'token jest zapisany — wpisz nowy, żeby zmienić' : 'wklej token z panelu Cloudflare'}">
    </label>
    <div class="male ${u.tunel_token_ustawiony ? '' : 'slaby'}">
      ${u.tunel_token_ustawiony ? (ikonka('haczyk') + 'Token zapisany') : 'Token nie jest ustawiony'}</div>
    <label style="margin-top:12px">Adres tunelu stałego
      <input id="u-tunel-adres" value="${escHtml(u.tunel_adres || '')}"
             placeholder="np. https://trasy.twojafirma.pl"></label>
    <div class="male slaby">Tylko w trybie stałym: ten sam adres, który ustawiono w panelu
      Cloudflare. Program podaje go Panelowi Zarządczemu GK, a Panel wpisuje go aplikacji na GitHub Pages.</div>

    <details style="margin-top:12px">
      <summary class="male" style="cursor:pointer">Jak zdobyć token tunelu stałego</summary>
      <ol class="male slaby" style="padding-left:20px;line-height:1.8">
        <li>Załóż darmowe konto na <b>cloudflare.com</b> i dodaj do niego domenę firmy.</li>
        <li>Wejdź w <b>Zero Trust → Networks → Tunnels → Create a tunnel</b>,
            wybierz <b>Cloudflared</b> i nazwij tunel (np. „trasy”).</li>
        <li>Cloudflare pokaże polecenie instalacyjne z długim tokenem —
            <b>skopiuj sam token</b> (ten długi ciąg znaków) i wklej go tutaj.</li>
        <li>W zakładce <b>Public Hostname</b> ustaw subdomenę (np. <code>trasy</code>),
            typ <b>HTTP</b> i adres <code>localhost:8770</code>.</li>
        <li>Zapisz ustawienia tutaj i uruchom program ponownie.</li>
      </ol>
    </details>

    <p class="male slaby" style="margin-top:10px">Zmiana trybu działa dopiero
      po zamknięciu i ponownym uruchomieniu programu.</p>
    <button class="glowny zapisz-ustawienia">Zapisz ustawienia</button>`, 'u-tunel');
}

function zmienionoTunel(poprzednie) {
  // Na zakładce Konta karty tunelu nie ma — nic nie mogło się zmienić.
  if (!document.getElementById('u-tunel-token')) return false;
  const wybrany = (document.querySelector('input[name=tunel]:checked') || {}).value || 'brak';
  return wybrany !== (poprzednie.tunel_tryb || 'brak') || !!val('u-tunel-token');
}


/* ------------------------------------- adres dla telefonów (D33, D42) */

/* Telefony otwierają STAŁY adres na jednej stronie wszystkich aplikacji GK
   (GitHub Pages, katalog trasy/). Tam leży sam wygląd aplikacji, a dane wydaje
   ten program pod adresem tunelu. Od D42 na GitHub wysyła je Panel Zarządczy GK
   (hub na tym samym komputerze, jeden token): program podaje mu tylko adres
   tunelu i wersję. Tu nic się nie ustawia — karta mówi, co leży na Pages.  */
function kartaPages(u) {
  const p = u.pages || {};
  const plakietka = !p.lokalne ? '<span class="plakietka p-oczekuje">kopia testowa</span>'
    : !p.hub_odpisal ? '<span class="plakietka p-oczekuje">czeka na Panel</span>'
      : p.blad ? '<span class="plakietka p-nieudane">błąd</span>'
        : !p.opublikowano ? '<span class="plakietka p-oczekuje">nie wysłano</span>'
          : p.starsza ? '<span class="plakietka p-w_toku">wysyła nową wersję</span>'
            : ('<span class="plakietka p-dostarczone">' + ikonka('haczyk') + 'aktualna</span>');
  const kiedy = t => escHtml(czasNaEkran(t));
  return zwin('Adres dla telefonów (GitHub Pages)', plakietka, `
    <p class="male slaby">Stały adres aplikacji dla telefonów — ten sam po każdym restarcie
      komputera w biurze. <b>Adres dla telefonów publikuje Panel Zarządczy GK</b> na tym
      komputerze, tym samym tokenem co aplikacje hali: program podaje mu adres tunelu i swoją
      wersję, Panel wysyła je na GitHub sam. Na GitHubie leży sam wygląd, bez żadnych danych firmy.</p>

    ${p.adres ? `<div class="wstega info">Adres dla telefonów publikuje Panel Zarządczy GK:<br>
        <a href="${escHtml(p.adres)}" target="_blank" rel="noopener"
           style="font-size:15px;word-break:break-all"><b>${escHtml(p.adres)}</b></a></div>` : ''}

    ${!p.lokalne ? `<div class="wstega uwaga">Ta kopia programu nie zgłasza adresu Panelowi Zarządczemu GK (kopia
        testowa albo druga kopia na innym porcie).</div>` : ''}
    ${p.lokalne && !p.hub_odpisal ? `<div class="wstega uwaga">Panel Zarządczy GK jeszcze się nie odezwał.
        Sprawdź, czy Panel Zarządczy GK działa na tym komputerze (w nowej wersji).</div>` : ''}
    ${p.blad ? `<div class="wstega uwaga">Panel Zarządczy GK nie wysłał adresu na GitHub:
        ${escHtml(p.blad)} Panel ponawia sam; szczegóły w Panelu → Administracja → Ustawienia → Dostęp z telefonów.</div>` : ''}

    <table class="male" style="margin-bottom:10px">
      <tr><td class="slaby">Aplikacja wysłana</td>
          <td><b>${p.opublikowano ? kiedy(p.opublikowano) : 'jeszcze nie'}</b></td></tr>
      <tr><td class="slaby">Wersja na Pages</td>
          <td><code>${escHtml(p.wersja_na_pages || '—')}</code>${p.opublikowano && !p.starsza
            ? ' — ta sama co w programie' : p.starsza ? ` <span class="slaby">(program: ${escHtml(p.wersja_programu)})</span>` : ''}</td></tr>
      <tr><td class="slaby">Adres danych na Pages</td>
          <td>${p.adres_api ? `<code style="word-break:break-all">${escHtml(p.adres_api)}</code>
            ${p.adres_aktualny ? ikonka('haczyk') : '<span class="slaby">(inny niż bieżący tunel)</span>'}`
            : '—'}${p.adres_zmieniono ? ` <span class="slaby">· ${kiedy(p.adres_zmieniono)}</span>` : ''}</td></tr>
    </table>
    <p class="male slaby">Nowy adres tunelu (po każdym uruchomieniu) i nową wersję programu
      (po aktualizacji) Panel wysyła sam, zwykle w ciągu minuty. Telefony dostają je same.</p>`, 'u-pages');
}


/* --------------------------------------- lokalizatory GPS w busach (IKOL) */

function kartaIkol(u) {
  const s = u.ikol_stan || {};
  const wlaczony = u.ikol_wlaczony === '1';
  const lokalizatory = stan._lokalizatory || [];
  const stanPlakietka = !wlaczony ? '<span class="plakietka p-oczekuje">wyłączona</span>'
    : s.stan === 'dziala' ? ('<span class="plakietka p-dostarczone">' + ikonka('haczyk') + 'pobiera pozycje</span>')
    : s.stan === 'blad' ? ('<span class="plakietka p-nieudane">' + ikonka('zamknij') + 'błąd</span>')
    : '<span class="plakietka p-w_toku">czeka na pierwsze pobranie</span>';

  return zwin('Lokalizatory w autach (IKOL)', stanPlakietka, `
    <p class="male slaby">Program potrafi sam pobierać pozycje z Waszych lokalizatorów
      w <b>system.ikol.pl</b> i pokazywać je na Pulpicie obok potwierdzeń dostaw —
      bez przełączania się między dwiema stronami. Pyta o pozycję co półtorej minuty,
      z zapasem względem limitów IKOL-a.</p>

    <div class="wstega uwaga">W IKOL-u są <b>dwie różne rzeczy o nazwie „Interfejs API”</b>
      i potrzebne są obie. To była przyczyna odmów przy pierwszym podejściu.</div>
    <ol class="male slaby" style="margin:0 0 12px 18px; padding:0">
      <li><b>Uprawnienie użytkownika — bezpłatne.</b><br>
        MENU → Konfiguracja → Konfiguracja lokalizatorów → przy pojeździe
        „Uprawnienia użytkowników” → kolumna <b>Interfejs API</b> → zaznaczyć → Zapisz.<br>
        <i>U Was włączone przy czterech lokalizatorach 1.09.2026.</i></li>
      <li><b>Usługa dodatkowa — płatna, 10 zł netto miesięcznie ZA KAŻDY lokalizator.</b><br>
        IKOL → Wybór usług → Zarządzaj usługami → sekcja <b>Dodatki</b> → pozycja
        nr 58 „Interfejs API”.<br>
        <i>U Was wyłączona przy wszystkich czterech (stan z 1.09.2026).</i></li>
    </ol>
    <p class="male slaby">Bez wykupionej usługi API odpowiada kodem 3 — tym samym,
      co przy złym haśle. Dlatego łatwo wziąć to za pomyłkę w loginie.
      <b>Nie musicie wykupywać jej dla wszystkich aut</b> — wystarczy dla tych,
      które faktycznie wożą dostawy.</p>
    <p class="male slaby">Póki tego nie ma, położenie aut i tak działa —
      bezpłatnie, z telefonu kierowcy (ekran „Moja trasa” → „Udostępniaj położenie”).</p>

    <label class="plaska"><input type="checkbox" id="u-ikol-wlaczony" ${wlaczony ? 'checked' : ''}>
      <b>Pobieraj pozycje z IKOL-a</b></label>

    <div class="dwie">
      <label>Login do IKOL-a<input id="u-ikol-login" value="${escHtml(u.ikol_login || '')}"
        autocapitalize="none" placeholder="ten sam co na system.ikol.pl"></label>
      <label>Hasło<input id="u-ikol-haslo" type="password" autocomplete="new-password"
        placeholder="${u.ikol_ustawiony ? 'hasło jest zapisane — wpisz nowe, żeby zmienić' : 'hasło do IKOL-a'}"></label>
    </div>
    <label>Klucz aplikacji (appkey) <span class="slaby">— jeśli IKOL go od Was wymaga</span>
      <input id="u-ikol-appkey" placeholder="wygenerowany w panelu IKOL"></label>

    <div class="przyciski" style="margin-top:10px">
      <button id="u-ikol-sprawdz">Sprawdź połączenie i pobierz listę</button>
      ${lokalizatory.length ? '<button id="u-ikol-pobierz">Pobierz pozycje teraz</button>' : ''}
      ${u.ikol_ustawiony ? '<button id="u-ikol-zapomnij">Usuń zapisane hasło</button>' : ''}
    </div>
    ${s.blad ? `<div class="wstega uwaga" style="margin-top:12px">${escHtml(s.blad)}</div>` : ''}
    ${s.ostatnio && wlaczony ? `<div class="male slaby" style="margin-top:8px">
      Ostatnie sprawdzenie: ${escHtml(s.ostatnio)}</div>` : ''}

    ${lokalizatory.length ? `
      <h3 style="margin-top:18px">Które auta</h3>
      <p class="male slaby">Przypisz każdy lokalizator do auta albo wprost do kierowcy —
        bez tego program nie wie, czyją trasę zapisać.</p>
      <div class="tabela-przewijana"><table>
        <thead><tr><th>Lokalizator</th><th>Auto</th><th>Kierowca</th><th>Ostatnia pozycja</th><th></th></tr></thead>
        <tbody>${lokalizatory.map(l => `<tr style="${l.aktywny ? '' : 'opacity:.5'}">
          <td><b>${escHtml(l.nazwa || l.klucz)}</b>
              ${l.nazwa ? `<br><span class="male slaby">${escHtml(l.klucz)}</span>` : ''}</td>
          <td>${escHtml(l.pojazd_nazwa || '—')}</td>
          <td>${escHtml(l.kierowca_imie || (l.pojazd_nazwa ? 'wg trasy na dziś' : '—'))}</td>
          <td class="male">${escHtml(l.ostatnio_o || 'jeszcze nic')}</td>
          <td><button class="maly" data-lokalizator="${escHtml(l.klucz)}">Przypisz</button></td>
        </tr>`).join('')}</tbody>
      </table></div>` : ''}

    <details style="margin-top:12px">
      <summary class="male" style="cursor:pointer">Czego potrzeba po stronie IKOL-a</summary>
      <ul class="male slaby" style="padding-left:20px;line-height:1.8">
        <li><b>Płatna usługa „Interfejs API”</b> włączona przy każdym lokalizatorze,
            z którego chcecie brać pozycje: IKOL → <b>Wybór usług</b> → <b>Zarządzaj
            usługami</b> → sekcja <b>Dodatki</b>. Kosztuje 10 zł netto miesięcznie
            za auto. <b>Bez tego API odmawia dostępu</b>, nawet przy poprawnym haśle.</li>
        <li><b>Uprawnienie „Interfejs API”</b> dla użytkownika przy każdym lokalizatorze:
            Konfiguracja → Konfiguracja lokalizatorów → Uprawnienia użytkowników →
            ostatnia kolumna. To jest bezpłatne, ale samo w sobie nie wystarcza.</li>
        <li><b>Klucz aplikacji (appkey)</b> nie jest potrzebny — według specyfikacji IKOL-a
            służy tylko do powiadomień push. Pole zostaw puste.</li>
        <li>Hasło zapisuje się w pliku <code>dane.db</code> w folderze programu —
            tak samo jak reszta danych firmy. Trzymaj ten folder tam, gdzie inne
            dane firmowe.</li>
      </ul>
    </details>`, 'u-ikol');
}

function oknoLokalizatora(klucz) {
  const l = (stan._lokalizatory || []).find(x => x.klucz === klucz);
  if (!l) return;
  const busy = stan.pojazdy.filter(p => p.aktywny || p.id === l.pojazd);
  const kierowcy = (stan._kierowcy || []).filter(k => k.rola === 'kierowca');

  okno({
    tytul: l.nazwa || klucz,
    tresc: `
      <label>Auto
        <select id="lk-pojazd">
          <option value="">— nie przypisano —</option>
          ${busy.map(b => `<option value="${b.id}" ${l.pojazd === b.id ? 'selected' : ''}>
            ${escHtml(b.nazwa)}${b.rejestracja ? ' · ' + escHtml(b.rejestracja) : ''}</option>`).join('')}
        </select></label>
      <label>Kierowca na stałe <span class="slaby">(zostaw puste, jeśli tym autem jeżdżą różni —
        wtedy program bierze kierowcę z trasy na dany dzień)</span>
        <select id="lk-kierowca">
          <option value="">— wg trasy na dany dzień —</option>
          ${kierowcy.map(k => `<option value="${k.id}" ${l.kierowca === k.id ? 'selected' : ''}>${escHtml(k.imie)}</option>`).join('')}
        </select></label>
      <label class="plaska"><input type="checkbox" id="lk-aktywny" ${l.aktywny ? 'checked' : ''}>
        Pobieraj pozycje z tego lokalizatora</label>`,
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Zapisz', klasa: 'glowny', klik: async z => {
        const w = await sprobuj(() => API.post('/api/ikol/lokalizatory', {
          klucz,
          pojazd: document.getElementById('lk-pojazd').value || null,
          kierowca: document.getElementById('lk-kierowca').value || null,
          aktywny: document.getElementById('lk-aktywny').checked ? 1 : 0,
        }), 'Zapisano');
        if (w) { z(); wrocDoUstawien(); }
      } },
    ],
  });
}


/* ---------------------------------------------- GK Flota (GK Transport) */

/* Połączenie z programem floty. Umowa między programami: GK-TRANSPORT.md.
   Klucz tworzy administrator GK Flota, tutaj się go tylko wkleja. Stan pokazuje
   to, co admin musi wiedzieć bez zaglądania do dziennika: czy konta kierowców
   doszły i czy któryś raport utknął.                                        */
function kartaFlotexu(u) {
  const s = u.flotex_stan || {};
  const konta = s.kierowcy || {};
  const wynik = konta.wynik || {};
  const kolejka = s.kolejka || {};
  const plakietka = !u.flotex_klucz_ustawiony
    ? '<span class="plakietka p-oczekuje">niepołączony</span>'
    : s.uwaga ? '<span class="plakietka p-nieudane">wymaga uwagi</span>'
    : (konta.blad || (s.pojazdy || {}).blad)
      ? ('<span class="plakietka p-nieudane">' + ikonka('zamknij') + 'błąd</span>')
      : konta.kiedy ? ('<span class="plakietka p-dostarczone">' + ikonka('haczyk') + 'połączony</span>')
      : '<span class="plakietka p-w_toku">łączy się</span>';

  return zwin('GK Flota (GK Transport)', plakietka, `
    <p class="male slaby">GK Flota prowadzi przeglądy, terminy i usterki aut. Po połączeniu
      planista widzi przy autach, czy są sprawne, kierowca ma w menu „Moje auto”
      (GK Flota bez drugiego logowania), a przebieg, tankowania i usterki z raportu
      pracy same trafiają do GK Flota. Konta kierowców zakłada się tylko tutaj —
      GK Flota dostaje je sama, z tym samym loginem i PIN-em.</p>
    <p class="male slaby">Adres: <b>http://127.0.0.1:8780</b>, gdy GK Flota działa na tym
      komputerze, albo <b>https://…</b> (tunel). Zwykłe <b>http://</b> do innego komputera
      jest zablokowane — klucz i PIN-y kierowców szłyby otwartym tekstem.</p>
    <div class="dwie">
      <label>Adres GK Flota
        <input id="u-flotex-adres" value="${escHtml(u.flotex_adres || '')}"
               autocapitalize="none" placeholder="http://127.0.0.1:8780"></label>
      <label>Klucz połączenia
        <input id="u-flotex-klucz" type="password" autocomplete="new-password"
               placeholder="${u.flotex_klucz_ustawiony
                 ? 'klucz jest zapisany — wklej nowy, żeby zmienić'
                 : 'z GK Flota: Ustawienia → Połączenie z GK Trasy'}"></label>
    </div>
    <div class="male ${u.flotex_klucz_ustawiony ? '' : 'slaby'}">
      ${u.flotex_klucz_ustawiony ? (ikonka('haczyk') + 'Klucz ustawiony') : 'Klucz nie jest ustawiony'}</div>
    <div class="przyciski" style="margin-top:10px">
      <button class="glowny zapisz-ustawienia">Zapisz ustawienia</button>
      <button id="u-flotex-sprawdz">Sprawdź połączenie</button>
      ${u.flotex_klucz_ustawiony ? '<button id="u-flotex-zapomnij">Odłącz</button>' : ''}
    </div>
    ${u.flotex_klucz_ustawiony ? `
      ${s.uwaga ? `<div class="wstega blad" style="margin-top:12px">Połączenie z GK Flota
        wymaga uwagi: ${escHtml(s.uwaga.komunikat || '')}
        <div class="male">Raporty czekają w kolejce i pójdą same, gdy połączenie znów
        zadziała.</div></div>` : ''}
      <h3 style="margin-top:18px">Konta kierowców</h3>
      ${konta.blad ? `<div class="wstega uwaga">${escHtml(konta.blad)}</div>` : ''}
      <div class="male slaby">${wynik.pusta && !konta.blad
        ? 'Nie ma jeszcze kont kierowców — nie ma czego wysyłać.'
        : konta.kiedy && !konta.blad
        ? `Ostatnio wysłane ${escHtml(czasNaEkran(konta.kiedy))}: ${wynik.wyslano || 0}
           ${odmiana(wynik.wyslano || 0, 'konto', 'konta', 'kont')}`
          + ` (nowe ${wynik.dodane || 0}, zmienione ${wynik.zmienione || 0},
           wyłączone ${wynik.wylaczone || 0}, przejęte ${wynik.przejete || 0}).`
        : konta.kiedy ? `Ostatnia próba ${escHtml(czasNaEkran(konta.kiedy))}.`
        : 'Jeszcze nie wysłane — pójdą za chwilę.'} Wysyłają się same po każdej zmianie
        konta kierowcy i co 10 minut.</div>
      ${(wynik.konflikty || []).length ? `<div class="wstega uwaga" style="margin-top:8px">
        Te loginy są w GK Flota zajęte przez konta biura, więc tych kierowców GK Flota nie
        przyjęła: <b>${wynik.konflikty.map(escHtml).join(', ')}</b>. Zmień login w jednym
        z programów.</div>` : ''}
      ${(s.pojazdy || {}).blad ? `<div class="wstega uwaga" style="margin-top:8px">
        Stan aut: ${escHtml(s.pojazdy.blad)}</div>` : ''}

      <h3 style="margin-top:18px">Raporty do GK Flota</h3>
      <div class="male">Czeka: <b>${kolejka.czeka || 0}</b> ·
        odrzucone: <b>${kolejka.odrzucone || 0}</b> · wysłane: ${kolejka.wyslane || 0}</div>
      ${(kolejka.problemy || []).length ? `<div class="tabela-przewijana" style="margin-top:8px"><table>
        <thead><tr><th>Raport</th><th>Stan</th><th>Powód</th></tr></thead>
        <tbody>${kolejka.problemy.map(p => `<tr>
          <td>${escHtml(p.imie || '')} ${p.data ? escHtml(polskaData(p.data)) : escHtml(p.klucz)}</td>
          <td>${p.wyslany ? '<span class="plakietka p-planowana">wysłany z uwagą</span>'
            : p.odrzucone ? '<span class="plakietka p-nieudane">odrzucony</span>'
            : [401, 403, 409].includes(p.kod_http)
              ? '<span class="plakietka p-oczekuje">czeka na połączenie</span>'
            : '<span class="plakietka p-w_toku">ponawiam</span>'}</td>
          <td class="male">${escHtml(p.blad)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="male slaby">Odrzucony raport nie wraca sam — popraw przyczynę (np. dopisz
        auto w GK Flota albo jego rejestrację tutaj) i kliknij „Ponów wysyłkę”.</p>
      <button id="u-flotex-ponow">Ponów wysyłkę</button>` : ''}` : ''}`, 'u-flota');
}


/* ------------------------------------- Konta GK z Panelu (GK-KONTA.md) */

/* Jedno konto osoby we wszystkich aplikacjach GK, zakładane w Panelu →
   Administracja (decyzja właściciela 2026-10-02). Tutaj admin wkleja adres
   i klucz Panelu; program sam pobiera konta co 5 minut. „Przenieś konta do
   Panelu” to jednorazowe przeniesienie kont założonych dotąd tutaj — z ich
   PIN-ami (jadą tylko skróty, PIN się nie zmienia).                         */
function kartaKontGK(u) {
  const s = u.hub_stan || {};
  const w = s.wynik || {};
  const imp = s.import;
  const lok = s.lokalne || {};
  const adm = s.admin || {};              // D48: kto jest teraz loginem „admin”
  const plakietka = !u.hub_klucz_ustawiony || !u.hub_adres
    ? '<span class="plakietka p-oczekuje">niepołączony</span>'
    : s.uwaga ? '<span class="plakietka p-nieudane">wymaga uwagi</span>'
    : s.blad ? ('<span class="plakietka p-nieudane">' + ikonka('zamknij') + 'błąd</span>')
    : s.kiedy ? ('<span class="plakietka p-dostarczone">' + ikonka('haczyk') + 'połączony</span>')
    : '<span class="plakietka p-w_toku">łączy się</span>';
  return zwin('Konta GK (Panel Zarządczy GK)', plakietka, `
    <p class="male slaby">Konta wszystkich aplikacji GK zakłada się w jednym miejscu:
      <b>Panel → Administracja</b>. Osoba loguje się wszędzie imieniem i nazwiskiem i tym
      samym PIN-em. Program pobiera konta z Panelu co 5 minut i trzyma ich kopię — logowanie
      działa dalej, gdy Panel chwilowo nie odpowiada.</p>
    <p class="male slaby"><b>Panel na tym komputerze łączy się sam</b> — Panel robi klucz i podaje go
      programowi przez plik w profilu Windows, nic nie trzeba wklejać. Ręcznie (Panel na innym
      komputerze): adres <b>https://…</b> i klucz z Panelu → Administracja → Ustawienia → Połączenia GK.</p>
    <p class="male slaby"><b>Login „admin”</b> to konto Menedżera z Panelu — to samo hasło i PIN
      co w Panelu (ustawia się je w aplikacji hali). Tutejszy awaryjny „admin” z tutejszym hasłem
      wpuszcza tylko bez Panelu: gdy połączenie nie jest ustawione albo konta nie pobrały się od
      ponad ${Number(adm.po_godz) || 24} godzin. Inni Menedżerowie logują się imieniem i nazwiskiem.</p>
    ${lok.auto ? `<div class="wstega ok">${ikonka('haczyk')}Połączono samo z Panelem na tym komputerze (${escHtml(u.hub_adres || '')}).</div>`
      : lok.plik === 'wylaczone' ? `<div class="wstega uwaga">Połączenie jest wyłączone w Panelu → Administracja →
        Ustawienia → Połączenia GK — program nie łączy się sam, dopóki Menedżer w Panelu go nie włączy.</div>`
      : lok.plik === 'reczny' && !s.kiedy ? `<div class="wstega uwaga">W Panelu utworzono klucz ręcznie — wklej go niżej
        albo w Panelu kliknij „Połącz na tym komputerze”.</div>`
      : lok.odlaczony ? '<div class="male slaby">Odłączono ręcznie — program nie łączy się sam.</div>' : ''}
    <div class="dwie">
      <label>Adres Panelu
        <input id="u-hub-adres" value="${escHtml(u.hub_adres || '')}"
               autocapitalize="none" placeholder="http://127.0.0.1:8790"></label>
      <label>Klucz Panelu
        <input id="u-hub-klucz" type="password" autocomplete="new-password"
               placeholder="${u.hub_klucz_ustawiony
                 ? 'klucz jest zapisany — wklej nowy, żeby zmienić'
                 : 'z Panelu: Administracja → Ustawienia → Połączenia GK'}"></label>
    </div>
    <div class="male ${u.hub_klucz_ustawiony ? '' : 'slaby'}">
      ${u.hub_klucz_ustawiony ? (ikonka('haczyk') + 'Klucz ustawiony') : 'Klucz nie jest ustawiony'}</div>
    <div class="przyciski" style="margin-top:10px">
      <button class="glowny zapisz-ustawienia">Zapisz ustawienia</button>
      <button id="u-hub-sprawdz" aria-label="Sprawdź połączenie z Panelem">Sprawdź</button>
      ${lok.mozna && (!u.hub_klucz_ustawiony || lok.odlaczony || s.uwaga)
        ? '<button id="u-hub-lokalnie">Połącz z Panelem na tym komputerze</button>' : ''}
      ${u.hub_klucz_ustawiony ? `<button id="u-hub-pobierz" aria-label="Pobierz teraz konta z Panelu">Pobierz teraz</button>
        <button id="u-hub-zapomnij">Odłącz</button>` : ''}
    </div>
    ${u.hub_klucz_ustawiony ? `
      ${s.uwaga ? `<div class="wstega blad" style="margin-top:12px">${escHtml(s.uwaga)}</div>`
        : s.blad ? `<div class="wstega uwaga" style="margin-top:12px">${escHtml(s.blad)}</div>` : ''}
      <div class="male" style="margin-top:10px">${s.kiedy && !s.blad
        ? `Ostatnio pobrane ${escHtml(czasNaEkran(s.kiedy))}: ${w.konta || 0}
           ${odmiana(w.konta || 0, 'osoba', 'osoby', 'osób')} z rolą Panelu Zarządczego SP
           (nowe ${w.dodane || 0}, połączone ${w.polaczone || 0}, zmienione ${w.zmienione || 0},
           wyłączone ${w.wylaczone || 0}).`
        : s.kiedy ? `Ostatnia próba ${escHtml(czasNaEkran(s.kiedy))}.` : 'Jeszcze nie pobrane — pójdą za chwilę.'}
        Kont z Panelu tutaj: <b>${s.z_panelu || 0}</b> · tutejszych czynnych: ${s.tutejsze || 0}.</div>
      <div class="male" style="margin-top:6px">${adm.z_panelu
        ? `Login <b>admin</b> = konto z Panelu <b>${escHtml(adm.z_panelu)}</b> — tutejszy awaryjny „admin” teraz nie wpuszcza.`
        : `Login <b>admin</b> = tutejsze konto awaryjne${adm.w_panelu && !adm.swiezy
          ? ` — konta z Panelu nie pobrały się od ponad ${Number(adm.po_godz) || 24} h` : ''}.`}</div>
      ${(s.bez_pinu || []).length ? `<div class="wstega uwaga" style="margin-top:8px">
        Bez PIN-u (ustaw go w Panelu albo niech ta osoba zaloguje się raz w aplikacji GK na hali):
        <b>${s.bez_pinu.map(escHtml).join(', ')}</b></div>` : ''}
      ${(w.ostrzezenia || []).length ? `<div class="wstega uwaga" style="margin-top:8px">
        ${w.ostrzezenia.map(x => `<div>${escHtml(x)}</div>`).join('')}</div>` : ''}

      <h3 style="margin-top:18px">Przenieś konta do Panelu</h3>
      <p class="male slaby">Jednorazowo: konta założone dotąd tutaj trafiają do Panelu razem
        z PIN-ami (jadą tylko skróty — nikt nie musi zmieniać PIN-u). Osoba, która już jest
        w Panelu pod tym samym imieniem i nazwiskiem, dostaje tylko rolę Panelu Zarządczego SP. Najpierw
        popraw w kontach <b>pełne imię i nazwisko</b> — to w Panelu jest login. Konto awaryjne
        „admin” zostaje tutaj. Powtórne przeniesienie niczego nie dubluje.</p>
      <button id="u-hub-przenies">Przenieś konta do Panelu</button>
      ${imp ? `<div class="male" style="margin-top:8px">Przeniesiono ${escHtml(czasNaEkran(imp.kiedy))}:
        nowe ${imp.dodane || 0}, połączone ${imp.polaczone || 0},
        konflikty ${(imp.konflikty || []).length}.</div>
        ${(imp.konflikty || []).length ? `<div class="wstega uwaga" style="margin-top:8px">
          ${imp.konflikty.map(k => `<div><b>${escHtml(k.login)}</b>${k.powod
            ? ' — ' + escHtml(k.powod) : ''}</div>`).join('')}</div>` : ''}` : ''}` : ''}`, 'u-konta-gk');
}

function podepnijKontaGK(pole, ustawienia) {
  const przycisk = id => pole.querySelector('#' + id);
  const sprawdz = przycisk('u-hub-sprawdz');
  // Jak przy GK Flota: najpierw zapis tego, co wpisano obok, potem pytanie —
  // inaczej sprawdzalibyśmy stary klucz z bazy.
  if (sprawdz) sprawdz.onclick = async () => {
    if (!val('u-hub-adres')) { komunikat('Wpisz adres Panelu', 'blad'); return; }
    if (!val('u-hub-klucz') && !ustawienia.hub_klucz_ustawiony) {
      komunikat('Wklej klucz z Panelu (Administracja → Ustawienia → Połączenia GK)', 'blad');
      return;
    }
    const zapisane = await sprobuj(() => API.post('/api/ustawienia', {
      hub_adres: val('u-hub-adres'), hub_klucz: val('u-hub-klucz'),
    }));
    if (!zapisane) return;
    const w = await sprobuj(() => API.post('/api/konta-gk/sprawdz'));
    if (w) komunikat(w.komunikat, 'ok');
    wrocDoUstawien();
  };
  const lokalnie = przycisk('u-hub-lokalnie');
  if (lokalnie) lokalnie.onclick = async () => {
    const w = await sprobuj(() => API.post('/api/konta-gk/lokalnie'));
    if (!w) return;
    komunikat(['polaczono', 'polaczony'].includes(w.wynik) ? 'Połączono z Panelem na tym komputerze — konta przyjdą za chwilę'
      : w.wynik === 'wylaczone_w_panelu' ? 'Połączenie jest wyłączone w Panelu → Administracja → Ustawienia → Połączenia GK'
        : 'Poprosiłem Panel o klucz — połączy się sam w ciągu minuty', w.wynik === 'wylaczone_w_panelu' ? 'blad' : 'ok');
    setTimeout(() => { if (stan.ekran === 'ustawienia' || stan.ekran === 'administracja') wrocDoUstawien(); }, 1500);
  };
  const pobierz = przycisk('u-hub-pobierz');
  if (pobierz) pobierz.onclick = async () => {
    const w = await sprobuj(() => API.post('/api/konta-gk/pobierz'));
    if (w) {
      const x = w.wynik || {};
      komunikat(`Pobrano ${x.konta || 0} ${odmiana(x.konta || 0, 'konto', 'konta', 'kont')} z Panelu`
        + ` (nowe ${x.dodane || 0}, połączone ${x.polaczone || 0}, wyłączone ${x.wylaczone || 0})`, 'ok');
      wrocDoUstawien();
    }
  };
  const przenies = przycisk('u-hub-przenies');
  if (przenies) przenies.onclick = async () => {
    if (!await potwierdz('Przenieść konta do Panelu?',
      'Konta założone tutaj (oprócz awaryjnego „admin”) trafią do Panelu → Administracja '
      + 'z obecnymi PIN-ami. Od tej chwili zmienia się je w Panelu.')) return;
    const w = await sprobuj(() => API.post('/api/konta-gk/przenies'));
    if (w) {
      komunikat(`Przeniesiono: nowe ${w.dodane}, połączone ${w.polaczone}, konflikty `
        + `${(w.konflikty || []).length}`, (w.konflikty || []).length ? 'blad' : 'ok');
      setTimeout(() => { if (stan.ekran === 'ustawienia' || stan.ekran === 'administracja') wrocDoUstawien(); }, 1500);
    }
  };
  const odlacz = przycisk('u-hub-zapomnij');
  if (odlacz) odlacz.onclick = async () => {
    if (!await potwierdz('Odłączyć GK Trasy od Panelu?',
      'Program zapomni klucz Panelu i nie połączy się sam od nowa. Konta z Panelu zostają i działają, '
      + 'ale od teraz zmienia się je tutaj — Panel przestanie je aktualizować.')) return;
    const w = await sprobuj(() => API.post('/api/konta-gk/zapomnij'), 'Odłączono');
    if (w) wrocDoUstawien();
  };
}


/* Ustawienia to osiem sekcji, z ktorych na co dzien dotyka sie dwoch. Reszta
   ma byc pod reka, ale nie ma zajmowac ekranu — stad sekcje zwijane.
   Kazda ma id (podane albo z tytulu): po nim alarm otwiera wlasciwa sekcje,
   a ekran po zapisie pamieta, ktore byly otwarte (UI etap 2).               */
function zwin(tytul, plakietka, tresc, id) {
  return `<details class="karta karta-zwijana" id="${escHtml(id || idSekcji(tytul))}">
    <summary><span>${escHtml(tytul)}</span>${plakietka || ''}</summary>
    <div class="zwijana-tresc">${tresc}</div>
  </details>`;
}

function idSekcji(tytul) {
  return 'u-' + String(tytul).toLowerCase().replace(/ł/g, 'l').normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/* Alarm (kod z /api/alarmy) → sekcja Ustawień, która go naprawia. Wszystkie
   leżą pod „Zaawansowane”, więc samo przejście do Ustawień zostawiało
   administratora przed zwiniętym nagłówkiem — bez śladu, gdzie szukać.     */
const SEKCJA_ALARMU = {
  kopia: 'u-kopie', kopia_folder: 'u-kopie', miejsce: 'u-kopie',
  pages: 'u-pages', tunel: 'u-tunel',
};

/* Otwiera „Zaawansowane” i podaną sekcję, przewija do niej. */
function otworzSekcjeUstawien(pole, id) {
  const sekcja = id && pole.querySelector('#' + id);
  if (!sekcja) return false;
  const zaawansowane = sekcja.closest('details.zaawansowane');
  if (zaawansowane) zaawansowane.open = true;
  sekcja.open = true;
  setTimeout(() => sekcja.scrollIntoView({ block: 'start' }), 0);
  return true;
}


/* ------------------------------------------- powiadomienie klienta e-mailem */

function oknoPowiadomienia(p) {
  const klient = (stan.klienci || []).find(k => k.id === p.klient) || {};
  if (!(klient.email || '').trim()) {
    komunikat('Ten klient nie ma zapisanego adresu e-mail — uzupełnij go w kartotece', 'blad');
    return;
  }
  const okno_txt = (p.okno_od || p.okno_do) ? `${p.okno_od || '…'}–${p.okno_do || '…'}` : '';
  okno({
    tytul: 'Powiadom klienta',
    tresc: `
      <p>Wiadomość pójdzie na <b>${escHtml(klient.email)}</b>.</p>
      <label>Kiedy planujecie być <span class="slaby">(trafi do treści)</span>
        <input id="pw-okno" value="${escHtml(p.eta ? 'ok. ' + p.eta : okno_txt)}"
               placeholder="np. 12:30–13:00"></label>
      <p class="male slaby" id="pw-temat">Temat: …</p>
      <label>Treść wiadomości <span class="slaby">(możesz ją poprawić tylko dla tej jednej wysyłki)</span>
        <textarea id="pw-tresc" rows="9"></textarea></label>
      <p class="male slaby" id="pw-uwaga"></p>
      <p class="male slaby">Treść składa program z szablonu (adres klienta, dzień z dniem tygodnia,
        podana godzina, towar, dokument). Nic nie wysyła się samo — wysyłasz Ty, tym przyciskiem.</p>`,
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Wyślij', ikona: 'poczta', klasa: 'glowny', klik: async z => {
        const dane = { okno: val('pw-okno') };
        // Własny tekst idzie tylko wtedy, gdy biuro go poprawiło — inaczej serwer składa treść sam.
        if (pw.edytowano) dane.tresc = val('pw-tresc');
        // Bez programu wiadomość czeka w tym komputerze i wyjdzie do klienta dopiero po powrocie połączenia.
        const w = await sprobuj(() => zapisBiura('POST', `/api/przystanki/${p.id}/powiadom`, dane,
          { opis: 'e-mail do klienta: ' + (p.klient_nazwa || '') }), 'Wiadomość wysłana');
        if (w) z();
      } },
    ],
  });
  const pw = { edytowano: false, numer: 0 };
  // Błąd z 2026-11-19: `jest` stało tylko w zapisie Ustawień, więc podgląd treści i komunikat o błędzie rzucały ReferenceError.
  const jest = id => !!document.getElementById(id);
  const odswiez = async () => {
    const numer = ++pw.numer;
    try {
      const w = await API.get(`/api/przystanki/${p.id}/powiadom/podglad?okno=${encodeURIComponent(val('pw-okno'))}`);
      if (numer !== pw.numer || !jest('pw-tresc')) return;
      document.getElementById('pw-temat').textContent = 'Temat: ' + w.temat;
      if (!pw.edytowano) document.getElementById('pw-tresc').value = w.tresc;
      document.getElementById('pw-uwaga').textContent = w.brak_adresu
        ? 'Klient nie ma zapisanego adresu — uzupełnij go w kartotece, zanim wyślesz powiadomienie.' : '';
    } catch (e) {
      if (jest('pw-uwaga')) document.getElementById('pw-uwaga').textContent = poLudzku(e);
    }
  };
  document.getElementById('pw-tresc').addEventListener('input', () => { pw.edytowano = true; });
  document.getElementById('pw-okno').addEventListener('change', odswiez);
  odswiez();
}

/* Przeniesienie punktu i „zaległe” pytają, gdy telefon kierowcy może jeszcze
   trzymać zapisy (serwer odpowiada 428 z opisem). Bez tego biuro wysyłało drugi
   samochód do klienta, który odebrał towar godzinę temu — dowód był w kolejce. */
async function zRyzykiemKolejki(dane, wyslij, komunikatSukcesu) {
  zajety(true);
  try {
    const w = await wyslij(dane);
    if (komunikatSukcesu) komunikat(komunikatSukcesu, 'ok');
    return w;
  } catch (e) {
    if (e.kod !== 428) { komunikat(poLudzku(e), 'blad'); return null; }
    zajety(false);
    if (!await potwierdz('Przenieść mimo to?', e.message,
      { tak: 'Przenieś mimo to', nie: 'Wstrzymaj' })) return null;
    return sprobuj(() => wyslij(Object.assign({}, dane, { mimo_to: true })), komunikatSukcesu);
  } finally {
    zajety(false);
  }
}

/* ------------------------------------------- przeniesienie punktu na inną trasę */

async function oknoPrzeniesienia(trasa, p) {
  /* Przełożenie na INNY DZIEŃ, nie tylko na inną trasę tego samego dnia.
     Klient prosi o to co tydzień, a biuro musiało kasować punkt i wpisywać
     go od nowa — gubiąc WZ-kę, okno czasowe i uwagi dla kierowcy. */
  const kierowcy = await listaKierowcow();
  const rysujTrasy = async (dzien) => {
    const trasy = await API.get(`/api/trasy?data=${dzien}`).catch(() => []);
    const inne = trasy.filter(x => x.id !== trasa.id);
    const wybor = document.getElementById('pn-trasa');
    if (!wybor) return;
    wybor.innerHTML = inne.map(x => `<option value="${x.id}">${escHtml(x.nazwa || 'Trasa ' + x.id)}
        — ${escHtml(x.kierowca_imie || 'bez kierowcy')} (${x.ile}
        ${odmiana(x.ile, 'punkt', 'punkty', 'punktów')})</option>`).join('')
      + '<option value="">— załóż nową trasę tego dnia —</option>';
  };
  okno({
    szkic: 'przeniesienie-' + p.id,
    tytul: 'Przenieś: ' + p.klient_nazwa,
    tresc: `
      <p class="male slaby">Punkt przejdzie razem z towarem, numerem dokumentu,
        oknem czasowym i uwagami dla kierowcy.</p>
      <label>Na dzień
        <input type="date" id="pn-dzien" value="${escHtml(trasa.data)}"></label>
      <label>Na trasę <select id="pn-trasa"></select></label>
      <label>Kierowca <span class="slaby">(gdy zakładamy nową trasę)</span>
        <select id="pn-kierowca">
          <option value="">— nie przydzielono —</option>
          ${kierowcy.map(u => `<option value="${u.id}"${
            u.id === trasa.kierowca ? ' selected' : ''}>${escHtml(u.imie)}</option>`).join('')}
        </select></label>`,
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Przenieś', klasa: 'glowny', klik: async z => {
        const cel = document.getElementById('pn-trasa').value;
        const dzien = document.getElementById('pn-dzien').value;
        const dane = cel ? { trasa: cel }
          : { data: dzien, kierowca: document.getElementById('pn-kierowca').value || null };
        const w = await zRyzykiemKolejki(dane,
          d => zapisBiura('POST', `/api/przystanki/${p.id}/przenies`, d, {
            opis: 'przeniesienie punktu ' + (p.klient_nazwa || ''),
            zrodla: ['/api/trasy/' + trasa.id],
            popraw: (sciezka, dt) => {
              if (sciezka !== '/api/trasy/' + trasa.id || !dt || !Array.isArray(dt.przystanki)) return;
              dt.przystanki = dt.przystanki.filter(x => x.id !== p.id);
            },
          }), 'Przeniesione');
        if (w) { z(); pokazEkran('trasa', { id: trasa.id }); }
      } },
    ],
    poOtwarciu: async pole => {
      await rysujTrasy(trasa.data);
      pole.querySelector('#pn-dzien').onchange = e => rysujTrasy(e.target.value);
    },
  });
}

/* ------------------------------------------------ trasa w Google Maps */

async function oknoLinkuDoMap(trasaId, tylkoOtwarte) {
  const w = await sprobuj(() => API.get(
    `/api/trasy/${trasaId}/mapa-link` + (tylkoOtwarte ? '?otwarte=1' : '')));
  if (!w) return;
  okno({
    tytul: 'Trasa w Google Maps',
    tresc: `
      <p class="male slaby">${w.punktow} ${odmiana(w.punktow, 'punkt', 'punkty', 'punktów')}${
        w.z_bazy ? ', ze startem i powrotem do bazy' : ''}.
        ${w.czesci.length > 1 ? `Google przyjmuje najwyżej dziewięć punktów pośrednich,
          więc trasa jest podzielona na ${w.czesci.length}
          ${odmiana(w.czesci.length, 'część', 'części', 'części')} — każda zaczyna się tam,
          gdzie kończy poprzednia.` : ''}</p>
      ${w.ciezarowe ? `${wstegiOstrzezen(w.ciezarowe.ostrzezenia)}${w.ciezarowe.punkty_posrednie ? `<div class="wstega info">
        Trasa ciężarowa: odnośnik ma ${w.ciezarowe.punkty_posrednie}
        ${odmiana(w.ciezarowe.punkty_posrednie, 'punkt pośredni', 'punkty pośrednie', 'punktów pośrednich')}
        z kształtu trasy dla ciężarówki, żeby Google pokazał tę samą drogę. Google może pokazać je jako punkty pośrednie — to nie są dostawy, kierowca tylko je mija.</div>` : ''}` : ''}
      ${w.czesci.map((c, i) => `
        <div class="karta scisla">
          <div class="male"><b>${w.czesci.length > 1 ? `Część ${i + 1}: ` : ''}${
            escHtml(c.od)} → ${escHtml(c.do)}</b></div>
          <div class="przyciski" style="margin-top:8px">
            <a class="maly glowny" href="${escHtml(c.adres)}" target="_blank" rel="noopener"
               style="padding:6px 12px;border-radius:8px;background:var(--granat);color:var(--na-marce);
                      text-decoration:none;font-weight:600;font-size:13px;display:inline-block">
               Otwórz w Google Maps</a>
            <button class="maly" data-kopiuj="${i}">Kopiuj odnośnik</button>
          </div>
        </div>`).join('')}
      <p class="male slaby">Odnośnik możesz wysłać kierowcy SMS-em albo na komunikator —
        otworzy mu całą trasę po kolei.</p>`,
    przyciski: [{ napis: 'Zamknij', klik: z => z() }],
    poOtwarciu: pole => {
      pole.querySelectorAll('[data-kopiuj]').forEach(b => b.onclick = () => {
        navigator.clipboard.writeText(w.czesci[Number(b.dataset.kopiuj)].adres)
          .then(() => komunikat('Odnośnik skopiowany', 'ok'))
          .catch(() => komunikat('Skopiuj odnośnik ręcznie z paska adresu', 'blad'));
      });
    },
  });
}


/* --------------------------------------------------------- lista braków
   Liczona wyłącznie z tego, co już jest w bazie. Brakujący dzień pracy jest
   dziś niewidzialny — nie ma wiersza, więc nie ma czego zauważyć.           */

const ZNAKI_BRAKOW = {
  brak_raportu: ['pilne', 'zegar', 'Brak raportu pracy'],
  licznik: ['pilne', 'kpi', 'Zerwany łańcuch licznika'],
  bez_dowodu: ['uwaga', 'spinacz', 'Dostarczone bez dowodu'],
  niezamkniety: ['uwaga', 'klepsydra', 'Punkt nie został zamknięty'],
  bez_mapy: ['info', 'znacznik-miejsca', 'Klient bez adresu na mapie'],
};

async function rysujBraki(pole, od, doDnia) {
  if (!pole) return;
  const w = await API.get(`/api/braki?od=${od}&do=${doDnia}`).catch(() => null);
  if (!w) return;

  w.braki = brakiDoSprawdzenia(w.braki);   // ten sam filtr co kafelek na Pulpicie
  const grupy = {};
  for (const b of w.braki) (grupy[b.rodzaj] = grupy[b.rodzaj] || []).push(b);

  pole.innerHTML = `
    <div class="karta">
      <div class="karta-gora"><h2>Do sprawdzenia</h2>
        <span class="plakietka ${w.braki.length ? 'p-nieudane' : 'p-dostarczone'}">
          ${w.braki.length ? w.braki.length : (ikonka('haczyk') + 'nic')}</span></div>
      ${w.braki.length ? Object.entries(grupy).map(([rodzaj, lista]) => {
        const [klasa, ikona, tytul] = ZNAKI_BRAKOW[rodzaj] || ['info', '•', rodzaj];
        return `<h3 style="margin:14px 0 4px">${escHtml(tytul)} (${lista.length})</h3>
          ${lista.slice(0, 25).map(b => `<div class="brak">
            <span class="znak ${klasa}">${ikona.length > 3 ? ikonka(ikona) : ikona}</span>
            <span style="flex:1">
              <span class="male">${escHtml(b.opis)}</span>
              ${b.data ? `<span class="male slaby" style="display:block">${
                escHtml(polskaData(b.data))}${b.kto ? ' · ' + escHtml(b.kto) : ''}</span>` : ''}
            </span>
            ${b.trasa ? `<button class="maly" data-trasa-brak="${b.trasa}">Trasa</button>` : ''}
            ${b.klient ? `<button class="maly" data-klient-brak="${b.klient}">Klient</button>` : ''}
          </div>`).join('')}
          ${lista.length > 25 ? `<p class="male slaby">…i jeszcze ${lista.length - 25}</p>` : ''}`;
      }).join('') : '<p class="male slaby">Wszystko się zgadza — żadnych braków w tym okresie.</p>'}

      ${w.spalanie.length ? `<h3 style="margin:18px 0 4px">Spalanie</h3>
        <div class="male">${w.spalanie.map(s =>
          `<b>${escHtml(s.bus)}</b>: ${liczbaPl(s.srednia)} l/100 km
           <span class="slaby">(z ${s.ile_tankowan} ${odmiana(s.ile_tankowan,
             'tankowania', 'tankowań', 'tankowań')})</span>`).join(' &nbsp;·&nbsp; ')}</div>` : ''}
    </div>`;

  pole.querySelectorAll('[data-trasa-brak]').forEach(b =>
    b.onclick = () => pokazEkran('trasa', { id: Number(b.dataset.trasaBrak) }));
  pole.querySelectorAll('[data-klient-brak]').forEach(b => b.onclick = () => {
    const k = (stan.klienci || []).find(x => x.id === Number(b.dataset.klientBrak));
    if (k) oknoKlienta(k);
  });
}
