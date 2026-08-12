#!/usr/bin/env node
// Zadanie godzinowe, budzone co 60 minut na jedynej maszynie chodzącej non stop:
// pobranie zmian → koszyki z ostatnich 48 godzin → jedno wywołanie modelu na
// koszyk → wiersze dopisane przez skrypt → zatwierdzenie, wypchnięcie, dziennik.
// Katalogu projektów Claude'a nie czyta — od tego jest hak.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { czasWarszawski } from '../lib/sesja.mjs';
import { dopiszWiersze, zachetaKoszyka } from '../lib/wiersze.mjs';
import { KLON, git, dziennik, zapewnijKlon, zajmijZamek, zwolnijZamek, pobierz, wypchnij } from '../lib/klon.mjs';

const GODZINA_MS = 3600 * 1000;
const OKNO_DOB = 4; // 48 godzin okna plus doba na przesunięcie strefy
const MODEL = 'haiku'; // najtańszy dostępny

const zapisz = dziennik('.messaging-log-godzina.log');

const doby = teraz =>
  Array.from({ length: OKNO_DOB }, (_, i) => czasWarszawski(teraz - i * 24 * GODZINA_MS).doba);

function czytajRekordy(teraz) {
  const rekordy = [];
  for (const doba of doby(teraz)) {
    const katalog = path.join(KLON, 'rozmowy', doba);
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

function czytajCsvy(teraz) {
  const csvy = {};
  for (const doba of doby(teraz)) {
    try {
      csvy[doba] = fs.readFileSync(path.join(KLON, 'godziny', `${doba}.csv`), 'utf8');
    } catch {
      // brak pliku dobowego znaczy „jeszcze żadnej godziny nie policzono"
    }
  }
  return csvy;
}

// ponytail: model wołany przez CLI Claude Code, bo klucza API tu nie ma i nie ma
// go skąd wziąć. Gdyby CLI zniknęło, to jedyne miejsce do przepięcia na HTTP.
const opisz = async rekordy =>
  execFileSync('claude', ['-p', '--model', MODEL], {
    input: zachetaKoszyka(rekordy),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    timeout: 120_000,
  });

async function main() {
  const teraz = Date.now();
  zapewnijKlon();
  try {
    pobierz();
  } catch (blad) {
    // brak sieci wstrzymuje wymianę z remote, ale nie liczenie wierszy
    zapisz(`pobranie nieudane, licze na tym, co lokalne: ${blad.stderr || blad.message}`);
  }

  const csvy = czytajCsvy(teraz);
  // wywołania modelu idą poza zamkiem — trwają minuty, a hak ma pisać dalej
  const nowe = await dopiszWiersze(czytajRekordy(teraz), csvy, teraz, opisz);

  const zmienione = Object.keys(nowe).filter(doba => nowe[doba] !== csvy[doba]);
  if (!zmienione.length) return zapisz('brak nowych koszyków');

  if (!zajmijZamek()) return zapisz('zamek zajęty, koszyki wrócą za godzinę');
  try {
    for (const doba of zmienione) {
      const plik = path.join(KLON, 'godziny', `${doba}.csv`);
      fs.mkdirSync(path.dirname(plik), { recursive: true });
      fs.writeFileSync(plik, nowe[doba]);
      git('add', '--', `godziny/${doba}.csv`);
    }
    git('commit', '-m', `godziny: ${zmienione.join(', ')}`);
    try {
      wypchnij(zapisz);
    } catch (blad) {
      zapisz(`wypchnięcie nieudane, zostaje lokalnie: ${blad.stderr || blad.message}`);
    }
    zapisz(`dopisane doby: ${zmienione.join(', ')}`);
  } finally {
    zwolnijZamek();
  }
}

try {
  await main();
} catch (blad) {
  zapisz(`zadanie przerwane: ${blad.stack || blad.message}`);
}
