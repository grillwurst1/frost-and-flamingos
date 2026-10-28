# Frost & Flamingos — Bedienungsanleitung

**Bullets, Fondue & Coconuts** · Test-Build „M5-Kern“: Klima-Eroberung, Fahrzeuge, Wanderinnen, Hühner & gemalte Welt
Stand: 26. Oktober 2026 · Zielplattform: macOS

Diese Anleitung beschreibt die lokale Playtest-Version. Sie richtet sich an alle, die das
Projekt auf einem Mac starten, spielen, testen, aktualisieren und wieder sauber beenden wollen.

---

## 1. Was ist Frost & Flamingos?

Frost & Flamingos ist ein Third-Person-Multiplayer-Action-Cartoon in einer alpenländischen
Klimakrieg-Komödie. Zwei Urlaubsresorts kämpfen um denselben Fjord: die **Gipfel-Garde**
will ewigen Schnee, Fondue und alpine Ruhe; die **Lagunen-Liga** will endlosen Sommer,
Flamingo-Schwimmringe und barfüßigen Chaos-Urlaub.

Die Meilensteine M1 bis M4 sind fertig (Bewegung, Klassen und Garderobe, Waffen, Kampf, Bots
und Audio). Dieser **Test-Build „M5-Kern“** ist der Kern von Milestone 5 plus die neuen Grafik-
und Figurenpakete. Nach diesem Build ruht die Arbeit, bis der Projektinhaber getestet hat.
Neu sind:

- **Klima-Eroberung:** drei Wettertürme, 50 Urlaubstickets pro Team, Ticketverlust für das
  Team mit weniger Türmen, ein Klima, das Himmel, Licht und Wasser färbt, 20-Minuten-Runden,
  15 s Ergebnis-Banner mit Waffenruhe und automatischer Neustart (Abschnitt 8),
- **vier Fahrzeuge:** Fondue-Raupe, Kokosnuss-Strandpanzer, Taktischer Badi-Flamingo und
  Seitenwagen-Motorrad (Abschnitt 9),
- **zwei neue Klassen:** das **Maskottchen** (Alpenkuh / Kampf-Kokosnuss) und die
  unberührbare **Wanderin** (Gruseliges Bergmädchen / Hot Beach Girl) mit Versorgungs-Aura
  (Abschnitt 7),
- **gemalte Soldaten:** alle sechs Soldaten (drei Klassen × zwei Fraktionen) sind gemalte,
  geriggte 3D-Modelle, die der Projektinhaber mit Meshy erzeugt hat; dazu 13 Heldenwaffen mit
  passenden Haltungen,
- **die neu gebaute, gemalte Fjord Fiesta:** 257 × 257 Höhenpunkte, Lagune im Südwesten, Dorf
  in der Mitte, Gipfel im Nordosten; gemalte Bäume, Büsche, Fassaden, Bodentexturen und
  Decals, ein Hügelkranz hinter dem Kartenrand und ein gemalter Comic-Look mit Tuschekonturen,
- **frei laufende Hühner** auf beiden Kartenhälften, die man abschießen kann (Abschnitt 10),
- Comic-HUD und Comic-Menüs, Punktetafel (`Tab`) und eine Einstellung für die Bildqualität,
- vollständige deutsche und englische Texte für alle neuen Oberflächen.

**Noch nicht enthalten:** Schlepplift, Alpine Coaster, Hängematten-Katapult und die
NPC-Kuh, Doppeldecker, Ruderboot und Gondel, das Reparieren von Fahrzeugen, Zerstörung,
Krater, Decal-Ringpuffer, Meta-Ökonomie und Kur-Pass. Diese Systeme folgen im Rest von M5 und
in M6 bis M7. Details in Abschnitt 16.

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

Getestet ist das Spiel mit Bun 1.4.4; neuere 1.x-Versionen laufen in der Regel auch. Genau
diese Version installiert:

```bash
curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.4"
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

## 3. Installation: das Spiel von GitHub holen

### Kurzfassung

Wer Git und Bun schon hat, braucht im Terminal nur diese Befehle:

```bash
cd ~
git clone https://github.com/grillwurst1/frost-and-flamingos.git
cd frost-and-flamingos
bun install
bun run dev
```

Danach im Browser **<http://localhost:5173>** öffnen. Beenden mit `Ctrl` + `C` im Terminal.
Die Schritte im Einzelnen:

### 3.1 Terminal öffnen

Programme → Dienstprogramme → **Terminal** (oder `Cmd` + Leertaste, „Terminal“ tippen,
Enter). Alle folgenden Befehle tippst du dort ein und bestätigst jeweils mit Enter.

### 3.2 Git prüfen

```bash
git --version
```

Erscheint eine Versionsnummer (z. B. `git version 2.39.5`), ist Git vorhanden. Sonst bietet
macOS an, die „Command Line Developer Tools“ zu installieren: auf **Installieren** klicken,
warten und den Befehl wiederholen. Von Hand geht das auch mit `xcode-select --install`.

### 3.3 Bun prüfen

```bash
bun --version
```

Fehlt Bun, zuerst wie in Abschnitt 2 installieren.

### 3.4 Das Spiel herunterladen (einmalig)

```bash
cd ~
git clone https://github.com/grillwurst1/frost-and-flamingos.git
cd frost-and-flamingos
```

Das Spiel liegt danach im Ordner `~/frost-and-flamingos` (im Finder: dein Benutzerordner →
`frost-and-flamingos`). Der Download ist rund 250 MB groß, weil Modelle, gemalte Grafiken und
Musik mitkommen. `git clone` holt automatisch den neusten Stand des Hauptzweigs `master`.

**Falls GitHub nach Benutzername und Passwort fragt** (privates Repository): Im Terminal nimmt
GitHub kein normales Passwort mehr an. Zwei einfache Wege:

- **GitHub CLI:** einmal `brew install gh` (braucht [Homebrew](https://brew.sh)), dann
  `gh auth login` und den Anweisungen im Browser folgen. Danach funktioniert `git clone` wie
  oben, alternativ `gh repo clone grillwurst1/frost-and-flamingos`.
- **Zugangstoken:** auf GitHub unter Settings → Developer settings → Personal access tokens
  ein Token mit Lesezugriff auf das Repository erstellen und es bei der Passwortfrage
  einfügen.

**Ohne Git** (nur zum einmaligen Ausprobieren): auf der GitHub-Seite des Projekts den grünen
Knopf **Code** → **Download ZIP** wählen, die ZIP-Datei entpacken und im Terminal in den
entpackten Ordner wechseln, z. B. `cd ~/Downloads/frost-and-flamingos-master`. Eine neue
Version musst du dann jedes Mal neu herunterladen; mit Git reicht `git pull` (Abschnitt 3.6).

### 3.5 Abhängigkeiten installieren

Im Spielordner:

```bash
bun install
```

Das legt die Workspace-Pakete an und lädt Babylon.js, Rapier, Svelte, Vite und TypeScript. Das
dauert beim ersten Mal ein bis zwei Minuten und ist danach nur nach einem Update nötig.

### 3.6 Auf die neuste Version aktualisieren

Immer wenn auf GitHub eine neue Version liegt:

```bash
cd ~/frost-and-flamingos
git pull
bun install
```

Danach wie in Abschnitt 4 starten. Welche Version gerade installiert ist, zeigt
`git log -1 --oneline` (z. B. `2a279ea docs: …`); auf GitHub steht derselbe Code oben in der
Commit-Liste von `master`.

Meldet `git pull`, dass lokale Änderungen überschrieben würden, und brauchst du diese
Änderungen nicht, setzt du den Ordner auf den GitHub-Stand zurück:

```bash
git fetch origin
git reset --hard origin/master
bun install
```

**Achtung:** `git reset --hard` verwirft alle eigenen Änderungen im Spielordner.

---

## 4. Spiel starten

Jedes Mal, wenn du spielen willst, im Terminal:

```bash
cd ~/frost-and-flamingos
bun run dev
```

Das Terminalfenster muss geöffnet bleiben, solange du spielst.

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
wird. Der Ladebildschirm zeigt eines der gemalten Resort-Motive, den Spieltitel, das Duell
Alpen gegen Strand, einen gestreiften Ladebalken und wechselnde Tipps. Er zeigt drei Schritte:

1. **Renderer starten** (WebGPU oder WebGL2),
2. **Fjord Fiesta aufbauen** (Terrain, Props, Wasser),
3. **Rezeption anrufen** (Verbindung zum autoritativen Server).

Das Hauptmenü liegt über dem gemalten Titelbild des Resorts: links stehen Logo,
**„Jetzt spielen“**, Garderobe, Einstellungen und die Profilkarten (Klasse, Fraktion, Stimme).
Wenn in der Statuspille unten **VERBUNDEN** steht, ist alles bereit. Steht dort **OFFLINE**,
läuft der Server nicht oder Port 3000 ist blockiert (siehe Abschnitt 17); eine Hinweiskarte mit
**„Neu verbinden“** erscheint dann direkt unter den Knöpfen.

Optionaler Server-Test im Browser:

**<http://127.0.0.1:3000/api/health>**

Dort müssen `status: "ok"`, `online: true`, `mapId: "fjord_fiesta"` und
`protocolVersion: 11` erscheinen; der Block `conquest` zeigt Runde, Tickets und Türme.

Auf dem Server spielen automatisch vier KI-Bots mit. Wer in Ruhe ohne Bots testen will,
startet den Stack so:

```bash
FF_NO_BOTS=1 bun run dev
```

### Spiel beenden

Im Terminal `Ctrl` + `C` drücken: das beendet Server und Client zusammen. Den Browser-Tab
kannst du einfach schließen. Meldet ein späterer Start, dass ein Port belegt ist, hilft
`bun run stop` (Abschnitt 17).

---

## 5. Erste Schritte

1. Im Hauptmenü eine **Fraktion** und **Klasse** wählen oder direkt **„Jetzt spielen“** klicken.
2. Der Browser fängt die Maus ein (Pointer Lock). Die Kamera folgt nun der Maus.
3. Nach dem Klick erscheint kurz der **Einsatzbildschirm** mit Zielort, Einteilung und einem
   Ladebalken. In dieser Zeit läuft der Runden-Track „Skiing the Sandbar“.
4. Danach steht der Charakter auf einem Spawn-Pad an einem Turm seines Teams und das HUD
   erscheint. Zu Rundenbeginn hält die Lagunen-Liga den Lagunen-Hafen (A), die Gipfel-Garde
   die Gipfel-Käserei (C); der Dorfplatz (B) ist neutral. Die ersten 2 Sekunden bist du
   geschützt.

Falls der Browser die Maus nicht einfängt, erscheint ein Hinweis. Dann einfach noch einmal
auf die Spielfläche klicken. Manche Browser verlangen eine direkte Benutzeraktion.

Beim allerersten Start laden die gemalten Figuren- und Fahrzeugmodelle nach und nach; ein
Fahrzeug erscheint kurz als einfacher Platzhalter, bis sein Modell geladen ist.

---

## 6. Steuerung

### Zu Fuß (Allrounder, Heavy, Infiltrator)

| Aktion | Taste / Eingabe |
| --- | --- |
| Bewegen | `W` `A` `S` `D` oder Pfeiltasten |
| Umsehen | Maus |
| Springen | `Leertaste` |
| Notfallschirm öffnen / abwerfen | `Leertaste` im Fall (abwerfen auch mit `C`) |
| Sprinten | `Shift` (halten) |
| Ducken (umschalten) | `C` |
| Ducken (halten) | `Ctrl` |
| Ausweichrolle | `C` während des Vorwärtssprints |
| Feuern | linke Maustaste |
| Waffen-Slots | `1` `2` `3` oder Mausrad |
| Nachladen | `R` |
| Klassenfähigkeiten | `Q` `E` `T` |
| Interagieren / Fahrzeug betreten | `F` |
| Spotthymne (Taunt) | `G` |
| Punktetafel | `Tab` halten |
| Kamera über die andere Schulter | `V` |
| Kameraabstand | `Alt` + Mausrad |
| Maus freigeben / Pause | `Esc` |
| Telemetrie ein-/ausblenden | `F1` |

### Im Fahrzeug

| Aktion | Taste / Eingabe |
| --- | --- |
| Einsteigen / Aussteigen | `F` (höchstens 2,4 m vom Fahrzeug entfernt) |
| Fahren | `W` `A` `S` `D` |
| Platz wechseln | `C` |
| Hupe | `H` |
| Fahrzeugwaffe (Panzerkanone, Flamingo-Harpune) | linke Maustaste, zielen mit der Maus |
| Stöpsel-Turbo (Badi-Flamingo, nur auf dem Wasser) | `Shift` |
| Handbremsdrift (Seitenwagen) | `Leertaste` |

Auf dem zweiten Platz der Panzer (Kommandanten- bzw. Kokosnuss-Luke) und im Seitenwagen
schießt man mit den eigenen Waffen.

### Maskottchen und Wanderin

- **Alpenkuh:** `W`/`S` Gas, Bremse und rückwärts, `A`/`D` lenken, `Shift` + `W`
  galoppieren (leert die Galoppleiste), `Leertaste` hüpfen; die Kamera kreist frei.
- **Kampf-Kokosnuss:** `W` `A` `S` `D` rollt relativ zur Kamera, `Leertaste` springt, zweimal
  `Leertaste` ergibt einen Doppelsprung; Gefälle macht sie schneller.
- Beide lösen ihre drei Moves mit `Q` `E` `T` aus (oder `1` `2` `3` + Klick).
- **Wanderin:** nur `W` `A` `S` `D` und die Maus – kein Springen, Sprinten, Ducken, keine
  Waffen und keine Spotthymne.

### Bewegung im Detail

- **Vorwärts** 100 %, **seitwärts** 85 %, **rückwärts** 70 % der Klassengeschwindigkeit.
- **Sprinten** erhöht das Tempo um 35 %, nur vorwärts und nicht geduckt.
- **Ducken** reduziert das Tempo auf 55 % und verkleinert die Kapsel.
- **Ausweichrolle:** während des Vorwärtssprints `C` drücken; 0,6 s Rolle plus 0,4 s Erholung.
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
| Maskottchen | Alpenkuh | Kampf-Kokosnuss | 260 / 200 | 6,4 / 10,5 m/s | Rammt statt zu schießen |
| Wanderin | Gruseliges Bergmädchen | Hot Beach Girl | – | 2,4 m/s | Unberührbare Versorgerin |

Bei den drei Soldatenklassen bestimmt die Klasse HP, Kapselgröße, Bewegung und das
Standard-Loadout; sie können alle Kosmetik-Items tragen. Ihre Fähigkeiten auf `Q` `E` `T`:

- **Allrounder:** Fondue-Snack, Ramm-Sprint, Schlacht-Jodel
- **Heavy:** Käsepanzerung, Fass-Explosion, Bodenslam
- **Infiltrator:** Riff-Tarnung, Rauchbombe, Enterhaken-Sprint

### Maskottchen

Die Fraktion bestimmt die Form: Die Gipfel-Garde spielt die **Alpenkuh** (260 Vitalität,
Trab 6,4 m/s, Galopp 11,5 m/s), die Lagunen-Liga die **Kampf-Kokosnuss** (200 Vitalität,
rollt aus eigener Kraft bis 10,5 m/s, bergab schneller). Maskottchen tragen ein festes
Kostüm und keine Schusswaffen; sie rammen Gegner mit Schwung um, Teamkollegen bekommen nur
einen freundlichen Schubser. Moves auf `Q` `E` `T`:

- **Alpenkuh:** Hörner-Ansturm, Hufstampfer, Kuhglocken-Klang
- **Kampf-Kokosnuss:** Turbo-Rolle, Kokos-Plumps (nur in der Luft), Kokosmilch-Pfütze

Die Kuh trägt eine schwingende Glocke und einen federnden Schwanz und blinzelt; die
Kokosnuss rollt und zeigt eines von 12 gemalten Gesichtern. Maskottchen können Türme
erobern, aber nicht in Fahrzeuge steigen.

### Wanderin

Die Gipfel-Garde bringt das **Gruselige Bergmädchen**, die Lagunen-Liga das **Hot Beach
Girl**. Beide funktionieren gleich:

- **Unberührbar:** Kugeln, Explosionen, Rammstöße und Körper gehen einfach durch sie hindurch.
  Bots lassen sie in Ruhe, und die Hühner fliehen nicht vor ihr.
- **Geht nur:** 2,4 m/s, kein Springen, Sprinten, Ducken, keine Waffen und keine
  Fähigkeiten. Über Wasser schwebt sie knapp über der Oberfläche; aus großer Höhe sinkt sie
  langsam herab.
- **Versorgungs-Aura:** Mitspieler im Umkreis von **6 m** erhalten **8 Vitalität pro
  Sekunde**, sobald sie **3 s** keinen Schaden genommen haben, und ihre Reservemunition füllt
  sich **alle 4 s um ein Magazin pro Waffenslot** auf. Mehrere Wanderinnen addieren sich nicht.
- **Support-Punkte:** je 10 geheilte Vitalität und jedes aufgefüllte Magazin bringen einen
  Punkt; sie stehen auf der Punktetafel (`Tab`).
- Sie kann **keine Türme erobern**, zählt **nicht für den Teamausgleich** und kann **nicht in
  Fahrzeuge** steigen. Ihr Aussehen ist fest, nur das Rufzeichen lässt sich ändern.
- Wechselst du von der Wanderin zu einer anderen Klasse, wirst du sofort neu eingesetzt;
  dabei kann dich der Server ins kleinere Team setzen. Dann erscheint der Hinweis „Du spielst
  jetzt für die …, damit die Teams ausgeglichen bleiben.“

---

## 8. Klima-Eroberung

Drei Wettertürme entscheiden über das Klima: **A Lagunen-Hafen** (Leuchtturm), **B Dorfplatz**
und **C Gipfel-Käserei**. Die Regeln in Kürze:

- Jedes Team startet mit **50 Urlaubstickets**.
- **Zone:** 16 m Radius um den Turm, von 4,5 m unter bis 16 m über dem Turm. Es zählen
  lebende Spieler, die erobern können (nicht die Wanderin), außer während des Spawnschutzes.
- Die Seite mit mehr Spielern in der Zone bewegt die Kontrolle; bei Gleichstand passiert
  nichts („Umkämpft!“).
- **Einnehmen** neutral → eigen: **8 / 6 / 4 s** bei einer Überzahl von 1 / 2 / 3 und mehr.
- **Neutralisieren** eigen → neutral (auch das Zurückdrehen einer gegnerischen
  Teileinnahme): **4 / 3 / 2 s**. Einen gegnerischen Turm ganz zu übernehmen dauert also
  12 / 9 / 6 s.
- Eine leere Zone kehrt in **24 s** zum Besitzer (oder zu neutral) zurück.
- Jeder Tod kostet das Team des Opfers **1 Ticket**.
- Das Team mit weniger Türmen verliert **alle 6 s pro fehlendem Turm 1 Ticket** (bei 2
  fehlenden alle 3 s, bei 3 alle 2 s).
- **Wetter:** Jeder gehaltene Turm verschiebt das Klima um 0,015 pro Sekunde (netto;
  Lagunen-Liga Richtung Sonne, Gipfel-Garde Richtung Frost), begrenzt auf ±1, zu jeder Runde
  wieder 0. Das Wetter färbt Himmel, Licht und Wasser und verstärkt den Wind am Fallschirm.
- Die Runde endet, wenn ein Team 0 Tickets hat (beide im selben Tick = Unentschieden) oder
  nach **20:00** Minuten (mehr Tickets gewinnt; Gleichstand = Unentschieden).
- Danach **15 s Waffenruhe** mit Ergebnis-Banner: kein Schaden, keine Einnahmen, keine
  Tickets; auch Fahrzeuge und Hühner bleiben verschont.
- **Neustart:** 50 : 50 Tickets; A Lagunen-Liga, C Gipfel-Garde, B neutral; Wetter 0; alle
  spawnen neu mit Abschüssen und Toden auf 0, alle Fahrzeuge stehen wieder an ihrem Platz.

### Spawns

- Kein Spawn-Menü. Nach der 10-s-Killer-Cam wählt der Server ein zufälliges freies Pad an
  einem Turm deines Teams, ohne Turm die Hauptbasis.
- Die Pads liegen außerhalb aller Zonen: an Turm A auf den festen Ruhedecks der Stege
  (29–34 m vom Leuchtturm), an Turm B am Platzrand, an Turm C auf den Gipfelterrassen.
- **2 s Spawnschutz:** immun und in Zonen nicht mitgezählt, sichtbar als sanftes Leuchten auf
  dem Pad und als Hinweis „Geschützt“.
- Du schaust zum nächsten Turm, den dein Team nicht sicher hält (sonst zur Kartenmitte),
  entlang der freiesten Linie.
- Die Seilbahn verbindet Talstation, Dorf-Mittelstation und Gipfel. Die bisherigen
  Übergangs-Spawnplatten im Schluchtboden entfallen; die normalen Turm-/Basispads bleiben.

### Klasse wechseln

Klassen- und Ausrüstungswechsel aus der Garderobe gelten sofort, solange du noch frisch auf
dem Spawn-Pad stehst, vor dem ersten Einsatz aus dem Menü und während des Ergebnis-Banners.
Sonst gelten sie ab dem nächsten Respawn, und es erscheint der Hinweis „Neue Klasse und
Ausrüstung gelten ab deinem nächsten Respawn.“ Name und Kosmetik der aktuellen Klasse
wechseln sofort.

---

## 9. Fahrzeuge

| Fahrzeug | HP | Tempo | Plätze | Waffe | Neu nach |
| --- | ---: | --- | --- | --- | ---: |
| Fondue-Raupe | 650 | 9,5 m/s | Fahrer & Kanone · Kommandantenluke (eigene Waffen) | Fondue-Kanone, 85 Treffer + 50 Splash (5 m) | 30 s |
| Kokosnuss-Strandpanzer | 650 | 9,5 m/s | Fahrer & Kanone · Kokosnuss-Luke (eigene Waffen) | Bambus-Kokosmörser, 85 Treffer + 50 Splash (5 m) | 30 s |
| Taktischer Badi-Flamingo | 450 | 12 m/s, Turbo 2,5× | Steuer · Harpunenschütze | Harpunenkanone, Dauerfeuer | 20 s |
| Seitenwagen-Motorrad | 280 | 19 m/s | Fahrer · Seitenwagen (eigene Waffen) | – | 15 s |

- **Wem gehört was:** Fahrzeuge der Basen gehören der eigenen Fraktion. Die Fahrzeuge auf der
  Karte (zwei Flamingos am Hafen und am Oststrand, zwei Seitenwagen im Dorf) darf jeder
  nehmen; ein besetztes Fahrzeug aber nur das Team der Besatzung.
- **Vorgeschobene Panzer:** Die Fondue-Raupe an Turm C gibt es nur, solange die Gipfel-Garde
  C hält; den Kokosnuss-Strandpanzer am Hafenstrand nur, solange die Lagunen-Liga A hält.
- **Rammen:** Wer überfahren wird, nimmt je nach Tempo viel Schaden und fliegt davon
  („BOING!“). Kugeln richten an Fahrzeugen weniger aus als Explosionen.
- **Boote:** Der Badi-Flamingo gleitet auf flache Strände und kommt im Seichten rückwärts
  wieder frei. Der Stöpsel-Turbo (`Shift`, 2,5 s, danach 7 s Pause) funktioniert nur auf dem
  Wasser. Ein leeres, gestrandetes Boot lässt nach 10 s die Luft raus und erscheint neu.
- Zerstörte Fahrzeuge explodieren, werfen die Besatzung ab und erscheinen nach der oben
  genannten Zeit wieder. Ein leeres Fahrzeug weit weg von seinem Platz wird nach 75 s
  zurückgebracht.
- Maskottchen und Wanderinnen können nicht einsteigen. **Reparieren geht noch nicht.**

---

## 10. Hühner

Auf jeder Kartenhälfte laufen drei weiße Hühner herum, am liebsten im Dorf, am Strand und am
Hafen. Sie picken, scharren und schauen sich um und flattern davon, wenn Spieler, Schüsse oder
Explosionen in die Nähe kommen. Man kann sie abschießen, überfahren oder wegsprengen: Dann
fliegen die Federn, und im Kill-Feed steht „… hat ein Huhn erlegt“. Nach 45 s kommt ein neues
Huhn. Hühner bringen keine Punkte und kosten keine Tickets. Vor der Wanderin fliehen sie nicht.

---

## 11. Garderobe und Profil

Die Garderobe ist über das Hauptmenü und das Pausenmenü erreichbar. Für die drei
Soldatenklassen gilt:

- **Körpertyp:** stufenlos von 0,0 (breiter) bis 1,0 (schmaler). Die Hitbox bleibt identisch.
- **Hauttöne:** 12 kuratierte Farben.
- **Haarfarben:** 8 Farben, darunter Ginger-Orange, Goldblond, Kastanie, Schwarz und Silber.
- **Haarstile:** Buzzcut, Afro, lange Wellen, Zöpfe, Pferdeschwanz, Pompadour und Glatze.
- **Stimmlage:** 0,8 bis 1,25; die Vorschau spielt sofort eine prozedurale Kauderwelsch-Zeile.
- **Sieben Slots:** Kopf, Gesicht, Torso, Rücken, Hände, Beine und Füße.
- **Loadout:** Primärwaffe, Sekundärwaffe und Gimmick-Waffe.
- **Effekte:** Vorschau von Kampfspuren/Ruß, verkohlt und gefroren.
- **Zufällig / Zurücksetzen:** mischt das Aussehen oder stellt die Klassen-Standardwerte her.

Maskottchen und Wanderinnen haben ein festes Aussehen und keine Waffen; ihre Karte in der
Garderobe zeigt Form, Moves bzw. Aura. Wann ein Klassenwechsel greift, steht in Abschnitt 8.

Die Soldaten zeigen das gemalte Modell ihrer Klasse und Fraktion. Weicht das Outfit stark von
der Malerei ab, erscheint stattdessen die einfachere prozedurale Figur.

Das Profil wird im Browser unter `frost-and-flamingos.profile` gespeichert und beim Verbinden
an den Server gesendet. Der Server prüft und normalisiert es und verteilt es an alle Spieler.
Die Fraktion im Menü ist eine **Präferenz**; der Server weist im Match die ausbalancierte
Fraktion zu.

---

## 12. Audio

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

## 13. HUD und Telemetrie

Das HUD ist im Comic-Stil der Referenzbilder gestaltet:

- **Unten links:** rundes Profilporträt, tatsächliche/maximale Vitalität und grüne
  Gesundheitsleiste; darunter die blaue Schildanzeige.
- **Oben in der Mitte:** blaue/rote Urlaubstickets, Turmkreise A/B/C und Kompass.
- **Oben rechts:** Minimap mit begehbaren Flächen, Gebäuden, Wegen, Türmen und
  lebenden Teamkameraden. Sie folgt der eigenen Position; der Pfeil zeigt die Blickrichtung.
- **Über Figuren:** echte Spielernamen, blau für Verbündete und rot für Gegner, mit
  Dreieck. Hinter festen Hindernissen und bei getarnten Gegnern werden sie ausgeblendet.
- **Unten in der Mitte:** Klassenfähigkeiten Q/E/T, Gimmick auf 3 und Reparaturwerkzeug X.
- **Unten rechts:** drei farbige Waffenkarten für 1/2/3, ausgewählte Munition und Nachladen.
- **Eroberungsbalken:** In einer Turmzone zeigt ein Balken den Fortschritt und die Kopfzahl
  beider Seiten („… wird erobert“, „Umkämpft!“, „… gesichert“). Kann deine Klasse nicht
  erobern, steht dort „Deine Klasse kann keine Türme erobern“.
- **Oben rechts:** Kill-Feed als Comic-Bänder mit Wappen und Waffe, dazu Turm-Meldungen
  („… erobert …“) und erlegte Hühner.
- **Fahrzeug-Karte:** im Fahrzeug Rumpf, Platz, Tempo, Waffe bzw. Turbo und die Tasten.
- **Maskottchen- und Wanderin-Karte:** Vitalität, Galopp bzw. Schwung oder Aura und
  Support-Punkte.
- **Rundenende:** Ergebnis-Banner mit „Sieg!“, „Niederlage!“ oder „Unentschieden“, dem Grund,
  den Tickets und dem Countdown zur nächsten Runde.
- **Punktetafel:** `Tab` halten zeigt Abschüsse, Tode und Support aller Spieler.
- **Unten rechts:** Waffendock mit gemalten Kacheln für die Slots 1–3, Munition, Nachladen
  und die Fähigkeiten Q / E / T mit Abklingzeit.
- **Mitte:** Fadenkreuz, Treffermarker und Comic-Wörter wie BOING!, PLING!, PENG! oder PLATSCH!
  bei Treffern, Kopftreffern, Abschüssen und Wasser.
- **Nach dem Tod:** rotes Banner mit dem Namen des Gegners, Live-Killer-Cam und eine
  Wiedereinstiegsuhr.

`F1` öffnet die Netzwerk- und Engine-Telemetrie: Verbindung, Renderer (WebGPU/WebGL2), FPS,
Server-Tick, Ping, Spielerzahl, Position, Geschwindigkeit, unbestätigte Eingaben,
Vorhersage-Korrektur, Draw Calls, aktive Meshes sowie die aktuelle Musik und deren BPM.
Sie ist für Playtests und Fehlersuche gedacht, nicht für den normalen Spielbetrieb.
Der aktive Renderer steht außerdem auf dem Ladebildschirm.

---

## 14. Sprache

Oben rechts im Fenster steht der Umschalter **EN | DE** – im Menü, auf dem Ladebildschirm und
in der Pause (während des Spiels gehört die Ecke dem Kill-Feed). Die Umschaltung wirkt sofort
auf Menü, Ladebildschirm, Einsatzbildschirm, HUD, Pause, Garderobe, Fehlermeldungen und
Telemetrie. Die Auswahl wird im Browser gespeichert und beim nächsten Öffnen wiederhergestellt.

---

## 15. Pause, Menü und Einstellungen

- `Esc` gibt die Maus frei und öffnet die Pause.
- **„Zurück zum Fjord“** setzt das Spiel fort und fängt die Maus erneut ein.
- **„Hauptmenü“** beendet die Runde und kehrt zum Menü zurück.
- Im Pausenmenü lassen sich Garderobe, Audio-Einstellungen, Bildqualität und das Feldhandbuch
  öffnen. Das Feldhandbuch zeigt die Tasten passend zur gewählten Klasse.
- Der Sprache-Schalter ist in der Garderobe ausgeblendet, damit er den Schließen-Button
  nicht überdeckt. Wird die Garderobe aus der Pause geöffnet, ist auch das HUD ausgeblendet.
- **Bildqualität** (Einstellungen im Hauptmenü und in der Pause): **Automatisch**, **Hoch**,
  **Mittel** oder **Niedrig**. Sie regelt Pinselstrich-Malpass, Tuschekonturen, Schatten,
  Oberflächendetails und Renderauflösung. „Automatisch“ wählt eine Stufe passend zum
  Grafikchip und schaltet auch während des Spiels bei anhaltender Überlast stufenweise
  herunter. Kurze Ladehänger lösen keinen Wechsel aus; manuell gewählte Stufen bleiben erhalten.
  Die 3D-Auflösung ist auf höchstens 1440p (Hoch), 1080p (Mittel) beziehungsweise 720p
  (Niedrig) begrenzt; die Oberfläche bleibt scharf. Das Rendering ist auf 60 Bilder/s begrenzt
  und setzt in unsichtbaren Tabs aus. Die Wahl wird auf dem Gerät gespeichert.

---

## 16. Bekannte Einschränkungen

Dieser Build ist ein Test-Build. Bewusst **noch nicht** enthalten:

- **Rest von M5:** Schleppliftfahrt, Alpine Coaster, Hängematten-Katapult, das
  Verhalten der NPC-Kuh sowie Doppeldecker, Ruderboot und Gondel. Stationen, Masten und Bahn
  stehen schon als Kulisse in der Karte. Die großen Verwandlungen der Wettertürme und
  Wettereffekte wie Schneegrenze und Schneesturm folgen später.
- **Fahrzeuge reparieren** geht noch nicht.
- **Neue prozedurale Ersatzfiguren (Paket 1E)** wurden zurückgestellt; jede Klasse zeigt
  bereits ihr gemaltes Modell.
- **Hot Beach Girl:** Ihre vollständige Ausnahme vom gemalten Nachbearbeitungs-Look fehlt
  noch; sie bekommt weiterhin die Silhouetten-Tusche und die Farbabstimmung.
- **Zerstörung (M6)** und **Meta-Systeme (M7)** sind noch nicht begonnen.

Bekannte Fehler:

- Kollisionsboden und sichtbares Gelände teilen steile Geländezellen entlang
  unterschiedlicher Diagonalen (bis zu etwa 3,7 m Unterschied). An steilen Hängen können
  Füße deshalb schweben oder einsinken.
- Das Startdeck des Alpine Coasters ragt etwa 2,5 m in die Panzerstraße.
- Ein Boot, das ganz aufs trockene Sandufer gefahren wurde, bleibt stecken. Aussteigen: Nach
  10 s lässt es die Luft raus und erscheint neu.
- Reine Bot-Runden fallen eher für die Lagunen-Liga aus (etwa 6 : 14 Runden im Dauertest).
- Hält die Lagunen-Liga Turm C, sieht man von ihren Gipfel-Pads auf die Basis-Pads der
  Gipfel-Garde.
- Die Karte ist aufwendig (über 1,3 Millionen Dreiecke) und kann auf schwächeren Grafikchips
  ruckeln. Dann die Bildqualität auf **Niedrig** stellen (oder `?quality=low` anhängen).

---

## 17. Fehlerbehebung

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

### Das Spiel ruckelt

- In den Einstellungen die **Bildqualität** auf **Mittel** oder **Niedrig** stellen.
- Für einen schnellen Vergleich ohne die gespeicherte Wahl zu ändern:
  <http://localhost:5173/?quality=low>.

### Test-Optionen in der Adresszeile

Diese Zusätze an <http://localhost:5173/> helfen beim Eingrenzen von Grafikfehlern (mehrere
mit `&` verbinden, z. B. `?renderer=webgl2&quality=low`):

| Zusatz | Wirkung |
| --- | --- |
| `?renderer=webgl2` | WebGL2 statt WebGPU |
| `?quality=auto`, `high`, `medium` oder `low` | Bildqualität nur für diese Sitzung |
| `?painted=0` | ohne gemalte Modelle: Soldaten als prozedurale Figur, Fahrzeuge als Platzhalter |
| `?mascotModels=off` | prozedurale Kuh und Kokosnuss statt der Meshy-Modelle |
| `?coconutShell=painted`, `meshy` oder `vertex` | Variante der Kokosnuss-Schale (Standard `painted`) |
| `?lei=procedural` | prozedurale statt gemalter Blumenkette an der Kokosnuss |
| `?cowWalk=clip` | Meshy-Laufanimation der Kuh statt des berechneten Gangs |

### Ports sind belegt

```bash
bun run stop
```

### Build, Typecheck oder Tests schlagen fehl

```bash
bun run typecheck
bun run build
bun run test
```

Die erwartete einzige Warnung ist Rapiers Hinweis zu Initialisierungsparametern; er ist
harmlos.

---

## 18. Fehler melden

Damit sich ein Fehler nachstellen lässt, hilft beim Melden:

- **Was** ist passiert, und was hättest du erwartet?
- **Wo:** der Kartenbereich oben links im HUD (z. B. „Dorfplatz“) und, falls möglich, die
  Position aus der Telemetrie (`F1`).
- **Womit:** Klasse und Fraktion, ob du in einem Fahrzeug gesessen hast, und welcher Turm wem
  gehörte.
- **Technik:** Renderer (WebGPU oder WebGL2, steht in der Telemetrie und auf dem
  Ladebildschirm), Bildqualität, Browser und eventuelle URL-Zusätze.
- Ein **Screenshot** der Szene und der Telemetrie (`F1`) sowie rote Meldungen aus der
  Browser-Konsole (Chrome/Edge: `Cmd` + `Option` + `J`; Safari: `Cmd` + `Option` + `C`, wenn
  das Entwickler-Menü aktiviert ist).
- Bei Grafikfehlern: Tritt er auch mit `?renderer=webgl2`, `?quality=low` oder `?painted=0`
  auf?

---

## 19. Projektstruktur

```text
apps/client/      Svelte 5, Vite, Babylon.js, prozedurales Web Audio, gemalte Modelle und Grafiken
apps/server/      Bun-Server, autoritative Simulation, Binärprotokoll, Tests
packages/shared/  Konfiguration, Physik, Protokoll, Typen, EN/DE-i18n
scripts/          Startskript, Modell-Optimierer (`bun run models`), Skript-Tests
art-src/          unveränderte Quellen des Projektinhabers (Meshy, Gemini, gemalte Welt)
```

Weitere Dokumente:

- [`README.md`](README.md) — GitHub-Übersicht und Meilenstein-Status
- [`game-decisions.md`](game-decisions.md) — vollständiges Design- und Entscheidungsprotokoll
- [`CLAUDE.md`](CLAUDE.md) — technische Arbeitsnotizen für Agenten und Entwickler

---

## 20. Lizenz und Assets

Dieses Projekt ist ein Original-Clean-Room-Projekt. Es enthält keine Battlefield/EA- oder
sonstigen Fremd-Assets, Namen, Karten, Sounds oder kopierten Kompositionen. Gelände, Gebäude,
Props, Heldenwaffen und Effekte werden prozedural erzeugt. Die einzigen externen Dateien
stammen vom Projektinhaber:

- die fünf Musikstücke in `apps/client/public/audio/`,
- KI-generierte 2D-Grafik in `apps/client/public/art/` (Titelbild, Ladebildschirm-Motive,
  gemalte Waffen- und Fähigkeitskacheln, Comic-Wörter, Fraktionswappen, Kokosnuss-Gesichter
  sowie die Sprites, Fassaden, Bodentexturen, Decals, das Panorama und die Wolken der gemalten
  Welt); fehlt eine Datei, zeichnet das Spiel stattdessen prozedurale Grafik, SVG-Symbole bzw.
  CSS-Schrift,
- die mit Meshy erzeugten 3D-Modelle in `apps/client/public/models/` (Soldaten, Wanderinnen,
  Maskottchen, Huhn und Fahrzeuge; Quellen in `art-src/meshy/`); fehlt ein Soldaten-,
  Maskottchen- oder Fahrzeugmodell, erscheint die prozedurale Figur bzw. ein Platzhalter (die
  Wanderinnen gibt es nur als gemalte Modelle),
- sowie die eingebundenen Schriften Luckiest Guy (Apache 2.0) und Fredoka (SIL OFL 1.1).

Die vollständige Liste steht in [`CREDITS.md`](CREDITS.md).


### Klarer 3D-Look und Laptop-Budget (26. Oktober 2026)

Auf Wunsch des Besitzers wurden Grafik und Dauerlast nach dem M5-Kern-Test überarbeitet. BFH dient ausschließlich als Referenz für klare Silhouetten und weich beleuchtete 3D-Formen; fremde Modelle oder Texturen werden nicht übernommen. Der Vollbild-Kuwahara-Malfilter entfällt vollständig. Zwei feste Nachbearbeitungsschritte (feine Konturen/Farbkorrektur und FXAA) ersetzen den bisherigen Dreieraufbau; Korn, Nachschärfen und Konturwackeln entfallen. Der Tiefen-/Normalenpuffer arbeitet mit halber Breite und Höhe (ein Viertel der Pixel). Materialbeleuchtung wird weicher, Modell-Normalmaps zurückhaltender und Textur-Mipwahl weniger überschärft. Der Kamera-Blickwinkel beträgt 62 Grad. Die sichtbare Terrain-Triangulierung stimmt nun mit Rapier überein, damit Figuren auf steilen Zellen nicht schweben oder einsinken. Die Physik bleibt unverändert.

Apple-GPUs starten automatisch auf Mittel. In den Grafikeinstellungen sind 30/45/60 FPS wählbar und gespeichert; Standard 45 FPS, Menüs höchstens 30 FPS. Niedrig behält bis zu 1600×900 Bildpunkte für bessere Lesbarkeit. Die automatische Qualitätsregelung berücksichtigt das gewählte FPS-Limit, damit absichtlich sparsame 30 FPS nicht als Überlast gelten. Diese Änderungen ersetzen die entsprechenden früheren Angaben zu Malfilter, 720p und 60 FPS-Standard. Weitere Meilenstein-Funktionen bleiben pausiert.

Das eigene Detailmodell wird bereits hinter dem Menü mit der vom Server zugewiesenen Fraktion angefordert. Die bedarfsgesteuerte Prüfung des Kamerabilds bleibt auf entfernte Figuren beschränkt. Dadurch muss die lokale Figur nicht erst mehrere sichtbare Frames als einfacher Platzhalter verbringen. Der Browservergleich prüft ausdrücklich das geladene Detailmodell. Das behebt die Ladeverzögerung; die mitgelieferten Modellgeometrien wurden dabei nicht neu modelliert.


### Räumlicher Boden (26. Oktober 2026)

Der Besitzer hat die flach wirkenden Bodentexturen beanstandet. Das Dorfpflaster bekommt daher echte, niedrig profilierte Steine mit abgeschrägten Kanten. Vier kleine, gemeinsam instanzierte Steingeometrien und ein Mörtelbett bilden das Pflaster; die Steine sind statisch und höchstens fünf Zentimeter höher als der Physikboden. Brunnenzugang und Spawnflächen bleiben frei. Außerhalb von 42 Metern entfällt die zusätzliche Geometrie. Die kleinen Steine werden nur im Farbdurchlauf gerendert; ihre Flächennormalen und abgedunkelten Fasen liefern die lokale Schattierung. Sie werden nicht erneut in die Schatten- oder Konturpässe geschickt.

Pflasterwege, Schnee, Sand und weitere Terrainlagen bekommen außerdem eine distanzabhängige Beleuchtungsnormalen-Variation aus den bereits gefilterten Materialfarben. Sie läuft in GLSL und WGSL ohne zusätzliche Texturabfragen, Materialtexturen oder Vollbildpass; steile Oberflächen und entfernte Details werden ausgeblendet. Das ergänzt das vorhandene Schnee-/Sandwellen-Shading. Die Gelände- und Spielfigurenphysik bleibt unverändert; das Mikrorelief ist rein visuell.


### Solide Karte und ruhigere 3D-Darstellung (26. Oktober 2026)

Auf den weiteren Spieltest des Besitzers hin wurden die stufigen Konturen und unvollständigen Kollisionen überarbeitet. Der halb aufgelöste Konturpuffer wird weich rekonstruiert; die Linien sind zurückhaltender und blenden früher aus. Runde Metallmasten verwenden mindestens zwölf Umfangssegmente. Mittel/Hoch glätten die eigentlichen Geometriekanten zusätzlich mit zwei MSAA-Samples unter WebGL2 beziehungsweise vier unter WebGPU (dessen API keine zwei unterstützt). Niedrig bleibt bei einem Sample. Die zwei Nachbearbeitungspässe, Pixelbudgets, 45-FPS-Vorgabe und dauerhafte Lastregelung bleiben erhalten. Dies ersetzt die frühere Aussage, dass MSAA auf allen Stufen abgeschaltet sei.

Die vorhandenen GLB-Figuren erhalten kontinuierliche Lichtverläufe und deutlicheres, in der Entfernung ausgeblendetes Normalmap-Relief. Die zugrunde liegenden Modelle werden nicht durch fremde Assets ersetzt. Frei kombinierte Oberteile, Hosen und Schuhe verwenden weiterhin den dafür vorgesehenen Baukasten-Körper; in der Garderobe führt „Gemaltes Outfit“ zum mitgelieferten Detailmodell zurück.

Begehbare Bäume, Palmen und Felsen sind nun räumliche Geometrien statt kameradrehender Bilder. Räumliche Gruppen wechseln nach 145 Metern auf einfachere 3D-Modelle; die Fernmodelle und Laubdetails erzeugen keine zusätzlichen Konturen. Kontaktschatten verankern sie am Boden. Bildflächen bleiben für kleines Boden-Dekor und den Hintergrund außerhalb der begehbaren Karte erhalten. Felsen sind auf die vorhandenen festen Kollisionsmaße abgestimmt. Rote Geländer an Land und Bojen im Wasser kennzeichnen die bestehende Kartenkante.

Wegzäune besitzen jetzt feste, dem Verlauf folgende Kollisionskörper. Kistenstapel werden auf Client und Server aus denselben Einzelteilen gebaut, einschließlich oberer Kisten und ihrer Drehung. Auch die allgemeine Höhenabfrage für Objektplatzierung folgt jetzt derselben Dreiecksaufteilung wie sichtbarer Boden und Rapier; die bisher verbliebene Abweichung auf steilen Zellen entfällt. Diese Korrekturen betreffen die bestehende Testkarte, nicht neue Meilenstein-Spielmechaniken.


### Gemalte Pflastertextur als 3D-Relief (26. Oktober 2026)

Nach dem weiteren Feedback des Besitzers entfallen die wiederholten Einzelstein-Grundformen. Das Relief wird stattdessen aus den gezeichneten Fugen und Steinflächen der unveränderten `art/tex/cobblestone_color.jpg` abgeleitet. Farbe und Geometrie verwenden dieselbe zwei Meter große Kachel und dieselben Koordinaten. So bleiben die unterschiedlichen Konturen und Pinselstriche erhalten; Fugen liegen tiefer und die Steinflächen steigen weich an. Eine zurückhaltende Höhenvariation über den Platz verhindert gleich hohe Steinflächen.

Eine gemeinsame, statische Bodenfläche ersetzt die vier Steinvarianten und das separate Mörtelbett. Sie bleibt unter 240.000 Dreiecken, verwendet nur einen zusätzlichen Farbdurchlauf und keine zusätzlichen Texturen. Der spezielle Pflastershader liest die vorhandene gemalte Farbkachel direkt, ohne die zusätzlichen allgemeinen Materialmuster darüberzulegen. Entfernungsausblendung bei 42 Metern, höchstens fünf Zentimeter Abstand zum Physikboden und freie Brunnen-/Spawnflächen bleiben erhalten. Das ersetzt die frühere Beschreibung des Bodens aus vier instanzierten Stein-Grundformen. Die 64×64-Höhentabelle lässt sich mit `python3 scripts/bake-paving-relief.py` (Pillow) reproduzieren; ein Test prüft den SHA-256 der unveränderten Quelltextur.


### Konfigurierbare, animierte Figuren (26. Oktober 2026)

Auf ausdrücklichen Wunsch des Besitzers wurde die Figurendarstellung im bestehenden Test-Build überarbeitet. Die sechs Soldaten verwenden weiterhin ihre mitgelieferten GLB-Skelette und Bewegungsclips, bekommen aber einen gemeinsamen, vollständig konfigurierbaren Körper. Oberteil, Hose und Schuhe lösen keinen Wechsel auf das alte starre Ersatzmodell mehr aus. Alle sieben Kleidungsbereiche, zwölf Hauttöne, acht Haarfarben, sieben Frisuren und der Körperbau beeinflussen die tatsächliche Geometrie beziehungsweise deren Farben. Vorschau, eigene Spielfigur und Mitspieler verwenden denselben Aufbau. Drifter und Maskottchen behalten ihre eigenen festen Formen.

Gesicht mit Kiefer, Augen, Nase und Ohren, einzelne Finger, Bartsträhnen, runde Gliedmaßen, Kragen, Gürtel, Knöpfe, Hosennähte und Stiefelschnürung sind räumlich ausgearbeitet. Kleidung, Haare, Haut und Accessoires werden in einem einzigen animierten Körpermesh zusammengeführt. Die vorhandenen Waffenposen, IK, Rollen und Bewegungsclips bleiben erhalten; konservative Knochenhüllen berücksichtigen bei Rollen auch die ausgewählte Kopfbedeckung. Für Soldaten entfallen die ungenutzten großen gemalten Körpertexturen. Ein auf zwölf Varianten pro Szene begrenzter Geometrie-Cache beschleunigt wiederholte Kombinationen, ohne pro Kleidungsstück eigene Draw Calls oder neue Vollbildfilter einzuführen.

Die Garderobe bezeichnet den Standard-Reset jetzt als „Standardkleidung anziehen“. Haut- und Haarfarbfelder haben eindeutige Beschriftungen, auch für Tastatur-/Screenreader-Bedienung. Die bestehende Profil-Speicherung und binäre Übertragung bleiben erhalten. Dies ersetzt die frühere Aussage, dass frei kombinierte Oberteile, Hosen und Schuhe nur am einfachen Baukasten-Modell dargestellt werden. Neue M5-Spielmechaniken bleiben pausiert.

Schnelle Mehrfachklicks auf Frisur- und Kleidungspfeile lesen den aktuellen Auswahlwert, statt einen noch nicht aktualisierten UI-Zwischenstand wiederzuverwenden. „Glatze“ erzeugt auch unter Hüten keinen zusätzlichen Haarbüschel. Validierung: 230 automatisierte Tests (10 Skript-, 171 Server-, 49 Client-Tests), TypeScript/Svelte ohne Fehler oder Warnungen und erfolgreicher Produktionsbuild. WebGL2-Browsertests prüfen Vorschau, alle sieben Kleidungsbereiche, Haut-/Haarwahl, Körperbau, Speicherung nach Neuladen, die eigene Figur, eine über das echte binäre Protokoll verbundene Mitspielerfigur und schnelle Auswahlwechsel ohne Konsolenfehler. Der neue Materialshader wurde außerdem unter WebGPU kompiliert. Die Cloud verwendet Software-Rendering; native Mac-FPS und Wärmeentwicklung wurden damit nicht gemessen.


### Fortsetzung der Entwicklung (26. Oktober 2026)

Der Besitzer hat die Testpause aufgehoben. Die restlichen Funktionen von M5 werden nun fertiggestellt und geprüft; danach folgen M6, M7 und M8 in dieser Reihenfolge. Der genaue Arbeitsstand steht in `MILESTONE_WORK.md`. Bestehende Beschreibungen des pausierten Test-Builds dokumentieren den vorherigen Stand.

### Ruderboote und Reparaturen (M5-Fortsetzung)

An den drei Hafenstegen und unter dem Wasserfall stehen vier Ruderboote für je
zwei Personen. F steigt ein/aus, C wechselt den Platz. W/S rudert, A/D lenkt.
Allein fährt das Boot bis 8 m/s. Tippt zu zweit W gemeinsam an, wenn der Taktbalken
neu beginnt (alle 0,8 Sekunden), für Ruderschläge mit bis zu 16 m/s. Umschalt
löst diesen Sprint nicht aus. Das Boot hat 200 Strukturpunkte und erscheint nach
Zerstörung nach 20 Sekunden wieder. Die Ruder des gemalten Bootsmodells bewegen
sich während der Fahrt; die Taktanzeige sagt, ob ein zweiter Ruderer fehlt.

**X halten** repariert nahe eigene Fahrzeuge mit 40 Strukturpunkten pro Sekunde,
solange sie höchstens 3,5 Meter entfernt und nicht hinter einer Wand stehen.
Reparaturen funktionieren auch in Passagierplätzen mit freien Händen. Fahrer,
die beide Hände zur Steuerung brauchen, können nicht gleichzeitig reparieren.
Beim Reparieren kann nicht geschossen werden. **E bleibt deine Klassenfähigkeit.**

Validation (27 October): 237 automated tests pass (10 scripts, 177 server, 50 client), strict typecheck reports zero errors/warnings, and all production bundles build. The WebGL2 browser test checks the painted hull and moving oars, short-tap boarding, movement, rhythm HUD and actual repair (130 to 137 HP), with no console errors. Short action taps now survive slow render frames until consumed by simulation; inputs in text fields are ignored. No native Mac heat/FPS measurement is claimed.

### Doppeldecker (M5-Fortsetzung, 27. Oktober 2026)

An der Lagune und auf der Gletscherpiste steht je ein Doppeldecker mit 320
Strukturpunkten. F steigt ein, C wechselt zwischen Pilot und den beiden Plätzen
auf den oberen Tragflächen. W beschleunigt, S reduziert das Tempo; ab etwa
14 m/s mit der Maus die Nase anheben. Die Maus steuert Richtung und Neigung,
A/D unterstützt mit dem Seitenruder. Das Höchsttempo beträgt 28 m/s.

Der Pilot feuert mit der linken Maustaste das feste Bord-MG nach vorn (15 Schaden
pro Treffer, 500 Schuss pro Minute). Auf den Flügeln könnt ihr die eigenen Waffen
benutzen und mit X das Flugzeug reparieren. **Leertaste springt mit Schwung ab**;
der vorhandene Notschirm hilft bei einem langen Sturz. Sanft auf Wasser oder
flachem Boden aufsetzen: steile, schnelle Einschläge zerstören das Flugzeug.
Der laufende Propeller schleudert gegnerische Soldaten mit einer rußschwarzen
Comic-Explosion fort. Die eigene Fraktion bleibt davon verschont.

Geprüfter Stand: 244 automatisierte Tests erfolgreich, TypeScript/Svelte ohne
Fehler oder Warnungen und erfolgreicher Produktionsbuild. Der WebGL2-Spieltest
prüft Einsteigen, Abheben mit Pilot und Flügelpassagier, Schießen und Abspringen
über das echte Netzwerkprotokoll ohne Konsolenfehler. Die Cloud rendert per
Software; Temperatur und Bildrate auf einem Mac wurden hier nicht gemessen.

### Beifahreransicht und Fahrzeugposen (27. Oktober 2026)

Im Beiwagen wechselt **V** zwischen der Außenansicht und deiner Sitzperspektive.
Mit der Maus kannst du dich frei umsehen und deine eigenen Waffen benutzen.
Hände, Hautfarbe, Handschuhe und Waffe folgen deiner Garderobe. **X halten**
zeigt den Schraubenschlüssel und repariert das Motorrad; dabei kannst du nicht
schießen. Die Fahrzeuganzeige steht in dieser Ansicht oben, damit sie die Hände
nicht verdeckt. Beim Aussteigen oder Platzwechsel wird die Außenansicht
wiederhergestellt. In Garderobe und Menü werden die Hände ausgeblendet.

Figuren sitzen jetzt mit gebeugten Knien, halten die Steuerung beziehungsweise
die Ruder und stemmen sich auf Flugzeugflügeln gegen den Fahrtwind. Der Körper
folgt der Flugzeugneigung. Die Schusshöhe berücksichtigt die tiefere Sitzposition;
die eigene Fahrzeughülle fängt deine Beifahrerschüsse nicht mehr ab.

Geprüfter Stand: 248 Tests erfolgreich (10 Skript-, 185 Server-, 53 Client-Tests),
TypeScript/Svelte ohne Fehler oder Warnungen und erfolgreicher Produktionsbuild.
Der WebGL2-Spieltest prüft V, die bemalte Beiwagen-Innenseite, Hände und Waffe,
Schraubenschlüssel und tatsächliche Reparatur sowie Rückkehr zur Außenansicht
und Garderobe ohne Konsolenfehler.

### Neues Zielbild und Seilbahn (27. Oktober 2026)

Das aktuelle Ziel ist der zuletzt gesendete Screenshot mit Spielernamen. HUD, klareres
Cel-Shading, verschneite Schluchtufer, blaugraue Felsflächen und die niedrigere Seilbrücke
sind daran angepasst. Die Trachtenweste ist grün mit weißen Ärmeln; neue beziehungsweise
zurückgesetzte Allrounder tragen braunen Bart, Kuckucksuhr und rote Skistiefel. Gespeicherte
Kleidung, Haut- und Haarwahl bleiben erhalten. Figurenproportionen und Kartenbild sind noch
kein exakter Treffer. Die gemalte Pflastertextur bleibt als echtes niedriges 3D-Relief erhalten.

Zwei rote Gondeln fahren gegeneinander über Tal-, Mittel- und Bergstation. Sie halten
dort jeweils drei Sekunden. Mit **F** ein-/aussteigen, mit **H** zwischen Innenraum und
Dachplätzen wechseln. Innen bist du geschützt; auf dem Dach kannst du mit deiner Waffe
schießen. **C/Strg** lässt dich dort hocken und festhalten. Ein Ausstieg in der Luft ist
ein echter Fall; der normale Notschirm bleibt verfügbar.

Mit **F am Stationshebel** oder einem Treffer mit einer direkt treffenden Schusswaffe
löst du die Notbremse aus. Beide Kabinen halten zwei Sekunden an und schaukeln. Wer auf
dem Dach steht, wird abgeworfen; wer hockt oder innen sitzt, bleibt dabei. Die Gondeln
sind unzerstörbar und werden leer nicht abgeschleppt. Bots benutzen sie noch nicht.

Die Minimap zeichnet keine zweite 3D-Szene. FPS-Limit (standardmäßig 45), automatische
Lastregelung und zwei Nachbearbeitungsschritte bleiben erhalten. Native Mac-FPS und
Temperatur wurden in der Cloud nicht gemessen.

Geprüft am 27. Oktober: 255 automatisierte Tests (10 Skript-, 189 Server- und
56 Client-Tests), TypeScript/Svelte ohne Fehler oder Warnungen und erfolgreiche
Produktionsbuilds. WebGL2 prüft das echte HUD, Spielernamen, Gondelfahrt, Sitzwechsel,
Hocken, Ausstieg und Notbremsereignisse ohne Konsolenfehler. Fünf Materialvarianten
kompilieren unter WebGPU fehlerfrei. Die bewegten Gondel-/Ersatzboot-Meshes folgen
ihren Halterungen; Regressionstests prüfen Rumpfbewegung und Ruderdrehung.
Cloud-Rendering verwendet Software; native Mac-FPS und Temperatur sind nicht gemessen.

### Schulterperspektive und Zielen (27. Oktober 2026)

Die Figur steht größer und weiter links im Vordergrund wie im Zielbild. An einer Wand
zieht die Kamera seitlich ein; nach einem Positionssprung bleibt kein alter Kameraschwung
übrig. Der Schuss läuft jetzt zum Punkt unter dem Fadenkreuz statt parallel daneben.
Der Server berechnet den Treffer weiterhin vom echten Auge aus: Hinter einer Deckung
kannst du deshalb nicht durch die Wand schießen. Auch die sichtbare Spur vom Waffenlauf
zeigt zum Zielpunkt. Projektile überspringen keine unmittelbar davor liegende dünne Wand
mehr. Tasten, Bildwinkel, Bildratenlimit und Bildqualität bleiben gleich.

Geprüft: 262 Tests bestanden (10 Skript-, 192 Server-, 60 Client-Tests), saubere
Typprüfung und erfolgreicher Build. Im WebGL2-Browser auf „Mittel“ trifft die neue
Zielberechnung einen echten Mitspieler (150 → 122 HP), ohne Konsolenfehler. Ein
exakter grafischer Treffer zur Vorlage ist weiterhin nicht erreicht.

### Figuren, Uhr und Stiefel (27. Oktober 2026)

Die Körper sind kräftiger und die grüne Weste folgt räumlich der Brustform. Der
Kuckucksrucksack hat ein sichtbares Zifferblatt, Stundenmarken, Zeiger, ein richtiges
Giebeldach und Gewichte. Die hohen Skistiefel zeigen Schäfte, Riemen und Schnallen;
bedeckte Hosenbündchen ragen nicht mehr durch die Stiefel. Der Übergang zwischen
Schienbein und Fuß verhindert verdrehte Schnallenflächen. Für das Referenz-Outfit
beim Allrounder in der Garderobe **„Standardkleidung anziehen“** wählen.

Der Standardkörper hat ungefähr 44.000 Dreiecke in einem animierten Körpermesh. Es
kommen keine neue Textur und kein zusätzlicher Vollbildfilter hinzu. Die WebGL2-
Detailkontrolle ist fehlerfrei. Der zusätzliche komplette WebGPU-Figurentest scheitert
in der Cloud an der Adapter-/Pufferinitialisierung, auch bei kleiner Bildgröße. Das
ist kein bestandener WebGPU-Spieltest; native Mac-FPS und Temperatur sind ungemessen.

Geprüfter Stand: 266 Tests bestanden (10 Skript-, 192 Server-, 64 Client-Tests),
TypeScript/Svelte ohne Fehler oder Warnungen und erfolgreiche Produktionsbuilds.
Die animierte WebGL2-Nahaufnahme ist ohne Konsolenfehler. Der Knöcheltest erkennt
die frühere falsche Flächenrichtung und besteht mit der korrigierten Bindung.

### Verschneite Schlucht und Aussicht (27. Oktober 2026)

Östlich der Hängebrücke erreichst du vom Dorf aus einen erhöhten Schneevorsprung.
Das Holzgeländer sichert die Kante; seine Kollision folgt jetzt auch auf gewölbtem
Boden den sichtbaren Pfosten. Das nördliche Chalet steht weiter zurück auf einem
festen Absatz und hat waagerechte Holzbretter sowie einen seitlichen Balkon.
Die Schlucht ist bis zum Talboden verschneit, die Brücke hängt stärker durch und
bleibt begehbar. Große Tannen verdecken den Kampfbereich nicht mehr. Die Bot-Route
führt am versetzten Haus und den Dorfmauern vorbei.

Client und Server müssen wegen der geänderten Karte gemeinsam aktualisiert werden
(Protokoll 12); eine bereits offene ältere Spielseite bitte neu laden. Es kommen
keine neuen Texturen oder Vollbildfilter hinzu. Die bisherigen Qualitätsstufen und
das Standardlimit von 45 FPS bleiben erhalten. Die Vorlage ist noch nicht exakt erreicht.

Geprüft: 271 Tests bestanden, TypeScript/Svelte ohne Fehler oder Warnungen und
erfolgreiche Produktionsbuilds. Die abschließende WebGL2-Kontrolle auf „Mittel“
zeigt die echte Karte und verbundene Testspieler ohne Konsolenfehler.
[Aktueller Spielausschnitt](docs/qa/gorge-reference-2026-10-27.png).
Temperatur und Bildrate auf einem echten Mac wurden hier nicht gemessen.

### Figuren und sauberere Konturen

Die vorherige Grafik entspricht noch nicht der geforderten Vorlage. In diesem
Schritt verschwinden die Hautspitzen an den Skistiefeln: Verdeckte Unterschenkel
werden ausgelassen und lange Flächen vor dem Binden ans Skelett unterteilt. Das
Trachtenhemd hat hochgekrempelte Ärmel; die gewählte Hautfarbe bleibt sichtbar.
Die Hutkante ist runder, die Figurenbeleuchtung verläuft weicher und die Konturen
nutzen die bereits geglättete Bildkante statt einer zusätzlichen groben Tiefenkante.
Der Schnee zeigt weniger Sprenkel und ruhigere Farbdetails. Steintexturen und
Bodenrelief bleiben erhalten. Es kommt kein zusätzlicher Vollbildfilter hinzu.
Das Referenzziel ist weiterhin in Arbeit; die bisherigen Bildratenlimits bleiben.

Geprüft: 273 Tests bestanden, saubere Typprüfung und erfolgreiche Produktionsbuilds.
Sechs Shader-Varianten kompilieren unter WebGPU; der vollständige native Cloud-
Spieltest scheitert weiterhin am bekannten Cloud-GPU-Fehler. WebGL2-Nahaufnahme und
[Spielbild in Referenzauflösung](docs/qa/field-quality-1280.png) sind ohne Browserfehler.
[Vorher](docs/qa/figure-quality-before.png) und [nachher](docs/qa/figure-quality-after.png)
zeigen die Modelle in unterschiedlichen Ruheposen. Die Vorlage ist noch nicht erreicht.


### Modellierte Figuren und neue Feldweste

Gesichter haben jetzt eine zusammenhängende Form mit eingelassenen Augen und
Lidern. Arme sind durchgehend modelliert; verdeckte Haut und Hosenabschlüsse
werden unter geschlossenen Westen beziehungsweise Stiefeln ausgelassen. Haut
glänzt weniger, Stiefelsohlen sind runder. Die gewählte Hautfarbe bleibt erhalten.
Die Felswände zeigen ruhigere Flächen und Texturen bei unverändertem 3D-Relief.

In der Garderobe ist die **„Ärmellose Feldweste“** mit Taschen und Schulterlaschen
auswählbar. Neue beziehungsweise zurückgesetzte Heavy-Figuren tragen sie mit
Glatze, freien Armen, olivgrüner Hose und Bergstiefeln. Bestehende Figuren bleiben
erhalten. Für den neuen Heavy-Look dort **„Standardkleidung anziehen“** wählen;
Fassrüstung, Topfhelm und alle bisherigen Kleidungsstücke bleiben auswählbar.

Client und Server benötigen nun Protokoll **13**; ältere offene Spielseiten neu
laden. Kein zusätzlicher Vollbildfilter, keine neue Textur und kein höheres
Bildratenlimit wurden hinzugefügt. [Figurenansicht](docs/qa/reference-heavy-vest.png)
und [Spielszene](docs/qa/reference-field-vest-1280.png) zeigen den aktuellen Stand.
Die vollständige Grafikvorlage ist weiterhin nicht erreicht. Mac-Temperatur und
Bildrate auf echter Hardware wurden hier nicht gemessen.

Geprüft für diesen Stand: **280 Tests bestanden** (10 Skript-, 198 Server- und
72 Clienttests), Typprüfung ohne Fehler oder Warnungen, Produktionsbuilds erfolgreich.
WebGL2-Figurenansicht und Spielszene laufen ohne Browserfehler. Unter WebGPU
kompilieren sechs isolierte Shader-Varianten; beim Abschluss der GPU-Aufträge
scheitert die Cloud-Umgebung weiterhin am Treiberfehler „external Instance“.
Ein vollständiger WebGPU-Spieltest und die Messung auf deinem Mac bleiben offen.


### Detailliertere Spielfiguren (28. Oktober 2026)

Gesichter erhalten ausgeprägtere Nasen-, Wangen- und Kieferformen sowie vertiefte
Augenpartien. Der Bart folgt als zusammenhängende Form dem Kiefer. Westen haben
räumliche Stofffalten, Nähte und anliegende Lederriemen. Der Tirolerhut hat eine
geformte Krone und eine geschwungene ovale Krempe. Köpfe, Stiefel und Schnallen
sind proportional kleiner; Lederhosen zeigen dezentere Ziernähte.

Die sichtbaren Finger bewegen sich jetzt mit den tatsächlichen Fingergelenken beim
Waffenhalten und Nachladen. Die Handflächen passen zum jeweiligen Skelett. Der
Fehler mit abstehenden nackten Armen wurde beim Zusammenführen der Modellteile
korrigiert. Handschuhe, Hakenhand, Uhr, Haar- und Hautfarben bleiben auswählbar.

Eine lokale Oberflächenschattierung betont Vertiefungen, ohne die gewählte Hautfarbe
zu ändern. Es gibt keinen zusätzlichen Vollbildfilter und kein höheres FPS-Limit.
Die Übereinstimmung mit der Grafikvorlage bleibt weiterhin in Arbeit.

Nach Neuladen der Spielseite erscheinen die überarbeiteten Modellformen auch bei
bereits gespeicherten Figuren; eine Rücksetzung der Garderobe ist dafür nicht nötig.
[Modellansichten](docs/qa/player-sculpt-2026-10-28.png) und
[echte Spielszene in 1280×714](docs/qa/player-field-2026-10-28.png) zeigen den Stand.
Die Testspieler sind verbunden, ihre Positionen für das Bild gestellt.

Geprüft: **283 Tests bestanden** (10 Skript-, 198 Server-, 75 Clienttests); nach
der letzten Riemenanpassung nochmals alle 75 Clienttests. Typprüfung ohne Fehler
oder Warnungen, Produktionsbuilds und frischer WebGL2-Spieleinstieg erfolgreich.
Sechs isolierte WebGPU-Shader kompilieren; der Abschluss der GPU-Aufträge scheitert
in Cloud weiterhin am Fehler „external Instance“. Der native Spieltest und echte
Mac-Messwerte bleiben offen. Die Körpermodelle haben nun 46.236 beziehungsweise
25.756 Dreiecke, jeweils in einem animierten Körpermesh. Die vollständige
Übereinstimmung mit der Grafikvorlage ist weiterhin nicht bestätigt.


### Detaillierte Originalmodelle und Garderobe

Passende Körperteile verwenden jetzt die detaillierten Meshy-Modelle: Gesicht,
Hände, Stofffalten, Lederhosen und Hut behalten ihre modellierten Formen und
gemalten Einzelheiten. Die gewählte Ausrüstung wird damit kombiniert; die
Körperteile bleiben gemeinsam animiert. Haut- und Haarfarben werden über eigene
Masken angepasst, ohne Hemd und Leder pauschal umzufärben.

Die Farbdaten werden pro Figurentyp gemeinsam geladen. Zusätzliche Vollbildfilter
oder höhere FPS-Limits kommen nicht hinzu. Bereits gespeicherte Figuren werden
nach Neuladen der Seite aktualisiert; eine Rücksetzung der Garderobe ist unnötig.
Einige Gesichts- und Haarkombinationen verwenden noch vollständige Ersatzteile.
Diese werden als Nächstes überarbeitet, besonders der glattrasierte Heavy. Die
Screenshotvorgabe ist damit weiterhin nicht abgeschlossen.


### Einheitliche Hautfarbe und Köpfe ohne Kopfbedeckung (28. Oktober 2026)

Die Hautfarbe gehört jetzt zur Grundfigur. Gesicht, Stirn, Kopfhaut, Arme und Hände
verwenden denselben ausgewählten Farbton. Hemd, Weste, Haare und Zubehör liegen als
eigene Farbbereiche darüber. Ein Kleidungswechsel verändert die Hautfarbe nicht.
Natürliche Licht- und Schattenunterschiede bleiben sichtbar.

Auch bei Glatze oder abgenommener Kopfbedeckung bleiben die modellierten Augen,
Nase, Ohren und Lippen erhalten. Der Kopf ist hinten und oben geschlossen. Der
Afro nutzt modellierte Locken und folgt der gewählten Haarfarbe. Alle bisherigen
Auswahlmöglichkeiten und gespeicherten Profile bleiben erhalten. Nach dem Update
die Seite neu laden. Die vollständige Übereinstimmung mit dem Zielbild bleibt in
Arbeit; besonders freiliegende Arme und weitere Kleidungsdetails werden verfeinert.

Die aktualisierten Figurenatlanten und Masken werden automatisch mit einer
Inhaltsversion geladen. Dadurch passen Hautdaten, Kleidung und Kopfgeometrie auch
nach einem Update zusammen. Die neue Frisur übernimmt zusätzlich das gemalte
Lockendetail des Originalmodells.
