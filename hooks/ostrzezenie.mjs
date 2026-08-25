#!/usr/bin/env node
// Hak Stop synchroniczny Claude Code: czyta ślad awarii i nic więcej. Istnieje
// dlatego, że wyjście haka asynchronicznego nie dociera tam do Michała, a nieudany
// zapis rozmowy musi być widoczny, zanim ruszy kolejna tura. Żadnego gita, żadnej
// sieci. Codex nie potrzebuje tego haka — ostrzega przez własny stop.mjs.

import { komunikatSladu } from '../lib/awaria.mjs';

const komunikat = komunikatSladu();
if (komunikat) process.stdout.write(JSON.stringify({ systemMessage: komunikat }));
