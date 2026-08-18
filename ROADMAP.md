# Piano di intervento — miglioramenti futuri

Questo documento raccoglie, in ordine di priorità consigliato, i prossimi interventi possibili su questo fork. Non è un impegno a farli tutti: è una lista di opzioni con passi concreti, rischio e sforzo stimato, da cui scegliere.

Legenda sforzo: **S** = poche ore, **M** = una sessione di lavoro concentrata, **L** = più sessioni / rischio di regressioni da testare con calma.

---

## Fase 1 — Consolidamento (basso rischio, consigliata come prossimo passo)

Obiettivo: eliminare l'ultimo pezzo di codice davvero datato (`node-persist`) e aggiungere una rete di sicurezza minima (validazione, test, CI) prima di toccare qualsiasi architettura.

### 1.1 Sostituire `node-persist` con uno storage JSON proprio — **S/M**

`node-persist@0.0.8` è fermo al 2016 e usa un'API sincrona che il resto del codice già assume ovunque (`getItemSync`/`setItemSync`/`initSync`). Il dato salvato è banale: solo timestamp numerici (`lastSuccessfulPing_<target>`, `lastWebhook_<target>`). Non serve una libreria, basta un modulo di ~30 righe.

Passi:
1. Creare `src/storage.js` con una classe/oggetto che espone `initSync({ dir })`, `getItemSync(key)`, `setItemSync(key, value)`, tenendo tutto in un unico file `data.json` dentro `dir`.
2. `initSync` legge `data.json` se esiste (con `try/catch` in caso di file corrotto: parte da oggetto vuoto e logga un warning, non crasha), altrimenti parte da `{}`.
3. `setItemSync` aggiorna l'oggetto in memoria e riscrive `data.json` per intero con `fs.writeFileSync` (scrittura sincrona = nessun rischio di scritture concorrenti che si accavallano, dato che Node è single-thread).
4. In `src/platform.js`, sostituire `require('node-persist')` con `require('./storage')`. La firma delle chiamate resta identica, quindi `accessory.js` e `all_accessory.js` non cambiano.
5. Rimuovere `"node-persist": "0.0.8"` da `package.json`.
6. **Nota sulla migrazione dati:** il vecchio `node-persist` salva ogni chiave come file separato in una cartella, formato diverso dal nuovo `data.json`. Non conviene scrivere uno script di migrazione per un dato così a bassa importanza (nel giro di un ciclo di ping, pochi secondi/minuti, il valore si ripopola da solo). Basta scriverlo nel CHANGELOG: "dopo questo aggiornamento i sensori mostreranno 'non a casa' finché non arriva il primo ping/webhook".
7. Validare: `node -c`, poi test manuale — cancellare/rinominare la vecchia cartella `plugin-persist`, avviare, controllare che `data.json` venga creato e popolato correttamente dopo un paio di cicli di ping.

### 1.2 Validazione config più robusta — **S**

Oggi il costruttore di `PeopleProAccessory` valida `type` e `target`, ma non `threshold` o `pingInterval` (es. un `threshold` negativo o una stringa passerebbero senza errore, con comportamento imprevedibile a valle).

Passi:
1. In `src/accessory.js`, dopo aver letto `this.threshold`/`this.pingInterval`, controllare che siano numeri finiti e positivi (per `pingInterval`, anche `-1` è valido); se non lo sono, loggare un warning e usare il default.
2. In `src/platform.js`, validare `webhookPort` (intero tra 1 e 65535) prima di passarlo a `http.createServer(...).listen(...)`.
3. **Più importante:** avvolgere il ciclo `for` in `accessories(callback)` (dove vengono creati i `PeopleProAccessory`) in un `try/catch` per singola entry di `people`, così un errore di configurazione su UN sensore non fa fallire il caricamento di tutti gli altri. Oggi un'eccezione nel costruttore di un singolo accessorio farebbe fallire l'intero blocco.

### 1.3 Test automatici sulle funzioni pure — **S/M**

Non c'è nessun test nel repo. Non serve una suite completa, ma le funzioni pure che abbiamo appena riscritto (quelle con logica di date/soglie) sono facili da testare e danno una rete di sicurezza per il futuro.

Passi:
1. Aggiungere `jest` come devDependency.
2. Creare `test/accessory.test.js`: testare `encodeState()` (motion e occupancy), e con un `platform.storage` finto (un semplice oggetto con `getItemSync` che ritorna valori di test), testare `isActive()`, `webhookIsOutdated()`, `successfulPingOccurredAfterWebhook()` sui casi limite (nessun dato, dato recente, dato scaduto).
3. Aggiungere `"test": "jest"` agli script di `package.json`.

### 1.4 CI di base con GitHub Actions — **S**

La cartella `.github` oggi contiene solo `FUNDING.yml`, nessuna pipeline.

Passi:
1. Creare `.github/workflows/ci.yml`: su push e pull request, `npm install`, controllo sintassi (`node -c` su tutti i file `src/*.js` e `index.js`), e `npm test` se il punto 1.3 è stato fatto.
2. Matrice su Node 22 e 24, per restare allineati agli `engines` dichiarati.

---

## Fase 2 — Migrazione a "dynamic platform" (rischio medio-alto, da valutare)

Non necessaria per far funzionare il plugin oggi — l'unico motivo per farla è se in futuro vuoi modificare spesso la lista di persone in config senza rischiare di dover ri-fare le automazioni HomeKit collegate (con il pattern "static platform" attuale, gli accessori non vengono mantenuti in cache da Homebridge tra un riavvio e l'altro).

Passi ad alto livello (da dettagliare solo se si decide di procedere):
1. `platform.js`: il costruttore riceve anche `api` (terzo parametro), si registra su `api.on('didFinishLaunching', ...)` invece di essere richiamato via `accessories(callback)`.
2. Generare un UUID stabile per ogni sensore (basato sul `target`, che è l'unico dato realmente univoco e persistente in config) con `api.hap.uuid.generate(...)`.
3. Implementare `configureAccessory(accessory)` per riusare gli accessori già in cache al riavvio.
4. Riscrivere `accessory.js` e `all_accessory.js` per operare su un `PlatformAccessory` esistente (`accessory.addService(...)`) invece di essere loro stesse l'accessorio con `getServices()`.
5. Rimuovere la doppia registrazione come Accessory Plugin standalone (`homebridge.registerAccessory` per `PeopleProAccessory`/`PeopleProAllAccessory` in `index.js`).

Rischio principale: è un cambio di identità degli accessori in HomeKit se gli UUID generati non coincidono esattamente con quelli attuali — rischio concreto di dover ri-aggiungere i sensori alle automazioni esistenti. Da fare con calma e testare su una copia di config prima.

---

## Fase 3 — Supporto multi-target per persona — **M**

Oggi ogni persona ha un solo `target`. Nella pratica le persone hanno più dispositivi (telefono + smartwatch, per dire), e oggi il plugin ne traccia solo uno.

Passi:
1. `config.schema.json`: permettere che `target` sia sia una stringa singola (retrocompatibilità) sia un array di stringhe.
2. `src/accessory.js`: normalizzare sempre `this.target` in un array interno (`this.targets = Array.isArray(config.target) ? config.target : [config.target]`), mantenendo `this.target` (singolare, primo elemento) per compatibilità con le chiavi di storage esistenti se si vuole evitare di perdere lo storico.
3. `pingFunction()`: ciclare su tutti i target del sensore (in sequenza o con `Promise.all`), il sensore è "attivo" se **almeno uno** dei target risulta visto entro la soglia.
4. Storage: una chiave `lastSuccessfulPing_<target>` per ogni target (già così oggi, basta astrarre il calcolo di "attivo" per fare l'OR tra tutti).
5. Aggiornare `README.md` e `config-sample.json` con un esempio.

---

## Fase 4 — Rilevamento presenza via router (esplorativo) — **L**

Se il tuo router espone una lista di dispositivi connessi via API (Unifi, pfSense, alcuni Asus/Netgear con firmware aperto), interrogare il router è più affidabile del ping: i telefoni spesso non rispondono quando lo schermo è spento per risparmiare batteria, il router invece sa sempre chi è associato alla rete.

Questa fase dipende dal modello di router che hai — prima di scrivere qualunque codice bisogna sapere quale usi e se espone un'API o solo l'interfaccia web. Da riprendere con questa informazione, se interessa.

---

## Voce a parte — campo `webhookToken` mascherato nella UI — **S, da verificare prima di implementare**

Idea: far apparire `webhookToken` come campo tipo "password" (mascherato) nella UI di Homebridge invece che testo in chiaro, per igiene visiva.

Prima di implementarlo: verificare sulla documentazione ufficiale (`https://developers.homebridge.io/#/config-schema`) la sintassi esatta supportata da Homebridge Config UI X per marcare un campo stringa come password (verosimilmente `"format": "password"` nello schema, ma non l'ho confermato — meglio controllare che indovinare).

---

## Ordine consigliato

1. Fase 1 (1.1 → 1.4), in questo ordine — sono indipendenti tra loro ma a rischio crescente di superficie toccata.
2. Fase 3 (multi-target) — beneficio pratico immediato, non richiede la Fase 2.
3. Fase 2 (dynamic platform) — solo se senti davvero il bisogno di gestire la lista persone più liberamente; è quella con più rischio di regressione su HomeKit.
4. Fase 4 (router) — solo se hai un router che la supporta.
5. Pubblicazione su npm (sotto) — indipendente da tutto il resto, da fare per ultima e solo dopo averla decisa a mente fredda.

---

## Pubblicare su npm per renderlo disponibile ad altri — DECISO, IN CORSO

**Decisione presa:** procedere con la pubblicazione. `package.json` è già stato aggiornato con `"name": "@riccardoq76/homebridge-people-pro"` (il nome senza scope è occupato dal pacchetto originale di mfkrause, non riutilizzabile).

**Stato prima della decisione (verificato):** il repo GitHub era già pubblico, installabile con `npm install -g github:riccardoq76/homebridge-people-pro`. Su npm non c'era nulla sotto il nome di Riccardo. L'unico `homebridge-people-pro` pubblicato restava quello originale di mfkrause, fermo alla 0.11.6, che punta al repo archiviato.

**Passi rimanenti (da fare da terminale, non automatizzabili da qui):**
1. ~~Cambiare `"name"` in `package.json`~~ — fatto.
2. Commit + push del cambio di nome (e di tutto il lavoro Fase 4 in sospeso, se non già fatto).
3. `npm login` da terminale (richiede autenticazione a due fattori).
4. `npm publish --access public` dalla cartella del progetto (il flag è obbligatorio la prima volta per un pacchetto scoped).
5. Verificare su `npmjs.com/package/@riccardoq76/homebridge-people-pro` che sia visibile.

**Da ricordare per il futuro:** da qui in avanti, ogni release richiede anche `npm version patch|minor|major` + `npm publish`, non solo `git push` — un passo manuale in più da non dimenticare.

---

## Idea in sospeso — rinominare il pacchetto npm in `-v2`

Valutato il 18/08/2026, rimandato: non è un semplice bump di versione, è un rename vero e proprio. Da riprendere in futuro se interessa ancora, non come parte di una release ordinaria.

**Cosa comporta, se si decide di farlo:**
1. `package.json`: `"name"` → `@riccardoq76/homebridge-people-pro-v2`.
2. **`index.js` — passo critico, facile da dimenticare:** Homebridge deriva il "nome plugin" interno dal `name` di `package.json` (togliendo lo scope `@riccardoq76/`). Le tre chiamate `homebridge.registerPlatform('homebridge-people-pro', ...)` / `registerAccessory('homebridge-people-pro', ...)` (righe 22-24) usano quella stringa hardcoded per farsi riconoscere da Homebridge. Se il nome del pacchetto cambia ma queste tre righe no, il plugin smette di caricarsi. Vanno aggiornate insieme, nella stessa modifica.
3. Il secondo argomento di `registerPlatform` (`'PeoplePro'`) NON cambia — è quello che identifica la piattaforma nel `config.json` (`"platform": "PeoplePro"`), quindi la config esistente resta valida senza modifiche.
4. Aggiornare comando di installazione e badge in `README.md`.
5. `npm publish --access public` (di nuovo prima volta, essendo un pacchetto scoped nuovo).
6. `npm deprecate @riccardoq76/homebridge-people-pro "renamed to @riccardoq76/homebridge-people-pro-v2"` per non lasciare il vecchio nome orfano.
7. Aggiornare il comando di installazione sul Pi.

Nessun rischio di nome già occupato: essendo sotto lo scope `@riccardoq76`, il nome è comunque disponibile a prescindere da terzi.

**Nota:** finché il pacchetto ha pochissima o nessuna adozione esterna, il costo di questo rename resta basso — conviene farlo prima piuttosto che dopo, se si decide di farlo.
