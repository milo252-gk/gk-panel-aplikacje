/* Instrukcja w razie awarii.

   Jedyny ekran w tym programie pisany pod człowieka, któremu właśnie coś się
   stało: stoi w nocy na poboczu, jest zdenerwowany, trzyma telefon w jednej
   ręce i nie ma czasu czytać. Stąd wszystkie decyzje niżej:

   - treść jest już w telefonie, zanim się przyda (app.js trzyma ją razem
     ze słownikami — ekran NIE pyta serwera, bo zasięgu może nie być),
   - punkty są zwinięte i widać same tytuły, żeby dało się znaleźć właściwy
     jednym spojrzeniem,
   - numery telefonu są przyciskiem, który dzwoni — nie tekstem do przepisania,
   - pierwszy punkt („pilny") jest otwarty i czerwony, bo przy wypadku z ludźmi
     nikt nie będzie nic rozwijał.

   Biuro widzi ten sam ekran plus przyciski do pisania — celowo ten sam,
   a nie osobny edytor: kto pisze instrukcję, ma widzieć dokładnie to,
   co zobaczy kierowca.                                                       */

EKRANY.awaria = {
  tytul: 'W razie awarii',

  async rysuj(pole) {
    const biuro = jestBiuro();
    // Najpierw to, co już jest w telefonie — ekran ma się narysować
    // natychmiast i bez sieci. Świeższą wersję dociągamy dopiero potem
    // i tylko jeśli się uda.
    let lista = stan.instrukcje || [];
    rysujAwarie(pole, lista, biuro);

    if (stan.online) {
      const swieze = await API.get('/api/instrukcje' + (biuro ? '?wszystkie=1' : ''))
        .catch(() => null);
      if (swieze) {
        stan.instrukcje = swieze.filter(p => p.aktywna);
        if (stan.ekran === 'awaria') rysujAwarie(pole, swieze, biuro);
      }
    }
  },
};

function rysujAwarie(pole, lista, biuro) {
  const widoczne = biuro ? lista : lista.filter(p => p.aktywna);
  const wypelnione = widoczne.filter(p => (p.tresc || '').trim() || (p.telefon || '').trim());

  pole.innerHTML = `
    ${!wypelnione.length ? `<div class="wstega ${biuro ? 'blad' : 'uwaga'}">
      ${biuro
        ? '<b>Instrukcja nie jest jeszcze uzupełniona.</b><br>Program założył same '
          + 'tytuły — treść musi wpisać firma. Kierowca, który otworzy ten ekran '
          + 'w nocy na poboczu, zobaczy dziś puste punkty.'
        : '<b>Instrukcja nie została jeszcze uzupełniona przez biuro.</b><br>'
          + 'W nagłym wypadku dzwoń pod <b>112</b>, potem do biura.'}
    </div>` : ''}

    ${!biuro ? `<div class="wstega info male">Ta instrukcja jest zapisana w telefonie
      i otwiera się także bez zasięgu.</div>` : ''}

    ${biuro ? `<div class="pasek-narzedzi">
      <button class="glowny" id="aw-nowy">Dodaj punkt</button>
      <span class="slaby male">Kolejność ustala liczba przy punkcie —
        mniejsza jest wyżej.</span>
    </div>` : ''}

    ${widoczne.length ? widoczne.map(p => punktAwarii(p, biuro)).join('') : `
      <div class="pusto"><span class="duza-ikona">🆘</span>
      Nie ma jeszcze żadnego punktu instrukcji.</div>`}`;

  if (biuro) {
    pole.querySelector('#aw-nowy').onclick = () => oknoPunktuAwarii(null);
    pole.querySelectorAll('[data-edytuj]').forEach(b => {
      b.onclick = (e) => {
        e.preventDefault();          // przycisk siedzi w <summary>, które by się zwinęło
        e.stopPropagation();
        oknoPunktuAwarii(lista.find(p => p.id === Number(b.dataset.edytuj)));
      };
    });
    pole.querySelectorAll('[data-skasuj]').forEach(b => {
      b.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        skasujPunktAwarii(lista.find(p => p.id === Number(b.dataset.skasuj)));
      };
    });
  }
}

function punktAwarii(p, biuro) {
  const pusty = !(p.tresc || '').trim() && !(p.telefon || '').trim();
  return `
    <details class="karta karta-zwijana${p.pilna ? ' nie' : ''}"${p.pilna ? ' open' : ''}>
      <summary>
        <span style="flex:1">${p.pilna ? '🚨 ' : ''}${escHtml(p.tytul)}</span>
        ${pusty ? '<span class="plakietka p-zalegly">puste</span>' : ''}
        ${p.aktywna ? '' : '<span class="plakietka">ukryty</span>'}
        ${biuro ? `<span class="uchwyty">
          <button data-edytuj="${p.id}">Zmień</button>
          <button data-skasuj="${p.id}">Skasuj</button></span>` : ''}
      </summary>
      <div class="zwijana-tresc">
        ${(p.tresc || '').trim()
          ? `<div class="instrukcja-tresc">${escHtml(p.tresc)}</div>`
          : '<p class="slaby">Ten punkt nie ma jeszcze treści.</p>'}
        ${numeryPunktu(p.telefon)}
      </div>
    </details>`;
}

/* Numery są przyciskiem, który dzwoni. Kierowca stojący w nocy na drodze nie
   będzie przepisywał cyfr z ekranu do klawiatury telefonu — a jeden numer
   przepisany z błędem to kilka minut, których wtedy nie ma.                  */
function numeryPunktu(surowe) {
  const numery = String(surowe || '').split(/[,;]/).map(n => n.trim()).filter(Boolean);
  if (!numery.length) return '';
  return `<div class="chipy">${numery.map(n => {
    // tel: nie znosi spacji ani myślników — do wybrania idą same cyfry i „+”.
    const doWybrania = n.replace(/[^\d+]/g, '');
    return `<a class="chip glowny" href="tel:${escHtml(doWybrania)}">📞 ${escHtml(n)}</a>`;
  }).join('')}</div>`;
}

function oknoPunktuAwarii(p) {
  const nowy = !p;
  okno({
    tytul: nowy ? 'Nowy punkt instrukcji' : 'Punkt: ' + p.tytul,
    szerokie: true,
    tresc: `
      <label class="pole">Tytuł *
        <input id="aw-tytul" maxlength="120" value="${escHtml(p ? p.tytul : '')}"
               placeholder="np. Awaria w nocy, poza godzinami pracy biura"></label>
      <p class="slaby male">Po tytule kierowca znajduje właściwy punkt — pisz tak,
      jak sam by o tym pomyślał, a nie językiem procedury.</p>

      <label class="pole">Co robić
        <textarea id="aw-tresc" rows="10" maxlength="8000"
          placeholder="Krótkie zdania, po kolei. Jeden krok w jednej linii.">${
          escHtml(p ? p.tresc || '' : '')}</textarea></label>

      <div class="dwie-kolumny">
        <label class="pole">Numery telefonu
          <input id="aw-telefon" maxlength="40"
                 value="${escHtml(p ? p.telefon || '' : '')}"
                 placeholder="np. 601 234 567, 112"></label>
        <label class="pole">Kolejność
          <input id="aw-kolejnosc" type="number" inputmode="numeric"
                 value="${p && p.kolejnosc != null ? p.kolejnosc : ''}"
                 placeholder="mniejsza liczba = wyżej"></label>
      </div>
      <p class="slaby male">Kilka numerów oddziel przecinkiem. Każdy stanie się
      przyciskiem, który dzwoni jednym dotknięciem.</p>

      <label class="male"><input type="checkbox" id="aw-pilna"${
        p && p.pilna ? ' checked' : ''}> punkt pilny — zawsze na górze i rozwinięty</label><br>
      <label class="male"><input type="checkbox" id="aw-aktywna"${
        !p || p.aktywna ? ' checked' : ''}> pokazuj kierowcom</label>`,
    poOtwarciu: (tresc) => tresc.querySelector('#aw-tytul').focus(),
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Zapisz', klasa: 'glowny', klik: async (zamknij) => {
        const we = id => document.getElementById(id);
        const tytul = we('aw-tytul').value.trim();
        if (!tytul) { komunikat('Podaj tytuł punktu', 'blad'); return; }
        const kolejnosc = we('aw-kolejnosc').value.trim();
        const w = await sprobuj(() => API.post('/api/instrukcje', {
          id: p ? p.id : null,
          tytul,
          tresc: we('aw-tresc').value,
          telefon: we('aw-telefon').value.trim(),
          kolejnosc: kolejnosc === '' ? null : Number(kolejnosc),
          pilna: we('aw-pilna').checked ? 1 : 0,
          aktywna: we('aw-aktywna').checked ? 1 : 0,
        }), nowy ? 'Punkt dopisany' : 'Zapisane');
        if (!w) return;
        zamknij();
        await wczytajSlowniki().catch(() => {});
        odswiezEkran();
      } },
    ],
  });
}

async function skasujPunktAwarii(p) {
  if (!p) return;
  const tak = await potwierdz('Skasować punkt „' + p.tytul + '"?',
    'Zniknie z instrukcji, którą czytają kierowcy. Jeśli chcesz go tylko '
    + 'schować, odznacz „pokazuj kierowcom" zamiast kasować.',
    { tak: 'Skasuj', groznie: true });
  if (!tak) return;
  if (!await sprobuj(() => API.del('/api/instrukcje/' + p.id), 'Punkt skasowany')) return;
  await wczytajSlowniki().catch(() => {});
  odswiezEkran();
}
