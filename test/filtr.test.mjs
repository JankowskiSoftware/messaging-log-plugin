import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transkryptNaRekordy } from '../lib/filtr.mjs';

const fixture = name => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const POLA = ['ts', 'kanal', 'sesja', 'repo', 'rola', 'tekst', 'uuid'];

test('transkrypt Claude\'a zwraca wyłącznie prawdziwe wymiany', () => {
  const rekordy = transkryptNaRekordy(fixture('claude-sesja.jsonl'), 'claude');

  assert.deepEqual(rekordy.map(r => r.rola), ['michal', 'claude', 'claude', 'claude']);
  assert.deepEqual(Object.keys(rekordy[0]), POLA);
  assert.equal(rekordy[0].kanal, 'claude-vscode');
  assert.equal(rekordy[0].sesja, '4cf5991e-8119-47aa-b92e-de4448304a49');
  assert.equal(rekordy[0].repo, 'repo');
  assert.equal(rekordy[0].ts, '2026-07-28T15:09:53.407Z');
  assert.match(rekordy[0].tekst, /^Review one implemented issue\./);
  assert.equal(rekordy[1].tekst, 'I\'ll invoke the skill.');

  // żadne rozumowanie, wywołanie ani wynik narzędzia nie przecieka
  for (const r of rekordy) assert.doesNotMatch(r.tekst, /tool_use_id|Base directory for this skill/);
});

test('linia queue-operation nie wchodzi, mimo że niesie treść wiadomości', () => {
  const rekordy = transkryptNaRekordy(fixture('claude-sesja.jsonl'), 'claude');
  const wiadomosci = rekordy.filter(r => r.tekst.startsWith('Review one implemented issue.'));
  assert.equal(wiadomosci.length, 1);
});

test('linie meta nie wchodzą', () => {
  const rekordy = transkryptNaRekordy(fixture('claude-sesja.jsonl'), 'claude');
  for (const r of rekordy) assert.doesNotMatch(r.tekst, /^Base directory for this skill/);
});

test('obudowa komend nie wchodzi', () => {
  assert.deepEqual(transkryptNaRekordy(fixture('claude-komendy.jsonl'), 'claude'), []);
});

test('sesja -p (entrypoint sdk-cli) daje pustą listę rekordów', () => {
  // fixture z prawdziwego transkryptu `claude -p` odpalonego z cmd na Windowsie
  assert.deepEqual(transkryptNaRekordy(fixture('claude-sdk.jsonl'), 'claude'), []);
});

test('wiadomość z doklejonym system-reminder wchodzi bez tego bloku', () => {
  const [rekord] = transkryptNaRekordy(fixture('claude-system-reminder.jsonl'), 'claude');
  assert.equal(rekord.tekst, 'napraw builda');
});

test('ten sam transkrypt z aktualnym znacznikiem daje pustą listę', () => {
  const tresc = fixture('claude-sesja.jsonl');
  const rekordy = transkryptNaRekordy(tresc, 'claude');
  const ostatni = rekordy.at(-1).uuid;
  assert.deepEqual(transkryptNaRekordy(tresc, 'claude', ostatni), []);
  assert.deepEqual(transkryptNaRekordy(tresc, 'claude', rekordy[0].uuid), rekordy.slice(1));
});

test('nieznany znacznik daje zapis od początku', () => {
  const tresc = fixture('claude-sesja.jsonl');
  assert.deepEqual(
    transkryptNaRekordy(tresc, 'claude', 'nie-ma-takiego-uuid'),
    transkryptNaRekordy(tresc, 'claude'),
  );
});

test('ucięta ostatnia linia nie rzuca wyjątku', () => {
  const tresc = fixture('claude-sesja.jsonl');
  const uciety = tresc.slice(0, -400);
  assert.doesNotThrow(() => transkryptNaRekordy(uciety, 'claude'));
  assert.ok(transkryptNaRekordy(uciety, 'claude').length > 0);
});

test('plik Codeksa daje ten sam siedmiopolowy schemat z syntetyzowanym znacznikiem', () => {
  const rekordy = transkryptNaRekordy(fixture('codex-sesja.jsonl'), 'codex');

  assert.deepEqual(rekordy.map(r => r.rola), ['michal', 'claude', 'claude']);
  assert.deepEqual(Object.keys(rekordy[0]), POLA);
  assert.equal(rekordy[0].kanal, 'codex_vscode');
  assert.equal(rekordy[0].sesja, '019e58ed-6ec6-7c03-93b7-bb9584dd38fc');
  assert.equal(rekordy[0].repo, 'llm-wiki');
  assert.equal(rekordy[0].ts, '2026-05-24T07:40:23.111Z');
  assert.equal(rekordy[0].uuid, '019e58ed-6ec6-7c03-93b7-bb9584dd38fc#7');
  assert.equal(rekordy[1].uuid, '019e58ed-6ec6-7c03-93b7-bb9584dd38fc#8');
  assert.match(rekordy[1].tekst, /^I’ll inspect the repo instructions/);
});

test('wznawianie Codeksa działa tak samo jak u Claude\'a', () => {
  const tresc = fixture('codex-sesja.jsonl');
  const rekordy = transkryptNaRekordy(tresc, 'codex');
  assert.deepEqual(transkryptNaRekordy(tresc, 'codex', rekordy.at(-1).uuid), []);
  assert.deepEqual(transkryptNaRekordy(tresc, 'codex', rekordy[0].uuid), rekordy.slice(1));
});

test('plik Codeksa o pochodzeniu codex_exec daje pustą listę', () => {
  assert.deepEqual(transkryptNaRekordy(fixture('codex-exec.jsonl'), 'codex'), []);
});

test('pusta treść daje pustą listę dla obu źródeł', () => {
  assert.deepEqual(transkryptNaRekordy('', 'claude'), []);
  assert.deepEqual(transkryptNaRekordy('', 'codex'), []);
});

test('brak pochodzenia w transkrypcie zapisuje się jako unknown, nie jako pustka', () => {
  const linia = JSON.stringify({
    type: 'user',
    uuid: 'u1',
    sessionId: 's1',
    timestamp: '2026-07-05T17:02:36.402Z',
    cwd: '/repo/alfa',
    message: { content: 'cześć' },
  });

  const [rekord] = transkryptNaRekordy(linia, 'claude');
  assert.equal(rekord.kanal, 'unknown');

  const [zCodeksa] = transkryptNaRekordy(JSON.stringify({
    type: 'event_msg',
    timestamp: '2026-07-05T17:02:36.402Z',
    payload: { type: 'user_message', message: 'cześć' },
  }), 'codex');
  assert.equal(zCodeksa.kanal, 'unknown');
});
