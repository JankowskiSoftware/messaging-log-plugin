import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sciezkaSesji, ostatniUuid, znajdzSciezkeSesji } from '../lib/sesja.mjs';

const rekord = (ts, repo = 'personal', sesja = 'e5b1a539-a443-4957-b265-241e57ee9d49') =>
  ({ ts, repo, sesja, kanal: 'claude-vscode', rola: 'michal', tekst: 'x', uuid: 'u' });

test('plik sesji nazywa się dobą i godziną w strefie Europe/Warsaw', () => {
  // 17:02 UTC w lipcu to 19:02 w Warszawie
  assert.equal(
    sciezkaSesji(rekord('2026-07-05T17:02:36.402Z')),
    'rozmowy/2026-07-05/1902-personal-e5b1a539.jsonl',
  );
  // zimą przesunięcie jest o godzinę mniejsze
  assert.equal(
    sciezkaSesji(rekord('2026-01-05T17:02:36.402Z')),
    'rozmowy/2026-01-05/1802-personal-e5b1a539.jsonl',
  );
});

test('wymiana tuż po północy czasu warszawskiego należy już do nowej doby', () => {
  assert.equal(
    sciezkaSesji(rekord('2026-07-05T22:10:00.000Z')),
    'rozmowy/2026-07-06/0010-personal-e5b1a539.jsonl',
  );
  // północa to 0000, nigdy 2400
  assert.equal(
    sciezkaSesji(rekord('2026-07-05T22:00:00.000Z')),
    'rozmowy/2026-07-06/0000-personal-e5b1a539.jsonl',
  );
});

test('znacznik postępu to uuid ostatniej linii, także gdy plik kończy się nowym wierszem', () => {
  const linie = ['{"uuid":"a"}', '{"uuid":"b"}'];
  assert.equal(ostatniUuid(linie.join('\n')), 'b');
  assert.equal(ostatniUuid(linie.join('\n') + '\n'), 'b');
});

test('ucięta ostatnia linia cofa znacznik do poprzedniej, nie kasuje go', () => {
  assert.equal(ostatniUuid('{"uuid":"a"}\n{ucięta linia'), 'a');
});

test('pusty plik docelowy nie daje znacznika, czyli zapis od początku', () => {
  assert.equal(ostatniUuid(''), undefined);
  assert.equal(ostatniUuid('{ucięta linia'), undefined);
});

test('kolejna tura tej samej sesji trafia do pliku założonego przez pierwszą', () => {
  const klon = fs.mkdtempSync(path.join(os.tmpdir(), 'sesja-'));
  fs.mkdirSync(path.join(klon, 'rozmowy', '2026-07-05'), { recursive: true });
  fs.mkdirSync(path.join(klon, 'rozmowy', '2026-07-06'), { recursive: true });
  fs.writeFileSync(path.join(klon, 'rozmowy', '2026-07-05', '1902-personal-e5b1a539.jsonl'), '');
  fs.writeFileSync(path.join(klon, 'rozmowy', '2026-07-06', '0900-personal-99999999.jsonl'), '');

  // sesja przechodząca przez północ zostaje w dobie, w której się zaczęła
  assert.equal(
    znajdzSciezkeSesji(klon, 'e5b1a539-a443-4957-b265-241e57ee9d49'),
    'rozmowy/2026-07-05/1902-personal-e5b1a539.jsonl',
  );
  assert.equal(znajdzSciezkeSesji(klon, '00000000-dead-beef-0000-000000000000'), undefined);

  fs.rmSync(klon, { recursive: true, force: true });
});

test('brak katalogu rozmowy nie wysadza szukania', () => {
  const klon = fs.mkdtempSync(path.join(os.tmpdir(), 'sesja-'));
  assert.equal(znajdzSciezkeSesji(klon, 'e5b1a539-a443-4957-b265-241e57ee9d49'), undefined);
  fs.rmSync(klon, { recursive: true, force: true });
});
