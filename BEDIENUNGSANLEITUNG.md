# Frost & Flamingos — Bedienungsanleitung

**Bullets, Fondue & Coconuts** · Milestone 2: Klassen, Garderobe & Identität
Stand: 24. Oktober 2026 · Zielplattform: macOS

Diese Anleitung beschreibt die lokale Playtest-Version. Sie richtet sich an alle, die das
Projekt auf einem Mac starten, spielen, aktualisieren und wieder sauber beenden wollen.

---

## 1. Was ist Frost & Flamingos?

Frost & Flamingos ist ein Third-Person-Multiplayer-Action-Cartoon in einer alpenländischen
Klimakrieg-Komödie. Zwei Urlaubsresorts kämpfen um denselben Fjord: die **Gipfel-Garde**
will ewigen Schnee, Fondue und alpine Ruhe; die **Lagunen-Liga** will endlosen Sommer,
Flamingo-Schwimmringe und barfüßigen Chaos-Urlaub.

**Milestone 2 (M2)** ist der Klassen-, Garderoben- und Identitäts-Meilenstein:

- drei spielbare Klassen mit unterschiedlichen Werten und Standard-Loadouts,
- ein dauerhaft gespeichertes Spielerprofil,
- eine live gerenderte 3D-Garderobe mit sieben Kosmetik-Slots,
- Server-synchronisierte Profile und Kosmetik für alle Spieler,
- erweiterte Bewegung: Sprinten, Ducken, Hechtsprung, Schwimmen, Klettern und Notfallschirm,
- prozedurale Audio-Effekte, Stimmen, Umgebung und die vom Projektinhaber gelieferten Musikstücke,
- ein neuer, an klassische Reiseplakate angelehnter Start- und Ladebildschirm.

**Noch nicht enthalten:** Waffen, Schießen, Schaden, Bots, Fahrzeuge, Zerstörung, Match-Wertung
und Progression. Diese Systeme folgen in M3 bis M6.

---

## 2. Voraussetzungen

### Hardware und System

- macOS 13 (Ventura) oder neuer, Apple Silicon oder Intel
- ca. 1 GB freier Speicherplatz für Abhängigkeiten und Builds
- eine stabile lokale Verbindung; das Spiel läuft ausschließlich auf deinem Mac
- Bildschirmauflösung mindestens 1280 × 720, empfohlen 1440 × 900 oder größer

### Bun

Das Projekt verwendet **Bun 1.4.4** als Runtime, Paketmanager und Server. Node.js wird nicht
benötigt.

```bash
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
bun --version
```

Damit Bun dauerhaft gefunden wird, diese Zeile in `~/.zshrc` ergänzen:

```bash
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.zshrc
```

### Browser

Empfohlen: **Google Chrome** oder **Microsoft Edge**, aktuell gehalten. Safari funktioniert
ebenfalls, kann bei WebGPU und Pointer Lock aber strengere Einstellungen haben.

Wichtig ist die **Hardwarebeschleunigung**:

- Chrome/Edge: Einstellungen → System → „Hardwarebeschleunigung verwenden, wenn verfügbar“
  aktivieren, danach Browser neu starten.
- Safari: ist standardmäßig hardwarebeschleunigt; bei Problemen Safari aktualisieren.

Das Spiel nutzt WebGPU, wenn der Browser es anbietet, und fällt sonst automatisch auf WebGL2
zurück. Beide Wege sind spielbar.

---

## 3. Installation

1. Terminal öffnen (Programme → Dienstprogramme → Terminal).
2. In den Projektordner wechseln:

   ```bash
   cd "/Users/nicolas/Documents/Default Project"
   ```

   Der Pfad enthält ein Leerzeichen und muss daher in Anführungszeichen stehen.

3. Abhängigkeiten installieren:

   ```bash
   bun install
   ```

   Das legt die Workspace-Pakete an und lädt Babylon.js, Rapier, Svelte, Vite und TypeScript.
   Der Vorgang ist nur beim ersten Mal oder nach Änderungen an den Abhängigkeiten nötig.

---

## 4. Spiel starten

Im Projektordner:

```bash
bun run dev
```

Der Befehl startet **Server und Client gemeinsam**. Im Terminal erscheint in etwa:

```text
  Frost & Flamingos — dev stack
  client   http://localhost:5173
  server   http://127.0.0.1:3000/api/health
  stop     Ctrl+C
```

Jetzt im Browser öffnen:

**<http://localhost:5173>**

Der erste Start kann einige Sekunden dauern, weil Shader kompiliert und die Karte aufgebaut
wird. Der Ladebildschirm zeigt drei Schritte:

1. **Renderer starten** (WebGPU oder WebGL2),
2. **Fjord Fiesta aufbauen** (Terrain, Props, Wasser),
3. **Rezeption anrufen** (Verbindung zum autoritativen Server).

Wenn oben im Menü **VERBUNDEN** steht, ist alles bereit. Steht dort **OFFLINE**, läuft der
Server nicht oder Port 3000 ist blockiert (siehe Abschnitt 13).

Optionaler Server-Test im Browser:

**<http://127.0.0.1:3000/api/health>**

Dort müssen `status: "ok"`, `online: true` und `mapId: "fjord_fiesta"` erscheinen.

---

## 5. Erste Schritte

1. Im Hauptmenü eine **Fraktion** und **Klasse** wählen oder direkt **„Jetzt spielen“** klicken.
2. Der Browser fängt die Maus ein (Pointer Lock). Die Kamera folgt nun der Maus.
3. Nach dem Klick erscheint kurz der **Einsatzbildschirm** mit Zielort, Einteilung und einem
   Ladebalken. In dieser Zeit läuft der Runden-Track „Skiing the Sandbar“.
4. Danach landet der Charakter im Fjord Fiesta und das HUD erscheint.

Falls der Browser die Maus nicht einfängt, erscheint ein Hinweis. Dann einfach noch einmal
auf die Spielfläche klicken. Manche Browser verlangen eine direkte Benutzeraktion.

---

## 6. Steuerung

| Aktion | Taste / Eingabe |
| --- | --- |
| Bewegen | `W` `A` `S` `D` oder Pfeiltasten |
| Umsehen | Maus |
| Springen | `Leertaste` |
| Notfallschirm öffnen / abwerfen | `Leertaste` im Fall |
| Sprinten | `Shift` (halten) |
| Ducken (umschalten) | `C` |
| Ducken (halten) | `Ctrl` |
| Hechtsprung | `C` während des Sprintens |
| Kamera über die andere Schulter | `V` |
| Kameradistanz | Mausrad |
| Waffen-Slots | `1` `2` `3` oder Mausrad |
| Zoom | `Alt` + Mausrad |
| Interagieren / Heilen / Reparieren | `F` / `Q` / `E` |
| Nachladen | `R` |
| Spot / Taunt | `T` |
| Maus freigeben / Pause | `Esc` |
| Telemetrie ein-/ausblenden | `F1` |

### Bewegung im Detail

- **Vorwärts** 100 %, **seitwärts** 85 %, **rückwärts** 70 % der Klassengeschwindigkeit.
- **Sprinten** erhöht das Tempo um 35 %, nur vorwärts und nicht geduckt.
- **Ducken** reduziert das Tempo auf 55 % und verkleinert die Kapsel.
- **Hechtsprung:** während des Sprintens `C` drücken; 0,6 s Rolle plus 0,4 s Erholung.
- **Schwimmen:** tiefes Wasser startet automatisch den Schwimmmodus. Nur ein Sturz unter
  `Y = -12` führt zum Respawn.
- **Klettern:** Sprung an eine 0,55–1,6 m hohe Kante löst automatisch die Kletteranimation aus.
- **Notfallschirm:** Bei einem Sturz schneller als 6,5 m/s und mindestens 4,5 m Bodenabstand
  öffnet er sich nach 1,2 s automatisch. `Leertaste` öffnet ihn sofort, `Leertaste` oder `C`
  werfen ihn ab. `W` fliegt mit 8,5 m/s vorwärts, `S` taucht mit 4,8 m/s, `A`/`D` steuern
  seitlich mit 4,5 m/s. Wind und Wetter beeinflussen die Drift. Am Boden oder im Wasser
  schließt er sich automatisch.

---

## 7. Klassen

| Klasse | Gipfel-Garde | Lagunen-Liga | HP | Tempo | Rolle |
| --- | --- | --- | ---: | ---: | --- |
| Allrounder | Geissen-Major | Yacht-Kapitän | 150 | 7,0 m/s | Flexibler Alleskönner |
| Heavy | Senn-Koloss | Hafen-Hüne | 220 | 5,6 m/s | Langsamer, robuster Anker |
| Infiltrator | Gämsen-Jäger | Riff-Schmuggler | 110 | 8,1 m/s | Schneller, fragiler Flanker |

Die Klasse bestimmt HP, Kapselgröße, Bewegung und das Standard-Loadout. Jede Klasse kann
alle Kosmetik-Items tragen.

---

## 8. Garderobe und Profil

Die Garderobe ist über das Hauptmenü und das Pausenmenü erreichbar.

- **Körpertyp:** stufenlos von 0,0 (breiter) bis 1,0 (schmaler). Die Hitbox bleibt identisch.
- **Hauttöne:** 12 kuratierte Farben.
- **Haarfarben:** 8 Farben, darunter Ginger-Orange, Goldblond, Kastanie, Schwarz und Silber.
- **Haarstile:** Buzzcut, Afro, lange Wellen, Zöpfe, Pferdeschwanz, Pompadour und Glatze.
- **Stimmlage:** 0,8 bis 1,25; die Vorschau spielt sofort eine prozedurale Kauderwelsch-Zeile.
- **Sieben Slots:** Kopf, Gesicht, Torso, Rücken, Hände, Beine und Füße.
- **Loadout:** Primärwaffe, Sekundärwaffe und Gimmick-Waffe.
- **Effekte:** Vorschau von Kampfspuren/Ruß, verkohlt und gefroren.
- **Zufällig / Zurücksetzen:** mischt das Aussehen oder stellt die Klassen-Standardwerte her.

Das Profil wird im Browser unter `frost-and-flamingos.profile` gespeichert und beim Verbinden
an den Server gesendet. Der Server prüft und normalisiert es und verteilt es an alle Spieler.
Die Fraktion im Menü ist eine **Präferenz**; der Server weist im Match die ausbalancierte
Fraktion zu.

---

## 9. Audio

Die komplette Audio-Kette läuft über Web Audio:

```text
SFX / Fahrzeuge / Stimmen / Umgebung / Musik
        → masterGain → Limiter → Ausgabe
```

- **Musik:** Die vom Projektinhaber gelieferten Stücke werden als `AudioBuffer` geladen und
  über eigene Musik-Busse überblendet.
  - Menü: „Lederhosen on the Sand“ (ca. 103 BPM)
  - Ruhiges Gameplay: „Midday at the Chalet“ (ca. 90 BPM)
  - Mittleres Gameplay: „Surfing the Alpine Slope“ (ca. 123 BPM)
  - Hektisches Gameplay: „The Cactus Gambit“ (ca. 144 BPM)
  - Rundenstart, Rundenende und Tod: „Skiing the Sandbar“ (ca. 120 BPM)
- **SFX:** Schritte auf Schnee, Sand, Holz und mit Flossen, Eisrutschen, Schraubenschlüssel,
  Snack-Heilung und die Fraktionsstimmen stammen aus der gelieferten prozeduralen SFX-Bibliothek.
- **Nicht in der Bibliothek enthaltene Klänge** (UI, Sprung, Landung, Rolle, Platschen,
  Schwimmzug, Schirm, Umgebung, Musik) bleiben eigene prozedurale Synthesen.
- **3D-Positionierung:** Weltklänge nutzen `PannerNode` mit HRTF und Distance-Rolloff.
- **Lautstärken:** In den Audio-Einstellungen lassen sich Master, SFX, Musik und Stimmen
  getrennt regeln. Die Werte liegen unter `frost-and-flamingos.audio`.

Beim ersten Klick auf „Jetzt spielen“ entsperrt der Browser das Audio. Der Einsatzbildschirm
wartet bei Bedarf kurz, bis der Runden-Track dekodiert ist.

---

## 10. HUD und Telemetrie

Während des Spiels zeigt das HUD:

- Fraktion, Klasse und Vitalität,
- Urlaubstickets beider Seiten,
- Verbindungsstatus, Ping, Spielerzahl und FPS,
- aktuellen Kartenbereich (z. B. „Lagunen-Hafen“ oder „Gipfelalm“),
- den aktiven Renderer (WebGPU/WebGL2),
- die aktuelle Musik und deren BPM.

`F1` öffnet die Netzwerk- und Engine-Telemetrie: Server-Tick, Snapshots, Position,
Geschwindigkeit, unbestätigte Eingaben, Vorhersage-Korrektur, Draw Calls und aktive Meshes.
Sie ist für Playtests und Fehlersuche gedacht, nicht für den normalen Spielbetrieb.

---

## 11. Sprache

Oben rechts im Fenster steht der Umschalter **EN | DE**. Die Umschaltung wirkt sofort auf
Menü, Ladebildschirm, Einsatzbildschirm, HUD, Pause, Garderobe, Fehlermeldungen und
Telemetrie. Die Auswahl wird im Browser gespeichert und beim nächsten Öffnen wiederhergestellt.

---

## 12. Pause und Menü

- `Esc` gibt die Maus frei und öffnet die Pause.
- **„Zurück zum Fjord“** setzt das Spiel fort und fängt die Maus erneut ein.
- **„Hauptmenü“** beendet die Runde und kehrt zum Menü zurück.
- Im Pausenmenü lassen sich Garderobe, Audio-Einstellungen und das Feldhandbuch öffnen.
- Der Sprache-Schalter ist in der Garderobe ausgeblendet, damit er den Schließen-Button
  nicht überdeckt.

---

## 13. Fehlerbehebung

### Das Menü zeigt OFFLINE

- Läuft `bun run dev` noch?
- Ist Port 3000 belegt? `bun run stop` beendet verwaiste Prozesse.
- Server-Health prüfen: <http://127.0.0.1:3000/api/health>.

### Die Maus wird nicht eingefangen

- Erneut auf die Spielfläche klicken.
- Browser-Pointer-Lock-Einstellungen prüfen.
- In Safari kann ein Neuladen helfen.

### Kein Ton

- Einmal irgendwo auf die Seite klicken; Browser starten Audio erst nach einer Geste.
- Audio-Einstellungen im Pausenmenü prüfen.
- Die MP3-Dateien liegen unter `apps/client/public/audio/`; fehlt eine Datei, fällt das Spiel
  auf die prozedurale Musik zurück und zeigt eine Konsolenwarnung.

### WebGPU startet nicht

- Mit `?renderer=webgl2` erzwingen: <http://localhost:5173/?renderer=webgl2>.
- Browser und Grafiktreiber aktualisieren.

### Ports sind belegt

```bash
bun run stop
```

### Build oder Typecheck schlägt fehl

```bash
bun run typecheck
bun run build
```

Die erwartete einzige Warnung ist Rapiers Hinweis zu Initialisierungsparametern; er ist
harmlos.

---

## 14. Projektstruktur

```text
apps/client/      Svelte 5, Vite, Babylon.js, prozedurales Web Audio
apps/server/      Bun-Server, autoritative Simulation, Binärprotokoll
packages/shared/  Konfiguration, Physik, Protokoll, Typen, EN/DE-i18n
scripts/          Startskript für Server und Client
```

Weitere Dokumente:

- [`README.md`](README.md) — GitHub-Übersicht und Meilenstein-Status
- [`game-decisions.md`](game-decisions.md) — vollständiges Design- und Entscheidungsprotokoll
- [`CLAUDE.md`](CLAUDE.md) — technische Arbeitsnotizen für Agenten und Entwickler

---

## 15. Lizenz und Assets

Dieses Projekt ist ein Original-Clean-Room-Projekt. Es enthält keine Battlefield/EA-Assets,
Namen, Karten, Sounds oder kopierten Kompositionen. Charaktere, Props, Waffen, Fahrzeuge,
Effekte und UI-Grafik werden prozedural erzeugt. Externe Audio-Dateien sind ausschließlich
die vom Projektinhaber gelieferten Musikstücke.
