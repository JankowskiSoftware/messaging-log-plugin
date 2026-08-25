// Wejście-wyjście pierwszego przebiegu: doby okna, odczyt rozmów i wierszy
// z klonu, dociągnięcie transkryptów Claude'a, wywołanie modelu, zapis wierszy.
// Pisze do tego samego katalogu co hak sesyjny, więc czyta i zapisuje jego
// kodem — drugi zestaw dałby drugi format.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { transkryptNaRekordy } from './filtr.mjs';
import { czasWarszawski, dopiszRekordy } from './sesja.mjs';
import { zachetaKoszyka } from './wiersze.mjs';

const GODZINA_MS = 3600 * 1000;
const MODEL = 'haiku'; // najtańszy dostępny

export const KATALOG_CLAUDE = path.join(os.homedir(), '.claude', 'projects');

/** Etykiety dób wstecz od `teraz`, najnowsza pierwsza. */
export const doby = (teraz, ile) =>
  Array.from({ length: ile }, (_, i) => czasWarszawski(teraz - i * 24 * GODZINA_MS).doba);

/** Wymiany zapisane w klonie za podane doby. */
export function czytajRekordy(klon, doby) {
  const rekordy = [];
  for (const doba of doby) {
    const katalog = path.join(klon, 'rozmowy', doba);
    let pliki;
    try {
      pliki = fs.readdirSync(katalog);
    } catch {
      continue; // doba bez rozmów nie ma katalogu
    }
    for (const plik of pliki.filter(p => p.endsWith('.jsonl'))) {
      for (const linia of fs.readFileSync(path.join(katalog, plik), 'utf8').split('\n')) {
        if (!linia.trim()) continue;
        try {
          rekordy.push(JSON.parse(linia));
        } catch {
          // ucięta linia — reszta pliku jest dobra
        }
      }
    }
  }
  return rekordy;
}

/** Treść plików `godziny/<doba>.csv` za podane doby, po dobach. */
export function czytajCsvy(klon, doby) {
  const csvy = {};
  for (const doba of doby) {
    try {
      csvy[doba] = fs.readFileSync(path.join(klon, 'godziny', `${doba}.csv`), 'utf8');
    } catch {
      // brak pliku dobowego znaczy „jeszcze żadnej godziny nie policzono"
    }
  }
  return csvy;
}

export const zmienioneDoby = (nowe, csvy) => Object.keys(nowe).filter(doba => nowe[doba] !== csvy[doba]);

/** Zapis wierszy; zatwierdzenie zostaje po stronie wołającego, bo to on trzyma zamek. */
export function zapiszWiersze(klon, doby, nowe) {
  for (const doba of doby) {
    const plik = path.join(klon, 'godziny', `${doba}.csv`);
    fs.mkdirSync(path.dirname(plik), { recursive: true });
    fs.writeFileSync(plik, nowe[doba]);
  }
}

// ponytail: model wołany przez CLI Claude Code, bo klucza API tu nie ma i nie ma
// go skąd wziąć. Gdyby CLI zniknęło, to jedyne miejsce do przepięcia na HTTP.
export const opisz = async rekordy =>
  execFileSync('claude', ['-p', '--model', MODEL], {
    input: zachetaKoszyka(rekordy),
    // znacznik dla naszego haka Stop: to wywołanie wewnętrzne, nie rozmowa do nagrania
    env: { ...process.env, MESSAGING_LOG_WEWNETRZNE: '1' },
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    timeout: 120_000,
  });

/** Transkrypty Claude'a tknięte w oknie. Katalog jest płaski: projekt/sesja.jsonl. */
function* transkryptyClaude(katalog, odKiedy) {
  let projekty;
  try {
    projekty = fs.readdirSync(katalog);
  } catch {
    return; // brak katalogu projektów to maszyna, na której Claude jeszcze nie chodził
  }
  for (const projekt of projekty) {
    let pliki;
    try {
      pliki = fs.readdirSync(path.join(katalog, projekt));
    } catch {
      continue;
    }
    for (const plik of pliki.filter(p => p.endsWith('.jsonl'))) {
      const pelna = path.join(katalog, projekt, plik);
      // okno liczone z czasu modyfikacji: transkrypt nietknięty od miesiąca nie
      // niesie rozmowy z tego miesiąca. Sesja z okna idzie w całości, także gdy
      // zaczęła się wcześniej — jej rekordy trafią do własnych dób.
      if (fs.statSync(pelna).mtimeMs < odKiedy) continue;
      yield pelna;
    }
  }
}

/**
 * Rozmowy Claude'a z okna dopisane do plików sesji w klonie. Normalnie zbiera je
 * hak po każdej turze; to jest jednorazowe nadrobienie historii sprzed haka.
 * @returns {string[]} ścieżki dopisanych plików względem klonu
 */
export function dociagnijRozmowyClaude(katalog, klon, odKiedy) {
  const dopisane = [];
  for (const transkrypt of transkryptyClaude(katalog, odKiedy)) {
    const wzgledna = dopiszRekordy(klon, transkryptNaRekordy(fs.readFileSync(transkrypt, 'utf8'), 'claude'));
    if (wzgledna) dopisane.push(wzgledna);
  }
  return dopisane;
}
