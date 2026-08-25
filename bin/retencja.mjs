#!/usr/bin/env node
// Zadanie dobowe: katalogi dobowe `rozmowy/` starsze niż sześćdziesiąt dni znikają
// z repo danych (ADR 0004). Po wycofaniu zadania godzinowego retencja stoi tu i tylko
// tu — hak sesyjny jej nie robi, bo miałby ją powtarzać przy każdej turze na każdej
// maszynie, a pisarz aktywności w repo `personal` klon wyłącznie czyta.
// Nic więcej ten przebieg nie pisze: żadnych wierszy, żadnych rozmów.

import { stareDoby, skasujDobe } from '../lib/retencja.mjs';
import { KLON, git, dziennik, zapewnijKlon, zajmijZamek, zwolnijZamek, pobierz, wypchnij } from '../lib/klon.mjs';

const zapisz = dziennik('.messaging-log-retencja.log');
const opis = blad => blad.stderr || blad.message;

function main() {
  zapewnijKlon();
  if (!zajmijZamek()) return zapisz('zamek zajęty, retencja wróci jutro');
  try {
    try {
      pobierz();
    } catch (blad) {
      // kasowanie idzie po nazwach katalogów, więc stary klon co najwyżej pominie dobę
      zapisz(`pobranie nieudane, kasuję na tym, co lokalne: ${opis(blad)}`);
    }

    const przeterminowane = stareDoby(KLON, Date.now());
    if (!przeterminowane.length) return zapisz('nic przeterminowanego');
    for (const doba of przeterminowane) {
      skasujDobe(KLON, doba);
      git('add', '--', `rozmowy/${doba}`);
    }
    // katalog mógł nie być jeszcze wypchnięty — wtedy skasowanie nie zmienia indeksu
    if (!git('diff', '--cached', '--name-only').trim()) return zapisz('skasowane katalogi nie były zatwierdzone');
    git('commit', '-m', `retencja: ${przeterminowane.length}`);
    try {
      wypchnij(zapisz);
    } catch (blad) {
      zapisz(`wypchnięcie nieudane, zostaje lokalnie: ${opis(blad)}`);
    }
    zapisz(`skasowane doby: ${przeterminowane.join(', ')}`);
  } finally {
    zwolnijZamek();
  }
}

try {
  main();
} catch (blad) {
  zapisz(`zadanie przerwane: ${blad.stack || blad.message}`);
}
