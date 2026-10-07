/* Podpis palcem pod przeglądem wewnętrznym.

   Przegląd jeżdżący do teczki auta i do warsztatu jest dokumentem — biuro
   podpisuje go tym samym palcem, którym klikało checklistę, zamiast drukować,
   podpisywać długopisem i skanować z powrotem. Płótno jest małe i proste
   celowo: ma działać na tablecie w hali, w rękawiczce, przy jednym podejściu.

   Zmniejszania zdjęć TU NIE MA — od tego jest zdjecia.js. Ten plik zajmuje się
   wyłącznie płótnem.                                                         */

const Podpis = (() => {
  function zaloz(plotno) {
    const rys = plotno.getContext('2d');
    let pisze = false, cos = false, ostatni = null;

    function dopasuj() {
      const gestosc = window.devicePixelRatio || 1;
      const p = plotno.getBoundingClientRect();
      // Przy przeliczaniu rozmiaru płótno się czyści, więc podpis, który już
      // na nim leży, trzeba przenieść. Bez tego obrót tabletu w połowie
      // składania podpisu kasował go bez słowa.
      const kopia = cos ? plotno.toDataURL() : null;
      plotno.width = Math.round(p.width * gestosc);
      plotno.height = Math.round(p.height * gestosc);
      rys.setTransform(gestosc, 0, 0, gestosc, 0, 0);
      /* '#fff' i '#16232f' to KARTKA I ATRAMENT, nie kolory interfejsu — i tak
         mają zostać także w motywie ciemnym. Ten piksel wchodzi do PNG-a przez
         obraz() niżej, jedzie na serwer i na wydruk przeglądu, gdzie tło jest
         białe. Ciemne płótno dałoby czarny prostokąt na papierze,
         a przezroczyste — podpis niewidzialny w każdej ciemnej przeglądarce
         zdjęć. Wartości zsynchronizowane z --podpis-tlo i --podpis-atrament
         w style.css; komentarz stoi też tam.                                  */
      rys.fillStyle = '#fff';
      rys.fillRect(0, 0, p.width, p.height);
      rys.lineWidth = 2.4;
      rys.lineCap = 'round';
      rys.lineJoin = 'round';
      rys.strokeStyle = '#16232f';
      if (kopia) {
        const o = new Image();
        o.onload = () => rys.drawImage(o, 0, 0, p.width, p.height);
        o.src = kopia;
      }
    }

    function punkt(zdarzenie) {
      const p = plotno.getBoundingClientRect();
      const z = zdarzenie.touches ? zdarzenie.touches[0] : zdarzenie;
      return { x: z.clientX - p.left, y: z.clientY - p.top };
    }
    function start(e) { e.preventDefault(); pisze = true; ostatni = punkt(e); }
    function ciagnij(e) {
      if (!pisze) return;
      // preventDefault, bo bez niego przeciągnięcie palcem po płótnie przewija
      // całe okno przeglądu zamiast rysować.
      e.preventDefault();
      const teraz = punkt(e);
      rys.beginPath();
      rys.moveTo(ostatni.x, ostatni.y);
      rys.lineTo(teraz.x, teraz.y);
      rys.stroke();
      ostatni = teraz;
      cos = true;
      plotno.classList.add('zapelnione');
    }
    function koniec() { pisze = false; }

    ['mousedown', 'touchstart'].forEach(n =>
      plotno.addEventListener(n, start, { passive: false }));
    ['mousemove', 'touchmove'].forEach(n =>
      plotno.addEventListener(n, ciagnij, { passive: false }));
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(n =>
      plotno.addEventListener(n, koniec));
    window.addEventListener('resize', dopasuj);
    dopasuj();

    return {
      wyczysc() { cos = false; plotno.classList.remove('zapelnione'); dopasuj(); },
      pusty() { return !cos; },
      obraz() { return cos ? plotno.toDataURL('image/png') : null; },
      /* Odtworzenie podpisu z zapisanego brudnopisu — przegląd przerwany
         telefonem ma wrócić w całości, razem z podpisem. */
      wstaw(dataURL) {
        if (!dataURL) return;
        const o = new Image();
        o.onload = () => {
          const r = plotno.getBoundingClientRect();
          rys.drawImage(o, 0, 0, r.width, r.height);
          cos = true;
          plotno.classList.add('zapelnione');
        };
        o.src = dataURL;
      },
      /* Nasłuchy na oknie trzeba zdjąć razem z zamknięciem okna przeglądu.
         Bez tego każde kolejne otwarcie dokłada nasłuch resize rysujący po
         płótnie, którego już nie ma w drzewie. */
      rozlacz() { window.removeEventListener('resize', dopasuj); },
    };
  }

  /* Gotowy kawałek formularza: płótno + przycisk czyszczenia. Wołający dostaje
     to samo, co z zaloz(), więc nie musi wiedzieć o istnieniu płótna.        */
  function wstawDo(pojemnik, etykieta) {
    pojemnik.innerHTML =
      `<label class="pole">${escHtml(etykieta || 'Podpis')}
         <canvas class="pole-podpisu"></canvas>
       </label>
       <button type="button" class="tekstowy" data-czysc-podpis>Wyczyść podpis</button>`;
    const uchwyt = zaloz(pojemnik.querySelector('canvas'));
    pojemnik.querySelector('[data-czysc-podpis]').onclick = () => uchwyt.wyczysc();
    return uchwyt;
  }

  return { zaloz, wstawDo };
})();
