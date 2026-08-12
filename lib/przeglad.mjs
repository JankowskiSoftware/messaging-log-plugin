// Trzeci szew: wiersze dobowe + nazwy plików rozmów → tekst dla skilla „co robiłem".
// Czysta funkcja; czytanie z dysku i odświeżanie klonu siedzą w bin/co-robilem.mjs.
// Dziury liczą się z nazw plików rozmów, nie z ich treści — skill niczego nie
// odtwarza, tylko mówi wprost, że godziny nie zostały policzone.

import { czytajCsv } from './wiersze.mjs';

const DZIEN_MS = 24 * 3600 * 1000;

/** Doby od granicy do granicy włącznie, rosnąco. Odwrócony zakres jest pusty. */
export function zakresDob(od, doKtorej) {
  const start = Date.parse(`${od}T00:00:00Z`);
  const koniec = Date.parse(`${doKtorej}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(koniec)) {
    throw new Error(`zakres poza formatem RRRR-MM-DD: ${od}..${doKtorej}`);
  }
  const doby = [];
  // doby liczone w UTC, bo nazwa katalogu jest etykietą warszawskiej doby, nie chwilą
  for (let t = start; t <= koniec; t += DZIEN_MS) doby.push(new Date(t).toISOString().slice(0, 10));
  return doby;
}

// nazwa pliku sesji zaczyna się od HHMM warszawskiej godziny pierwszej wymiany
// ponytail: sesja przez kilka godzin znaczy tylko swoją pierwszą, więc dziura
// w środku takiej sesji nie zostanie zgłoszona; poprawka wymaga czytania treści
const godzinyRozmow = pliki =>
  new Set(pliki.filter(p => /^\d{4}-.*\.jsonl$/.test(p)).map(p => p.slice(0, 2)));

/**
 * @param {Array<{doba:string, csv:string, pliki?:string[]}>} doby rosnąco
 * @returns {string} wiersze pogrupowane po godzinie i repozytorium, plus dziury
 */
export function przeglad(doby) {
  return doby
    .map(({ doba, csv, pliki = [] }) => {
      const wiersze = czytajCsv(csv);
      const grupy = new Map();
      for (const w of wiersze) {
        const klucz = `${w.godzina} ${w.repo}`;
        if (!grupy.has(klucz)) grupy.set(klucz, { ...w, tematy: [] });
        grupy.get(klucz).tematy.push(w.temat);
      }

      const linie = [];
      for (const [, g] of [...grupy].sort(([a], [b]) => (a < b ? -1 : 1))) {
        linie.push(`  ${g.godzina}:${g.od}–${g.godzina}:${g.do} ${g.repo} · ${g.wymiany} wymian`);
        for (const temat of g.tematy) linie.push(`    - ${temat}`);
      }

      const opisane = new Set(wiersze.map(w => w.godzina));
      const dziury = [...godzinyRozmow(pliki)].filter(g => !opisane.has(g)).sort();
      if (dziury.length) linie.push(`  bez wierszy: ${dziury.join(', ')}`);

      return `${doba}\n${linie.length ? linie.join('\n') : '  brak zapisu'}`;
    })
    .join('\n');
}
