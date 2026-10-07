/* Własny SHA-256 — bo przeglądarkowego tutaj nie ma.

   Powód jest jeden i bardzo konkretny: `crypto.subtle` istnieje WYŁĄCZNIE
   w bezpiecznym kontekście (https albo localhost). GK Flota chodzi na sieci
   firmowej pod zwykłym http://192.168…, bez certyfikatu — i tam
   `crypto.subtle` jest po prostu `undefined`. Nie ma tego jak obejść
   ustawieniem ani flagą. Gdyby program liczył odciski przez przeglądarkę,
   przestałby je liczyć dokładnie tam, gdzie pracuje kierowca: na placu,
   z telefonu, po adresie IP.

   Do czego to służy w tym programie:
   1. Rozpoznanie DWA RAZY WŁOŻONEGO tego samego zdjęcia. Kierowca w rękawicach
      dotyka migawki dwa razy i do kadru wchodzą dwa identyczne pliki po 250 kB.
      Bez odcisku komplet pięciu ujęć potrafi ważyć tyle, co komplet ośmiu.
   2. Numer operacji liczony z jej TREŚCI. Dzięki niemu przegląd włożony
      do kolejki dwa razy (podwójne dotknięcie „Zapisz”, odzyskany brudnopis)
      niesie ten sam uuid — a serwer po uuid rozpoznaje powtórkę i zapisuje
      przegląd raz.                                                            */

const Skrot = (() => {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];

  /* Napis na bajty. Dwie drogi, bo zdjęcie w base64 to kilkaset kilobajtów
     czystego ASCII, a `unescape(encodeURIComponent(...))` robi z niego po
     drodze DWIE dodatkowe kopie w pamięci. Na telefonie za 400 zł, który ma
     jednocześnie otwarty aparat, to jest różnica między „chwilkę” a zabiciem
     karty przeglądarki przez system. Sprawdzenie „czy same znaki ASCII”
     robi silnik regexpów natywnie, więc kosztuje tyle co nic.                */
  function naBajty(tresc) {
    const s = String(tresc == null ? '' : tresc);
    if (!/[^\x00-\x7F]/.test(s)) {
      const b = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
      return b;
    }
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(s);
    // Starsze WebView na Androidzie 5 nie ma TextEncodera. `unescape` jest
    // przestarzały, ale jest wszędzie i daje dokładnie UTF-8 bajt po bajcie.
    const u = unescape(encodeURIComponent(s));
    const b = new Uint8Array(u.length);
    for (let i = 0; i < u.length; i++) b[i] = u.charCodeAt(i);
    return b;
  }

  const obrot = (x, n) => (x >>> n) | (x << (32 - n));

  function blok(dane, przes, h, w) {
    for (let i = 0; i < 16; i++) {
      const p = przes + i * 4;
      w[i] = (dane[p] << 24) | (dane[p + 1] << 16) | (dane[p + 2] << 8) | dane[p + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = obrot(w[i - 15], 7) ^ obrot(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = obrot(w[i - 2], 17) ^ obrot(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3];
    let e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let i = 0; i < 64; i++) {
      const S1 = obrot(e, 6) ^ obrot(e, 11) ^ obrot(e, 25);
      const wybor = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + wybor + K[i] + w[i]) | 0;
      const S0 = obrot(a, 2) ^ obrot(a, 13) ^ obrot(a, 22);
      const wiekszosc = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + wiekszosc) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }

  function sha256hex(tresc) {
    const dane = naBajty(tresc);
    const dl = dane.length;
    const h = new Int32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const w = new Int32Array(64);

    // Pełne bloki liczymy PROSTO ZE ŹRÓDŁA, bez doklejania dopełnienia do
    // kopii całego napisu. Kopia oznaczałaby drugie kilka megabajtów w pamięci
    // telefonu w chwili, w której kierowca właśnie zamyka komplet zdjęć.
    let i = 0;
    for (; i + 64 <= dl; i += 64) blok(dane, i, h, w);

    const reszta = dl - i;
    const ogon = new Uint8Array(reszta < 56 ? 64 : 128);
    ogon.set(dane.subarray(i), 0);
    ogon[reszta] = 0x80;
    // Długość idzie w bitach na 64 bitach, big-endian. Rozbita na dwie
    // połówki, bo operatory bitowe JavaScriptu obcinają wszystko do 32 bitów
    // i sama długość powyżej 512 MB wyszłaby z nich jako zero.
    const bity = dl * 8;
    const gora = Math.floor(bity / 4294967296);
    const dol = bity % 4294967296;
    for (let j = 0; j < 4; j++) {
      ogon[ogon.length - 8 + j] = (gora >>> (24 - j * 8)) & 0xff;
      ogon[ogon.length - 4 + j] = (dol >>> (24 - j * 8)) & 0xff;
    }
    for (let j = 0; j < ogon.length; j += 64) blok(ogon, j, h, w);

    let wynik = '';
    for (let j = 0; j < 8; j++) wynik += (h[j] >>> 0).toString(16).padStart(8, '0');
    return wynik;
  }

  /* Pamięć policzonych odcisków zdjęć.

     Bez niej odcisk tego samego zdjęcia liczy się kilka razy: raz przy
     dokładaniu do kadru, raz przy numerze operacji, raz po odzyskaniu
     brudnopisu. Przy komplecie sześciu ujęć to kilkanaście przebiegów po
     półtora megabajta i widoczne zacięcie ekranu. Kluczem jest sam napis
     base64, który i tak żyje w kolejce, więc mapa niczego nie powiela —
     trzyma tylko referencję. Limit jest po to, żeby po skończonym przeglądzie
     nie zostały w niej zdjęcia z poprzedniego auta.                          */
  const POJEMNOSC = 32;
  const zapamietane = new Map();

  function obrazu(dataURL) {
    const s = String(dataURL || '');
    if (!s) return '';
    const juz = zapamietane.get(s);
    if (juz) return juz;
    // Nagłówek „data:image/jpeg;base64,” zdejmujemy, żeby to samo zdjęcie
    // zapisane raz jako jpeg, a raz jako png dawało różne odciski wtedy i
    // tylko wtedy, gdy różnią się piksele.
    const przecinek = s.indexOf(',');
    const tresc = (przecinek > 0 && przecinek < 60) ? s.slice(przecinek + 1) : s;
    // UWAGA: to NIE jest ta sama liczba co `odcisk` w bazie serwera. Serwer
    // liczy sha256 z ROZKODOWANYCH bajtów zdjęcia, my z tekstu base64.
    // Obie strony rozpoznają po tym duplikat u siebie, ale porównanie odcisku
    // z telefonu z odciskiem z bazy zawsze wyjdzie „różne” — nie wolno na tym
    // niczego budować.
    const odcisk = sha256hex(tresc).slice(0, 32);
    if (zapamietane.size >= POJEMNOSC) zapamietane.delete(zapamietane.keys().next().value);
    zapamietane.set(s, odcisk);
    return odcisk;
  }

  /* Pola, które opisują życie operacji w telefonie, a nie jej treść. Gdyby
     weszły do numeru, ta sama paczka po pierwszej nieudanej próbie wysyłki
     dostawałaby inny numer — i serwer przyjąłby ją drugi raz jako nową. */
  const POMIJANE = ['uuid', 'dodano', 'prob', 'blad', 'odrzucono', 'czeka_na_wyslanie'];
  const DLUGI = 256;

  function kanoniczny(w, glebokosc) {
    if (glebokosc > 6) return '…';          // pętla w danych zamiast zawieszonego telefonu
    if (w === null || w === undefined) return '~';
    if (Array.isArray(w)) return '[' + w.map(e => kanoniczny(e, glebokosc + 1)).join(',') + ']';
    if (typeof w === 'object') {
      // Klucze sortowane, bo kolejność pól w obiekcie zależy od tego, w jakiej
      // kolejności je wpisano — a dwa zapisy tej samej treści mają dać ten sam
      // numer niezależnie od tego, którą gałęzią kodu powstały.
      return '{' + Object.keys(w).sort()
        .filter(k => POMIJANE.indexOf(k) < 0)
        .map(k => k + ':' + kanoniczny(w[k], glebokosc + 1)).join(',') + '}';
    }
    const t = String(w);
    return t.length > DLUGI ? '#' + t.length + '#' + obrazu(t) : t;
  }

  /* Numer operacji policzony z jej treści.

     Idempotencja stoi na uuid: serwer trzyma tabelę `operacje` i drugi raz
     tego samego numeru nie wykona. Numer losowy załatwia powtórki wysyłki,
     ale NIE załatwia powtórki włożenia: dwa dotknięcia „Zapisz” w rękawicy,
     albo brudnopis odzyskany po tym, jak aparat wypchnął przeglądarkę
     z pamięci, dają dwie paczki z tymi samymi zdjęciami i dwoma numerami.
     Serwer zapisze wtedy jeden przegląd, ale przepuści przez łącze dwa
     komplety po kilka megabajtów — na firmowym wifi na placu to są minuty.  */
  function operacji(op) {
    return 'op-' + sha256hex(kanoniczny(op, 0)).slice(0, 32);
  }

  return { sha256hex, obrazu, operacji };
})();
