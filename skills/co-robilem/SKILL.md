---
name: co-robilem
description: Odpowiada na pytania o własną przeszłą pracę Michała — „co robiłem wczoraj", „co robiłem w ostatnie dwa tygodnie", „nad czym siedziałem w poniedziałek", „kiedy tykałem ten projekt". Czyta dziennik godzinowy z repo messaging-log: godzina, repozytorium i tematy pracy, za dowolny zakres dni. Użyj zawsze, gdy pytanie dotyczy tego, co Michał robił w przeszłości, w dowolnym repozytorium i na dowolnym urządzeniu. Nie używaj do planów ani do stanu bieżącej sesji.
---

# Co robiłem

Zapis pracy Michała siedzi w repo `messaging-log` jako wiersze `godziny/<doba>.csv`:
jedna godzina, jedno repozytorium, do trzech tematów. Skrypt poniżej odświeża klon
i wypisuje te wiersze za wskazany zakres.

## Jak odpowiadać

1. Przelicz pytanie na zakres dób `RRRR-MM-DD`, w strefie Europe/Warsaw. „Wczoraj" to
   jeden dzień, „ostatnie dwa tygodnie" to czternaście dni kończących się wczoraj.
   Dzisiejsza godzina jeszcze się nie zamknęła, więc dzisiaj bywa puste.
2. Uruchom, z korzenia pluginu:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/co-robilem.mjs" 2026-08-01 2026-08-12
   ```

   Bez argumentów wypisuje wczoraj. Z jednym — ten jeden dzień.
3. Odpowiedz prozą na to, o co Michał zapytał. Nie wypisuj ścieżek plików i nie
   przepisuj wyjścia wiersz po wierszu, chyba że o to prosi.

## Twarde zasady

Linia `bez wierszy: 14, 15` znaczy, że w tych godzinach były rozmowy, ale nie zostały
policzone. **Wymień takie godziny wprost.** Nie odtwarzaj ich z surowych rozmów
w `rozmowy/` — to droga ścieżka, a zadanie godzinowe zwykle nadrobi je samo.

`brak zapisu` znaczy tyle, że za ten dzień nie ma nic w repo. Nie zgaduj, co się działo.

Skill **niczego nie zapisuje**. Nie zatwierdzaj, nie wypychaj i nie ruszaj plików
w `~/.messaging-log` — jedynym pisarzem dziennika jest zadanie godzinowe.
