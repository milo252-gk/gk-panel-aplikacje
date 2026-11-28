/* Wspólny nagłówek Lidera, UR i KJ (audyt 2026-11-21): po prawej „Szukaj”, dzwonek dźwięku i konto — jak w Panelu.

     HalaNaglowek.zamontuj(hala, { zrodla: () => [{ grupa, tytul, opis, znacznik, otworz }], komunikat })
     HalaNaglowek.filtruj(pozycje, fraza, limit)      // czysta funkcja (testy: reduktor-testy.js)

   „Szukaj” przeszukuje tylko to, co aplikacja już ma i pokazuje tej roli — pozycje budują te same listy co ekrany (zlecenia
   działu, awarie linii…), nic nie idzie do serwera, więc nie ma nowych uprawnień. Okno wygląda jak „Szukaj” w Panelu (hala.css).
   Dzwonek pokazuje, czy przeglądarka wpuszcza dźwięk (to samo co baner „Dźwięk wyłączony — włącz”); dotknięcie włącza i gra próbkę. */
(function (global) {
  'use strict';

  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MIN_ZNAKOW = 2;

  /* Pisownia bez znaczenia: wielkość liter, polskie znaki, kropki i myślniki (jak loginZNazwy w Panelu). */
  const prosty = s => String(s === null || s === undefined ? '' : s).toLowerCase().replace(/ł/g, 'l')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

  /* Wszystkie słowa frazy muszą pasować (w dowolnym polu tej samej pozycji). Grupy zostają w kolejności, w jakiej podało je
     źródło; w grupie najpierw pozycje z frazą w tytule. */
  function filtruj(pozycje, fraza, limit) {
    const f = prosty(fraza);
    if (f.length < MIN_ZNAKOW) return [];
    const slowa = f.split(' ');
    const trafione = (pozycje || []).filter(p => p && slowa.every(s => prosty([p.tytul, p.opis, p.znacznik, p.szukaj].join(' ')).includes(s)));
    const kolejnosc = [...new Set(trafione.map(p => p.grupa))];
    return trafione
      .map((p, i) => ({ p, i, wTytule: prosty(p.tytul).includes(f) ? 0 : 1 }))
      .sort((a, b) => (kolejnosc.indexOf(a.p.grupa) - kolejnosc.indexOf(b.p.grupa)) || (a.wTytule - b.wTytule) || (a.i - b.i))
      .map(x => x.p).slice(0, limit || 40);
  }

  /* Rysowanie i wybór wyników — wspólne dla okna (telefon) i stałego pola w nagłówku (komputer). */
  function silnik(opcje) {
    let wyniki = [];
    return {
      rysuj(fraza, lista) {
        wyniki = filtruj(opcje.zrodla(), fraza);
        if (!fraza.trim()) { lista.innerHTML = `<p class="slaby">${esc(opcje.podpowiedz)}</p>`; return; }
        if (!wyniki.length) {
          lista.innerHTML = `<p class="pusto">${prosty(fraza).length < MIN_ZNAKOW ? 'Wpisz co najmniej 2 znaki.' : 'Nic nie znaleziono. Sprawdź pisownię albo wpisz numer.'}</p>`;
          return;
        }
        let grupa = '';
        lista.innerHTML = wyniki.map((w, i) => {
          const naglowek = w.grupa !== grupa ? `<h3 class="szukaj-grupa">${esc(w.grupa)}</h3>` : '';
          grupa = w.grupa;
          return `${naglowek}<button type="button" class="szukaj-wynik" data-n="${i}"><span class="szukaj-tekst"><b>${esc(w.tytul)}</b>${w.opis ? `<span class="slaby">${esc(w.opis)}</span>` : ''}</span>${w.znacznik ? `<span class="znacznik neutral">${esc(w.znacznik)}</span>` : ''}</button>`;
        }).join('');
      },
      wybierz(b) { const w = b && wyniki[+b.dataset.n]; if (w) w.otworz(); return !!w; },
    };
  }

  function okno(hala, opcje, S) {
    let o = document.getElementById('okno-szukaj');
    const rysuj = () => S.rysuj(document.getElementById('szukaj-pole').value, document.getElementById('szukaj-wyniki'));
    if (!o) {
      o = document.createElement('dialog');
      o.id = 'okno-szukaj';
      o.className = 'hala-okno okno-szukaj';
      o.setAttribute('aria-label', 'Szukaj');
      o.innerHTML = `<form method="dialog"><h2>Szukaj</h2>
        <input id="szukaj-pole" type="search" autocomplete="off" enterkeyhint="search" aria-label="Szukaj" placeholder="${esc(opcje.znak)}">
        <div id="szukaj-wyniki" class="szukaj-wyniki" aria-live="polite"></div>
        <div class="hala-okno-przyciski"><button type="submit">Zamknij</button></div></form>`;
      document.body.appendChild(o);
      const pole = document.getElementById('szukaj-pole');
      pole.addEventListener('input', rysuj);
      pole.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); const p = o.querySelector('.szukaj-wynik'); if (p) p.click(); } });
      document.getElementById('szukaj-wyniki').addEventListener('click', ev => {
        const b = ev.target.closest('.szukaj-wynik');
        if (!b) return;
        o.close();
        S.wybierz(b);
      });
    }
    document.getElementById('szukaj-pole').value = '';
    rysuj();
    if (!o.open) o.showModal();
    document.getElementById('szukaj-pole').focus();
  }

  const ik = (nazwa, rozmiar) => (global.GKIkony ? `<span class="ik" aria-hidden="true">${global.GKIkony.html(nazwa, rozmiar)}</span>` : '');

  /* Dzwonek: ikona `alerty`; gdy przeglądarka trzyma dźwięk (stan AudioContext ≠ running) — ten sam dzwonek w pomarańczowej
     ramce (klasa `czeka`, hala.css), dokładnie jak w Panelu (właściciel 2026-11-27, P6: ten sam stan — ten sam wygląd). */
  function dzwonek(hala, przycisk) {
    const GD = () => global.GKDzwieki;
    const rysuj = () => {
      const a = GD() && GD().kontekst ? GD().kontekst() : null;
      const wyl = !!a && a.state !== 'running';
      przycisk.innerHTML = ik('alerty', 18);
      przycisk.classList.toggle('czeka', wyl);
      przycisk.title = wyl ? 'Włącz dźwięk — dotknij, żeby przeglądarka wpuściła dźwięk' : 'Dźwięk włączony — dotknij, żeby sprawdzić';
      przycisk.setAttribute('aria-label', przycisk.title);
      if (a && !a.naglowekSledzi) { a.naglowekSledzi = true; a.addEventListener('statechange', rysuj); }
    };
    przycisk.addEventListener('click', () => {
      if (GD()) GD().odblokuj();
      setTimeout(() => { if (global.HalaDzwieki) global.HalaDzwieki.zagraj('pilne'); rysuj(); }, 150);
    });
    hala.na('sesja', rysuj);
    global.document.addEventListener('visibilitychange', () => { if (global.document.visibilityState === 'visible') rysuj(); });
    rysuj();
  }

  const KOMPUTER = '(min-width: 821px)';
  const naKomputerze = () => !!(global.matchMedia && global.matchMedia(KOMPUTER).matches);

  /* E5 (standard UI §5): stałe pole „Szukaj” w nagłówku na komputerze, wyniki pogrupowane w rozwijanym panelu pod spodem; na
     telefonie zostaje lupa i okno. Pole nie ma własnej wiedzy o wynikach: opcje.rysuj(fraza, lista) wypełnia panel, opcje.wybierz(przycisk)
     reaguje na wybór (te same funkcje co w oknie — wynik widzi tylko to, co rola już widzi). Zwraca { fokus } albo null (brak nagłówka). */
  function stalePole(kto, opcje) {
    const doc = global.document;
    if (!kto || doc.getElementById('szukaj-nag')) return null;
    const w = doc.createElement('div');
    w.className = 'szukaj-stale';
    w.innerHTML = `${ik('szukaj', 18)}<input id="szukaj-nag" type="search" autocomplete="off" enterkeyhint="search" role="combobox" aria-expanded="false" aria-controls="szukaj-panel" aria-label="${esc(opcje.aria)}" placeholder="${esc(opcje.znak)}" title="Klawisz /"><kbd class="szukaj-klawisz" aria-hidden="true">/</kbd><div id="szukaj-panel" class="szukaj-wyniki szukaj-panel" hidden aria-live="polite"></div>`;
    kto.prepend(w);
    const pole = w.querySelector('#szukaj-nag'), panel = w.querySelector('#szukaj-panel');
    const pokaz = () => { opcje.rysuj(pole.value, panel); panel.hidden = false; pole.setAttribute('aria-expanded', 'true'); };
    const zamknij = () => { panel.hidden = true; panel.innerHTML = ''; pole.setAttribute('aria-expanded', 'false'); };
    const wyniki = () => [...panel.querySelectorAll('.szukaj-wynik')];
    pole.addEventListener('focus', pokaz);
    pole.addEventListener('input', pokaz);
    pole.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { ev.preventDefault(); if (pole.value) { pole.value = ''; pokaz(); } else { zamknij(); pole.blur(); } }
      else if (ev.key === 'Enter') { ev.preventDefault(); const p = wyniki()[0]; if (p) p.click(); }
      else if (ev.key === 'ArrowDown') { ev.preventDefault(); const p = wyniki()[0]; if (p) p.focus(); }
    });
    panel.addEventListener('keydown', ev => {
      const lista = wyniki(), i = lista.indexOf(doc.activeElement);
      if (ev.key === 'ArrowDown') { ev.preventDefault(); if (lista[i + 1]) lista[i + 1].focus(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); (i > 0 ? lista[i - 1] : pole).focus(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); pole.focus(); zamknij(); }
    });
    panel.addEventListener('click', ev => {
      const b = ev.target.closest('.szukaj-wynik');
      if (!b) return;
      opcje.wybierz(b);
      pole.value = '';
      zamknij();
      if (doc.activeElement && w.contains(doc.activeElement)) doc.activeElement.blur();
    });
    doc.addEventListener('pointerdown', ev => { if (!w.contains(ev.target)) zamknij(); });
    w.addEventListener('focusout', ev => { if (!w.contains(ev.relatedTarget) && ev.relatedTarget !== null) zamknij(); });
    return {
      // Klawisz „/”: na komputerze ustawia fokus w polu (true), na telefonie nic (false) — wtedy otwiera się okno.
      fokus() { if (!naKomputerze() || !w.offsetParent) return false; pole.focus(); pole.select(); if (panel.hidden) pokaz(); return true; },
    };
  }

  /* Wstawia „Szukaj” i dzwonek przed przyciskiem konta w <header class="naglowek"> (blok .kto). Klawisz „/” otwiera Szukaj. */
  function zamontuj(hala, opcje) {
    const kto = global.document.querySelector('.naglowek .kto');
    if (!kto || kto.querySelector('#szukaj')) return;
    const o = Object.assign({ podpowiedz: 'Wpisz numer, tytuł, maszynę albo osobę.', znak: 'numer, tytuł, maszyna, osoba' }, opcje);
    const S = silnik(o);
    const s = global.document.createElement('button');
    s.id = 'szukaj'; s.type = 'button'; s.className = 'maly';
    s.setAttribute('aria-label', 'Szukaj'); s.title = 'Szukaj (klawisz /)';
    s.innerHTML = `${ik('szukaj', 18)}<span class="szukaj-napis">Szukaj</span>`;
    const d = global.document.createElement('button');
    d.id = 'dzwiek'; d.type = 'button'; d.className = 'maly';
    kto.prepend(s, d);
    const stale = stalePole(kto, { znak: `Szukaj: ${o.znak}`, aria: `Szukaj: ${o.znak}`, rysuj: S.rysuj, wybierz: S.wybierz });
    const otworz = () => { if (hala.zalogowany()) okno(hala, o, S); };
    s.addEventListener('click', otworz);
    global.document.addEventListener('keydown', ev => {
      if (ev.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test((ev.target || {}).tagName || '') && !global.document.querySelector('dialog[open]')) {
        ev.preventDefault();
        if (hala.zalogowany() && !(stale && stale.fokus())) otworz();
      }
    });
    dzwonek(hala, d);
  }

  /* Po przejściu na ekran z wyniku: zlecenie z listy dostaje ramkę i przewija się na ekran (jak w Panelu). */
  function zaznacz(idObiektu) {
    setTimeout(() => {
      const el = global.document.querySelector(`[data-id="${global.CSS && global.CSS.escape ? global.CSS.escape(idObiektu) : idObiektu}"]`);
      if (!el) return;
      el.classList.add('znalezione');
      el.scrollIntoView({ block: 'center' });
      setTimeout(() => el.classList.remove('znalezione'), 6000);
    }, 150);
  }

  global.HalaNaglowek = { zamontuj, stalePole, filtruj, zaznacz };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.HalaNaglowek;
})(typeof window !== 'undefined' ? window : globalThis);
