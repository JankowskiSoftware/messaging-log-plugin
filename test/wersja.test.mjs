// Jedna przypięta wersja paczki na obu komputerach zaczyna się od jednej wersji
// w repo: trzy manifesty i README muszą mówić to samo, bo instalacja idzie
// z odbicia na tagu i to README niesie jego nazwę.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KORZEN = path.dirname(import.meta.dirname);
const wersja = plik => JSON.parse(fs.readFileSync(path.join(KORZEN, plik), 'utf8')).version;

test('wszystkie manifesty niosą tę samą wersję paczki', () => {
  const oczekiwana = wersja('package.json');
  assert.match(oczekiwana, /^\d+\.\d+\.\d+$/);
  assert.equal(wersja('.claude-plugin/plugin.json'), oczekiwana);
  assert.equal(wersja('.codex-plugin/plugin.json'), oczekiwana);
});

test('README przypina instalację do tagu bieżącej wersji', () => {
  const readme = fs.readFileSync(path.join(KORZEN, 'README.md'), 'utf8');
  assert.ok(readme.includes(`checkout v${wersja('package.json')}`), 'README nie przypina bieżącej wersji');
});
