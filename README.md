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

## Paczka do Coworku

```
npm run spakuj
```

Buduje `messaging-log.plugin` z **zatwierdzonego** stanu repo i dokłada token
z `~/.messaging-log-token` jako `token.txt`. Paczka idzie na claude.ai przez
Customize → Plugins i jest w Coworku jedynym nośnikiem — także poświadczenia,
bo kontener nie ma skąd go wziąć (ADR 0001).

## Skrypt startowy sesji chmurowej

```
npm run chmura
```

Wypisuje skrypt do pola *Setup script* środowiska chmurowego: trzy kropki
w prawym górnym rogu sesji → *Edit environment*. Środowisko należy do konta,
więc to jedno wklejenie obowiązuje we wszystkich repozytoriach (ADR 0002).
Skrypt zapisuje ustawienia, token, instaluje plugin i klonuje repo danych.

Migawka systemu plików trzyma wynik do następnej zmiany skryptu albo mniej
więcej siedem dni. Pluginy z repo gitowego nie odświeżają się same, więc
aktualizacją w chmurze jest zmiana skryptu — dowolna, bo unieważnia migawkę.

Klon repo danych powstaje sam przy pierwszej turze, pod `~/.messaging-log`.
Kiedy coś nie wyjdzie, hak milczy i pisze linię do `~/.messaging-log-hak.log`.
