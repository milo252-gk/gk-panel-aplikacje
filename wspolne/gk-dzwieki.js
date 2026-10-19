/* GK Dźwięki — jeden zestaw dźwięków powiadomień dla wszystkich aplikacji GK (właściciel 2026-10-16: „dźwięki niech
   będą mniej jak 8-bitowe gry, a faktyczne powiadomienia”, „dźwięki, szata graficzna też spójne”).

     GKDzwieki.zagraj('info' | 'sukces' | 'reakcja' | 'blad' | 'pilne' | 'awaria' | 'zatrzymanie')   // → true, gdy zagrało
     GKDzwieki.odblokuj()       // przy geście użytkownika (robi się samo: pointerdown, keydown, touchend)
     GKDzwieki.gotowy()         // czy przeglądarka już pozwala grać (false → pasek „🔇 … dotknij”)
     GKDzwieki.kontekst()       // wspólny AudioContext strony (jeden na stronę — pasek i dźwięki patrzą na ten sam)
     GKDzwieki.wlaczony(fn)     // przełącznik aplikacji: fn() === false → cisza (wibracja też)
     GKDzwieki.RODZAJE, GKDzwieki.WIBRACJE

   Brzmienie: miękkie dzwonki jak powiadomienia w telefonie — każde „uderzenie” to sinus z kilkoma alikwotami (dwa
   niezharmonizowane, jak w metalofonie), atak 6 ms bez trzasku i naturalne wybrzmienie; całość przez łagodny kompresor
   i filtr. ŻADNEJ fali prostokątnej ani piłokształtnej (test: wspolne/testy/t_dzwieki.py). Pilność rośnie wysokością,
   tempem i liczbą powtórzeń, nie ostrością barwy (opis każdego rodzaju — przy RODZAJE niżej i w STYL-GK §6a).

   Ten plik jest wspólny i kopiowany 1:1 do programów spoza hali (GK Trasy, GK Flota — web/gk-dzwieki.js);
   .github/spojnosc.py pilnuje, że kopie są identyczne. Bez zależności od hala.js. */
(function (global) {
  'use strict';

  // [stosunek częstotliwości, amplituda (× jasność od drugiego alikwotu w górę), mnożnik czasu wybrzmienia]
  const ALIKWOTY = [[1.0, 1.0, 1.0, false], [1.003, 0.45, 1.0, false], [2.0, 0.3, 0.45, true], [3.0, 0.12, 0.25, true],
    [4.16, 0.08, 0.12, true], [5.43, 0.04, 0.07, true]];

  // Uderzenia: [Hz, start s, szczyt, tau s, jasność]. Serie: [liczba, odstęp s].
  // 2026-10-19 (właściciel: „Dźwięki reakcji mogą być jednakowe, ale inne mają się różnić. Awaria ma być najwyraźniejsza.”):
  // każdy rodzaj ma inną wysokość, liczbę uderzeń i rytm — da się je rozróżnić bez patrzenia:
  //   info        — jedno miękkie E6 (krótka wiadomość, nic pilnego);
  //   sukces      — szybkie C6 → G6 w górę (zapisane, zrobione);
  //   reakcja     — „ta-ta-DAM”: dwa razy F5 i skok na C6, lżej i wolniej niż sukces (reakcja kierownika, D77 — jedna dla czterech);
  //   blad        — niskie G4 → Dis4 w dół, krótko (coś nie wyszło);
  //   pilne       — „ding-dong” H5 → G5, długie wybrzmienie (pilne zadanie, alert jakości);
  //   awaria      — NAJWYRAŹNIEJSZY: wznoszący dwuton G5 → D6, najgłośniejszy w zestawie, trzy razy (ok. 2 s);
  //   zatrzymanie — blisko awarii, ale z niskim C5 na początku: C5 → G5 → D6, trzy razy szybciej (maszyna stoi).
  const C5 = 523.3, F5 = 698.5, G5 = 784.0, H5 = 987.8, C6 = 1046.5, D6 = 1174.7, E6 = 1318.5, G6 = 1568.0, G4 = 392.0, DIS4 = 311.1;
  const RODZAJE = {
    info: { uderzenia: [[E6, 0, 0.18, 0.4, 0.5]], serie: [1, 0] },
    sukces: { uderzenia: [[C6, 0, 0.14, 0.12, 0.5], [G6, 0.075, 0.14, 0.2, 0.5]], serie: [1, 0] },
    reakcja: { uderzenia: [[F5, 0, 0.16, 0.09, 0.6], [F5, 0.11, 0.16, 0.09, 0.6], [C6, 0.24, 0.2, 0.35, 0.7]], serie: [1, 0] },
    blad: { uderzenia: [[G4, 0, 0.22, 0.1, 0.3], [DIS4, 0.11, 0.22, 0.14, 0.3]], serie: [1, 0] },
    pilne: { uderzenia: [[H5, 0, 0.3, 0.8, 0.8], [G5, 0.28, 0.3, 1.1, 0.8]], serie: [1, 0] },
    awaria: { uderzenia: [[G5, 0, 0.5, 0.3, 1.0], [D6, 0.17, 0.5, 0.36, 1.0]], serie: [3, 0.5] },
    zatrzymanie: { uderzenia: [[C5, 0, 0.44, 0.16, 0.9], [G5, 0.11, 0.44, 0.16, 0.9], [D6, 0.22, 0.44, 0.24, 1.0]], serie: [3, 0.36] },
  };
  const WIBRACJE = {
    info: [60], sukces: [30], reakcja: [40, 50, 90], blad: [80, 60, 80], pilne: [150, 100, 150],
    awaria: [500, 150, 500, 150, 500], zatrzymanie: [250, 80, 250, 80, 250, 150, 800],
  };

  let audio = null, wyjscie = null, wlaczonyFn = null;

  function kontekst() {
    if (!audio) {
      const K = global.AudioContext || global.webkitAudioContext;
      if (!K) return null;
      try { audio = new K(); } catch (e) { return null; }
    }
    return audio;
  }

  // Wspólny tor: głośność → kompresor (wyrównuje uderzenia, nic nie przesteruje) → filtr (zdejmuje „cyfrowy” połysk).
  function tor(a) {
    if (wyjscie && wyjscie.context === a) return wyjscie;
    const g = a.createGain();
    g.gain.value = 0.9;
    let dalej = a.destination;
    try {
      const f = a.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 7000; f.Q.value = 0.7;
      f.connect(a.destination);
      const k = a.createDynamicsCompressor();
      k.threshold.value = -20; k.knee.value = 10; k.ratio.value = 3.5; k.attack.value = 0.003; k.release.value = 0.2;
      k.connect(f);
      dalej = k;
    } catch (e) { /* stara przeglądarka — bez kompresora i filtra */ }
    g.connect(dalej);
    wyjscie = g;
    return g;
  }

  function uderzenie(a, cel, hz, t, szczyt, tau, jasnosc) {
    for (const [stosunek, amp, mnoznik, zJasnoscia] of ALIKWOTY) {
      const czas = tau * mnoznik;
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine';
      o.frequency.value = hz * stosunek;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(szczyt * amp * (zJasnoscia ? jasnosc : 1), t + 0.006);
      g.gain.setTargetAtTime(0, t + 0.006, czas);
      o.connect(g).connect(cel);
      o.start(t);
      o.stop(t + 0.006 + 6 * czas);
    }
  }

  function odblokuj() {
    const a = kontekst();
    if (!a) return;
    if (a.state !== 'running') a.resume().catch(() => {});
    // iPhone: pierwszy dźwięk z gestu odblokowuje wyjście na dobre — krótki cichy bufor.
    if (!a.gkOdblokowany) {
      a.gkOdblokowany = true;
      try { const b = a.createBufferSource(); b.buffer = a.createBuffer(1, 1, 22050); b.connect(a.destination); b.start(0); } catch (e) { /* nic */ }
    }
  }
  if (global.document) {
    for (const zd of ['pointerdown', 'keydown', 'touchend']) global.document.addEventListener(zd, odblokuj, { capture: true, passive: true });
    global.document.addEventListener('visibilitychange', () => {
      if (global.document.visibilityState === 'visible' && audio && audio.state !== 'running') audio.resume().catch(() => {});
    });
  }

  /* Zwraca, czy zagrało (false — brak dźwięku w przeglądarce, przełącznik wyłączony albo przeglądarka czeka na pierwsze
     dotknięcie: aplikacja pokazuje wtedy pasek „🔇 … dotknij, żeby włączyć”). Wibracja idzie zawsze, gdy dźwięk włączony. */
  function zagraj(rodzaj) {
    const r = RODZAJE[rodzaj];
    if (!r) return false;
    if (wlaczonyFn && wlaczonyFn() === false) return false;
    try { global.navigator && global.navigator.vibrate && global.navigator.vibrate(WIBRACJE[rodzaj]); } catch (e) { /* bez wibracji */ }
    const a = kontekst();
    if (!a) return false;
    if (a.state !== 'running') { a.resume().catch(() => {}); return false; }
    const cel = tor(a);
    const t0 = a.currentTime + 0.02;
    const [serie, odstep] = r.serie;
    const dlugoscSerii = Math.max(...r.uderzenia.map(u => u[1])) + odstep;
    for (let s = 0; s < serie; s++) {
      for (const [hz, start, szczyt, tau, jasnosc] of r.uderzenia) uderzenie(a, cel, hz, t0 + s * dlugoscSerii + start, szczyt, tau, jasnosc);
    }
    return true;
  }

  const gotowy = () => { const a = kontekst(); return !!a && a.state === 'running'; };
  const wlaczony = fn => { wlaczonyFn = typeof fn === 'function' ? fn : null; };

  const GKDzwieki = { zagraj, odblokuj, gotowy, kontekst, wlaczony, RODZAJE, WIBRACJE, ALIKWOTY };
  global.GKDzwieki = GKDzwieki;
  if (typeof module !== 'undefined' && module.exports) module.exports = GKDzwieki;
})(typeof window !== 'undefined' ? window : globalThis);
