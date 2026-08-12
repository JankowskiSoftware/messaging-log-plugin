#!/usr/bin/env node
// Operacja jednorazowa, nie część cyklu godzinowego: system startuje z zapasem
// historii zamiast od pustego repo (system-v1 #10).
//
//   node bin/pierwszy-przebieg.mjs
//
// Trzydzieści dni rozmów z obu źródeł, wiersze dziennika za ostatnie pięć dni —
// parę minut na rozmowy, kilkadziesiąt wywołań taniego modelu na wiersze.
// Puszczony dwa razy nie duplikuje ani jednej wymiany i nie rusza wierszy, które
// zadanie godzinowe już policzyło: dedupe siedzi w dopiszRekordy i dopiszWiersze.

import { KATALOG_CODEKSA, dopiszRozmowyCodeksa } from '../lib/codex.mjs';
import { dopiszWiersze } from '../lib/wiersze.mjs';
import {
  KATALOG_CLAUDE, doby, czytajRekordy, czytajCsvy, zmienioneDoby, zapiszWiersze, opisz,
  dociagnijRozmowyClaude,
} from '../lib/przebieg.mjs';
import { KLON, git, wytrzyj, zapewnijKlon, zajmijZamek, zwolnijZamek, pobierz, wypchnij } from '../lib/klon.mjs';

const DZIEN_MS = 24 * 3600 * 1000;
const DNI_ROZMOW = 30;
const DNI_WIERSZY = 5;

// treści rozmów nie wypisujemy nigdy — na wyjściu są tylko liczby i nazwy dób,
// a komunikat gita idzie przez wytrzyj, żeby token nie wyszedł na ekran
const powiedz = tekst => process.stdout.write(`${wytrzyj(tekst)}\n`);

function zatwierdz(sciezka, opis) {
  git('add', '--', sciezka);
  if (!git('diff', '--cached', '--name-only').trim()) return false;
  git('commit', '-m', opis);
  try {
    wypchnij(powiedz);
  } catch (blad) {
    // brak sieci nie może zabrać drogiej części przebiegu — zaległość dogoni zadanie godzinowe
    powiedz(`wypchnięcie nieudane, zostaje lokalnie: ${blad.stderr || blad.message}`);
  }
  return true;
}

/** Zamek jest tu twardym warunkiem: przebieg trwa minuty i pisze w dwóch turach. */
function podZamkiem(praca) {
  if (!zajmijZamek()) throw new Error('zamek na klonie zajęty — zatrzymaj zadanie godzinowe i spróbuj ponownie');
  try {
    return praca();
  } finally {
    zwolnijZamek();
  }
}

const teraz = Date.now();
zapewnijKlon();
pobierz();

const dopisane = podZamkiem(() => {
  const pliki = [
    ...dociagnijRozmowyClaude(KATALOG_CLAUDE, KLON, teraz - DNI_ROZMOW * DZIEN_MS),
    ...dopiszRozmowyCodeksa(KATALOG_CODEKSA, KLON, doby(teraz, DNI_ROZMOW)),
  ];
  // katalog naraz, bo pojedynczych wywołań gita byłyby setki
  if (pliki.length) zatwierdz('rozmowy', `pierwszy przebieg, rozmowy: ${pliki.length}`);
  return pliki;
});
powiedz(`rozmowy: ${dopisane.length} plików`);

const okno = doby(teraz, DNI_WIERSZY + 1); // doba zapasu na przesunięcie strefy
const csvy = czytajCsvy(KLON, okno);
// wywołania modelu idą poza zamkiem — trwają minuty, a hak ma pisać dalej
const nowe = await dopiszWiersze(czytajRekordy(KLON, okno), csvy, teraz, opisz, DNI_WIERSZY * 24);
const zmienione = zmienioneDoby(nowe, csvy);

if (!zmienione.length) powiedz('wiersze: nic nowego');
else {
  podZamkiem(() => {
    zapiszWiersze(KLON, zmienione, nowe);
    zatwierdz('godziny', `pierwszy przebieg, godziny: ${zmienione.join(', ')}`);
  });
  powiedz(`wiersze: ${zmienione.join(', ')}`);
}
