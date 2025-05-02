# Text Adventure Builder 1.2b (Nederlandse Versie)

Een webgebaseerde applicatie voor het creëren van klassieke tekstgebaseerde avonturenspellen zonder programmeerkennis.

## Overzicht

Dit project biedt een grafische gebruikersinterface (GUI) om tekstavonturen te bouwen. Gebruikers kunnen:

*   Meerdere spelprojecten aanmaken, beheren en verwijderen.
*   Kamers ontwerpen met een visuele editor (lijst- en grafiekweergave).
*   Spelentiteiten definiëren zoals voorwerpen (items) en niet-speelbare personages (NPCs).
*   Gesprekken met NPCs creëren via een JSON-editor of grafische weergave.
*   Eenvoudige spellogica implementeren met triggers, condities en acties (scripts).
*   Afbeeldingen uploaden en beheren voor kamers, entiteiten en het spel zelf.
*   Hun spellen direct testen binnen de builder.
*   Spellen exporteren naar een ZIP-bestand (inclusief data en afbeeldingen) en importeren.
*   Spellen indienen bij de Adventure Store (indien geconfigureerd).

## Functies

*   **Spelbeheer:** Aanmaken, hernoemen, verwijderen en instellingen (naam, omschrijving, start/win afbeelding, versie) aanpassen van spellen.
*   **Kamer Editor:**
    *   **Lijstweergave:** Kamers toevoegen, verwijderen, hernoemen, beschrijvingen aanpassen en de volgorde (startkamer) bepalen via slepen en neerzetten. Afbeeldingen toewijzen.
    *   **Grafiekweergave:** Kamers visueel positioneren (slepen), verbinden via richtingen (noord, oost, etc.), en snel nieuwe kamers/entiteiten toevoegen via rechtermuisklik.
*   **Entiteiten Editor:**
    *   Items en NPCs aanmaken en beheren.
    *   Eigenschappen instellen: naam, beschrijving, type (ITEM/NPC), locatie (kamer of container), opneembaar (takable), container, mobiel (NPC), oppak-bericht (ITEM).
    *   Afbeeldingen en gesprekken (voor NPCs) toewijzen.
*   **Script Editor:** Definieer spelgedrag met:
    *   **Triggers:** Wanneer moet het script worden uitgevoerd (bv. `ON_ENTER`, `ON_TAKE(sleutel)`, `ON_COMMAND(open deur)`).
    *   **Condities (Optioneel):** Voorwaarden waaraan voldaan moet worden (bv. `HAS_ITEM(sleutel)`, `STATE(deur_open)==false`).
    *   **Acties:** Wat moet er gebeuren (bv. `SHOW_MESSAGE("De deur is open!")`, `GIVE_ITEM(schat)`, `SET_STATE(deur_open, true)`, `ADD_SCORE(10)`).
*   **Gesprekken Editor:** Maak interactieve dialogen voor NPCs met een JSON-structuur of een visuele grafiek. Definieer tekst van de NPC, keuzes voor de speler, en de volgende stap in het gesprek (inclusief acties).
*   **Bestandsbeheer:** Upload, bekijk, hernoem en verwijder afbeeldingen en andere bestanden in een mappenstructuur. Gebruikt voor kamer-, entiteit- en spelafbeeldingen.
*   **Speelmodus:** Test het spel direct in de browser. Voer commando's in, zie de uitvoer, beheer inventaris, en ervaar de gemaakte scripts en gesprekken. Sla de voortgang op, laad, of reset de sessie.
*   **Import/Export:** Exporteer een compleet spel (data + afbeeldingen) naar een ZIP-bestand. Importeer een spel vanuit een ZIP-bestand (handig voor delen of backups).
*   **High Scores:** Bekijk een overzicht van de hoogste scores per gebruiker en per spel.
*   **Admin Panel:** (Voor beheerders) Beheer gebruikers, systeeminstellingen (zoals thema, Adventure Store API Key), bekijk statistieken en comprimeer spelafbeeldingen.
*   **Adventure Store Submission:** (Voor beheerders) Dien een voltooid spel in bij de Adventure Store via de API.

## Tech Stack

*   **Frontend:** HTML, CSS, Vanilla JavaScript, D3.js (voor grafiekweergave)
*   **Backend:** Python (Flask)
*   **Database:** PostgreSQL (via Flask-SQLAlchemy)

## Projectstructuur

*   `/client`: Bevat de frontend code (HTML, CSS, JS, templates).
*   `/server`: Bevat de backend Flask applicatie, API endpoints, en databaselogica.
*   `/uploads`: (Binnen `/client`) Standaardlocatie voor geüploade bestanden (afbeeldingen etc.).
*   `/instance`: Bevat de ontwikkelingsdatabase (`dev_games.db` als SQLite gebruikt wordt) en andere instance-specifieke bestanden.

## Setup (Conceptueel)

1.  **Clone de repository:**
    ```bash
    git clone <repository-url>
    cd text-adventure-builder
    ```
2.  **Backend Setup:**
    ```bash
    cd server
    python -m venv venvw # Maak virtuele omgeving (gebruik python3 indien nodig)
    # Activeer de virtuele omgeving
    # Windows PowerShell: .\venvw\Scripts\Activate.ps1
    # Windows Command Prompt: venvw\Scripts\activate.bat
    # Linux/macOS: source venvw/bin/activate
    pip install -r requirements.txt
    # Stel omgevingsvariabelen in (bv. in een .env bestand in de server map)
    # FLASK_APP=app.py
    # FLASK_DEBUG=1
    # SECRET_KEY=jouw_zeer_geheime_sleutel # Houd dit geheim!
    # DATABASE_URL=postgresql://user:password@host:port/database # Nodig voor productie/testen met PostgreSQL
    flask db init # Als je Flask-Migrate voor het eerst gebruikt
    flask db migrate -m "Initial database schema" # Maak een migratiebestand
    flask db upgrade # Pas de migratie toe op de database
    flask run
    ```
3.  **(Optioneel) Initialisatie Ontwikkelingsdatabase:**
    *   Om de ontwikkelingsdatabase volledig te resetten (alle tabellen verwijderen en opnieuw aanmaken op basis van `models.py`), voer het initialisatiescript uit:
    ```bash
    python server/db_init.py
    ```
    *   **Waarschuwing:** Dit is een destructieve operatie en mag alleen in ontwikkeling worden gebruikt. Het gebruikt de connectiestring gedefinieerd in `config.py` (standaard PostgreSQL, of de `DATABASE_URL` omgevingsvariabele indien ingesteld). Het script vraagt om bevestiging. Het kan ook interactief vragen om een spel (`.zip`) te importeren vanuit de `server/games` map.
4.  **Frontend:**
    *   Open de applicatie in je webbrowser door naar het adres te gaan dat `flask run` aangeeft (meestal `http://127.0.0.1:5000`). De backend serveert nu de frontend bestanden.

## Ontwikkeling

*   Backend server draait typisch op `http://127.0.0.1:15001`.
*   Frontend wordt geserveerd door de Flask backend.

## Help: Handmatig een Spel Maken (`game_data.json` & ZIP) - Uitgebreid

Je kunt een spel ook handmatig voorbereiden voor import door een `game_data.json` bestand en een ZIP-archief te maken. Dit vereist zorgvuldigheid.

**1. `game_data.json` Structuur:**

Dit bestand bevat alle informatie over je spel. De structuur volgt de datamodellen. **UUIDs** moeten uniek zijn voor elk object (kamer, entiteit, gesprek) binnen het spel. Gebruik een online UUID generator.

```json
{
  "game_info": {
    "id": "spel-uuid", // Optioneel bij import, wordt genegeerd
    "name": "Mijn Avontuur", // Verplicht
    "description": "Een spannend avontuur!", // Optioneel, getoond bij start
    "start_image_path": "start.png", // Optioneel, relatief pad binnen 'avonturen' map in ZIP
    "win_image_path": "win.png", // Optioneel, relatief pad binnen 'avonturen' map in ZIP
    "version": "1.1.0", // Optioneel, versie van het avontuur zelf
    "builder_version": "1.1b" // Optioneel, versie van de builder waarmee het is gemaakt
  },
  "rooms": [
    {
      "id": "kamer-1-uuid", // Verplicht: Unieke UUID
      "title": "Start Kamer", // Verplicht
      "description": "Je staat in de startkamer. Het is hier donker.", // Optioneel
      "image_path": "start_kamer.png", // Optioneel, relatief pad binnen 'images/kamers' map in ZIP
      "pos_x": 100, // Optioneel, X-positie voor grafiekweergave
      "pos_y": 150, // Optioneel, Y-positie voor grafiekweergave
      "sort_index": 0 // Verplicht (impliciet of expliciet): Bepaalt startkamer (0) en volgorde in lijstweergave
    },
    { // ... meer kamers
      "id": "kamer-2-uuid",
      "title": "Gang",
      "description": "Een donkere gang strekt zich voor je uit.",
      "image_path": "gang.png",
      "pos_x": 100,
      "pos_y": 300,
      "sort_index": 1
    }
  ],
  "entities": [
    {
      "id": "sleutel-uuid", // Verplicht: Unieke UUID
      "type": "ITEM", // Verplicht: "ITEM" of "NPC"
      "name": "Roestige Sleutel", // Verplicht
      "description": "Een oude, roestige sleutel. Past misschien ergens op.", // Optioneel
      "is_takable": true, // Optioneel (alleen ITEM), default false. True = speler kan het oppakken.
      "is_container": false, // Optioneel (alleen ITEM), default false. True = speler kan dingen erin/eruit halen.
      "is_mobile": false, // Optioneel (alleen NPC), default false. True = NPC kan bewegen (toekomstige feature).
      "room_id": "kamer-1-uuid", // Optioneel: UUID van de kamer waar het item start. Kan null zijn (bv. in inventaris speler of container).
      "container_id": null, // Optioneel: UUID van de container-entiteit waar dit item in start. Kan null zijn. Exclusief met room_id.
      "image_path": "sleutel.png", // Optioneel, relatief pad binnen 'images/entiteiten' map in ZIP
      "pickup_message": "Je raapt de roestige sleutel op." // Optioneel (alleen ITEM): Bericht getoond bij oppakken.
    },
    {
      "id": "npc-uuid",
      "type": "NPC",
      "name": "Oude Man",
      "description": "Een oude man zit op een stoel en mompelt iets.",
      "is_takable": false,
      "is_container": false,
      "is_mobile": false,
      "room_id": "kamer-1-uuid",
      "container_id": null,
      "conversation_id": "gesprek-oude-man-uuid", // Optioneel: UUID van het gesprek gekoppeld aan deze NPC.
      "image_path": "oude_man.png"
    },
    {
      "id": "kist-uuid",
      "type": "ITEM",
      "name": "Zware Kist",
      "description": "Een zware, houten kist.",
      "is_takable": false, // Te zwaar om op te pakken
      "is_container": true, // Kan items bevatten
      "is_mobile": false,
      "room_id": "kamer-2-uuid",
      "container_id": null,
      "image_path": "kist.png"
    },
    {
      "id": "munt-uuid",
      "type": "ITEM",
      "name": "Gouden Munt",
      "description": "Een glimmende gouden munt.",
      "is_takable": true,
      "is_container": false,
      "is_mobile": false,
      "room_id": null, // Start niet in een kamer
      "container_id": "kist-uuid", // Start in de kist
      "pickup_message": "Je pakt de gouden munt."
    }
  ],
  "connections": [
    {
      // "id" is optioneel, wordt genegeerd bij import
      "from_room_id": "kamer-1-uuid", // Verplicht: UUID van de bronkamer
      "to_room_id": "kamer-2-uuid", // Verplicht: UUID van de doelkamer
      "direction": "zuid", // Verplicht: Richting (kleine letters). Standaard richtingen: "noord", "oost", "zuid", "west", "omhoog", "omlaag", "in", "uit".
      "is_locked": false, // Optioneel, default false. True = verbinding is op slot.
      "required_key_id": null // Optioneel: UUID van de entiteit (sleutel) die nodig is als is_locked=true. Moet een ITEM zijn.
    },
    {
      "from_room_id": "kamer-2-uuid",
      "to_room_id": "kamer-1-uuid",
      "direction": "noord",
      "is_locked": false,
      "required_key_id": null
    }
    // Voeg hier meer verbindingen toe
  ],
  "scripts": [
    {
      // "id" is optioneel
      "trigger": "ON_ENTER", // Verplicht: Wanneer wordt dit script gecontroleerd?
      "condition": "CURRENT_ROOM(\"Start Kamer\")", // Optioneel: Extra voorwaarde. Moet waar zijn om actie uit te voeren.
      "action": "SHOW_MESSAGE(\"Welkom in de Start Kamer!\")" // Verplicht: Wat gebeurt er?
    },
    {
      "trigger": "ON_COMMAND(open kist)", // Trigger bij specifiek commando
      "condition": "CURRENT_ROOM(\"Gang\") && HAS_ITEM(Roestige Sleutel)", // Speler moet in Gang zijn EN de sleutel hebben
      "action": "SHOW_MESSAGE(\"Je opent de kist met de sleutel!\") | SET_STATE(kist_open, true)" // Meerdere acties met '|'
    },
    {
      "trigger": "ON_TAKE(Gouden Munt)", // Trigger bij oppakken van specifiek item
      "condition": null, // Geen extra voorwaarde
      "action": "ADD_SCORE(10) | SHOW_MESSAGE(\"Je voelt je rijker! +10 punten.\")" // Geef punten en een bericht
    }
    // Voeg hier meer scripts toe
    // **Mogelijke Triggers:**
    //   - ON_ENTER: Bij het betreden van *elke* kamer. Gebruik condition `CURRENT_ROOM("Kamernaam")` voor specifieke kamer.
    //   - ON_EXIT: Bij het verlaten van *elke* kamer.
    //   - ON_TAKE(item_naam): Bij het succesvol oppakken van een specifiek item.
    //   - ON_DROP(item_naam): Bij het succesvol neerleggen van een specifiek item.
    //   - ON_COMMAND(commando_woord): Bij het invoeren van het eerste woord van een commando (bv. 'open', 'gebruik').
    //   - ON_COMMAND(volledig commando): Bij het invoeren van een exact commando (bv. 'open deur', 'praat met man').
    //   - ON_CONVERSATION_START(npc_naam): Bij het starten van een gesprek met een NPC.
    //   - ON_CONVERSATION_END(npc_naam): Bij het eindigen van een gesprek met een NPC.
    //   - ON_LOOK(item_of_npc_naam): Bij het bekijken van een specifiek item of NPC.
    // **Mogelijke Condities (kunnen gecombineerd worden met '&&' (en) of '||' (of)):**
    //   - HAS_ITEM(item_naam): Speler heeft het item in inventaris.
    //   - CURRENT_ROOM("kamer_titel"): Speler is in de kamer met deze titel.
    //   - STATE(variabele_naam) == "waarde": Een spelvariabele heeft een specifieke waarde (strings tussen quotes).
    //   - STATE(variabele_naam) != "waarde": Spelvariabele heeft *niet* deze waarde.
    //   - STATE(variabele_naam) > waarde: Spelvariabele (numeriek) is groter dan waarde. (Ook <, >=, <=)
    //   - NPC_PRESENT(npc_naam): NPC is in de huidige kamer.
    //   - NPC_STATE(npc_naam) == "status": Een status van een NPC (indien geïmplementeerd).
    //   - CONNECTION_LOCKED("richting"): Verbinding in die richting is op slot.
    // **Mogelijke Acties (meerdere acties scheiden met ' | '):**
    //   - SHOW_MESSAGE("Tekst die getoond wordt"): Toon een bericht aan de speler.
    //   - GIVE_ITEM(item_naam): Voeg een item toe aan de inventaris van de speler.
    //   - REMOVE_ITEM(item_naam): Verwijder een item uit de inventaris.
    //   - SET_STATE(variabele_naam, "waarde"): Zet of update een spelvariabele (strings tussen quotes, getallen zonder).
    //   - ADD_SCORE(punten): Verhoog de score van de speler.
    //   - MOVE_PLAYER("kamer_titel"): Verplaats de speler direct naar een andere kamer.
    //   - MOVE_NPC(npc_naam, "kamer_titel"): Verplaats een NPC naar een andere kamer.
    //   - LOCK_CONNECTION("richting"): Zet een verbinding op slot.
    //   - UNLOCK_CONNECTION("richting"): Haal een verbinding van het slot.
    //   - CHANGE_ROOM_DESC("kamer_titel", "Nieuwe beschrijving"): Verander de beschrijving van een kamer.
    //   - CHANGE_ENTITY_DESC(item_of_npc_naam, "Nieuwe beschrijving"): Verander de beschrijving van een entiteit.
    //   - END_GAME(win): Beëindig het spel met een win conditie.
    //   - END_GAME(lose): Beëindig het spel met een verlies conditie.
  ],
  "conversations": [
    {
      "id": "gesprek-oude-man-uuid", // Verplicht: Unieke UUID
      "name": "Gesprek Oude Man", // Verplicht: Interne naam voor editor
      "structure": { // Verplicht: JSON object met gespreksstructuur
        "start_node": "start", // Verplicht: Naam van het startknooppunt
        "nodes": { // Verplicht: Object met alle knooppunten
          "start": { // Naam van dit knooppunt
            "npc_text": "Hallo reiziger. Wat brengt u hier?", // Tekst die de NPC zegt
            "options": [ // Lijst met keuzes voor de speler
              {
                "text": "Wie bent u?", // Tekst die de speler kan kiezen
                "next_node": "uitleg" // Naam van het volgende knooppunt bij deze keuze
              },
              {
                "text": "Ik zoek avontuur.",
                "next_node": "avontuur_zoek"
              },
              {
                "text": "Doei.",
                "next_node": null // `null` beëindigt het gesprek direct
              }
            ]
            // Optioneel: "action": "SET_STATE(oude_man_ontmoet, true)" - Actie die direct na npc_text wordt uitgevoerd
          },
          "uitleg": {
            "npc_text": "Ik ben slechts een oude wachter. Niets bijzonders.",
            "options": [
              {
                "text": "Oké.",
                "next_node": null // Beëindig gesprek
                // Optioneel: "condition": "HAS_ITEM(amulet)" - Toon deze optie alleen als speler amulet heeft
                // Optioneel: "action": "GIVE_ITEM(stofdoek)" - Geef item als speler deze optie kiest
              }
            ]
          },
          "avontuur_zoek": {
            "npc_text": "Avontuur? Gevaarlijk pad. Neem dit advies: vertrouw niet alles wat glimt.",
            "options": [
              {
                "text": "Bedankt voor het advies.",
                "next_node": null
              }
            ]
          }
          // ... meer knooppunten (nodes)
        }
      }
    }
  ]
}

**Belangrijke Punten:**

*   **UUIDs:** Zorg ervoor dat alle `id` velden voor games, kamers, entiteiten en gesprekken uniek zijn binnen het JSON-bestand.
*   **Referenties:** Gebruik de correcte UUIDs wanneer je verwijst naar kamers (in `entities`, `connections`), entiteiten (in `connections` als `required_key_id`, in `entities` als `container_id`), en gesprekken (in `entities` als `conversation_id`).
*   **Paden:** Afbeeldingspaden (`image_path`, `start_image_path`, `win_image_path`) moeten relatief zijn en overeenkomen met de structuur binnen het ZIP-bestand (zie stap 2).
*   **JSON Validiteit:** Zorg ervoor dat de JSON-structuur correct is (komma's, haken, accolades). Gebruik een online validator.
*   **Scripts & Conversaties:** De syntax van triggers, condities en acties moet exact overeenkomen met wat de spel-engine verwacht. De voorbeelden hierboven geven een indicatie.

**2. ZIP-Bestand Structuur:**

Maak een ZIP-bestand (bv. mijn_spel.zip) met de volgende structuur:

Codebox

mijn_spel.zip
│
├── game_data.json         <-- Het JSON-bestand dat je hierboven hebt gemaakt
│
├── avonturen/             <-- Map voor spel start/win afbeeldingen (optioneel)
│   └── start.png
│   └── win.png
│
└── images/                <-- Map voor kamer/entiteit afbeeldingen (optioneel)
    ├── kamers/
    │   └── start_kamer.png
    └── entiteiten/
        └── sleutel.png
        └── ... andere entiteit afbeeldingen ...
Plaats game_data.json in de hoofdmap van het ZIP-bestand.
Plaats afbeeldingen in de mappen avonturen, images/kamers, of images/entiteiten binnen het ZIP-bestand, overeenkomend met de paden die je in game_data.json hebt opgegeven.
3. Importeren:

Gebruik de "Import / Export" knop in de applicatie om je ZIP-bestand te selecteren en te importeren. Het spel zou nu in de lijst moeten verschijnen.

Notities
De applicatie gebruikt nu PostgreSQL. Zorg ervoor dat je psycopg2-binary hebt geïnstalleerd (pip install -r server/requirements.txt).
De ontwikkelingsconfiguratie in server/config.py gebruikt standaard de PostgreSQL connectiestring postgresql://postgres:postgres@servername:5432/adventurez. Je kunt dit overschrijven door de DATABASE_URL omgevingsvariabele in te stellen.

Het server/db_init.py script biedt een manier om snel de databaseschema te resetten tijdens ontwikkeling.