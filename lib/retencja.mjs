// Retencja surowych rozmów: katalog dobowy żyje sześćdziesiąt dni, dziennik
// godzinowy nie jest kasowany nigdy (ADR 0004). Decyzja idzie po nazwie katalogu,
// nie po znacznikach w plikach — nazwa jest datą, więc porównanie jest trywialne.

import fs from 'node:fs';
import path from 'node:path';
import { czasWarszawski } from './sesja.mjs';

const DNI = 60;
const DOBA = /^\d{4}-\d{2}-\d{2}$/;

/** Najstarsza doba, która zostaje. Liczona na kalendarzu, więc zmiana czasu nie przesuwa progu. */
export function prog(teraz) {
  const dzis = new Date(`${czasWarszawski(teraz).doba}T00:00:00Z`);
  dzis.setUTCDate(dzis.getUTCDate() - DNI);
  return dzis.toISOString().slice(0, 10);
}

/** Katalogi dobowe do skasowania. Nazwy spoza wzorca daty zostawiamy w spokoju. */
export function stareDoby(klon, teraz) {
  const granica = prog(teraz);
  let wpisy;
  try {
    wpisy = fs.readdirSync(path.join(klon, 'rozmowy'));
  } catch {
    return []; // repo bez ani jednej rozmowy
  }
  return wpisy.filter(w => DOBA.test(w) && w < granica).sort();
}

export const skasujDobe = (klon, doba) =>
  fs.rmSync(path.join(klon, 'rozmowy', doba), { recursive: true, force: true });
