import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { doby, dociagnijRozmowyClaude, zmienioneDoby, zapiszWiersze, opisz } from '../lib/przebieg.mjs';

const DZIEN_MS = 24 * 3600 * 1000;
const TERAZ = Date.parse('2026-08-12T14:00:00.000Z');

const transkrypt = (sesja, wymiany) =>
  wymiany
    .map(([type, text, timestamp], i) =>
      JSON.stringify({
        type,
        uuid: `${sesja}-${i}`,
        sessionId: sesja,
        timestamp,
        cwd: 'C:\\Users\\borsu\\repos\\llm-wiki',
        entrypoint: 'claude-vscode',
        message: { content: [{ type: 'text', text }] },
      }))
    .join('\n') + '\n';

function katalogi() {
  const korzen = fs.mkdtempSync(path.join(os.tmpdir(), 'przebieg-'));
  const projekt = path.join(korzen, 'projects', '-Users-borsu-repos-llm-wiki');
  fs.mkdirSync(projekt, { recursive: true });
  return { klon: korzen, projekty: path.join(korzen, 'projects'), projekt };
}

function transkryptNaDysku(k, nazwa, sesja, wymiany, wiek = 0) {
  const plik = path.join(k.projekt, nazwa);
  fs.writeFileSync(plik, transkrypt(sesja, wymiany));
  const czas = new Date(TERAZ - wiek);
  fs.utimesSync(plik, czas, czas);
}

test('doby idą wstecz od teraz, najnowsza pierwsza', () => {
  assert.deepEqual(doby(TERAZ, 3), ['2026-08-12', '2026-08-11', '2026-08-10']);
});

test('dociągnięcie bierze transkrypty z okna, pomija starsze i nie duplikuje wymian', () => {
  const k = katalogi();
  transkryptNaDysku(k, 'swiezy.jsonl', 'aaaa58ed-6ec6-7c03-93b7-bb9584dd38fc', [
    ['user', 'pierwsze pytanie', '2026-08-12T07:40:23.111Z'],
    ['assistant', 'pierwsza odpowiedź', '2026-08-12T07:41:00.000Z'],
  ]);
  transkryptNaDysku(k, 'stary.jsonl', 'bbbb58ed-6ec6-7c03-93b7-bb9584dd38fc', [
    ['user', 'pytanie sprzed okna', '2026-06-01T07:40:23.111Z'],
  ], 40 * DZIEN_MS);

  const odKiedy = TERAZ - 30 * DZIEN_MS;
  const dopisane = dociagnijRozmowyClaude(k.projekty, k.klon, odKiedy);
  assert.deepEqual(dopisane, ['rozmowy/2026-08-12/0940-llm-wiki-aaaa58ed.jsonl']);

  const plik = path.join(k.klon, dopisane[0]);
  const przed = fs.readFileSync(plik, 'utf8');
  assert.deepEqual(przed.trim().split('\n').map(JSON.parse).map(r => r.tekst), [
    'pierwsze pytanie',
    'pierwsza odpowiedź',
  ]);

  // drugi przebieg tego samego okna: ani jednego pliku, ani jednego bajtu więcej
  assert.deepEqual(dociagnijRozmowyClaude(k.projekty, k.klon, odKiedy), []);
  assert.equal(fs.readFileSync(plik, 'utf8'), przed);
});

test('dociągnięcie dopisuje wyłącznie ogon sesji, która urosła między przebiegami', () => {
  const k = katalogi();
  const sesja = 'aaaa58ed-6ec6-7c03-93b7-bb9584dd38fc';
  const wymiany = [['user', 'pierwsze pytanie', '2026-08-12T07:40:23.111Z']];
  transkryptNaDysku(k, 'rosnacy.jsonl', sesja, wymiany);
  const odKiedy = TERAZ - 30 * DZIEN_MS;
  const [wzgledna] = dociagnijRozmowyClaude(k.projekty, k.klon, odKiedy);

  wymiany.push(['assistant', 'druga odpowiedź', '2026-08-12T08:10:00.000Z']);
  transkryptNaDysku(k, 'rosnacy.jsonl', sesja, wymiany);
  assert.deepEqual(dociagnijRozmowyClaude(k.projekty, k.klon, odKiedy), [wzgledna]);

  const tresc = fs.readFileSync(path.join(k.klon, wzgledna), 'utf8');
  assert.deepEqual(tresc.trim().split('\n').map(JSON.parse).map(r => r.tekst), [
    'pierwsze pytanie',
    'druga odpowiedź',
  ]);
});

test('brak katalogu transkryptów nie jest błędem', () => {
  const k = katalogi();
  assert.deepEqual(dociagnijRozmowyClaude(path.join(k.klon, 'nie-ma'), k.klon, 0), []);
});

test('opisz znakuje wywołanie modelu jako wewnętrzne, żeby hak go nie nagrał', async () => {
  const stuby = fs.mkdtempSync(path.join(os.tmpdir(), 'opisz-'));
  const windows = process.platform === 'win32';
  fs.writeFileSync(
    path.join(stuby, windows ? 'claude.cmd' : 'claude'),
    windows
      ? '@echo off\r\nmore > NUL\r\necho znacznik=%MESSAGING_LOG_WEWNETRZNE%\r\n'
      : '#!/bin/sh\ncat > /dev/null\necho "znacznik=$MESSAGING_LOG_WEWNETRZNE"\n',
    { mode: 0o755 },
  );
  const sciezka = process.env.PATH;
  process.env.PATH = `${stuby}${path.delimiter}${sciezka}`;
  try {
    const wyjscie = await opisz([{ rola: 'michal', tekst: 'cokolwiek' }]);
    assert.match(wyjscie, /znacznik=1/);
  } finally {
    process.env.PATH = sciezka;
    fs.rmSync(stuby, { recursive: true, force: true });
  }
});

test('zapisane są tylko doby, których treść się zmieniła', () => {
  const k = katalogi();
  const csvy = { '2026-08-11': 'stare\n', '2026-08-12': 'stare\n' };
  const nowe = { '2026-08-11': 'stare\n', '2026-08-12': 'stare\nnowe\n' };

  const zmienione = zmienioneDoby(nowe, csvy);
  assert.deepEqual(zmienione, ['2026-08-12']);

  zapiszWiersze(k.klon, zmienione, nowe);
  assert.equal(fs.readFileSync(path.join(k.klon, 'godziny', '2026-08-12.csv'), 'utf8'), 'stare\nnowe\n');
  assert.equal(fs.existsSync(path.join(k.klon, 'godziny', '2026-08-11.csv')), false);
});
