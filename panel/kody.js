/* Panel Kierownika — okno „🖨 Kody QR” (☰ Więcej; kierownik zakładu i administrator).

   Właściciel 2026-10-20: „Daj mi drukować każdy kod QR osobno, jak i wszystkie z kategorii zbiorczo jak teraz. Upewnij się,
   że w panelu kierownika do druku są wszystkie kody QR.” Kody były w czterech miejscach (Moje konto, Serwis, Maszyny,
   nigdzie — identyfikatory i punkty skanu), a kierownik zakładu do Maszyn i Serwisu nie wchodzi. Tu są wszystkie
   kategorie naraz: przy każdej „🖨 Drukuj wszystkie”, po rozwinięciu 🖨 przy każdym kodzie. Kategorie i etykiety liczy
   PanelEtykiety.kategorie (czysta funkcja, testy w widok-testy.js); druk — ten sam arkusz w ukrytej ramce co wszędzie
   (PanelEtykiety.drukuj, HalaKonto.drukujKody). Kody aplikacji z huba (GET /api/v1/aplikacje — wszystkie aplikacje GK,
   stały adres na GitHub Pages, także gdy program w biurze nie działa). */

(() => {
  'use strict';
  const P = window.Panel;
  const { hala, $, esc } = P;
  const E = window.PanelEtykiety;

  let aplikacje = null, bladAplikacji = '';
  const otwarte = new Set();          // rozwinięte kategorie — zostają po przerysowaniu (wczytanie aplikacji)
  let biezace = [];

  const dostepne = () => ((hala.pracownik && hala.pracownik.role) || []).some(r => r === 'kierownik' || r === 'admin');

  function rysuj() {
    biezace = E.kategorie({ slowniki: hala.slowniki, pracownicy: hala.pracownicy, kontrakt: hala.kontrakt, aplikacje, bladAplikacji });
    $('lista-kodow').innerHTML = biezace.map(k => {
      const zKodem = k.elementy.filter(e => e.aplikacja || (e.etykiety || []).length).length;
      return `<details class="kody-kategoria" data-kategoria="${esc(k.kod)}" ${otwarte.has(k.kod) ? 'open' : ''}>
        <summary><span class="kody-nazwa">${esc(k.nazwa)} <span class="znacznik neutral">${k.wczytuje ? '…' : zKodem}</span></span>
          <button type="button" class="maly glowny" data-wszystkie="${esc(k.kod)}" ${zKodem ? '' : 'disabled'}>🖨 Drukuj wszystkie</button></summary>
        ${k.gdzie ? `<p class="slaby">${esc(k.gdzie)}</p>` : ''}
        ${k.blad ? `<p class="tekst-alarm">${esc(k.blad)}</p>` : k.wczytuje ? '<p class="slaby">Wczytuję…</p>' : ''}
        <ul class="kody-lista">${k.elementy.map(e => `<li>
          <span><b>${esc(e.nazwa)}</b> <span class="slaby">${esc(e.podpis)}</span></span>
          ${e.aplikacja || (e.etykiety || []).length ? `<button type="button" class="maly" data-jeden="${esc(e.klucz)}" aria-label="Drukuj: ${esc(e.nazwa)}" title="Drukuj">🖨</button>` : ''}
        </li>`).join('')}</ul>
      </details>`;
    }).join('');
  }

  async function wczytajAplikacje() {
    try {
      aplikacje = window.HalaKonto.wierszeAplikacji((await hala.aplikacje()).aplikacje);
      bladAplikacji = '';
    } catch (e) {
      aplikacje = null;
      bladAplikacji = e && e.kod === 0 ? 'Kody aplikacji wymagają połączenia z serwerem.' : P.komunikatBledu(e);
    }
    if ($('okno-kodow').open) rysuj();
  }

  function otworz() {
    aplikacje = null; bladAplikacji = '';
    rysuj();
    if (!$('okno-kodow').open) $('okno-kodow').showModal();
    wczytajAplikacje();
  }

  async function drukuj(kategoria, element) {
    const k = biezace.find(x => x.kod === kategoria);
    if (!k) return;
    if (k.kod === 'aplikacje') {
      // Karta aplikacji (kod 55 mm, jak wejść) — wszystkie z listą tych bez kodu na dole albo jedna.
      const wiersze = element ? (aplikacje || []).filter(a => a.kod === element.aplikacja) : (aplikacje || []);
      if (wiersze.some(a => a.adres)) await window.HalaKonto.drukujKody(wiersze);
      return;
    }
    const lista = element ? element.etykiety : E.etykietyElementow(k.elementy);
    await E.drukuj(lista, element ? `Kod QR — ${element.nazwa}` : `Kody QR — ${k.nazwa}`);
  }

  $('lista-kodow').addEventListener('click', async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    // Przycisk w nagłówku kategorii nie zwija jej i nie rozwija.
    ev.preventDefault();
    try {
      if (b.dataset.wszystkie) await drukuj(b.dataset.wszystkie);
      if (b.dataset.jeden) {
        const kat = b.closest('[data-kategoria]').dataset.kategoria;
        const k = biezace.find(x => x.kod === kat);
        const el = k && k.elementy.find(e => e.klucz === b.dataset.jeden);
        if (el) await drukuj(kat, el);
      }
    } catch (e) { P.komunikat(P.komunikatBledu(e), 'blad'); }
  });
  $('lista-kodow').addEventListener('toggle', ev => {
    const d = ev.target;
    if (d.matches && d.matches('details.kody-kategoria')) { if (d.open) otwarte.add(d.dataset.kategoria); else otwarte.delete(d.dataset.kategoria); }
  }, true);

  // Po wylogowaniu lista osób i adresów nie zostaje w pamięci strony dla następnej osoby.
  hala.na('sesja', () => {
    aplikacje = null; bladAplikacji = ''; otwarte.clear(); biezace = [];
    $('lista-kodow').innerHTML = '';
    if ($('okno-kodow').open) $('okno-kodow').close();
  });

  P.widoki.kody = { otworz, dostepne, rysuj };
})();
