# messaging-log-plugin

Cały kod dziennika rozmów: filtr transkryptów, hak sesyjny, skill i skrypty
zadania godzinowego. Dane mieszkają osobno, w repo `messaging-log` (ADR 0003).

Bez zależności zewnętrznych. Testy: `node --test`.

## Instalacja

```
/plugin marketplace add JankowskiSoftware/messaging-log-plugin
/plugin install messaging-log@messaging-log
```

Token drobnoziarnisty do repo `messaging-log` (Contents: read and write) ląduje
w `~/.messaging-log-token`, a w paczce `.plugin` w `token.txt` obok pluginu.
Bez tokenu hak i tak zapisze rozmowę i spróbuje wypchnąć ją poświadczeniami
gita — token jest po to, żeby działało też tam, gdzie ich nie ma.

Klon repo danych powstaje sam przy pierwszej turze, pod `~/.messaging-log`.
Kiedy coś nie wyjdzie, hak milczy i pisze linię do `~/.messaging-log-hak.log`.
