/* Jakość: Quality Alerty (ekran blokujący + cyfrowe potwierdzenie), wyniki prób KJ
   na mojej linii, reklamacje klientów i otwarte zgłoszenia BHP.

   Alert przychodzi strumieniem w ciągu sekundy (KONTRAKT §6.3). Dopóki moja linia
   go nie potwierdzi, zasłania cały ekran — tak chce specyfikacja („wymóg cyfrowego
   zatwierdzenia”). Z zasłony da się tylko zgłosić awarię: maszyna nie czeka.       */

(function () {
  'use strict';

  const L = window.Lider, hala = L.hala, W = L.W, esc = L.esc;
  const widziane = new Set();         // alerty, o których już powiadomiliśmy
  let pokazany = null;                // id alertu na zasłonie

  // ------------------------------------------------------------ ekran blokujący

  function zaslona() {
    const el = L.$('blokada');
    const linia = L.linia();
    const lista = hala.zalogowany() && linia ? W.alertyDoPotwierdzenia(hala.obiekty('alert'), linia, hala.teraz()) : [];
    L.plakietka('jakosc', lista.length + W.reklamacje(hala.obiekty('reklamacja'), linia, hala.pracownik && hala.pracownik.id).filter(r => !r.przeczytana).length);
    if (!lista.length) {
      el.hidden = true;
      pokazany = null;
      document.body.classList.remove('z-blokada');
      return;
    }
    const a = lista[0];
    for (const x of lista) {
      if (!widziane.has(x.id)) {
        widziane.add(x.id);
        L.powiadom('Quality Alert: ' + ((x.dane || {}).tytul || ''), 'Potwierdź zapoznanie się na linii ' + linia,
                   { tag: 'alert-' + x.id, wibracja: [300, 100, 300, 100, 300] });
      }
    }
    if (pokazany === a.id && !el.hidden) return;         // nie przerysowujemy w trakcie pisania uwag
    pokazany = a.id;
    const d = a.dane || {};
    el.innerHTML = `<div class="blokada-karta">
      <div class="blokada-gora">
        <span class="znacznik alarm">Quality Alert</span>
        <span class="slaby">${esc(a.numer || '—')} · ${esc(W.godzina(d.czas_publikacji || a.utworzono))}${lista.length > 1 ? ` · 1 z ${lista.length}` : ''}</span>
        <button type="button" class="alarm maly" data-awaria>⚠ Awaria</button>
      </div>
      <h2 id="blokada-tytul">${esc(d.tytul || 'Alert jakościowy')}</h2>
      ${d.wyrob ? `<p class="slaby">Wyrób: ${esc(d.wyrob)}</p>` : ''}
      <p>${esc(d.opis || '')}</p>
      <div class="instrukcja"><b>Co robić na linii</b><p>${esc(d.instrukcja || '')}</p></div>
      <div class="zdjecia-alertu"><div data-z="wzor"></div><div data-z="wada"></div></div>
      <form class="formularz">
        <textarea name="uwagi" rows="2" maxlength="1000" placeholder="Uwagi (opcjonalnie)"></textarea>
        <button type="submit" class="glowny szeroki duzy">Zapoznałem się i wdrożyłem na linii ${esc(linia)}</button>
      </form></div>`;
    el.hidden = false;
    document.body.classList.add('z-blokada');
    L.galeria(el.querySelector('[data-z=wzor]'), d.zdjecie_wzorcowe, 'Wzorzec — tak ma być');
    L.galeria(el.querySelector('[data-z=wada]'), d.zdjecie_wady, 'Wada — tak nie może być');
    el.querySelector('[data-awaria]').addEventListener('click', () => L.zglosAwarie());
    const form = el.querySelector('form');
    L.formularz('alert:' + a.id, { uwagi: '' }).then(f => {
      f.powiaz(form);
      form.addEventListener('submit', W.przyWysylce(async ev => {
        ev.preventDefault();
        const zd = await L.zapisz('alert.potwierdzony', a.id, L.bezPustych({ linia, uwagi: (f.dane.uwagi || '').trim() }));
        if (!zd) return;
        await f.usun();
        pokazany = null;
        L.poZapisie('Alert potwierdzony');
        L.narysuj();
      }));
    });
  }
  L.poRysowaniu.push(zaslona);

  // ------------------------------------------------------------ szczegóły

  function szczegolyAlertu(id) {
    const a = hala.obiekt('alert', id);
    if (!a) return;
    const d = a.dane || {}, p = (d.potwierdzenia || {})[L.linia()];
    L.okno({
      tytul: d.tytul || 'Quality Alert',
      html: `<p class="slaby">${esc(a.numer || '—')} · ${esc(W.dataKrotka(d.czas_publikacji))} ${esc(W.godzina(d.czas_publikacji))} · ${esc(a.etykieta || a.status)}</p>
        <p>${esc(d.opis || '')}</p>
        <div class="instrukcja"><b>Co robić na linii</b><p>${esc(d.instrukcja || '')}</p></div>
        <div data-z="wzor"></div><div data-z="wada"></div>
        ${p ? `<p class="ok-tekst">Potwierdzone: ${esc(W.nazwaPracownika(hala.pracownicy, p.autor))}, ${esc(W.godzina(p.czas))}${p.uwagi ? ` — ${esc(p.uwagi)}` : ''}</p>` : ''}`,
      poOtwarciu: el => {
        L.galeria(el.querySelector('[data-z=wzor]'), d.zdjecie_wzorcowe, 'Wzorzec');
        L.galeria(el.querySelector('[data-z=wada]'), d.zdjecie_wady, 'Wada');
      },
    });
  }

  function szczegolyReklamacji(id) {
    const r = hala.obiekt('reklamacja', id);
    if (!r) return;
    const d = r.dane || {};
    const ja = hala.pracownik && hala.pracownik.id;
    const przeczytana = !!((d.odczyty || {})[ja]);
    L.okno({
      tytul: 'Reklamacja ' + (r.numer || '—'),
      html: `<dl class="dane">
          <dt>Klient</dt><dd>${esc(d.klient || '—')}</dd>
          <dt>Wyrób</dt><dd>${esc(d.kod_wyrobu || '—')} ${esc((((hala.slowniki.wyroby || {})[d.kod_wyrobu]) || {}).nazwa || '')}</dd>
          <dt>Partia</dt><dd>${esc(d.partia || '—')}</dd>
          <dt>Zarejestrowana</dt><dd>${esc(W.dataKrotka(d.czas_rejestracji))} ${esc(W.godzina(d.czas_rejestracji))}</dd>
          <dt>Status</dt><dd>${esc(r.etykieta || r.status)}</dd>
        </dl>
        <p>${esc(d.opis || '')}</p>
        ${d.rozstrzygniecie ? `<p><b>Rozstrzygnięcie:</b> ${esc(d.rozstrzygniecie)}</p>` : ''}
        <div data-z="zdj"></div>
        ${przeczytana ? '<p class="ok-tekst">Przeczytana</p>' : '<button type="button" class="glowny szeroki" data-przeczytana>Przeczytałem</button>'}`,
      poOtwarciu: el => {
        L.galeria(el.querySelector('[data-z=zdj]'), d.zdjecia, 'Zdjęcia od klienta');
        const b = el.querySelector('[data-przeczytana]');
        if (b) b.addEventListener('click', async () => {
          if (await L.zapisz('reklamacja.odczytana', id, { linia: L.linia() })) { L.zamknijOkno(); L.poZapisie('Reklamacja przyjęta do wiadomości'); }
        });
      },
    });
  }

  function szczegolyProby(id) {
    const p = hala.obiekt('proba', id);
    if (!p) return;
    const w = W.proby([p], p.linia, null, hala.slowniki)[0];
    const d = p.dane || {};
    L.okno({
      tytul: `Próba ${w.zrodlo === 'kj' ? 'KJ' : 'lidera'} · ${w.dzien} ${w.godz}`,
      html: `<dl class="dane">
          <dt>Stanowisko</dt><dd>${esc(w.stanowisko || '—')}</dd>
          <dt>Kontrolował</dt><dd>${esc(W.nazwaPracownika(hala.pracownicy, d.kontrolowal) || '—')}</dd>
          <dt>Zlecenie</dt><dd>${esc(w.zlecenie || '—')}</dd>
          <dt>Sprawdzone</dt><dd>${esc(w.sprawdzone)}</dd>
          <dt>Zgodne / braki</dt><dd>${esc(w.zgodne)} / <b>${esc(w.braki)}</b>${w.proc !== null ? ` (${esc(w.proc)} %)` : ''}</dd>
          <dt>Wady</dt><dd>${esc(w.wady.join(', ') || '—')}</dd>
        </dl>
        ${w.wnioski ? `<p><b>Wnioski:</b> ${esc(w.wnioski)}</p>` : ''}
        ${w.dzialania ? `<p><b>Działania:</b> ${esc(w.dzialania)}</p>` : ''}
        <div data-z="zdj"></div>`,
      poOtwarciu: el => L.galeria(el.querySelector('[data-z=zdj]'), d.zdjecia, 'Zdjęcia'),
    });
  }

  async function zamknijBhp(id) {
    const dzialania = await L.zapytaj({ tytul: 'Zamknij zgłoszenie BHP', pytanie: 'Jakie działania podjęto?', przycisk: 'Zamknij zgłoszenie', wymagane: true });
    if (!dzialania) return;
    if (await L.zapisz('bhp.zamkniete', id, { dzialania })) L.poZapisie('Zgłoszenie BHP zamknięte');
  }

  // ------------------------------------------------------------ ekran

  const wierszProby = p => `<li class="wiersz" data-proba="${esc(p.id)}">
      <span class="czas">${esc(p.dzien)} ${esc(p.godz)}</span>
      <span class="tresc">${esc(p.stanowisko || '—')}${p.wady.length ? ` <span class="slaby">· ${esc(p.wady.join(', '))}</span>` : ''}</span>
      <span class="znacznik ${p.braki ? 'uwaga' : 'ok'}">${esc(p.braki)}/${esc(p.sprawdzone)}</span>
      ${p.czeka ? '<span class="znacznik info">czeka</span>' : ''}</li>`;

  L.ekrany.jakosc = {
    rysuj(el) {
      const linia = L.linia();
      const ja = hala.pracownik && hala.pracownik.id;
      const alerty = W.alertyLinii(hala.obiekty('alert'), linia, hala.teraz()).filter(a => a.aktywny || !a.potwierdzony);
      const rekl = W.reklamacje(hala.obiekty('reklamacja'), linia, ja).filter(r => r.otwarta || !r.przeczytana);
      const probyKJ = W.proby(hala.obiekty('proba'), linia, 'kj', hala.slowniki).slice(0, 15);
      const moje = W.proby(hala.obiekty('proba'), linia, 'lider', hala.slowniki).slice(0, 10);
      const bhp = hala.obiekty('bhp_zgloszenie', b => b.linia === linia && b.aktywny);
      const rodzajeBhp = {};
      for (const r of ((hala.kontrakt && hala.kontrakt.stale.rodzaje_bhp) || [])) rodzajeBhp[r.kod] = r.nazwa;
      el.innerHTML = `
        <div class="przyciski-rzad">
          <button type="button" data-a="proba">+ Próba</button>
          <button type="button" data-a="bhp">+ Zgłoszenie BHP</button>
        </div>
        <h2>Quality Alerty</h2>
        <ul class="lista">${alerty.map(a => `<li class="wiersz ${a.potwierdzony || !a.aktywny ? '' : 'pilne'}" data-alert="${esc(a.id)}">
            <span class="czas">${esc(W.dataKrotka(a.czas))}</span>
            <span class="tresc"><b>${esc(a.tytul)}</b> <span class="slaby">${esc(a.numer)}</span></span>
            <span class="znacznik ${a.potwierdzony ? 'ok' : a.aktywny ? 'alarm' : 'neutral'}">${a.potwierdzony ? 'Potwierdzony' : a.aktywny ? 'Do potwierdzenia' : a.wygasl ? 'Nieważny' : 'Wycofany'}</span></li>`).join('')
          || '<li class="pusto ok">Brak aktywnych alertów dla linii</li>'}</ul>
        <h2>Reklamacje klientów</h2>
        <ul class="lista">${rekl.map(r => `<li class="wiersz ${r.przeczytana ? '' : 'pilne'}" data-reklamacja="${esc(r.id)}">
            <span class="czas">${esc(W.dataKrotka(r.czas))}</span>
            <span class="tresc"><b>${esc(r.numer)}</b> ${esc(r.wyrob)} <span class="slaby">${esc(r.opis.slice(0, 80))}</span></span>
            <span class="znacznik ${r.przeczytana ? 'neutral' : 'uwaga'}">${r.przeczytana ? (r.otwarta ? 'Otwarta' : 'Zamknięta') : 'Nowa'}</span></li>`).join('')
          || '<li class="pusto ok">Brak reklamacji dla linii</li>'}</ul>
        <h2>Próby KJ na linii</h2>
        <ul class="lista">${probyKJ.map(wierszProby).join('') || '<li class="pusto">Brak prób KJ z ostatnich dni</li>'}</ul>
        <h2>Moje próby</h2>
        <ul class="lista">${moje.map(wierszProby).join('') || '<li class="pusto">Brak</li>'}</ul>
        <h2>Zgłoszenia BHP — otwarte</h2>
        <ul class="lista">${bhp.map(b => `<li class="wiersz" data-bhp="${esc(b.id)}">
            <span class="czas">${esc(W.godzina((b.dane || {}).czas_zgloszenia || b.utworzono))}</span>
            <span class="tresc"><b>${esc(b.numer || '—')}</b> ${esc(rodzajeBhp[(b.dane || {}).rodzaj] || '')} <span class="slaby">${esc(((b.dane || {}).opis || '').slice(0, 80))}</span></span>
            <button type="button" class="maly" data-zamknij-bhp="${esc(b.id)}">Zamknij</button></li>`).join('')
          || '<li class="pusto ok">Brak otwartych zgłoszeń</li>'}</ul>`;
    },
  };

  // Jeden słuchacz na sekcję (ekran przerysowuje się co 20 s i po każdym zdarzeniu).
  L.$('ekran-jakosc').addEventListener('click', ev => {
    const t = ev.target.closest('[data-a],[data-alert],[data-reklamacja],[data-proba],[data-zamknij-bhp]');
    if (!t) return;
    if (t.dataset.a === 'proba') L.formularzProby({});
    else if (t.dataset.a === 'bhp') L.formularzBhp({});
    else if (t.dataset.zamknijBhp) zamknijBhp(t.dataset.zamknijBhp);
    else if (t.dataset.alert) szczegolyAlertu(t.dataset.alert);
    else if (t.dataset.reklamacja) szczegolyReklamacji(t.dataset.reklamacja);
    else if (t.dataset.proba) szczegolyProby(t.dataset.proba);
  });

  // Nowa reklamacja dla mojej linii — powiadomienie (alerty mają własną zasłonę).
  const znaneReklamacje = new Set();
  L.poRysowaniu.push(() => {
    const ja = hala.pracownik && hala.pracownik.id;
    for (const r of W.reklamacje(hala.obiekty('reklamacja'), L.linia(), ja)) {
      if (znaneReklamacje.has(r.id)) continue;
      if (znaneReklamacje.size && !r.przeczytana) L.powiadom('Nowa reklamacja ' + r.numer, r.opis.slice(0, 100), { tag: 'rk-' + r.id });
      znaneReklamacje.add(r.id);
    }
    if (!znaneReklamacje.size) znaneReklamacje.add('-');     // pierwsze rysowanie: tylko zapamiętujemy
  });
})();
