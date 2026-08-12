# messaging-log-plugin

Cały kod wykonywalny systemu `messaging-log`. Repo `messaging-log` jest czystym
magazynem danych — patrz ADR 0003 tamże.

Paczka Node bez zależności zewnętrznych. Testy: `node --test`.

- `lib/filtr.mjs` — jedyne miejsce, gdzie transkrypt zamienia się w rekordy
  rozmowy. Woła je hak `Stop`, zadanie godzinowe i pierwszy przebieg.

```js
import { filtruj } from './lib/filtr.mjs';

// zrodlo: 'claude' albo 'codex'; uuidOd: znacznik ostatniej zapisanej linii
const rekordy = filtruj(trescPliku, 'claude', uuidOd);
// [{ ts, kanal, sesja, repo, rola, tekst, uuid }, ...]
```

Wznawianie jest wyprowadzane z danych, nie przechowywane: podajesz `uuid`
ostatniej linii pliku docelowego, dostajesz to, co po nim. Nieznany znacznik
albo jego brak znaczy zapis od początku.
