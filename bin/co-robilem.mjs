#!/usr/bin/env node
// Odczyt dziennika za zakres dób, dla skilla „co robiłem".
//
//   node bin/co-robilem.mjs [od] [do]     # RRRR-MM-DD, domyślnie wczoraj
//
// Nic nie zapisuje do repo danych. Dziennik godzinowy jest zamknięty na dzień
// przełączenia (2026-08-25) i od tego dnia niesie wyłącznie historię.

import fs from 'node:fs';
import path from 'node:path';
import { czasWarszawski } from '../lib/sesja.mjs';
import { zakresDob, przeglad } from '../lib/przeglad.mjs';
import { KLON, dziennik, zapewnijKlon, zajmijZamek, zwolnijZamek, pobierz } from '../lib/klon.mjs';

const zapisz = dziennik('.messaging-log-co-robilem.log');

const wczoraj = czasWarszawski(Date.now() - 24 * 3600 * 1000).doba;
const od = process.argv[2] || wczoraj;
const doKtorej = process.argv[3] || od;

zapewnijKlon();
// pobranie przestawia gałąź klonu, więc idzie pod tym samym zamkiem co zapisy;
// zajęty zamek znaczy najwyżej dane sprzed kilku minut, a nie brak odpowiedzi
if (zajmijZamek()) {
  try {
    pobierz();
  } catch (blad) {
    zapisz(`pobranie nieudane, czytam to, co lokalne: ${blad.stderr || blad.message}`);
  } finally {
    zwolnijZamek();
  }
}

const czytaj = plik => {
  try {
    return fs.readFileSync(plik, 'utf8');
  } catch {
    return ''; // doba bez policzonych wierszy nie ma pliku
  }
};

const listuj = katalog => {
  try {
    return fs.readdirSync(katalog);
  } catch {
    return []; // doba bez rozmów albo za retencją nie ma katalogu
  }
};

console.log(
  przeglad(
    zakresDob(od, doKtorej).map(doba => ({
      doba,
      csv: czytaj(path.join(KLON, 'godziny', `${doba}.csv`)),
      pliki: listuj(path.join(KLON, 'rozmowy', doba)),
    })),
  ),
);
