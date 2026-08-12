#!/usr/bin/env node
// Hak Stop, uruchamiany z flagą async po każdej turze: transkrypt tej sesji →
// nowe rekordy → plik sesji w klonie → zatwierdzenie → wypchnięcie.
// Nic nowego = koniec bez dotykania gita. Cokolwiek pójdzie źle, hak milczy
// i kończy zerem — tura Michała nigdy nie ma na tym ucierpieć.

import fs from 'node:fs';
import { transkryptNaRekordy } from '../lib/filtr.mjs';
import { dopiszRekordy } from '../lib/sesja.mjs';
import { KLON, git, dziennik, zapewnijKlon, zajmijZamek, zwolnijZamek, wypchnij } from '../lib/klon.mjs';

const zapisz = dziennik('.messaging-log-hak.log');

function main() {
  const wejscie = JSON.parse(fs.readFileSync(0, 'utf8'));
  const sesja = wejscie.session_id;
  const transkrypt = wejscie.transcript_path;
  if (!sesja || !transkrypt) return;

  zapewnijKlon();
  if (!zajmijZamek()) return zapisz('zamek zajęty, pomijam turę — dogoni się przy następnej');
  try {
    const rekordy = transkryptNaRekordy(fs.readFileSync(transkrypt, 'utf8'), 'claude');
    const wzgledna = dopiszRekordy(KLON, rekordy);
    if (!wzgledna) return;

    git('add', '--', wzgledna);
    git('commit', '-m', `rozmowa ${sesja.slice(0, 8)}`);
    // brak sieci wstrzymuje wypchnięcie, ale nie zapis — zaległość dogoni następna tura
    try {
      wypchnij(zapisz);
    } catch (blad) {
      zapisz(`wypchnięcie nieudane, zostaje lokalnie: ${blad.stderr || blad.message}`);
    }
  } finally {
    zwolnijZamek();
  }
}

try {
  main();
} catch (blad) {
  zapisz(`hak przerwany: ${blad.stack || blad.message}`);
}
