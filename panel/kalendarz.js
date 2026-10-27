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
  const stan = { rok: 0, miesiac: 0, dzien: null, widok: 'miesiac', dniAgendy: 14 };
  let ostatnie = null;                          // ostatnie dane rysowania — dotknięcie dnia rysuje bez czekania na hub

  function ustawDzis() {
    const m = /^(\d{4})-(\d{2})/.exec(W.dzienZakladu(hala.teraz()));
    stan.rok = +m[1]; stan.miesiac = +m[2];
    stan.dzien = W.dzienZakladu(hala.teraz());
  }

  /* Najbliższe dni: lista zamiast siatki — co dnia zlecą zapisane stałe i co zaplanowano na później (W.agendaZlecen). */
  function rysujAgende() {
    const o = ostatnie;
    const dni = W.agendaZlecen({ slowniki: o.d.slowniki, pracownicy: o.d.pracownicy, stale: o.d.stale, zlecenia: o.lista, teraz: o.d.teraz, dni: stan.dniAgendy });
    const nazwaDnia = c => {
      const dt = (new Date(`${c.data}T12:00:00Z`).getUTCDay() + 6) % 7;
      return `${c.dzis ? 'Dziś' : W.DNI_NAZWY[dt]}, ${W.dataDluga(`${c.data}T12:00:00Z`)}`;
    };
    $('kal-tytul').textContent = `Najbliższe ${stan.dniAgendy} dni`;
    $('kal-agenda').innerHTML = (dni.map(c => `
      <section class="kal-agenda-dzien${c.swieto ? ' swieto' : ''}">
        <h3><button type="button" class="kal-dzien-link" data-dzien="${c.data}" title="Szczegóły dnia">${esc(nazwaDnia(c))} ›</button>${c.swieto ? ` <span class="znacznik alarm">${esc(c.swieto)}</span>` : ''}</h3>
        ${c.pozycje.map(p => `<article class="kal-pozycja">
          <div class="opis"><div><b>${p.checklista ? '☑ ' : ''}${esc(p.tytul)}</b> ${p.zaplanowane ? '<span class="znacznik neutral">Zaplanowane</span>' : ''}</div>
            <div class="slaby">${p.godziny.length ? `${esc(p.godziny.join(', '))} · ` : ''}${esc(p.dla || '')}</div></div></article>`).join('')}
      </section>`).join('') || `<p class="pusto">Nic nie jest zaplanowane na najbliższe ${stan.dniAgendy} dni.</p>`)
      + (stan.dniAgendy < 90 ? '<div class="przyciski"><button type="button" class="maly" data-agenda-wiecej>Pokaż dalej (+14 dni)</button></div>' : '');
  }

  function ustawWidok(widok) {
    stan.widok = widok;
    for (const b of document.querySelectorAll('[data-kal-widok]')) b.setAttribute('aria-pressed', String(b.dataset.kalWidok === widok));
    for (const b of document.querySelectorAll('#zlecenia-kalendarz [data-kal]')) b.hidden = widok === 'agenda';
    $('kal-siatka').hidden = $('kal-podpowiedz').hidden = widok === 'agenda';
    $('kal-agenda').hidden = widok !== 'agenda';
    rysuj();
  }

  function rysuj(d, lista) {
    if (d) ostatnie = { d, lista };
    if (!ostatnie) return;
    if (!stan.rok) ustawDzis();
    if (stan.widok === 'agenda') { rysujAgende(); return; }
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
    if ($('okno-dnia').open) rysujDzien(k.dni.find(c => c.data === stan.dzien));       // szczegóły dnia odświeżają się razem z listą
  }

  /* Okno dnia (właściciel 2026-10-27: „nie mogę wejść w dany dzień i szczegółowo zobaczyć, co jest zaplanowane”): dotknięcie dnia
     otwiera okno — na górze, co jest zaplanowane na ten dzień (zmiana, godziny od–do, dla kogo, opis, a przy checkliście każda
     pozycja z godziną, opisem i maszynami), niżej, co już zlecono tego dnia (numer, status, postęp). Te same przyciski:
     Pomiń ten dzień, Zakończ po tym dniu, Zmień. */
  function szczegolyHtml(p) {
    const s = p.szczegoly;
    if (!s) return '';
    const wyst = s.wystapienia.map(x => `<li><b>${esc(x.zmiana || 'Zlecenie')}</b> ${esc(x.start)}${x.termin ? `–${esc(x.termin)}` : ''}${x.od ? ` <span class="slaby">(do zrobienia od ${esc(x.od)})</span>` : ''}${
      x.pozycje.length ? `<ol class="kal-pozycje">${x.pozycje.map(q => `<li><span class="slaby">${esc(q.od ? `${q.od}–${q.godz}` : q.godz)}</span> <b>${esc(q.nazwa)}</b>${
        q.maszyny.length ? ` <span class="slaby">· ${q.maszyny.length > 3 ? `${q.maszyny.length} maszyn` : esc(q.maszyny.join(', '))}${q.skan ? ' · ▣ skan każdej' : ''}</span>` : ''}${
        q.zdjecie ? ' 📷' : ''}${q.notatka ? ' 📝' : ''}${q.opis ? `<div class="slaby kal-opis">${esc(q.opis)}</div>` : ''}</li>`).join('')}</ol>` : ''}</li>`).join('');
    return `<details class="kal-szczegoly"><summary>Szczegóły</summary>
      ${s.opis ? `<p class="kal-opis">${esc(s.opis)}</p>` : ''}
      <ul class="kal-wyst">${wyst}</ul>
      <p class="slaby">${s.harmonogram ? `${esc(s.harmonogram)} · ` : ''}${s.linia ? `${esc(s.linia)} · ` : ''}${s.maszyny.length ? `maszyny: ${esc(s.maszyny.join(', '))} · ` : ''}${
      s.wymagania.length ? `wymagane: ${esc(s.wymagania.join(', '))}` : ''}${s.pilne ? ' · <b>pilne</b>' : ''}</p></details>`;
  }

  function rysujDzien(c) {
    const el = $('dzien-tresc');
    if (!c) { el.innerHTML = ''; return; }
    const pisze = P.mozeZapisacStale();
    const dt = (new Date(`${c.data}T12:00:00Z`).getUTCDay() + 6) % 7;
    $('t-okno-dnia').innerHTML = `${esc(`${W.DNI_NAZWY[dt]}, ${W.dataDluga(`${c.data}T12:00:00Z`)}`)}${c.swieto ? ` <span class="znacznik alarm">${esc(c.swieto)}</span>` : ''}`;
    const wiersze = c.pozycje.map(p => `
      <article class="kal-pozycja${p.pominiety ? ' pominieta' : ''}" ${p.kod ? `data-kod="${esc(p.kod)}"` : ''}>
        <div class="opis">
          <div><b>${p.checklista ? '☑ ' : ''}${esc(p.tytul)}</b> ${p.zaplanowane ? '<span class="znacznik neutral">Zaplanowane</span>' : ''}
            ${p.pominiety ? `<span class="znacznik">${esc(p.pominiety === 'pominięty' ? 'Pominięte' : `Pominięte — ${p.pominiety}`)}</span>` : ''}</div>
          <div class="slaby">${p.godziny.length ? esc(p.godziny.join(', ')) + ' · ' : ''}${esc(p.dla || '')}</div>
          ${szczegolyHtml(p)}
        </div>
        ${pisze && p.kod && !c.przeszly ? `<div class="akcje">
          ${p.pominiety === 'pominięty' ? '<button type="button" class="maly" data-akcja="przywroc">Przywróć</button>'
            : !p.pominiety ? '<button type="button" class="maly" data-akcja="pomin">Pomiń ten dzień</button>' : ''}
          ${!p.pominiety ? '<button type="button" class="maly" data-akcja="zakoncz">Zakończ po tym dniu</button>' : ''}
          <button type="button" class="maly" data-akcja="zmien">Zmień</button></div>` : ''}
      </article>`).join('');
    const zlecone = (c.zlecone || []).map(z => `<li><span class="slaby">${esc(z.godz)}</span> <b>${esc(z.tytul)}</b> <span class="slaby">${esc(z.numer)} · ${esc(z.status)}${
      z.postep ? ` · ☑ ${z.postep.gotowe}/${z.postep.wszystkie}` : ''}${z.stale ? ' · 🔁' : ''}</span></li>`).join('');
    el.innerHTML = `<h3>${c.przeszly ? 'Było zaplanowane' : 'Zaplanowane'}</h3>`
      + (wiersze || `<p class="pusto">${c.przeszly ? 'Tego dnia nic nie było zaplanowane.' : 'Nic zaplanowanego.'}${pisze ? ' Nowe stałe zlecenie: 💾 Zapisane → „+ Nowe zapisane”.' : ''}</p>`)
      + (zlecone ? `<h3>Zlecone tego dnia (${c.zlecone.length})</h3><ul class="kal-zlecone">${zlecone}</ul>` : '');
  }

  function otworzDzien() {
    const k = ostatnie && W.kalendarzZlecen({ slowniki: ostatnie.d.slowniki, pracownicy: ostatnie.d.pracownicy, stale: ostatnie.d.stale,
                                              zlecenia: ostatnie.lista, rok: stan.rok, miesiac: stan.miesiac, teraz: ostatnie.d.teraz });
    rysujDzien(k && k.dni.find(c => c.data === stan.dzien));
    if (!$('okno-dnia').open) $('okno-dnia').showModal();
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
    const widok = ev.target.closest('[data-kal-widok]');
    if (widok) { ustawWidok(widok.dataset.kalWidok); return; }
    if (ev.target.closest('[data-agenda-wiecej]')) { stan.dniAgendy += 14; rysuj(); return; }
    const wDzien = ev.target.closest('[data-dzien]');
    if (wDzien) {
      const [r, m] = wDzien.dataset.dzien.split('-');
      stan.rok = +r; stan.miesiac = +m; stan.dzien = wDzien.dataset.dzien;
      otworzDzien();
      return;
    }
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
    if (dzien) { stan.dzien = dzien.dataset.data; rysuj(); otworzDzien(); return; }
  });
  $('okno-dnia').querySelector('[data-zamknij]').addEventListener('click', () => $('okno-dnia').close());
  $('okno-dnia').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-akcja]');
    if (!b) return;
    const kod = b.closest('[data-kod]').dataset.kod;
    const data = stan.dzien;
    const s = ((hala.slowniki || {}).zlecenia_stale || {})[kod];
    if (!s || !data) return;
    try {
      if (b.dataset.akcja === 'zmien') { $('okno-dnia').close(); P.widoki.stale.otworzKod(kod); }
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
