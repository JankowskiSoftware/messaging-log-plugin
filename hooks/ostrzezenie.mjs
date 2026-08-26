#!/usr/bin/env node
// Hak Stop synchroniczny: czyta ślad awarii i nic więcej. Istnieje dlatego, że
// wyjście haka asynchronicznego nie dociera do Michała, a nieudany zapis rozmowy
// musi być widoczny, zanim ruszy kolejna tura. Żadnego gita, żadnej sieci.
// Oba hosty biorą go z tego samego `hooks/hooks.json`, więc ostrzeżenie jest jedno.

import { komunikatSladu } from '../lib/awaria.mjs';

const komunikat = komunikatSladu();
if (komunikat) process.stdout.write(JSON.stringify({ systemMessage: komunikat }));
