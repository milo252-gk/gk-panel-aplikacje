/* RCP: Lider i Mistrz sprawdzają ludzi ze swojej zmiany (D96). Lista osób zmiany (linie osoby ∩ moje linie — liczy serwer) ze stanem
   odbić: wszedł o…, spóźnienie, brak wyjścia. „Sprawdzone” przy osobie (z uwagą, gdy jest spóźnienie albo brak) i JEDNA notatka do zmiany;
   po komplecie serwer odhacza pozycję checklisty z wymogiem „RCP”. To potwierdzenie — dzień zatwierdza kierownik w Panelu.

   Ekran działa tylko z siecią (hala.zapytaj, bez kolejki): „Sprawdzone” ma być prawdą w chwili kliknięcia. Szkielet rysuje się RAZ,
   a odświeżanie co 20 s podmienia tylko listę — notatka i uwagi, które ktoś pisze, nie giną przy przerysowaniu ekranu. */

(function () {
  'use strict';

  const L = window.Lider, hala = L.hala, W = L.W, esc = L.esc;
  const ODSWIEZ_MS = 20000;
  const S = { stan: null, blad: '', ostatnio: 0, wczytuje: false, notatka: '', uwagi: {}, zajete: new Set() };
  let korzen = null;

  const api = (metoda, sciezka, cialo) => hala.zapytaj(metoda, '/api/v1/lider/rcp/' + sciezka, cialo);
  const tekstBledu = e => (e && e.message) || 'Brak połączenia z serwerem — RCP działa tylko z siecią.';

  async function wczytaj() {
    if (S.wczytuje) return;
    S.wczytuje = true;
    try {
      S.stan = await api('GET', 'zmiana' + (S.zmiana ? `?zmiana=${encodeURIComponent(S.zmiana)}` : ''));
      S.blad = '';
    } catch (e) { S.blad = tekstBledu(e); }
    finally { S.wczytuje = false; S.ostatnio = Date.now(); rysujListe(); }
  }

  const znacznik = (z) => `<span class="znacznik ${esc(z.rodzaj || '')}">${esc(z.tekst)}</span>`;

  function wiersz(o) {
    const w = W.rcpOsoba(o);
    const kto = w.sprawdzone;
    return `<li class="rcp-osoba${kto ? ' sprawdzona' : ''}" data-osoba="${esc(w.id)}">
      <div class="rcp-osoba-glowna">
        <b>${esc(w.nazwa)}</b><span class="rcp-znaczniki">${w.znaczniki.map(znacznik).join('')}</span>
        ${kto ? `<span class="rcp-sprawdzone">${L.ik('haczyk', 16)}Sprawdzone${kto.uwaga ? ` · ${esc(kto.uwaga)}` : ''}</span>`
              : `<button type="button" class="glowny maly" data-a="sprawdz"${S.zajete.has(w.id) ? ' disabled' : ''}>${L.ik('haczyk', 16)}Sprawdzone</button>`}
      </div>
      ${!kto && w.uwaga ? `<input class="rcp-uwaga" data-uwaga maxlength="300" placeholder="Uwaga do tej osoby (opcjonalnie)" aria-label="Uwaga do: ${esc(w.nazwa)}" value="${esc(S.uwagi[w.id] || '')}">` : ''}
    </li>`;
  }

  /* Tylko lista i podsumowanie — pole notatki zostaje w spokoju. */
  function rysujListe() {
    if (!korzen) return;
    const st = S.stan, lista = korzen.querySelector('[data-lista]'), info = korzen.querySelector('[data-info]');
    korzen.querySelector('[data-blad]').textContent = S.blad;
    korzen.querySelector('[data-blad]').hidden = !S.blad;
    if (!st || !st.zmiana) {
      info.textContent = st && !st.zmiana ? 'Teraz nie trwa żadna zmiana.' : (S.blad ? '' : 'Wczytuję…');
      lista.innerHTML = '';
      odswiezPrzycisk();
      return;
    }
    const p = W.rcpPodsumowanie(st, S.notatka, st.moje_potwierdzenie);
    info.innerHTML = `Zmiana <b>${esc(st.kod)}</b>, ${esc(W.godzina(st.start))}–${esc(W.godzina(st.koniec))} · sprawdzone <b>${p.sprawdzone}</b> z <b>${p.razem}</b>${st.biezaca && st.biezaca !== st.zmiana ? ' · to nie bieżąca zmiana' : ''}`;
    const podpis = JSON.stringify(st.osoby) + [...S.zajete].join();
    if (lista.dataset.podpis !== podpis) {
      lista.dataset.podpis = podpis;
      lista.innerHTML = st.osoby.map(wiersz).join('')
        || (st.poza_zakresem
          ? `<li class="pusto tekst-uwaga">Na tej zmianie jest ${st.poza_zakresem} os., ale żadna nie jest przypisana do Twoich linii. Zgłoś kierownikowi przypisanie linii — samą notatką nikogo nie sprawdzisz.</li>`
          : '<li class="pusto">Nikogo na tej zmianie w Twoich liniach. Jeśli tak ma być, wystarczy notatka.</li>');
    }
    odswiezPrzycisk();
  }

  function odswiezPrzycisk() {
    if (!korzen) return;
    const st = S.stan, p = W.rcpPodsumowanie(st, S.notatka, st && st.moje_potwierdzenie);
    const b = korzen.querySelector('[data-a=potwierdz]');
    b.disabled = !p.mozna || S.zajete.has('potwierdz');
    korzen.querySelector('[data-podpowiedz]').textContent = st && st.zmiana ? p.podpowiedz : '';
    korzen.querySelector('[data-notatka]').disabled = !!(st && st.moje_potwierdzenie);
    const pot = korzen.querySelector('[data-potwierdzenia]');
    pot.innerHTML = ((st && st.potwierdzenia) || []).map(x => `<p class="slaby">${L.ik('haczyk', 14)}Potwierdził: <b>${esc(x.kto)}</b>, ${esc(W.godzina(x.kiedy))} — ${esc(x.notatka)}</p>`).join('');
  }

  async function polecenie(klucz, wywolanie, sukces) {
    S.zajete.add(klucz); rysujListe();
    try { await wywolanie(); if (sukces) L.komunikat(sukces, 'ok'); }
    catch (e) { L.komunikat(tekstBledu(e), 'blad'); }
    finally { S.zajete.delete(klucz); await wczytaj(); }
  }

  function zbuduj(el) {
    el.innerHTML = `<h1>Ludzie ze zmiany (RCP)</h1>
      <p class="slaby">Sprawdź odbicia osób ze swojej zmiany i swoich linii, napisz jedną notatkę do zmiany i potwierdź. Dzień zatwierdza kierownik.</p>
      <p class="blad" role="alert" data-blad hidden></p>
      <p data-info>Wczytuję…</p>
      <ul class="rcp-lista" data-lista></ul>
      <label class="rcp-notatka">Notatka do zmiany
        <textarea data-notatka rows="3" maxlength="1000" placeholder="np. wszyscy obecni, Kowalski spóźniony — korek"></textarea></label>
      <p class="slaby" data-podpowiedz></p>
      <button type="button" class="glowny szeroki duzy" data-a="potwierdz" disabled>${L.ik('haczyk', 18)}Potwierdzam zmianę</button>
      <div data-potwierdzenia></div>`;
    korzen = el;
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-a]');
      if (!b || b.disabled || !S.stan) return;
      if (b.dataset.a === 'sprawdz') {
        const id = b.closest('[data-osoba]').dataset.osoba;
        polecenie(id, () => api('POST', 'sprawdz', { zmiana: S.stan.zmiana, osoba: id, uwaga: S.uwagi[id] || '' }));
      } else if (b.dataset.a === 'potwierdz') {
        polecenie('potwierdz', async () => {
          const w = await api('POST', 'potwierdz', { zmiana: S.stan.zmiana, notatka: S.notatka });
          if (w.ostrzezenie) L.komunikat(w.ostrzezenie, 'blad');
          else L.komunikat(w.pozycje ? 'Zmiana potwierdzona — pozycja checklisty odhaczona.' : 'Zmiana potwierdzona.', 'ok');
        });
      }
    });
    el.addEventListener('input', ev => {
      if (ev.target.matches('[data-notatka]')) { S.notatka = ev.target.value; odswiezPrzycisk(); }
      else if (ev.target.matches('[data-uwaga]')) S.uwagi[ev.target.closest('[data-osoba]').dataset.osoba] = ev.target.value;
    });
  }

  L.ekrany.rcp = {
    rysuj(el) {
      if (!korzen || !el.contains(korzen)) { korzen = null; el.textContent = ''; zbuduj(el); rysujListe(); wczytaj(); return; }
      if (Date.now() - S.ostatnio > ODSWIEZ_MS) wczytaj();
    },
  };
})();
