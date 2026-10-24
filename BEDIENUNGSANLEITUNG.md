# Frost & Flamingos — Bedienungsanleitung

**Bullets, Fondue & Coconuts** · Milestone 1: Movement & World
Stand: 24. Oktober 2026 · Zielplattform: macOS

Diese Anleitung beschreibt die lokale Playtest-Version. Sie richtet sich an alle, die das
Projekt auf einem Mac starten, spielen, aktualisieren und wieder sauber beenden wollen.

---

## 1. Was ist das?

Frost & Flamingos ist ein Third-Person-Multiplayer-Prototyp in einer alpenländischen
Klimakrieg-Komödie. Zwei Urlaubsresorts kämpfen um denselben Fjord: die Gipfel-Garde will
ewigen Schnee, die Lagunen-Liga endlosen Sommer.

**Milestone 1 (M1)** ist der spielbare Bewegungs- und Welt-Prototyp:

- du kannst zu Fuß durch die Karte laufen, sprinten und springen,
- die Kamera sitzt federnd über der Schulter,
- der Server ist autoritativ und simuliert mit 60 Hz,
- mehrere Spieler sehen sich in Echtzeit,
- die komplette Oberfläche gibt es auf Deutsch und Englisch.

**Noch nicht enthalten:** Waffen, Schießen, Bots, Fahrzeuge, Zerstörung, andere Klassen,
Kosmetik und Match-Wertung. Diese Systeme kommen in späteren Milestones. M1 ist bewusst
ein Bewegungs- und Netzwerk-Test, kein vollständiges Spiel.

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

Falls Bun noch nicht installiert ist, im Terminal ausführen:

```bash
curl -fsSL https://bun.sh/install | bash
```

Danach das Terminal neu öffnen oder den Pfad für die aktuelle Sitzung setzen:

```bash
export PATH="$HOME/.bun/bin:$PATH"
```

Damit Bun dauerhaft gefunden wird, diese Zeile in `~/.zshrc` ergänzen:

```bash
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.zshrc
```

Installation prüfen:

```bash
bun --version
```

Erwartet wird `1.4.4` (oder eine neuere 1.4.x-Version).

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

Zusätzlich meldet der Server, dass er bereit ist, und Vite zeigt die lokale Adresse an.

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

## 5. Erste Schritte und Steuerung

1. Im Hauptmenü auf **„Play Now“** beziehungsweise **„Jetzt spielen“** klicken.
2. Der Browser fängt die Maus ein (Pointer Lock). Die Kamera folgt nun der Maus.
3. Mit den untenstehenden Tasten den Fjord erkunden.

Falls der Browser die Maus nicht einfängt, erscheint ein Hinweis. Dann einfach noch einmal
auf die Spielfläche klicken. Manche Browser verlangen eine direkte Benutzeraktion.

### Steuerung

| Aktion | Taste / Eingabe |
| --- | --- |
| Bewegen | `W` `A` `S` `D` oder Pfeiltasten |
| Umsehen | Maus |
| Springen | `Leertaste` |
| Sprinten | `Shift` (halten) |
| Kamera über die andere Schulter | `C` |
| Kameradistanz | Mausrad |
| Maus freigeben / Pause | `Esc` |
| Telemetrie ein-/ausblenden | `F1` |

### Pause und Menü

- `Esc` gibt die Maus frei und öffnet die Pause.
- **„Zurück zum Fjord“** setzt das Spiel fort und fängt die Maus erneut ein.
- **„Hauptmenü“** beendet die Runde und kehrt zum Menü zurück.
- Im Pausenmenü lässt sich das Feldhandbuch mit allen Tasten öffnen.

### Sprache

Oben rechts im Fenster steht der Umschalter **EN | DE**. Die Umschaltung wirkt sofort auf
Menü, HUD, Pause, Fehlermeldungen und Telemetrie. Die Auswahl wird im Browser gespeichert
und beim nächsten Öffnen wiederhergestellt.

### HUD und Telemetrie

Während des Spiels zeigt das HUD:

- Fraktion, Klasse und Vitalität,
- Urlaubstickets beider Seiten,
- Verbindungsstatus, Ping, Spielerzahl und FPS,
- aktuellen Kartenbereich (z. B. „High Pass“ oder „Gipfelalm“),
- den aktiven Renderer (WebGPU/WebGL2).

`F1` öffnet die Netzwerk- und Engine-Telemetrie: Server-Tick, Snapshots, Position,
Geschwindigkeit, unbestätigte Eingaben und Vorhersage-Korrektur. Sie ist für Playtests und
Fehlersuche gedacht, nicht für den normalen Spielbetrieb.

---

## 6. Was M1 kann

- **Bewegung:** Laufen, Sprinten, Springen, Luftkontrolle, Hängenbleiben an Steigungen und
  Treppen werden vom gemeinsamen Character-Motor berechnet.
- **Kamera:** federnde Third-Person-Kamera über der Schulter, Schulterwechsel und Zoom.
- **Welt:** 800 × 800 m große Karte mit Gipfel, Dorf, Strand, Hafen und Wasser.
- **Physik:** dieselbe Rapier-Heightfield- und Prop-Kollisionswelt auf Client und Server.
- **Netzwerk:** autoritativer Bun-Server, 60-Hz-Simulation, 30-Hz-Snapshots,
  Client-Vorhersage, Reconciliation und Interpolation anderer Spieler.
- **Mehrspieler:** mehrere Browser-Tabs oder Geräte im selben lokalen Netzwerk können
  gemeinsam spielen, solange sie den Server erreichen.
- **Respawn:** Wer ins tiefe Wasser fällt oder unter die Welt gerät, wird vom Server an einen
  sicheren Spawn-Punkt zurückgesetzt.
- **Darstellung:** Toon-Shader, Wasser, Himmel, prozedurale Props und Schatten; WebGPU mit
  WebGL2-Fallback.
- **Oberfläche:** Ladebildschirm, Hauptmenü, HUD, Pause, Fehlerbildschirm, Toasts,
  Sprachumschalter und Telemetrie.

**Nicht in M1:** Waffen, Munition, Treffer, Bots, Fahrzeuge, Zerstörung, andere Klassen,
Ausrüstungsauswahl, Fortschritt, Ranglisten und Match-Ende. Bitte nicht als Fehler melden —
diese Systeme sind bewusst noch nicht implementiert.

---

## 7. Mehrspieler lokal testen

1. Das Spiel in einem Browser-Tab starten und **Play Now** klicken.
2. Einen zweiten Tab mit **<http://localhost:5173>** öffnen.
3. Warten, bis auch dort **VERBUNDEN** steht, und ebenfalls **Play Now** klicken.
4. Beide Tabs zeigen oben rechts **2 / 16 im Resort**.
5. Die Spielfiguren sollten sich in der Welt sehen und Bewegungen des anderen Tabs
   flüssig interpoliert anzeigen.

Der Server zählt jede geöffnete Spielverbindung. Beim Schließen eines Tabs wird die Figur
entfernt. Ein zweiter Tab belastet den Rechner doppelt; für FPS-Messungen nur einen Tab
verwenden.

Hinweis: Der Server bindet standardmäßig an `127.0.0.1`. Zugriff von einem anderen Gerät
im LAN ist ohne bewusste Konfiguration von `HOST` nicht vorgesehen.

---

## 8. Renderer: WebGPU und WebGL2

Standardmäßig versucht der Client zuerst **WebGPU**. Klappt das nicht (älterer Browser,
deaktivierte Hardwarebeschleunigung, Treiberproblem), wird automatisch **WebGL2** verwendet.
Im HUD steht dann `RENDERER: WEBGL2`, und es erscheint ein kurzer Hinweis.

WebGL2 lässt sich bewusst erzwingen:

**<http://localhost:5173/?renderer=webgl2>**

Das ist der richtige Weg, um den Fallback gezielt zu testen. Beide Renderer müssen die
Karte, Figuren, Wasser und Himmel korrekt darstellen.

Wenn stattdessen „The ski lift is stuck“ erscheint, konnte gar kein 3D-Renderer starten:
Hardwarebeschleunigung prüfen, Browser aktualisieren, Chrome oder Edge testen.

---

## 9. Spiel beenden

### Normalfall

Im Terminal, in dem `bun run dev` läuft, **`Ctrl+C`** drücken. Der Dev-Stack beendet Server
und Client und gibt die Ports frei. Warte kurz, bis die Meldung zum Schließen erscheint.

### Terminal bereits geschlossen oder Absturz

Falls der Prozess weiterläuft und die Ports belegt sind:

```bash
bun run stop
```

Das beendet gezielt Prozesse auf den Ports **5173**, **3000** und **4173**. Danach kann
`bun run dev` wieder normal starten.

Ports prüfen (optional):

```bash
lsof -nP -iTCP:5173 -iTCP:3000 -sTCP:LISTEN
```

Bitte nicht pauschal `killall bun` verwenden — das würde auch andere Bun-Projekte beenden.

---

## 10. Projekt aktualisieren

Wenn eine neue Version im Repository liegt:

```bash
cd "/Users/nicolas/Documents/Default Project"
git pull
bun install
```

`bun install` ist nach Updates wichtig, weil sich Abhängigkeiten oder Workspace-Pakete
geändert haben können. Danach den alten Dev-Stack mit `Ctrl+C` beenden und neu starten:

```bash
bun run dev
```

Im Browser anschließend **hart neu laden**: `Cmd` + `Shift` + `R`. Das umgeht alte
Vite-Module und gecachte Assets.

Wenn weiterhin alter Code erscheint:

```bash
bun run stop
bun run clean
bun run dev
```

Vor `git pull` lohnt ein Blick auf `git status`, damit eigene Änderungen nicht überschrieben
oder vermischt werden.

---

## 11. Aufräumen

Beide Befehle im Projektordner ausführen und vorher den Dev-Stack beenden.

### `bun run clean`

Entfernt:

- Build-Ausgaben von Client, Server und Shared-Paket,
- Vite-Caches,
- lokale Serverdaten (z. B. den In-Memory-Spielstand unter `apps/server/data/`).

**Nicht** entfernt werden `node_modules` und `bun.lock`. Der nächste Start baut die nötigen
Dateien automatisch neu. Das ist der normale Reset bei merkwürdigem Build- oder Cache-Verhalten.

```bash
bun run clean
```

### `bun run clean:all`

Entfernt zusätzlich **alle** `node_modules` und die Lockfile. Danach ist eine vollständige
Neuinstallation nötig:

```bash
bun run clean:all
bun install
```

Das ist die Eskalationsstufe bei beschädigten Abhängigkeiten, Versionskonflikten oder einem
größeren Update. Es dauert länger und benötigt Internet.

---

## 12. Browser-Cache und LocalStorage löschen

Die Sprache wird lokal unter dem Schlüssel **`frost-and-flamingos.locale`** gespeichert.
Weitere Spielstände gibt es in M1 nicht.

### Chrome / Edge

1. `Cmd` + `Option` + `I` öffnet die Entwicklertools.
2. Reiter **Application** (Anwendung) → **Storage** → **Local Storage**.
3. `http://localhost:5173` auswählen.
4. Den Eintrag `frost-and-flamingos.locale` löschen.
5. Alternativ: **Application** → **Storage** → **Clear site data** für die Seite.
6. Mit `Cmd` + `Shift` + `R` neu laden.

### Safari

1. Entwicklermenü aktivieren: Safari → Einstellungen → Erweitert → „Entwicklermenü anzeigen“.
2. `Option` + `Cmd` + `I` öffnet den Web Inspector.
3. Reiter **Storage** → **Local Storage** → `http://localhost:5173`.
4. Den Spracheintrag löschen.
5. Alternativ: Safari → Einstellungen → Datenschutz → „Websitedaten verwalten“ → `localhost`
   entfernen.
6. Mit `Cmd` + `Shift` + `R` neu laden.

Nach dem Löschen erkennt das Spiel die Sprache des Browsers: Deutsch bei deutscher
Browser-Sprache, sonst Englisch. Über **EN | DE** lässt sie sich jederzeit wieder ändern.

Wenn nur alte Skripte oder Shader hängen, reicht meist `bun run clean` plus hartes Neuladen.
Das Löschen der LocalStorage ist nur bei falscher Sprache oder hartnäckigen Seitendaten nötig.

---

## 13. Fehlerbehebung

| Symptom | Ursache / Lösung |
| --- | --- |
| Menü zeigt **OFFLINE** | Server läuft nicht. Terminal prüfen, `bun run dev` starten, `http://127.0.0.1:3000/api/health` öffnen. |
| „Port 5173 is already in use“ | Ein alter Dev-Stack läuft noch. `bun run stop`, dann erneut starten. |
| „No signal from the resort“ | Server nicht erreichbar oder falscher Port. Server neu starten; Firewall/VPN prüfen. |
| Maus wird nicht gefangen | Einmal auf die Spielfläche klicken. Browser-Erweiterungen oder DevTools können Pointer Lock blockieren. |
| „Mouse capture failed“ | Wie oben; alternativ Seite neu laden und direkt nach dem Laden klicken. |
| Bildschirm bleibt schwarz | Browser-Konsole (`F12` / `Cmd`+`Option`+`I`) prüfen, hart neu laden, `bun run clean`, Browser aktualisieren. |
| „The ski lift is stuck“ | Kein 3D-Renderer gestartet. Hardwarebeschleunigung aktivieren, Chrome/Edge testen, Safari aktualisieren. |
| Nur wenige FPS | Weitere Tabs schließen, Fenster verkleinern, Hardwarebeschleunigung prüfen, `?renderer=webgl2` testen. |
| WebGL2-Hinweis | Kein Fehler: WebGPU war nicht verfügbar, der Fallback läuft. |
| Rapier-Warnung in der Konsole | Harmlose Deprecation-Warnung aus `@dimforge/rapier3d-compat`; beeinflusst das Spiel nicht. |
| Sprache bleibt falsch | LocalStorage-Eintrag `frost-and-flamingos.locale` löschen (Abschnitt 12) oder EN/DE erneut wählen. |
| Figuren anderer Spieler ruckeln | Netzwerk-/Interpolationsverhalten; bei lokalem Test beide Tabs im selben Browser beobachten. Bei dauerhaftem Problem Konsole und Terminalausgabe notieren. |
| Server meldet „The resort is full“ | Maximal 16 Verbindungen. Nicht mehr benötigte Tabs schließen. |
| Nach dem Update fehlen Pakete | `bun install` ausführen; bei Bedarf `bun run clean:all` und neu installieren. |

### Logs

- **Terminal:** Ausgaben von Server und Vite, inklusive Fehlern und Respawn-Meldungen.
- **Browser-Konsole:** Shader-, Netzwerk- und JavaScript-Fehler. In Chrome/Edge mit `F12`,
  in Safari mit `Option` + `Cmd` + `I`.
- **Netzwerk-Tab:** WebSocket-Verbindung zu `/ws` und HTTP-Aufrufe zu `/api/*`.

M1 sendet keine Telemetrie an externe Server. Alle Daten bleiben lokal.

---

## 14. Kurzreferenz

```bash
# Einmalig
cd "/Users/nicolas/Documents/Default Project"
bun install

# Täglich
bun run dev
# Browser: http://localhost:5173

# Beenden
Ctrl+C

# Notfall
bun run stop
bun run clean
bun run clean:all && bun install
```

**Viel Spaß im Fjord. Möge dein Handtuch trocken bleiben.**
