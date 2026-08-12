#!/usr/bin/env node
// Zadanie godzinowe, budzone co 60 minut na jedynej maszynie chodzącej non stop:
// pobranie zmian → rozmowy Codeksa z dysku → koszyki z ostatnich 48 godzin →
// jedno wywołanie modelu na koszyk → wiersze dopisane przez skrypt →
// zatwierdzenie, wypchnięcie, dziennik.
// Katalogu projektów Claude'a nie czyta — od tego jest hak. Codeksa czyta, bo
// Codex haków nie ma.

import { KATALOG_CODEKSA, dopiszRozmowyCodeksa } from '../lib/codex.mjs';
import { dopiszWiersze } from '../lib/wiersze.mjs';
import { doby, czytajRekordy, czytajCsvy, zmienioneDoby, zapiszWiersze, opisz } from '../lib/przebieg.mjs';
import { stareDoby, skasujDobe } from '../lib/retencja.mjs';
import { KLON, git, dziennik, zapewnijKlon, zajmijZamek, zwolnijZamek, pobierz, wypchnij } from '../lib/klon.mjs';

const OKNO_DOB = 4; // 48 godzin okna plus doba na przesunięcie strefy

const zapisz = dziennik('.messaging-log-godzina.log');

/** Rozmowy Codeksa dokładane przed koszykami, żeby weszły do wierszy tej samej godziny. */
function zbierzCodeksa(okno) {
  if (!zajmijZamek()) return zapisz('zamek zajęty, Codex wróci za godzinę');
  try {
    const dopisane = dopiszRozmowyCodeksa(KATALOG_CODEKSA, KLON, okno);
    if (!dopisane.length) return;
    for (const wzgledna of dopisane) git('add', '--', wzgledna);
    git('commit', '-m', `rozmowy Codeksa: ${dopisane.length}`);
    try {
      wypchnij(zapisz);
    } catch (blad) {
      zapisz(`wypchnięcie nieudane, zostaje lokalnie: ${blad.stderr || blad.message}`);
    }
    zapisz(`Codex: dopisane pliki ${dopisane.join(', ')}`);
  } finally {
    zwolnijZamek();
  }
}

async function main() {
  const teraz = Date.now();
  const okno = doby(teraz, OKNO_DOB);
  zapewnijKlon();
  try {
    pobierz();
  } catch (blad) {
    // brak sieci wstrzymuje wymianę z remote, ale nie liczenie wierszy
    zapisz(`pobranie nieudane, licze na tym, co lokalne: ${blad.stderr || blad.message}`);
  }

  zbierzCodeksa(okno);

  const csvy = czytajCsvy(KLON, okno);
  // wywołania modelu idą poza zamkiem — trwają minuty, a hak ma pisać dalej
  const nowe = await dopiszWiersze(czytajRekordy(KLON, okno), csvy, teraz, opisz);

  const zmienione = zmienioneDoby(nowe, csvy);
  const przeterminowane = stareDoby(KLON, teraz);
  if (!zmienione.length && !przeterminowane.length) return zapisz('brak nowych koszyków');

  if (!zajmijZamek()) return zapisz('zamek zajęty, koszyki wrócą za godzinę');
  try {
    zapiszWiersze(KLON, zmienione, nowe);
    for (const doba of zmienione) git('add', '--', `godziny/${doba}.csv`);
    for (const doba of przeterminowane) {
      skasujDobe(KLON, doba);
      git('add', '--', `rozmowy/${doba}`);
    }
    // katalog mógł nie być jeszcze wypchnięty — wtedy skasowanie nie zmienia indeksu
    if (!git('diff', '--cached', '--name-only').trim()) return zapisz('nic do zatwierdzenia');
    const opis = [
      zmienione.length && `godziny: ${zmienione.join(', ')}`,
      przeterminowane.length && `retencja: ${przeterminowane.length}`,
    ].filter(Boolean).join('; ');
    git('commit', '-m', opis);
    try {
      wypchnij(zapisz);
    } catch (blad) {
      zapisz(`wypchnięcie nieudane, zostaje lokalnie: ${blad.stderr || blad.message}`);
    }
    zapisz(`${opis}; skasowane katalogi: ${przeterminowane.length}`);
  } finally {
    zwolnijZamek();
  }
}

try {
  await main();
} catch (blad) {
  zapisz(`zadanie przerwane: ${blad.stack || blad.message}`);
}
