import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stareDoby, skasujDobe } from '../lib/retencja.mjs';

// 2026-08-12 12:00 czasu warszawskiego; sześćdziesiąt dni wstecz to 2026-06-13
const TERAZ = Date.parse('2026-08-12T10:00:00Z');

function klonZDobami(...doby) {
  const klon = fs.mkdtempSync(path.join(os.tmpdir(), 'retencja-'));
  for (const doba of doby) {
    fs.mkdirSync(path.join(klon, 'rozmowy', doba), { recursive: true });
    fs.writeFileSync(path.join(klon, 'rozmowy', doba, 'sesja.jsonl'), '{}\n');
  }
  return klon;
}

test('katalog dokładnie sześćdziesięciodniowy zostaje, sześćdziesięciojednodniowy znika', () => {
  const klon = klonZDobami('2026-06-13', '2026-06-12', '2026-08-12');
  assert.deepEqual(stareDoby(klon, TERAZ), ['2026-06-12']);
});

test('przebieg bez starych katalogów nie wskazuje nic do skasowania', () => {
  assert.deepEqual(stareDoby(klonZDobami('2026-08-12'), TERAZ), []);
  assert.deepEqual(stareDoby(fs.mkdtempSync(path.join(os.tmpdir(), 'pusty-')), TERAZ), []);
});

test('dziennik godzinowy nie jest kasowany, bez względu na wiek', () => {
  const klon = klonZDobami('2020-01-01');
  fs.mkdirSync(path.join(klon, 'godziny'), { recursive: true });
  fs.writeFileSync(path.join(klon, 'godziny', '2020-01-01.csv'), 'x\n');

  for (const doba of stareDoby(klon, TERAZ)) skasujDobe(klon, doba);

  assert.equal(fs.existsSync(path.join(klon, 'rozmowy', '2020-01-01')), false);
  assert.equal(fs.existsSync(path.join(klon, 'godziny', '2020-01-01.csv')), true);
});

test('cudze nazwy w katalogu rozmów są nietykalne', () => {
  const klon = klonZDobami('2026-06-12');
  fs.writeFileSync(path.join(klon, 'rozmowy', 'README.md'), 'x\n');
  assert.deepEqual(stareDoby(klon, TERAZ), ['2026-06-12']);
});
