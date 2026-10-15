/* Panel Kierownika — 📅 Kalendarz zleceń (D71, właściciel 2026-10-15: „Dodaj do aplikacji kalendarz, żeby móc też
   wybierać dni zleceń”).

   Miesiąc: co dnia zlecą zapisane stałe (te same reguły co hub — Hala.wystapieniaStale) i co jest zaplanowane na później
   (D47). Dotknięcie dnia → lista z „Pomiń ten dzień” / „Przywróć” (pole harmonogram.pomin — tylko to jedno wystąpienie,
   seria zostaje), „Zakończ po tym dniu” (harmonogram.do) i „Zmień” (okno zapisanego). Zleceń nie robi Panel — hub.
   Logika: W.kalendarzZlecen (widok.js, testy w panel/testy/widok-testy.js). */

(() => {
  'use strict';
  const P = window.Panel;
  const { hala, W, $, esc } = P;
  const stan = { rok: 0, miesiac: 0, dzien: null };
  let ostatnie = null;                          // ostatnie dane rysowania — dotknięcie dnia rysuje bez czekania na hub

  function ustawDzis() {
    const m = /^(\d{4})-(\d{2})/.exec(W.dzienZakladu(hala.teraz()));
    stan.rok = +m[1]; stan.miesiac = +m[2];
    stan.dzien = W.dzienZakladu(hala.teraz());
  }

  function rysuj(d, lista) {
    if (d) ostatnie = { d, lista };
    if (!ostatnie) return;
    if (!stan.rok) ustawDzis();
    const k = W.kalendarzZlecen({ slowniki: ostatnie.d.slowniki, pracownicy: ostatnie.d.pracownicy, stale: ostatnie.d.stale,
                                  zlecenia: ostatnie.lista, rok: stan.rok, miesiac: stan.miesiac, teraz: ostatnie.d.teraz });
    $('kal-tytul').textContent = k.tytul;
    $('kal-siatka').innerHTML = W.DNI_NAZWY.map(n => `<span class="kal-naglowek" aria-hidden="true">${esc(n.slice(0, 2))}</span>`).join('')
      + k.dni.map(c => {
        const tytuly = c.pozycje.filter(p => !p.pominiety).slice(0, 2).map(p => `<span class="kal-wpis${p.zaplanowane ? ' plan' : ''}">${esc(p.tytul)}</span>`).join('');
        const wiecej = c.liczba > 2 ? `<span class="kal-wiecej">+${c.liczba - 2}</span>` : '';
        return `<button type="button" class="kal-komorka${c.wMiesiacu ? '' : ' poza'}${c.dzis ? ' dzis' : ''}${c.przeszly ? ' przeszly' : ''}${c.swieto ? ' swieto' : ''}${c.weekend ? ' weekend' : ''}${stan.dzien === c.data ? ' wybrany' : ''}"
            data-data="${c.data}" aria-pressed="${stan.dzien === c.data}" aria-label="${esc(`${c.data}${c.swieto ? `, ${c.swieto}` : ''}: ${c.liczba} ${c.liczba === 1 ? 'zlecenie' : 'zleceń'}`)}">
          <span class="kal-nr">${c.dzien}</span>${c.liczba ? `<span class="kal-licznik">${c.liczba}</span>` : ''}
          <span class="kal-wpisy">${tytuly}${wiecej}</span></button>`;
      }).join('');
    rysujDzien(k.dni.find(c => c.data === stan.dzien));
  }

  function rysujDzien(c) {
    const el = $('kal-dzien');
    if (!c) { el.innerHTML = '<p class="slaby">Dotknij dnia, żeby zobaczyć jego zlecenia.</p>'; return; }
    const pisze = P.mozeZapisacStale();
    const dt = (new Date(`${c.data}T12:00:00Z`).getUTCDay() + 6) % 7;
    const naglowek = `<h3>${esc(`${W.DNI_NAZWY[dt]}, ${W.dataDluga(`${c.data}T12:00:00Z`)}`)}${c.swieto ? ` <span class="znacznik alarm">${esc(c.swieto)}</span>` : ''}</h3>`;
    const wiersze = c.pozycje.map(p => `
      <article class="kal-pozycja${p.pominiety ? ' pominieta' : ''}" ${p.kod ? `data-kod="${esc(p.kod)}"` : ''}>
        <div class="opis">
          <div><b>${p.checklista ? '☑ ' : ''}${esc(p.tytul)}</b> ${p.zaplanowane ? '<span class="znacznik neutral">Zaplanowane</span>' : ''}
            ${p.pominiety ? `<span class="znacznik">${esc(p.pominiety === 'pominięty' ? 'Pominięte' : `Pominięte — ${p.pominiety}`)}</span>` : ''}</div>
          <div class="slaby">${p.godziny.length ? esc(p.godziny.join(', ')) + ' · ' : ''}${esc(p.dla || '')}</div>
        </div>
        ${pisze && p.kod && !c.przeszly ? `<div class="akcje">
          ${p.pominiety === 'pominięty' ? '<button type="button" class="maly" data-akcja="przywroc">Przywróć</button>'
            : !p.pominiety ? '<button type="button" class="maly" data-akcja="pomin">Pomiń ten dzień</button>' : ''}
          ${!p.pominiety ? '<button type="button" class="maly" data-akcja="zakoncz">Zakończ po tym dniu</button>' : ''}
          <button type="button" class="maly" data-akcja="zmien">Zmień</button></div>` : ''}
      </article>`).join('');
    el.innerHTML = naglowek + (wiersze || `<p class="pusto">${c.przeszly ? 'Tego dnia nic nie było zaplanowane.' : 'Nic zaplanowanego.'}${
      pisze ? ' Nowe stałe zlecenie: 💾 Zapisane → „+ Nowe zapisane”.' : ''}</p>`);
  }

  async function zapiszHarmonogram(kod, zmiana, komunikat) {
    const s = ((hala.slowniki || {}).zlecenia_stale || {})[kod];
    if (!s) return;
    // Autor = kto zapisuje: od teraz hub zleca w imieniu tej osoby (kontrakt — hub to sprawdza), jak „Wstrzymaj”.
    const wartosc = Object.assign({}, s, { harmonogram: zmiana(Object.assign({}, s.harmonogram || {})), autor: hala.pracownik.id });
    await hala.zapisz('slownik.zapisany', `zlecenia_stale/${kod}`, { slownik: 'zlecenia_stale', klucz: kod, wartosc });
    P.komunikat(komunikat, 'ok');
  }

  $('zlecenia-kalendarz').addEventListener('click', async ev => {
    const nav = ev.target.closest('[data-kal]');
    if (nav) {
      if (+nav.dataset.kal === 0) ustawDzis();
      else {
        const d = new Date(Date.UTC(stan.rok, stan.miesiac - 1 + (+nav.dataset.kal), 1));
        stan.rok = d.getUTCFullYear(); stan.miesiac = d.getUTCMonth() + 1;
      }
      rysuj();
      return;
    }
    const dzien = ev.target.closest('.kal-komorka');
    if (dzien) { stan.dzien = dzien.dataset.data; rysuj(); return; }
    const b = ev.target.closest('[data-akcja]');
    if (!b) return;
    const kod = b.closest('[data-kod]').dataset.kod;
    const data = stan.dzien;
    const s = ((hala.slowniki || {}).zlecenia_stale || {})[kod];
    if (!s || !data) return;
    try {
      if (b.dataset.akcja === 'zmien') P.widoki.stale.otworzKod(kod);
      if (b.dataset.akcja === 'pomin' || b.dataset.akcja === 'przywroc')
        await zapiszHarmonogram(kod, h => W.przelaczDzien(h, data),
                                b.dataset.akcja === 'pomin' ? `Pominięte ${+data.slice(8)}.${data.slice(5, 7)} — pozostałe dni bez zmian` : 'Przywrócone');
      if (b.dataset.akcja === 'zakoncz') {
        if (!(await P.potwierdz('Zakończyć to zlecenie stałe?', `„${s.tytul}” — ostatni raz ${data}. Później serwer już go nie zleci; wcześniejsze zlecenia zostają.`, 'Zakończ'))) return;
        await zapiszHarmonogram(kod, h => Object.assign(h, { do: data }), 'Zakończone po tym dniu');
      }
    } catch (e) { P.komunikat(P.komunikatBledu(e), 'blad'); }
  });

  P.widoki.kalendarz = { rysuj };
})();
