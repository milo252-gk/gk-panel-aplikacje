/* Reklamacje klientów zewnętrznych (KONTRAKT §6.3, D14).

   „Przekazanie do odpowiedniego lidera” dzieje się przez LINIĘ: reklamację widzą
   liderzy tej linii na każdej zmianie. Linię podpowiada słownik wyrobów
   (kod_wyrobu → linia), a kontroler ją zatwierdza albo zmienia — to pole
   wymagane, bo bez niego reklamacja nie trafi do nikogo.
   Lider tylko potwierdza odczyt (reklamacja.odczytana → mapa odczyty po autorze). */

(function (KJ) {
  'use strict';

  const { hala, W, esc } = KJ;
  const BRUDNOPIS = 'reklamacja-nowa';

  KJ.ekran('reklamacje', {
    rysuj(el) {
      const lista = W.listaReklamacji({ reklamacje: hala.obiekty('reklamacja'), slowniki: hala.slowniki, pracownicy: hala.pracownicy });
      const otwarte = lista.filter(r => r.otwarta), zamkniete = lista.filter(r => !r.otwarta);
      el.innerHTML = `
        <div class="tytul-ekranu"><h1>Reklamacje</h1>
          ${KJ.mozna('reklamacja.zarejestrowana') ? '<a class="przycisk glowny" href="#reklamacja-nowa">Nowa</a>' : ''}</div>
        <div class="lista">${otwarte.map(karta).join('') || '<p class="pusto">Brak otwartych reklamacji</p>'}</div>
        ${zamkniete.length ? `<details class="archiwum"><summary>Zamknięte (${zamkniete.length})</summary><div class="lista">${zamkniete.map(karta).join('')}</div></details>` : ''}`;
    },
  });

  function karta(r) {
    return `<a class="karta reklamacja ${r.otwarta ? '' : 'zamknieta'}" href="#reklamacja/${encodeURIComponent(r.id)}">
      <div class="wiersz"><span class="znacznik ${r.otwarta ? 'uwaga' : 'neutral'}">${esc(r.numer)}</span>
        <b>${esc(r.wyrob)}</b>${r.wyrobNazwa ? `<span class="slaby">${esc(r.wyrobNazwa)}</span>` : ''}
        ${r.oczekuje ? '<span class="znacznik info">czeka na wysłanie</span>' : ''}</div>
      <div class="slaby">${esc(r.liniaNazwa)}${r.klient ? ' · ' + esc(r.klient) : ''} · ${esc(W.kiedy(r.czas, hala.teraz()))}</div>
      ${r.otwarta ? `<div class="${r.odczyty.length ? 'tekst-ok' : 'tekst-uwaga'}">${r.odczyty.length
        ? 'Odczytał: ' + esc(r.odczyty.map(o => o.kto).join(', ')) : 'Lider jeszcze nie odczytał'}</div>` : `<div class="slaby">${esc(r.etykieta)}</div>`}
    </a>`;
  }

  KJ.ekran('reklamacja', {
    zakladka: 'reklamacje',
    rysuj(el, id) {
      const r = hala.obiekt('reklamacja', id);
      if (!r) { el.innerHTML = '<p class="pusto">Nie ma takiej reklamacji. <a href="#reklamacje">Wróć do listy</a></p>'; return; }
      const d = r.dane, odczyty = W.odczytyReklamacji(r, hala.pracownicy);
      el.innerHTML = `<a class="wstecz" href="#reklamacje">‹ Reklamacje</a>
        <div class="wiersz"><span class="znacznik ${r.status === 'otwarta' ? 'uwaga' : 'neutral'}">${esc(W.numer(r))}</span><span class="slaby">${esc(r.etykieta)}</span></div>
        <h1>${esc(d.kod_wyrobu)} <span class="slaby">${esc(W.nazwaWyrobu(hala.slowniki, d.kod_wyrobu) || '')}</span></h1>
        <dl class="szczegoly">
          <dt>Linia</dt><dd>${esc(W.nazwaLinii(hala.slowniki, r.linia))}</dd>
          ${d.partia ? `<dt>Partia</dt><dd>${esc(d.partia)}</dd>` : ''}
          ${d.klient ? `<dt>Klient</dt><dd>${esc(d.klient)}</dd>` : ''}
          <dt>Zarejestrował</dt><dd>${esc(W.nazwaPracownika(hala.pracownicy, d.zarejestrowal) || '—')} · ${esc(W.kiedy(d.czas_rejestracji, hala.teraz()))}</dd>
          <dt>Opis</dt><dd class="tekst">${esc(d.opis)}</dd>
          <dt>Odczytali</dt><dd>${odczyty.map(o => `${esc(o.kto)} <span class="slaby">${esc(W.kiedy(o.czas, hala.teraz()))}</span>`).join('<br>') || '<span class="tekst-uwaga">jeszcze nikt</span>'}</dd>
          ${r.status === 'zamknieta' ? `<dt>Zamknięta</dt><dd>${esc(W.kiedy(d.czas_zamkniecia, hala.teraz()))}${d.rozstrzygniecie ? ': ' + esc(d.rozstrzygniecie) : ''}</dd>` : ''}
        </dl>
        <div class="zdjecia">${KJ.miniatury(d.zdjecia)}</div>
        ${r.status === 'otwarta' && KJ.mozna('reklamacja.zamknieta') ? '<button type="button" id="zamknij" class="szeroki">Zamknij reklamację</button>' : ''}`;
      const b = el.querySelector('#zamknij');
      if (b) b.addEventListener('click', async () => {
        const w = await KJ.okno({
          tytul: 'Zamknąć reklamację?',
          tresc: '<label>Rozstrzygnięcie<textarea name="rozstrzygniecie" rows="3" maxlength="4000" placeholder="np. Uznana, wymiana partii, działania korygujące…"></textarea></label>',
          przyciski: [{ tekst: 'Anuluj', wartosc: false }, { tekst: 'Zamknij', wartosc: true, glowny: true }],
        });
        if (!w || !w.wartosc) return;
        const t = String(w.dane.get('rozstrzygniecie') || '').trim();
        await hala.zapisz('reklamacja.zamknieta', r.id, t ? { rozstrzygniecie: t } : {});
        KJ.komunikat('Reklamacja zamknięta');
      });
    },
  });

  // ------------------------------------------------------------ nowa reklamacja

  const pusty = () => ({ kod_wyrobu: '', linia: '', liniaRecznie: false, partia: '', klient: '', opis: '', zdjecia: [] });
  let f = pusty();

  KJ.ekran('reklamacja-nowa', {
    zakladka: 'reklamacje',
    formularz: true,
    async rysuj(el) {
      if (!KJ.mozna('reklamacja.zarejestrowana')) { el.innerHTML = '<p class="pusto">Reklamacje rejestruje kontroler albo kierownik KJ.</p>'; return; }
      f = Object.assign(pusty(), (await hala.brudnopis.odczytaj(BRUDNOPIS)) || {});
      el.innerHTML = `<a class="wstecz" href="#reklamacje">‹ Reklamacje</a>
        <h1>Nowa reklamacja</h1>
        <form id="f-reklamacja" class="formularz" autocomplete="off" novalidate>
          <label>Kod wyrobu<input name="kod_wyrobu" list="lista-wyrobow" value="${esc(f.kod_wyrobu)}" autocapitalize="characters" placeholder="np. W-200"></label>
          <datalist id="lista-wyrobow"></datalist>
          <div class="slaby" id="nazwa-wyrobu"></div>
          <fieldset><legend>Linia <span class="slaby" id="skad-linia"></span></legend><div class="wybor" id="linia-reklamacji"></div></fieldset>
          <label>Numer partii <span class="slaby">(opcjonalnie)</span><input name="partia" value="${esc(f.partia)}"></label>
          <label>Klient <span class="slaby">(opcjonalnie)</span><input name="klient" maxlength="200" value="${esc(f.klient)}"></label>
          <label>Opis wady od klienta<textarea name="opis" rows="4" maxlength="4000">${esc(f.opis)}</textarea></label>
          <div class="zdjecia" id="r-zdjecia"></div>
          <p class="blad" id="bledy-reklamacji" hidden></p>
          <div class="przyciski-formularza">
            <button type="button" id="porzuc">Wyczyść</button>
            <button type="submit" class="glowny">Zarejestruj</button>
          </div>
        </form>`;
      rysujWyroby(el); rysujLinie(el); rysujZdjecia(el);
      const form = el.querySelector('#f-reklamacja');
      form.addEventListener('input', ev => {
        czytaj(form);
        if (ev.target.name === 'kod_wyrobu') podpowiedzLinie(el);
        hala.brudnopis.zapisz(BRUDNOPIS, f);
      });
      KJ.przyZapisie(form, zarejestruj);
      el.querySelector('#porzuc').addEventListener('click', async () => {
        if (!(await KJ.potwierdz('Wyczyścić formularz?', 'Wpisane dane i zdjęcia znikną.', 'Wyczyść'))) return;
        await hala.brudnopis.usun(BRUDNOPIS);
        KJ.idz('reklamacja-nowa');
      });
    },
    odswiez(el) { rysujWyroby(el); rysujLinie(el); },
  });

  function czytaj(form) {
    const d = new FormData(form);
    for (const k of ['kod_wyrobu', 'partia', 'klient', 'opis']) f[k] = String(d.get(k) || '');
  }

  /* Kod wyrobu z listy → linia ze słownika. Linii wybranej ręcznie nie nadpisujemy. */
  function podpowiedzLinie(el) {
    const kod = kodWyrobu();
    const z = W.liniaWyrobu(hala.slowniki, kod);
    if (z && !f.liniaRecznie) f.linia = z;
    rysujLinie(el);
  }
  // Wyrób ze słownika dopasowany bez względu na wielkość liter (w-200 = W-200).
  function kodWyrobu() {
    const t = f.kod_wyrobu.trim();
    return Object.keys(hala.slowniki.wyroby || {}).find(k => k.toLowerCase() === t.toLowerCase()) || t;
  }

  function rysujWyroby(el) {
    const dl = el.querySelector('#lista-wyrobow');
    if (dl) dl.innerHTML = Object.entries(hala.slowniki.wyroby || {}).map(([k, w]) => `<option value="${esc(k)}">${esc(w.nazwa)}</option>`).join('');
  }

  function rysujLinie(el) {
    const box = el.querySelector('#linia-reklamacji');
    if (!box) return;
    const z = W.liniaWyrobu(hala.slowniki, kodWyrobu());
    const nazwa = W.nazwaWyrobu(hala.slowniki, kodWyrobu());
    el.querySelector('#nazwa-wyrobu').textContent = nazwa || (f.kod_wyrobu.trim() ? 'Wyrobu nie ma w słowniku — wybierz linię ręcznie.' : '');
    el.querySelector('#skad-linia').textContent = f.linia && z === f.linia ? '(podpowiedź z wyrobu — zmień, jeśli trzeba)' : '';
    box.innerHTML = W.linie(hala.slowniki).map(l => `<button type="button" data-linia="${esc(l.kod)}" aria-pressed="${f.linia === l.kod}">${esc(l.nazwa)}</button>`).join('');
  }

  function rysujZdjecia(el) {
    const box = el.querySelector('#r-zdjecia');
    if (!box) return;
    box.innerHTML = KJ.miniatury(f.zdjecia, true) + (f.zdjecia.length < W.MAKS_ZDJEC
      ? '<button type="button" class="zrob-zdjecie" data-akcja="zdjecie"><span class="ikona" aria-hidden="true">📷</span>Zdjęcie wady</button>'
      : `<p class="slaby">Najwyżej ${W.MAKS_ZDJEC} zdjęć.</p>`);
    KJ.wypelnijZdjecia(box);
  }

  document.addEventListener('click', async ev => {
    if (!KJ.biezacy || KJ.biezacy.nazwa !== 'reklamacja-nowa') return;
    const el = KJ.$('ekran');
    const l = ev.target.closest('#linia-reklamacji button');
    if (l) {
      f.linia = l.dataset.linia;
      f.liniaRecznie = f.linia !== W.liniaWyrobu(hala.slowniki, kodWyrobu());
      rysujLinie(el); hala.brudnopis.zapisz(BRUDNOPIS, f);
      return;
    }
    if (ev.target.closest('[data-akcja="zdjecie"]')) {
      if (f.zdjecia.length >= W.MAKS_ZDJEC) return;
      const cel = f;                                   // formularz mógł w tym czasie zostać zapisany/wyczyszczony
      const id = await KJ.zrobZdjecie();
      if (id && f === cel) { f.zdjecia.push(id); rysujZdjecia(KJ.$('ekran')); hala.brudnopis.zapisz(BRUDNOPIS, f, { odrazu: true }); }
      return;
    }
    const u = ev.target.closest('#r-zdjecia [data-usun-zdjecie]');
    if (u) { f.zdjecia = f.zdjecia.filter(x => x !== u.dataset.usunZdjecie); rysujZdjecia(el); hala.brudnopis.zapisz(BRUDNOPIS, f); }
  });

  async function zarejestruj(form) {
    czytaj(form);
    f.kod_wyrobu = kodWyrobu();
    const bledy = W.bledyReklamacji(f);
    const b = form.querySelector('#bledy-reklamacji');
    b.hidden = !bledy.length;
    b.innerHTML = bledy.map(esc).join('<br>');
    if (bledy.length) return;
    const id = hala.nowyId();
    await hala.zapisz('reklamacja.zarejestrowana', id, W.daneReklamacji(f));
    await hala.brudnopis.usun(BRUDNOPIS);
    const linia = f.linia;                           // przed pusty() — inaczej komunikat mówił „liderom: —”
    f = pusty();                                     // spóźnione zdjęcie nie wskrzesi wysłanego formularza
    KJ.komunikat(W.komunikatReklamacji(hala.slowniki, linia));
    KJ.idz('reklamacja/' + id);
  }
})(window.KJ);
