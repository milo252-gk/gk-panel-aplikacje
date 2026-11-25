/* Panel Zarządczy GK — Wyniki (D98): terminowość, wykonane do zadanych, średnia dzienna, zlecenia wzięte bez przypisania i odrzucone
   przez kierownika — zakład, działy i osoby. Cały ekran to wspólny komponent (../wspolne/wyniki.js), ten sam co „Moje wyniki”
   w GK Produkcja, UR i KJ; tu tylko podpięcie do zakładki. */
(() => {
  'use strict';
  const P = window.Panel;
  P.widoki.wyniki = {
    rysuj: () => window.HalaWyniki.rysuj(P.$('wyniki-tresc'), P.hala, { tryb: 'zarzad', klucz: 'panel-wyniki', komunikat: (t, r) => P.komunikat(t, r) }),
  };
})();
