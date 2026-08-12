import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { filtruj } from '../lib/filtr.mjs';

const wczytaj = (nazwa) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${nazwa}`, import.meta.url)), 'utf8');

const claude = wczytaj('claude.jsonl');
const codex = wczytaj('codex.jsonl');
const codexExec = wczytaj('codex-exec.jsonl');

test('transkrypt Claude daje wylacznie prawdziwe wymiany', () => {
  const rekordy = filtruj(claude, 'claude');
  assert.deepEqual(
    rekordy.map((r) => r.rola),
    ['michal', 'claude', 'michal'],
  );
  assert.deepEqual(rekordy[0], {
    ts: '2026-07-21T09:26:00.341Z',
    kanal: 'claude-desktop',
    sesja: '70527304-d8fa-4808-99a2-97ca6791adff',
    repo: 'borsu',
    rola: 'michal',
    tekst: rekordy[0].tekst,
    uuid: '850d5988-6327-4c83-9fd5-6e7d8de2e2b4',
  });
  assert.match(rekordy[0].tekst, /^My Logitech camera/);
  assert.equal(rekordy[1].tekst, "I'll investigate before proposing anything. Let me gather read-only diagnostics.");
});

test('linie poboczne, meta i obudowa komend nie wchodza', () => {
  const teksty = filtruj(claude, 'claude').map((r) => r.tekst);
  assert.ok(!teksty.some((t) => t.includes('podagenta')));
  assert.ok(!teksty.some((t) => t.includes('Caveat:')));
  assert.ok(!teksty.some((t) => t.includes('<command-')));
});

test('wynik narzedzia, wywolanie narzedzia i rozumowanie nie wchodza', () => {
  const teksty = filtruj(claude, 'claude').map((r) => r.tekst);
  assert.ok(!teksty.some((t) => t.includes('FriendlyName')));
  assert.equal(filtruj(claude, 'claude').length, 3);
});

test('doklejony system-reminder jest obcinany, wiadomosc zostaje', () => {
  const ostatni = filtruj(claude, 'claude').at(-1);
  assert.equal(ostatni.tekst, 'Sprawdz jeszcze raz kamere.');
});

test('linia zaczynajaca sie od system-reminder jest odrzucana', () => {
  const linia = JSON.stringify({
    type: 'user',
    isSidechain: false,
    uuid: 'aaaa',
    timestamp: '2026-07-21T10:00:00.000Z',
    sessionId: 's',
    cwd: 'C:\\Users\\borsu\\repos\\personal',
    entrypoint: 'cli',
    message: { role: 'user', content: '<system-reminder>tylko kontekst</system-reminder>' },
  });
  assert.deepEqual(filtruj(linia, 'claude'), []);
});

test('queue-operation nie wchodzi, mimo ze niesie tresc wiadomosci', () => {
  const tylkoKolejka = claude.split('\n').filter((l) => l.includes('"queue-operation"')).join('\n');
  assert.ok(tylkoKolejka.length > 0);
  assert.deepEqual(filtruj(tylkoKolejka, 'claude'), []);
});

test('ten sam transkrypt z aktualnym znacznikiem daje pusta liste', () => {
  const rekordy = filtruj(claude, 'claude');
  assert.deepEqual(filtruj(claude, 'claude', rekordy.at(-1).uuid), []);
  assert.deepEqual(filtruj(claude, 'claude', rekordy[0].uuid), rekordy.slice(1));
});

test('nieznany znacznik daje zapis od poczatku', () => {
  assert.deepEqual(filtruj(claude, 'claude', 'nie-ma-takiego'), filtruj(claude, 'claude'));
});

test('ucieta ostatnia linia nie rzuca wyjatku', () => {
  assert.equal(filtruj(claude + '{"type":"user","mess', 'claude').length, 3);
});

test('plik Codeksa daje ten sam schemat z syntetyzowanym znacznikiem', () => {
  const rekordy = filtruj(codex, 'codex');
  assert.deepEqual(
    rekordy.map((r) => r.rola),
    ['michal', 'claude'],
  );
  assert.deepEqual(Object.keys(rekordy[0]), ['ts', 'kanal', 'sesja', 'repo', 'rola', 'tekst', 'uuid']);
  assert.equal(rekordy[0].kanal, 'codex_vscode');
  assert.equal(rekordy[0].repo, 'ChatGgtApp');
  assert.equal(rekordy[0].sesja, '019b3b2e-dccd-78a0-a990-e12e4023d3bd');
  assert.equal(rekordy[0].uuid, '019b3b2e-dccd-78a0-a990-e12e4023d3bd#2');
  assert.equal(rekordy[1].uuid, '019b3b2e-dccd-78a0-a990-e12e4023d3bd#5');
});

test('znacznik Codeksa wznawia tak samo jak u Claude', () => {
  const rekordy = filtruj(codex, 'codex');
  assert.deepEqual(filtruj(codex, 'codex', rekordy[0].uuid), rekordy.slice(1));
  assert.deepEqual(filtruj(codex, 'codex', rekordy.at(-1).uuid), []);
});

test('plik Codeksa o pochodzeniu codex_exec daje pusta liste', () => {
  assert.deepEqual(filtruj(codexExec, 'codex'), []);
});
