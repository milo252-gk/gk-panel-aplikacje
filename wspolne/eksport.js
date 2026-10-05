/* GK Panel Kierownika — wspólny pasek „Pobierz CSV” (D32: zestawienia do Excela dla kierowników).

   Panel (Raporty), UR (KPI — kierownik UR: awarie) i KJ (Pareto — kierownik KJ: próby, partie) rysują ten sam pasek:
       HalaEksport.rysuj(el, hala, { rodzaje: ['awarie'], komunikat })   // rodzaje: podzbiór HalaEksport.RODZAJE
   Rodzaje, których osoba nie może pobrać, pasek pomija (HalaEksport.dlaRol) — hub i tak sprawdza rolę (403).
   Okres domyślnie: ten miesiąc w czasie zakładu. Wybór (rodzaj, od, do) pamiętamy w pamięci strony, bo ekrany UR i KJ
   przerysowują się przy każdym zdarzeniu z hali. Plik pobiera hala.pobierz (token w nagłówku, nie w adresie).
   Bez sieci nie ma czego pobrać — pasek mówi to od razu („Potrzebne połączenie z hubem”). Wygląd: hala.css → .hala-eksport. */

(function (global) {
  'use strict';

  // Ta sama tabela co EKSPORTY w hala.py (admin może wszystko).
  const RODZAJE = {
    awarie: { nazwa: 'Awarie', role: ['kierownik', 'kierownik_ur'] },
    zlecenia: { nazwa: 'Zlecenia', role: ['kierownik', 'kierownik_ur', 'kierownik_kj'] },
    zmiany: { nazwa: 'Zmiany i checklisty', role: ['kierownik'] },
    proby: { nazwa: 'Próby KJ', role: ['kierownik', 'kierownik_kj'] },
    partie: { nazwa: 'Partie brakowe', role: ['kierownik', 'kierownik_kj'] },
  };

  function dlaRol(role, rodzaje) {
    const moje = role || [];
    return (rodzaje || Object.keys(RODZAJE)).filter(r => RODZAJE[r] && (moje.includes('admin') || RODZAJE[r].role.some(x => moje.includes(x))));
  }

  const dwa = n => String(n).padStart(2, '0');
  /* Domyślny okres: od 1. dnia bieżącego miesiąca do dziś (daty zakładu, nie telefonu). */
  function okres(teraz) {
    const l = global.Hala.lokalny(teraz);
    return { od: `${l.rok}-${dwa(l.miesiac)}-01`, do: `${l.rok}-${dwa(l.miesiac)}-${dwa(l.dzien)}` };
  }

  /* Adres zestawienia albo błąd po polsku (czysta funkcja — testy: reduktor-testy.js). */
  function adres(rodzaj, od, do_) {
    if (!RODZAJE[rodzaj]) return { blad: 'Wybierz, co pobrać.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(od || '') || !/^\d{4}-\d{2}-\d{2}$/.test(do_ || '')) return { blad: 'Podaj daty od i do.' };
    if (od > do_) return { blad: 'Data „od” jest po dacie „do”.' };
    return { sciezka: `/api/v1/eksport/${rodzaj}.csv?od=${od}&do=${do_}`, plik: `gk-${rodzaj}-${od}-${do_}.csv` };
  }

  const stan = new Map();          // klucz paska → { rodzaj, od, do }
  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function rysuj(el, hala, opcje) {
    if (!el) return;
    const o = Object.assign({ rodzaje: Object.keys(RODZAJE), komunikat: null }, opcje || {});
    const moje = dlaRol(hala.pracownik && hala.pracownik.role, o.rodzaje);
    if (!moje.length) { el.innerHTML = ''; return; }
    const klucz = o.rodzaje.join(',');
    const s = Object.assign({ rodzaj: moje[0] }, okres(hala.teraz()), stan.get(klucz) || {});
    if (!moje.includes(s.rodzaj)) s.rodzaj = moje[0];
    stan.set(klucz, s);
    el.innerHTML = `
      <form class="hala-eksport" aria-label="Pobierz zestawienie CSV">
        <b class="hala-eksport-tytul">Do Excela</b>
        ${moje.length > 1 ? `<select name="rodzaj" aria-label="Co pobrać">${moje.map(r =>
          `<option value="${r}" ${r === s.rodzaj ? 'selected' : ''}>${esc(RODZAJE[r].nazwa)}</option>`).join('')}</select>`
          : `<span>${esc(RODZAJE[moje[0]].nazwa)}</span>`}
        <label>od <input type="date" name="od" value="${esc(s.od)}"></label>
        <label>do <input type="date" name="do" value="${esc(s.do)}"></label>
        <button type="submit" class="glowny">⬇ Pobierz CSV</button>
        <span class="hala-eksport-uwaga">${hala.polaczenie && hala.polaczenie.online === false ? 'Brak sieci — pobieranie wymaga połączenia z hubem.' : 'Wymaga połączenia z hubem.'}</span>
      </form>`;
    const f = el.querySelector('form');
    f.addEventListener('change', () => {
      stan.set(klucz, { rodzaj: f.rodzaj ? f.rodzaj.value : moje[0], od: f.od.value, do: f.do.value });
    });
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const w = stan.get(klucz);
      const a = adres(w.rodzaj, w.od, w.do);
      const powiedz = (t, r) => (o.komunikat ? o.komunikat(t, r) : null);
      if (a.blad) { powiedz(a.blad, 'blad'); return; }
      const b = f.querySelector('button');
      b.disabled = true;
      try {
        await hala.pobierz(a.sciezka, a.plik);
        powiedz(`Pobrano: ${a.plik}`, 'ok');
      } catch (e) {
        powiedz(!e || e instanceof TypeError || !e.kod ? 'Pobieranie wymaga połączenia z hubem. Sprawdź sieć i spróbuj jeszcze raz.' : e.message, 'blad');
      } finally {
        b.disabled = false;
      }
    });
  }

  global.HalaEksport = { RODZAJE, dlaRol, okres, adres, rysuj };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.HalaEksport;
})(typeof window !== 'undefined' ? window : globalThis);
