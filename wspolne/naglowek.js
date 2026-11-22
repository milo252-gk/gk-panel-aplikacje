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

  function okno(hala, opcje) {
    let o = document.getElementById('okno-szukaj');
    let wyniki = [];
    const rysuj = () => {
      const fraza = document.getElementById('szukaj-pole').value;
      const lista = document.getElementById('szukaj-wyniki');
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
    };
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
        const w = b && wyniki[+b.dataset.n];
        if (!w) return;
        o.close();
        w.otworz();
      });
    }
    document.getElementById('szukaj-pole').value = '';
    rysuj();
    if (!o.open) o.showModal();
    document.getElementById('szukaj-pole').focus();
  }

  const ik = (nazwa, rozmiar) => (global.GKIkony ? `<span class="ik" aria-hidden="true">${global.GKIkony.html(nazwa, rozmiar)}</span>` : '');

  /* Dzwonek: ikona `alerty`, gdy dźwięk działa, `dzwonek-wyl`, gdy przeglądarka go trzyma (stan AudioContext ≠ running). */
  function dzwonek(hala, przycisk) {
    const GD = () => global.GKDzwieki;
    const rysuj = () => {
      const a = GD() && GD().kontekst ? GD().kontekst() : null;
      const wyl = !!a && a.state !== 'running';
      przycisk.innerHTML = ik(wyl ? 'dzwonek-wyl' : 'alerty', 18);
      przycisk.title = wyl ? 'Dźwięk wyłączony — dotknij, żeby włączyć' : 'Dźwięk włączony — dotknij, żeby sprawdzić';
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

  /* Wstawia „Szukaj” i dzwonek przed przyciskiem konta w <header class="naglowek"> (blok .kto). Klawisz „/” otwiera Szukaj. */
  function zamontuj(hala, opcje) {
    const kto = global.document.querySelector('.naglowek .kto');
    if (!kto || kto.querySelector('#szukaj')) return;
    const o = Object.assign({ podpowiedz: 'Wpisz numer, tytuł, maszynę albo osobę.', znak: 'numer, tytuł, maszyna, osoba' }, opcje);
    const s = global.document.createElement('button');
    s.id = 'szukaj'; s.type = 'button'; s.className = 'maly';
    s.setAttribute('aria-label', 'Szukaj'); s.title = 'Szukaj (klawisz /)';
    s.innerHTML = `${ik('jakosc', 18)}<span class="szukaj-napis">Szukaj</span>`;
    const d = global.document.createElement('button');
    d.id = 'dzwiek'; d.type = 'button'; d.className = 'maly';
    kto.prepend(s, d);
    const otworz = () => { if (hala.zalogowany()) okno(hala, o); };
    s.addEventListener('click', otworz);
    global.document.addEventListener('keydown', ev => {
      if (ev.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test((ev.target || {}).tagName || '') && !global.document.querySelector('dialog[open]')) { ev.preventDefault(); otworz(); }
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

  global.HalaNaglowek = { zamontuj, filtruj, zaznacz };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.HalaNaglowek;
})(typeof window !== 'undefined' ? window : globalThis);
