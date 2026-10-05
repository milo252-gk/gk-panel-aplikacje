/* Quality Alerty (KONTRAKT §6.3): tworzenie, lista z postępem potwierdzeń
   liderów, szczegóły, wycofanie.

   Wypchnięcie do liderów dzieje się samo — alert.opublikowany idzie strumieniem
   huba do Aplikacji Lidera w sekundę. Potwierdzenia (alert.potwierdzony {linia})
   wracają tą samą drogą, więc postęp X/Y rośnie tu bez odświeżania.           */

(function (KJ) {
  'use strict';

  const { hala, W, esc } = KJ;
  const BRUDNOPIS = 'alert-nowy';

  // ------------------------------------------------------------ lista

  KJ.ekran('alerty', {
    rysuj(el) {
      const lista = W.listaAlertow({ alerty: hala.obiekty('alert'), slowniki: hala.slowniki, pracownicy: hala.pracownicy, teraz: hala.teraz() });
      const aktywne = lista.filter(a => a.aktywny), wycofane = lista.filter(a => !a.aktywny);
      el.innerHTML = `
        <div class="tytul-ekranu"><h1>Quality Alerty</h1>
          ${KJ.mozna('alert.opublikowany') ? '<a class="przycisk glowny" href="#alert-nowy">Nowy alert</a>' : ''}</div>
        <div class="lista">${aktywne.map(karta).join('') || '<p class="pusto">Brak aktywnych alertów</p>'}</div>
        ${wycofane.length ? `<details class="archiwum"><summary>Wycofane (${wycofane.length})</summary>
          <div class="lista">${wycofane.map(karta).join('')}</div></details>` : ''}`;
    },
  });

  function karta(a) {
    const proc = a.wszystkie ? Math.round(a.potwierdzone * 100 / a.wszystkie) : 0;
    return `<a class="karta alert ${a.aktywny ? '' : 'wycofany'}" href="#alert/${encodeURIComponent(a.id)}">
      <div class="wiersz"><span class="znacznik ${a.aktywny ? 'alarm' : 'neutral'}">${esc(a.numer)}</span>
        <span class="slaby">${esc(W.kiedy(a.czas, hala.teraz()))}</span>
        ${a.oczekuje ? '<span class="znacznik info">czeka na wysłanie</span>' : ''}
        ${a.przeterminowany && a.aktywny ? '<span class="znacznik uwaga">po terminie ważności</span>' : ''}</div>
      <b class="tytul">${esc(a.tytul)}</b>
      ${a.aktywny ? `<div class="postep ${a.komplet ? 'komplet' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="${a.wszystkie}" aria-valuenow="${a.potwierdzone}"><span style="width:${proc}%"></span></div>
      <div class="potwierdzenia ${a.komplet ? 'komplet' : ''}">Potwierdzenia ${a.potwierdzone}/${a.wszystkie}${a.brakuje.length ? ` <span class="slaby">— brak: ${esc(a.brakuje.join(', '))}</span>` : ''}</div>` : `<div class="slaby">${esc(a.etykieta)}</div>`}
    </a>`;
  }

  // ------------------------------------------------------------ szczegóły

  KJ.ekran('alert', {
    zakladka: 'alerty',
    rysuj(el, id) {
      const a = hala.obiekt('alert', id);
      if (!a) { el.innerHTML = '<p class="pusto">Nie ma takiego alertu (może jeszcze się nie zsynchronizował). <a href="#alerty">Wróć do listy</a></p>'; return; }
      const d = a.dane, p = W.postepAlertu(a, hala.slowniki, hala.pracownicy);
      el.innerHTML = `
        <a class="wstecz" href="#alerty">‹ Alerty</a>
        <div class="wiersz"><span class="znacznik ${a.status === 'aktywny' ? 'alarm' : 'neutral'}">${esc(W.numer(a))}</span>
          <span class="slaby">${esc(a.etykieta)} · ${esc(W.kiedy(d.czas_publikacji || a.utworzono, hala.teraz()))} · ${esc(W.nazwaPracownika(hala.pracownicy, d.opublikowal) || '')}</span></div>
        <h1>${esc(d.tytul)}</h1>
        <div class="porownanie">
          <figure class="zdjecie-duze ok"><figcaption>Wzór — tak ma być</figcaption>${zdjecie(d.zdjecie_wzorcowe)}</figure>
          <figure class="zdjecie-duze alarm"><figcaption>Wada — tak nie może być</figcaption>${zdjecie(d.zdjecie_wady)}</figure>
        </div>
        <h2>Problem</h2><p class="tekst">${esc(d.opis)}</p>
        <h2>Instrukcja dla operatora</h2><p class="tekst instrukcja">${esc(d.instrukcja)}</p>
        <p class="slaby">${d.wyrob ? `Wyrób: ${esc(d.wyrob)} ${esc(W.nazwaWyrobu(hala.slowniki, d.wyrob) || '')} · ` : ''}${d.wazny_do ? `Ważny do ${esc(W.data(d.wazny_do))}` : 'Bez terminu ważności'}</p>
        <h2>Potwierdzenia liderów <span class="${p.komplet ? 'tekst-ok' : 'tekst-alarm'}">${p.potwierdzone}/${p.wszystkie}</span></h2>
        <ul class="potwierdzenia-linii">${p.wiersze.map(w => `
          <li class="${w.potwierdzone ? 'ok' : 'brak'}"><b>${esc(w.nazwa)}</b>
            ${w.potwierdzone ? `<span>${esc(w.kto || '')} · ${esc(W.kiedy(w.czas, hala.teraz()))}</span>${w.uwagi ? `<q>${esc(w.uwagi)}</q>` : ''}` : '<span>czeka na lidera</span>'}</li>`).join('')}
        </ul>
        ${a.status === 'wycofany' ? `<p class="slaby">Wycofany ${esc(W.kiedy(d.czas_wycofania, hala.teraz()))}${d.powod_wycofania ? ': ' + esc(d.powod_wycofania) : ''}</p>` : ''}
        ${a.status === 'aktywny' && KJ.mozna('alert.wycofany') ? '<button type="button" id="wycofaj" class="alarm szeroki">Wycofaj alert</button>' : ''}`;
      const b = el.querySelector('#wycofaj');
      if (b) b.addEventListener('click', () => wycofaj(a));
    },
  });

  const zdjecie = ids => (ids && ids.length ? `<img data-plik="${esc(ids[0])}" alt="">` : '<div class="brak-zdjecia">bez zdjęcia</div>');

  async function wycofaj(a) {
    const w = await KJ.okno({
      tytul: 'Wycofać alert?',
      tresc: '<p>Liderzy przestaną go widzieć jako obowiązujący.</p><label>Powód<textarea name="powod" rows="3" maxlength="1000"></textarea></label>',
      przyciski: [{ tekst: 'Anuluj', wartosc: false }, { tekst: 'Wycofaj', wartosc: true, alarm: true }],
    });
    if (!w || !w.wartosc) return;
    const powod = String(w.dane.get('powod') || '').trim();
    await hala.zapisz('alert.wycofany', a.id, powod ? { powod } : {});
    KJ.komunikat('Alert wycofany');
  }

  // ------------------------------------------------------------ nowy alert

  const pusty = () => ({ tytul: '', opis: '', instrukcja: '', zdjecie_wzorcowe: null, zdjecie_wady: null, linie: [], wyrob: '', wazny_do: '' });
  let f = pusty();

  KJ.ekran('alert-nowy', {
    zakladka: 'alerty',
    formularz: true,
    async rysuj(el) {
      if (!KJ.mozna('alert.opublikowany')) { el.innerHTML = '<p class="pusto">Alerty publikuje kontroler albo kierownik KJ.</p>'; return; }
      f = Object.assign(pusty(), (await hala.brudnopis.odczytaj(BRUDNOPIS)) || {});
      const wyroby = Object.entries(hala.slowniki.wyroby || {}).sort(([a], [b]) => a.localeCompare(b, 'pl'));
      el.innerHTML = `
        <a class="wstecz" href="#alerty">‹ Alerty</a>
        <h1>Nowy Quality Alert</h1>
        <form id="f-alert" class="formularz" autocomplete="off" novalidate>
          <label>Tytuł<input name="tytul" maxlength="200" value="${esc(f.tytul)}" placeholder="np. Rysa na obudowie A"></label>
          <div class="porownanie">
            <div class="zdjecie-pole ok" data-zdjecie="zdjecie_wzorcowe"></div>
            <div class="zdjecie-pole alarm" data-zdjecie="zdjecie_wady"></div>
          </div>
          <label>Problem<textarea name="opis" rows="3" maxlength="4000">${esc(f.opis)}</textarea></label>
          <label>Instrukcja dla operatora<textarea name="instrukcja" rows="3" maxlength="4000" placeholder="Co ma sprawdzać i co zrobić z wadliwą sztuką">${esc(f.instrukcja)}</textarea></label>
          <fieldset><legend>Linie</legend><div class="wybor" id="linie-alertu"></div></fieldset>
          <label>Wyrób <span class="slaby">(opcjonalnie)</span><select name="wyrob"><option value="">— każdy —</option>
            ${wyroby.map(([k, w]) => `<option value="${esc(k)}" ${f.wyrob === k ? 'selected' : ''}>${esc(k)} · ${esc(w.nazwa)}</option>`).join('')}</select></label>
          <label>Ważny do <span class="slaby">(opcjonalnie)</span><input type="date" name="wazny_do" min="${esc(W.dzisZakladu(hala.teraz()))}" value="${esc(f.wazny_do)}"></label>
          <p class="blad" id="bledy-alertu" hidden></p>
          <div class="przyciski-formularza">
            <button type="button" id="porzuc">Wyczyść</button>
            <button type="submit" class="glowny">Opublikuj</button>
          </div>
        </form>`;
      rysujZdjecia(el); rysujLinie(el);
      const form = el.querySelector('#f-alert');
      form.addEventListener('input', () => { czytaj(form); hala.brudnopis.zapisz(BRUDNOPIS, f); });
      KJ.przyZapisie(form, opublikuj);
      el.querySelector('#porzuc').addEventListener('click', async () => {
        if (!(await KJ.potwierdz('Wyczyścić formularz?', 'Wpisany tekst i zdjęcia znikną z tego alertu.', 'Wyczyść'))) return;
        await hala.brudnopis.usun(BRUDNOPIS);
        KJ.idz('alert-nowy');
      });
    },
    odswiez(el) { rysujLinie(el); },          // nowa linia w słowniku — reszta formularza zostaje
  });

  function czytaj(form) {
    const d = new FormData(form);
    for (const k of ['tytul', 'opis', 'instrukcja', 'wyrob', 'wazny_do']) f[k] = String(d.get(k) || '');
  }

  function rysujZdjecia(el) {
    for (const pole of el.querySelectorAll('[data-zdjecie]')) {
      const k = pole.dataset.zdjecie, id = f[k];
      const opis = k === 'zdjecie_wzorcowe' ? 'Wzór — tak ma być' : 'Wada — tak nie może być';
      pole.innerHTML = id
        ? `<span class="podpis">${opis}</span>${KJ.miniatury([id], true)}`
        : `<button type="button" class="zrob-zdjecie"><span class="ikona" aria-hidden="true">📷</span>${opis}</button>`;
    }
    KJ.wypelnijZdjecia(el);
  }

  function rysujLinie(el) {
    const box = el.querySelector('#linie-alertu');
    if (!box) return;
    const wszystkie = !f.linie.length;
    box.innerHTML = `<button type="button" data-linia="" aria-pressed="${wszystkie}">Wszystkie</button>` +
      W.linie(hala.slowniki).map(l => `<button type="button" data-linia="${esc(l.kod)}" aria-pressed="${f.linie.includes(l.kod)}">${esc(l.nazwa)}</button>`).join('');
  }

  document.addEventListener('click', async ev => {
    if (!KJ.biezacy || KJ.biezacy.nazwa !== 'alert-nowy') return;
    const el = KJ.$('ekran');
    const linia = ev.target.closest('#linie-alertu button');
    if (linia) {
      const k = linia.dataset.linia;
      f.linie = !k ? [] : f.linie.includes(k) ? f.linie.filter(x => x !== k) : f.linie.concat(k);
      if (f.linie.length === W.linie(hala.slowniki).length) f.linie = [];     // wszystkie zaznaczone = „wszystkie”
      rysujLinie(el); hala.brudnopis.zapisz(BRUDNOPIS, f);
      return;
    }
    const pole = ev.target.closest('[data-zdjecie]');
    if (!pole) return;
    if (ev.target.closest('.zrob-zdjecie')) {
      const cel = f;                                   // formularz mógł w tym czasie zostać opublikowany/wyczyszczony
      const id = await KJ.zrobZdjecie();
      if (id && f === cel) { f[pole.dataset.zdjecie] = id; rysujZdjecia(KJ.$('ekran')); hala.brudnopis.zapisz(BRUDNOPIS, f, { odrazu: true }); }
    } else if (ev.target.closest('[data-usun-zdjecie]')) {
      f[pole.dataset.zdjecie] = null; rysujZdjecia(el); hala.brudnopis.zapisz(BRUDNOPIS, f);
    }
  });

  async function opublikuj(form) {
    czytaj(form);
    const bledy = W.bledyAlertu(f, hala.teraz());
    const b = form.querySelector('#bledy-alertu');
    b.hidden = !bledy.length;
    b.innerHTML = bledy.map(esc).join('<br>');
    if (bledy.length) return;
    if (!f.zdjecie_wzorcowe || !f.zdjecie_wady) {
      if (!(await KJ.potwierdz('Bez zdjęcia?', 'Operatorowi najłatwiej porównać wzór z wadą na zdjęciach. Opublikować mimo to?', 'Opublikuj'))) return;
    }
    const id = hala.nowyId();
    await hala.zapisz('alert.opublikowany', id, W.daneAlertu(f));
    await hala.brudnopis.usun(BRUDNOPIS);
    f = pusty();                                     // spóźnione zdjęcie nie wskrzesi wysłanego formularza
    KJ.komunikat(hala.polaczenie.strumien ? 'Alert opublikowany — liderzy już go widzą' : 'Alert zapisany — wyśle się, gdy wróci sieć');
    KJ.idz('alert/' + id);
  }
})(window.KJ);
