/* Telefon kierowcy: moje auto, przegląd miesięczny, zgłoszenie usterki.

   Ten ekran jest obsługiwany w rękawicach, na mrozie i w słońcu, przez kogoś,
   kto chce mieć to z głowy w trzy minuty i wrócić do roboty. Prostota jest tu
   funkcją, nie estetyką: jedno auto wybrane samo, jedno pole na licznik, sześć
   kafelków na zdjęcia i jeden przycisk, który mówi wprost, czego brakuje.

   Wszystko idzie przez kolejkę offline. Obchód robi się na placu, w hali albo
   pod lasem — nie tam, gdzie jest firmowe wifi.                              */

/* ------------------------------------------------------------ MOJE AUTO */

EKRANY.moj = {
  tytul: 'Moje auto',
  poSynchronizacji() { if (stan.ekran === 'moj') odswiezEkran(); },

  async rysuj(pole) {
    const d = await sprobuj(() => API.get('/api/moj-pojazd'));
    if (!d) {
      pole.innerHTML = przyciskPowrotu() + '<div class="pusto">Nie udało się wczytać danych.</div>';
      podepnijPowrot(pole);
      return;
    }
    const auta = d.pojazdy || [];
    // Kierowca z GK Trasy wraca stąd do swojego planu dnia — przycisk stoi na
    // górze, bo po obejrzeniu auta to jest następny ruch, a nie ostatni.
    if (!auta.length) {
      pole.innerHTML = `${przyciskPowrotu()}<div class="pusto"><span class="duza-ikona">🚗</span>
        Nie masz przypisanego auta.<br>
        <span class="male">Zgłoś to biuru — bez przypisanego auta nie da się
        oddać przeglądu ani zgłosić usterki.</span></div>`;
      podepnijPowrot(pole);
      return;
    }

    pole.innerHTML = przyciskPowrotu() + auta.map(p => kartaMojegoAuta(p, d.okres)).join('')
      + `<div class="przyciski">
           <button id="m-usterka">Zgłoś usterkę</button>
         </div>`;
    podepnijPowrot(pole);

    pole.querySelectorAll('[data-protokol-pojazd]').forEach(b => {
      b.onclick = () => pokazEkran('przeglad', { pojazd: Number(b.dataset.protokolPojazd) });
    });
    // Cała lista, nie pierwsze auto: kierowca ciągnika z przyczepą zgłaszał
    // usterkę przyczepy zawsze na ciągnik, bo okno nie dawało wyboru.
    pole.querySelector('#m-usterka').onclick = () => oknoZgloszeniaUsterki(auta);
  },
};

function kartaMojegoAuta(p, okres) {
  const pr = p.protokol || {};
  const odrzucony = pr.status === 'odrzucony';
  return `
    ${odrzucony ? `<div class="wstega blad">
      Biuro odrzuciło Twój przegląd za ${escHtml(pr.okres || okres)}.<br>
      <b>Powód: ${escHtml(pr.powod || 'nie podano')}</b><br>
      Popraw to i wyślij jeszcze raz — zdjęcia, które biuro już ma, zostają;
      zrób na nowo tylko te, o które prosi biuro.</div>` : ''}

    <div class="karta">
      <div class="karta-gora">
        <div>
          <h2 style="margin:0;font-size:26px">${escHtml(p.rejestracja)}</h2>
          <p class="slaby" style="margin:4px 0 0">${escHtml(
            [p.marka, p.model].filter(Boolean).join(' ') || '')}</p>
        </div>
        ${p.terminy ? plakietkaTerminu(p.terminy) : ''}
      </div>

      <p><b>Licznik:</b> ${p.przebieg != null
        ? escHtml(kilometry(p.przebieg)) : '<span class="slaby">jeszcze nie spisany</span>'}
        ${p.przebieg_o ? `<span class="slaby male">(${escHtml(polskaData(p.przebieg_o))})</span>`
                       : ''}</p>

      ${pr.do_zrobienia ? `
        <button class="glowny duzy" data-protokol-pojazd="${p.id}" style="width:100%">
          ${odrzucony ? 'Popraw i wyślij ponownie' : `Zrób przegląd za ${escHtml(pr.okres || okres)}`}
        </button>`
      : pr.status === 'nie_teraz'
      // Auto z przeglądem co kilka miesięcy — ta sama reguła co pulpit biura
      // i automat (cykl_przegladu we flotex.py). Przycisk zostaje mniejszy:
      // biuro czasem prosi o przegląd poza kolejką.
      ? `<div class="wstega info">Następny przegląd: ${escHtml(pr.nastepny || '')}
           (co ${escHtml(String(pr.co_mies || 1))} ${odmiana(pr.co_mies || 1,
             'miesiąc', 'miesiące', 'miesięcy')}).</div>
         <button data-protokol-pojazd="${p.id}" style="width:100%">Zrób przegląd teraz</button>`
      : `<div class="wstega ok">Przegląd za ${escHtml(pr.okres || okres)} jest oddany${
          pr.status === 'zatwierdzony' ? ' i zatwierdzony przez biuro' : ' — czeka na biuro'}.</div>
         <button data-protokol-pojazd="${p.id}" style="width:100%">Otwórz przegląd</button>`}
    </div>

    ${(p.terminy && p.terminy.lista || []).length ? `
      <details class="karta karta-zwijana"><summary>Moje terminy</summary>
        <div class="zwijana-tresc">${(p.terminy.lista).map(t => `
          <div class="brak">
            <span class="plakietka p-${escHtml(t.stan)}">${escHtml(opisTerminu(t.dni))}</span>
            <span><b>${escHtml(t.nazwa)}</b>${t.termin
              ? ' — do ' + escHtml(polskaData(t.termin)) : ''}</span>
          </div>`).join('')}</div></details>` : ''}

    ${(p.usterki || []).length ? `
      <details class="karta karta-zwijana"><summary>Zgłoszone usterki (${p.usterki.length})</summary>
        <div class="zwijana-tresc">${p.usterki.map(u => `
          <div class="brak">
            <span class="plakietka p-${escHtml(u.status)}">${
              escHtml(u.status.replace('_', ' '))}</span>
            <span>${escHtml(u.opis)}<br><span class="slaby male">${
              escHtml(polskaData(u.utworzono))}</span></span>
          </div>`).join('')}</div></details>` : ''}`;
}

/* -------------------------------------------------------- PROTOKÓŁ MIESIĘCZNY */

EKRANY.przeglad = {
  tytul: 'Przegląd',

  async rysuj(pole, param) {
    const d = await sprobuj(() => API.get('/api/moj-pojazd'));
    if (!d || !(d.pojazdy || []).length) {
      pole.innerHTML = `<div class="pusto"><span class="duza-ikona">🚗</span>
        Nie masz przypisanego auta.</div>`;
      return;
    }
    const auta = d.pojazdy;
    const wybrany = Number((param && param.pojazd) || (stan.parametryEkranu || {}).pojazd)
      || (stan._pojazdProtokolu && auta.some(a => a.id === stan._pojazdProtokolu)
          ? stan._pojazdProtokolu : auta[0].id);
    stan._pojazdProtokolu = wybrany;
    const p = auta.find(a => a.id === wybrany) || auta[0];
    const pr = p.protokol || {};
    const okres = pr.okres || d.okres;
    // Kadry, które serwer już ma w tym przeglądzie — nie każemy ich robić drugi raz.
    const naSerwerze = pr.kadry || [];

    // Brudnopis wczytujemy PRZED narysowaniem kafelków — inaczej kierowca przez
    // moment widzi pusty formularz i zaczyna robić zdjęcia od nowa.
    const szkic = await Zdjecia.wczytajSzkic(p.id).catch(() => null);
    const komplet = (szkic && szkic.komplet) || Zdjecia.pustyKomplet();

    pole.innerHTML = `
      ${pr.status === 'odrzucony' ? `<div class="wstega blad">
        Biuro odrzuciło poprzednią wysyłkę.<br><b>${escHtml(pr.powod || '')}</b></div>` : ''}
      ${naSerwerze.length ? `<div class="wstega info">Biuro ma już zdjęcia:
        ${naSerwerze.map(k => escHtml(Zdjecia.opisKadru(k).etykieta)).join(', ')}.
        Dorób tylko brakujące albo te, o które prosi biuro.</div>` : ''}
      ${szkic ? `<div class="wstega info">Wróciłem do niedokończonego przeglądu —
        zdjęcia i licznik czekały w telefonie.</div>` : ''}
      ${!stan.online ? `<div class="wstega uwaga">Nie ma teraz zasięgu.
        Zrób przegląd normalnie — wyślę go sam, gdy sieć wróci.</div>` : ''}

      <div class="karta">
        ${auta.length > 1 ? `<label class="pole">Auto
          <select id="pg-pojazd">${auta.map(a => `<option value="${a.id}"${
            a.id === p.id ? ' selected' : ''}>${escHtml(a.rejestracja)}</option>`).join('')}
          </select></label>`
        : `<h2 style="margin:0 0 8px;font-size:24px">${escHtml(p.rejestracja)}</h2>`}
        <p class="slaby" style="margin:0">Przegląd za <b>${escHtml(okres)}</b></p>

        <label class="pole">Stan licznika (km) *
          <input id="pg-przebieg" type="number" inputmode="numeric" class="duzy"
                 placeholder="np. 184320"
                 value="${szkic && szkic.przebieg != null ? szkic.przebieg : ''}"></label>
        ${p.przebieg != null ? `<p class="slaby male" style="margin-top:-6px">
          Ostatnio zapisano ${escHtml(kilometry(p.przebieg))}. Licznik nie może być mniejszy —
          jeśli był wymieniany, zgłoś to biuru.</p>` : ''}
      </div>

      <h3>Zdjęcia auta</h3>
      <div id="pg-postep">${Zdjecia.pasekPostepu(komplet, naSerwerze)}</div>
      <div id="pg-kafelki">${Zdjecia.kafelki(komplet, 'pg', naSerwerze)}</div>

      <div class="karta">
        <label class="pole">Uwagi (opcjonalnie)
          <textarea id="pg-uwagi" rows="2" maxlength="2000"
            placeholder="np. rysa na prawych drzwiach, pęknięta szyba">${
            escHtml((szkic && szkic.uwagi) || '')}</textarea></label>
      </div>

      <div id="pg-braki"></div>
      <div class="przyciski rozstaw">
        <button id="pg-usterka">Zgłoś przy okazji usterkę</button>
        <button class="glowny duzy" id="pg-wyslij">Wyślij przegląd</button>
      </div>`;

    const wePrzebieg = pole.querySelector('#pg-przebieg');
    const zbierz = () => ({
      komplet, przebieg: wePrzebieg.value.trim() || null,
      uwagi: pole.querySelector('#pg-uwagi').value.trim(),
    });

    // Nasłuch brudnopisu MUSI zostać rozłączony przy wyjściu z ekranu —
    // inaczej każde kolejne otwarcie przeglądu dokłada kolejny, zapisujący
    // formularz, którego już nie ma na ekranie.
    if (stan._pilnowanieSzkicu) stan._pilnowanieSzkicu.rozlacz();
    stan._pilnowanieSzkicu = Zdjecia.pilnujSzkicu(p.id, zbierz);

    const odswiezBraki = () => {
      const brak = Zdjecia.brakujace(komplet, naSerwerze);
      pole.querySelector('#pg-postep').innerHTML = Zdjecia.pasekPostepu(komplet, naSerwerze);
      pole.querySelector('#pg-braki').innerHTML = brak.length
        ? `<div class="wstega uwaga">Do wysłania brakuje jeszcze:
           <b>${brak.map(escHtml).join(', ')}</b>.</div>`
        : '<div class="wstega ok">Komplet zdjęć gotowy.</div>';
      // Przycisk zostaje AKTYWNY także przy brakach — po naciśnięciu powie
      // wprost, czego brakuje. Szary przycisk bez wyjaśnienia to najczęstszy
      // powód telefonu do biura: „program nie działa, nie da się wysłać".
      pole.querySelector('#pg-wyslij').classList.toggle('nieaktywny', brak.length > 0);
    };

    Zdjecia.podepnijKafelki(pole, komplet, () => {
      odswiezBraki();
      stan._pilnowanieSzkicu.zapisz();
    });
    odswiezBraki();

    wePrzebieg.onchange = () => stan._pilnowanieSzkicu.zapisz();
    if (auta.length > 1) {
      pole.querySelector('#pg-pojazd').onchange = e =>
        pokazEkran('przeglad', { pojazd: Number(e.target.value) });
    }
    pole.querySelector('#pg-usterka').onclick = () => oknoZgloszeniaUsterki(p);
    pole.querySelector('#pg-wyslij').onclick = () => wyslijProtokol(p, okres, komplet, pole);
  },
};

async function wyslijProtokol(p, okres, komplet, pole) {
  // Kadry z serwera liczą się jak zrobione: po odrzuceniu dawniej trzeba było
  // dorobić wszystkie pięć, choć serwer (brakujace_ujecia) i tak by je przyjął.
  const brak = Zdjecia.brakujace(komplet, (p.protokol || {}).kadry);
  if (brak.length) {
    komunikat('Brakuje zdjęć: ' + brak.join(', ') + '. Bez kompletu biuro nie przyjmie przeglądu.',
              'blad');
    return;
  }
  const surowy = pole.querySelector('#pg-przebieg').value.trim();
  if (!surowy) { komunikat('Wpisz stan licznika', 'blad'); return; }
  const km = Number(surowy);
  if (!Number.isFinite(km) || km < 0) { komunikat('Licznik ma być liczbą kilometrów', 'blad'); return; }
  // Sprawdzamy tu, a nie dopiero na serwerze: kierowca stoi jeszcze przy aucie
  // i może spojrzeć na licznik drugi raz. Odpowiedź serwera przyjdzie czasem
  // dopiero za godzinę, gdy telefon złapie zasięg — a wtedy auta już nie ma.
  if (p.przebieg != null && km < p.przebieg) {
    const mimo = await potwierdz('Licznik mniejszy niż ostatnio?',
      `Ostatnio zapisano ${kilometry(p.przebieg)}, a wpisujesz ${kilometry(km)}. `
      + 'Biuro i tak to odrzuci, chyba że licznik był wymieniany.',
      { tak: 'Sprawdzę licznik', nie: 'Wyślij mimo to' });
    if (mimo) { pole.querySelector('#pg-przebieg').focus(); return; }
  }

  // uuid NIE jest tu nadawany: Kolejka.dodaj liczy go z tresci paczki, wiec
  // dwukrotne nacisniecie „Wyslij" daje ten sam numer i nadpisuje wpis
  // zamiast robic drugi protokol.
  const operacja = {
    typ: 'przeglad',
    pojazd: p.id,
    okres,
    przebieg: km,
    czas: czasTeraz(),
    uwagi: pole.querySelector('#pg-uwagi').value.trim(),
    // Klucz `zdjecia`, nie `ujecia` — tak czyta paczke _ujecia_z_paczki()
    // we flotex.py, i tak samo dla protokolu (pary kadr+obraz), jak dla
    // zgloszenia usterki (sama lista obrazow).
    zdjecia: Zdjecia.doPaczki(komplet),
  };
  try {
    await doKolejki(operacja, 'Przegląd przyjęty');
  } catch (e) {
    return;                       // doKolejki samo powiedziało, co się stało
  }
  // Brudnopis kasujemy DOPIERO teraz — dopóki paczka nie leżała w kolejce,
  // był jedynym egzemplarzem tego obchodu.
  await Zdjecia.skasujSzkic(p.id).catch(() => {});
  if (stan._pilnowanieSzkicu) { stan._pilnowanieSzkicu.rozlacz(); stan._pilnowanieSzkicu = null; }
  pokazEkran('moj');
}

/* ---------------------------------------------------------- ZGŁOSZENIE USTERKI */

/* `pojazd`: jedno auto (zgłoszenie z ekranu przeglądu), lista aut (z ekranu
   „Moje auto" — przy kilku jest wybór) albo nic (pobieramy listę).        */
async function oknoZgloszeniaUsterki(pojazd) {
  let auta = Array.isArray(pojazd) ? pojazd : (pojazd ? [pojazd] : null);
  if (!auta) {
    const d = await sprobuj(() => API.get('/api/moj-pojazd'));
    auta = (d && d.pojazdy) || [];
  }
  if (!auta || !auta.length) { komunikat('Nie masz przypisanego auta', 'blad'); return; }

  const zdjecia = [];
  const WAGI = [['drobna', 'drobna — może poczekać'],
                ['powazna', 'poważna — do naprawy szybko'],
                ['unieruchamiajaca', 'nie da się jechać']];
  okno({
    tytul: 'Zgłoszenie usterki',
    tresc: `
      ${auta.length > 1 ? `<label class="pole">Auto
        <select id="u-pojazd">${auta.map(a => `<option value="${a.id}">${
          escHtml(a.rejestracja)}</option>`).join('')}</select></label>`
      : `<p class="slaby">Auto: <b>${escHtml(auta[0].rejestracja)}</b></p>`}
      <label class="pole">Co jest nie tak *
        <textarea id="u-opis" rows="3" maxlength="500"
          placeholder="np. Świeci kontrolka silnika od wtorku, auto szarpie przy ruszaniu"></textarea>
      </label>
      <label class="pole">Jak pilne</label>
      <div class="chipy" id="u-wagi">${WAGI.map(([kod, opis], i) =>
        `<button type="button" class="chip${i === 0 ? ' wybrany' : ''}" data-waga="${kod}">${
          escHtml(opis)}</button>`).join('')}</div>
      <label class="pole">Zdjęcie (opcjonalnie)</label>
      <div class="miniatury" id="u-miniatury"></div>
      <div class="chipy">
        <label class="chip">📷 Zrób zdjęcie
          <input type="file" class="ukryty" accept="image/*" capture="environment" id="u-aparat"></label>
        <label class="chip">🖼️ Z galerii
          <input type="file" class="ukryty" accept="image/*" multiple id="u-galeria"></label>
      </div>`,
    poOtwarciu: (tresc) => {
      const pojemnik = tresc.querySelector('#u-miniatury');
      const opcje = { maks: 3, nazwa: 'Usterka' };
      ['#u-aparat', '#u-galeria'].forEach(sel => {
        const we = tresc.querySelector(sel);
        we.onchange = () => Zdjecia.dodaj(we.files, zdjecia, pojemnik, we, opcje);
      });
      tresc.querySelectorAll('[data-waga]').forEach(b => {
        b.onclick = () => {
          tresc.querySelectorAll('[data-waga]').forEach(x => x.classList.remove('wybrany'));
          b.classList.add('wybrany');
        };
      });
      tresc.querySelector('#u-opis').focus();
    },
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Zgłoś', klasa: 'glowny', klik: async (zamknij) => {
        const tresc = document.getElementById('okno-tresc');
        const opis = tresc.querySelector('#u-opis').value.trim();
        if (opis.length < 3) {
          komunikat('Napisz krótko, co jest nie tak — biuro musi wiedzieć, czego szukać', 'blad');
          return;
        }
        const wybrana = tresc.querySelector('[data-waga].wybrany');
        const wybor = tresc.querySelector('#u-pojazd');
        try {
          await doKolejki({
            typ: 'usterka',
            pojazd: wybor ? Number(wybor.value) : auta[0].id,
            opis,
            waga: wybrana ? wybrana.dataset.waga : 'drobna',
            czas: czasTeraz(),
            zdjecia: Zdjecia.doPaczkiUsterki(zdjecia),
          }, 'Usterka zgłoszona');
        } catch (e) {
          return;
        }
        zamknij();
        odswiezEkran();
      } },
    ],
  });
}
