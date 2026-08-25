// Drugi szew: rekordy + dotychczasowe CSV + bieżący czas → nowe CSV.
// Czysta funkcja, wywołanie modelu wstrzyknięte parametrem. Pliki, git
// i uruchomienie modelu siedzą poza szwem, w bin/godzina.mjs.

import { czasWarszawski } from './sesja.mjs';

const KOLUMNY = ['data', 'godzina', 'od', 'do', 'repo', 'wymiany', 'temat'];
const NAGLOWEK = KOLUMNY.join(',');

const GODZINA_MS = 3600 * 1000;
const OKNO_GODZIN = 48;
const MAX_TEMATOW = 3;
const MAX_ZNAKOW = 120;
const LIMIT_WYMIANY = 2000;
const LIMIT_KOSZYKA = 100 * 1024;

const INSTRUKCJA = [
  'Poniżej wymiany z jednej godziny pracy, z jednego repozytorium.',
  `Wypisz najwyżej ${MAX_TEMATOW} tematów, każdy w osobnej linii, najwyżej ${MAX_ZNAKOW} znaków.`,
  'Same fakty: co robił, nad czym, z jakim skutkiem. Bez diagnozy, bez oceny nastroju,',
  'bez teorii o jego stanie. Bez nagłówków, bez numeracji, bez komentarza od siebie.',
].join('\n');

function polaCsv(linia) {
  const pola = [];
  let pole = '';
  let wCudzyslowie = false;
  for (let i = 0; i < linia.length; i++) {
    const znak = linia[i];
    if (wCudzyslowie) {
      if (znak !== '"') pole += znak;
      else if (linia[i + 1] === '"') { pole += '"'; i++; }
      else wCudzyslowie = false;
    } else if (znak === '"') wCudzyslowie = true;
    else if (znak === ',') { pola.push(pole); pole = ''; }
    else pole += znak;
  }
  pola.push(pole);
  return pola;
}

const cytuj = wartosc => (/[",\n]/.test(wartosc) ? `"${wartosc.split('"').join('""')}"` : wartosc);

/** Wiersze pliku dobowego jako obiekty; nagłówek i puste linie odpadają. */
export function czytajCsv(tresc) {
  return String(tresc ?? '')
    .split(/\r?\n/)
    .filter(l => l.trim() && l !== NAGLOWEK)
    .map(l => Object.fromEntries(polaCsv(l).map((p, i) => [KOLUMNY[i], p])));
}

/** Zachęta dla modelu: wyłącznie wymiany tego koszyka, przycięte do sufitów kosztowych. */
export function zachetaKoszyka(rekordy) {
  const wymiany = rekordy.map(r => `${r.rola}: ${r.tekst.slice(0, LIMIT_WYMIANY)}`).join('\n\n');
  return `${INSTRUKCJA}\n\n${wymiany.slice(0, LIMIT_KOSZYKA)}`;
}

const kluczKoszyka = (data, godzina, repo) => `${data} ${Number(godzina)} ${repo}`;

function tematy(odpowiedz) {
  const linie = Array.isArray(odpowiedz) ? odpowiedz : String(odpowiedz ?? '').split('\n');
  return linie
    .map(l => String(l).replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
    .slice(0, MAX_TEMATOW)
    .map(t => t.slice(0, MAX_ZNAKOW));
}

function koszyki(rekordy, teraz, oknoGodzin) {
  const terazIdx = Math.floor(new Date(teraz).getTime() / GODZINA_MS);
  const zebrane = new Map();
  for (const rekord of rekordy) {
    const idx = Math.floor(new Date(rekord.ts).getTime() / GODZINA_MS);
    // bieżąca godzina jeszcze się nie zamknęła, a starsza niż okno już nie wróci
    if (!Number.isFinite(idx) || idx >= terazIdx || terazIdx - idx > oknoGodzin) continue;
    const { doba, godzina, minuta } = czasWarszawski(rekord.ts);
    const klucz = kluczKoszyka(doba, godzina, rekord.repo);
    let koszyk = zebrane.get(klucz);
    if (!koszyk) zebrane.set(klucz, (koszyk = { doba, godzina, repo: rekord.repo, rekordy: [] }));
    koszyk.rekordy.push({ ...rekord, minuta });
  }
  for (const koszyk of zebrane.values()) koszyk.rekordy.sort((a, b) => (a.ts < b.ts ? -1 : 1));
  return [...zebrane].sort(([a], [b]) => (a < b ? -1 : 1));
}

/**
 * @param {Array<{ts:string,repo:string,rola:string,tekst:string}>} rekordy wymiany z ostatnich dób
 * @param {Record<string,string>} csvy treść plików `godziny/<doba>.csv`, po dobach
 * @param {number|Date} teraz
 * @param {(rekordy:Array<object>) => Promise<string|string[]>} opisz wywołanie modelu
 * @param {number} [oknoGodzin] jak głęboko wstecz sięgamy; pierwszy przebieg sięga dalej
 * @returns {Promise<Record<string,string>>} te same doby plus nowe; nietknięte bajt w bajt
 */
export async function dopiszWiersze(rekordy, csvy, teraz, opisz, oknoGodzin = OKNO_GODZIN) {
  const wynik = { ...csvy };
  const opisane = new Set(
    Object.values(csvy).flatMap(czytajCsv).map(w => kluczKoszyka(w.data, w.godzina, w.repo)),
  );

  for (const [klucz, koszyk] of koszyki(rekordy, teraz, oknoGodzin)) {
    // koszyk z wierszami jest pomijany, także gdy dojechały do niego spóźnione rekordy
    if (opisane.has(klucz)) continue;

    let opis;
    try {
      opis = tematy(await opisz(koszyk.rekordy));
    } catch {
      // brak wiersza jest jedynym sygnałem „jeszcze nie policzone" — koszyk wróci
      continue;
    }
    if (!opis.length) continue;

    const stale = [
      koszyk.doba,
      koszyk.godzina,
      koszyk.rekordy[0].minuta,
      koszyk.rekordy.at(-1).minuta,
      koszyk.repo,
      String(koszyk.rekordy.length),
    ];
    const nowe = opis.map(temat => [...stale, temat].map(cytuj).join(',')).join('\n');

    const dotychczas = wynik[koszyk.doba]?.trim() ? wynik[koszyk.doba] : `${NAGLOWEK}\n`;
    wynik[koszyk.doba] = (dotychczas.endsWith('\n') ? dotychczas : `${dotychczas}\n`) + nowe + '\n';
    opisane.add(klucz);
  }
  return wynik;
}
