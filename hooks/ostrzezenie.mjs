#!/usr/bin/env node
// Hak Stop synchroniczny: czyta ślad awarii i nic więcej. Istnieje dlatego, że
// wyjście haka asynchronicznego nie dociera do Michała, a nieudany zapis rozmowy
// musi być widoczny, zanim ruszy kolejna tura. Żadnego gita, żadnej sieci.

import fs from 'node:fs';
import { SLAD } from '../lib/awaria.mjs';

try {
  const { powod, odzyskiwalne } = JSON.parse(fs.readFileSync(SLAD, 'utf8'));
  const ogon = odzyskiwalne
    ? 'zaległość zostanie dostarczona przy najbliższej udanej turze'
    : `rozmowa nie została zapisana; skasuj ${SLAD}, gdy się tym zajmiesz`;
  process.stdout.write(JSON.stringify({ systemMessage: `Messaging Log: ${powod} — ${ogon}` }));
} catch {
  // brak śladu to stan normalny; uszkodzony ślad nie ma prawa zablokować tury
}
