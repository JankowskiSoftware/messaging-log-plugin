import test from 'node:test';
import assert from 'node:assert/strict';
import { zakresDob, przeglad } from '../lib/przeglad.mjs';

const NAGLOWEK = 'data,godzina,od,do,repo,wymiany,temat\n';

test('zakres dób obejmuje obie granice', () => {
  assert.deepEqual(zakresDob('2026-08-10', '2026-08-12'), ['2026-08-10', '2026-08-11', '2026-08-12']);
  assert.deepEqual(zakresDob('2026-08-10', '2026-08-10'), ['2026-08-10']);
});

test('zakres przez zmianę czasu nie gubi ani nie dubluje doby', () => {
  assert.deepEqual(zakresDob('2026-10-24', '2026-10-27'), [
    '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27',
  ]);
});

test('zakres odwrócony jest pusty, data bez sensu to błąd', () => {
  assert.deepEqual(zakresDob('2026-08-12', '2026-08-10'), []);
  assert.throws(() => zakresDob('wczoraj', '2026-08-10'));
});

test('wiersze tej samej godziny i repo składają się w jeden wpis', () => {
  const csv = NAGLOWEK
    + '2026-08-11,09,03,57,messaging-log,12,pierwszy temat\n'
    + '2026-08-11,09,03,57,messaging-log,12,drugi temat\n';
  const tekst = przeglad([{ doba: '2026-08-11', csv, pliki: ['0903-messaging-log-abc.jsonl'] }]);
  assert.match(tekst, /09:03.*09:57.*messaging-log.*12/);
  assert.match(tekst, /pierwszy temat/);
  assert.match(tekst, /drugi temat/);
  assert.equal(tekst.match(/messaging-log/g).length, 1);
  assert.doesNotMatch(tekst, /bez wierszy/);
});

test('dwa repozytoria w tej samej godzinie zostają osobno', () => {
  const csv = NAGLOWEK
    + '2026-08-11,09,03,57,messaging-log,12,jeden\n'
    + '2026-08-11,09,10,20,company,4,dwa\n';
  const tekst = przeglad([{ doba: '2026-08-11', csv, pliki: [] }]);
  assert.match(tekst, /messaging-log/);
  assert.match(tekst, /company/);
});

test('godziny z rozmowami bez wierszy są wymienione wprost', () => {
  const csv = NAGLOWEK + '2026-08-11,09,03,57,messaging-log,12,jeden\n';
  const tekst = przeglad([
    { doba: '2026-08-11', csv, pliki: ['0903-a-x.jsonl', '1412-a-y.jsonl', '1500-a-z.jsonl'] },
  ]);
  assert.match(tekst, /bez wierszy: 14, 15/);
});

test('doba bez wierszy i bez rozmów mówi to wprost, nie udaje pustki', () => {
  const tekst = przeglad([{ doba: '2026-08-11', csv: '', pliki: [] }]);
  assert.match(tekst, /2026-08-11/);
  assert.match(tekst, /brak zapisu/);
});

test('doba za retencją ma same wiersze i nie zgłasza dziur', () => {
  const csv = NAGLOWEK + '2026-05-01,09,03,57,messaging-log,12,jeden\n';
  const tekst = przeglad([{ doba: '2026-05-01', csv, pliki: [] }]);
  assert.doesNotMatch(tekst, /bez wierszy/);
  assert.match(tekst, /jeden/);
});

test('nagłówek, puste linie i pliki spoza wzorca nie mieszają w wyniku', () => {
  const csv = NAGLOWEK + '\n2026-08-11,09,03,57,messaging-log,12,"temat, z przecinkiem"\n';
  const tekst = przeglad([{ doba: '2026-08-11', csv, pliki: ['README.md', '.gitkeep', '0903-a-x.jsonl'] }]);
  assert.match(tekst, /temat, z przecinkiem/);
  assert.doesNotMatch(tekst, /bez wierszy/);
  assert.doesNotMatch(tekst, /data,godzina/);
});
