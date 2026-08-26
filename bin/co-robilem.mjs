#!/usr/bin/env node
// Odczyt dziennika za zakres dób, dla skilla „co robiłem".
//
//   node bin/co-robilem.mjs [od] [do]     # RRRR-MM-DD, domyślnie wczoraj
//
// Nic nie zapisuje. Surowe rozmowy czyta z klonu Messaging Loga, a gotowy
// dziennik z repo Personal.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { czasWarszawski } from '../lib/sesja.mjs';
import { zakresDob, przeglad } from '../lib/przeglad.mjs';
import { KLON, dziennik, zapewnijKlon, zajmijZamek, zwolnijZamek, pobierz } from '../lib/klon.mjs';

const zapisz = dziennik('.messaging-log-co-robilem.log');
const PERSONAL = process.env.PERSONAL_REPO || path.join(os.homedir(), 'repos', 'personal');
const GODZINY = path.join(PERSONAL, 'AKTYWNOSC', 'godziny');

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

const SYNTHETYCZNE = [
  'This session is being continued from a previous conversation that ran out of context.',
  '[Request interrupted by user for tool use]',
  '<task-notification>',
];
const SAMO_POTWIERDZENIE = /^(?:ok|okej|okay|tak|nie|jasne|dzięki|dzieki)[.!?]*$/i;

const plikiGodzinMichala = katalog => {
  const godziny = new Set();
  let pliki;
  try {
    pliki = fs.readdirSync(katalog);
  } catch {
    return [];
  }
  for (const plik of pliki.filter(nazwa => nazwa.endsWith('.jsonl'))) {
    for (const linia of czytaj(path.join(katalog, plik)).split('\n')) {
      if (!linia.trim()) continue;
      try {
        const rekord = JSON.parse(linia);
        const tekst = String(rekord.tekst ?? '').trim();
        if (rekord.rola !== 'michal' || !tekst || SYNTHETYCZNE.some(p => tekst.startsWith(p)) || SAMO_POTWIERDZENIE.test(tekst)) continue;
        godziny.add(czasWarszawski(rekord.ts).godzina);
      } catch {
        // Ucięta linia nie unieważnia pozostałych rekordów.
      }
    }
  }
  // `przeglad` zna stary kontrakt nazw plików HHMM-*. Wystarcza mu godzina.
  return [...godziny].map(godzina => `${godzina}00-michal.jsonl`);
};

console.log(
  przeglad(
    zakresDob(od, doKtorej).map(doba => ({
      doba,
      csv: czytaj(path.join(GODZINY, `${doba}.csv`)),
      pliki: plikiGodzinMichala(path.join(KLON, 'rozmowy', doba)),
    })),
  ),
);
