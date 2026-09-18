---
name: monade-manutenzione
description: Esegue un ciclo di manutenzione sul progetto in cui viene lanciato l'agente (o su un modulo di esso, se monorepo), dipendenze (vulnerabilità, versioni obsolete/EOL), CVE, patch di sicurezza, verifica, e genera o aggiorna il report mensile in docs/maintenance/yyyy_mm.md secondo le linee guida aziendali.
argument-hint: "[modulo] [note aggiuntive]"
disable-model-invocation: true
---

# Manutenzione periodica progetti

Esegue l'attività di manutenzione su un progetto cliente e produce/aggiorna il
relativo report mensile, seguendo la struttura fissa definita in
`references/linee-guida.md` (linee guida complete, leggerle per intero prima
di iniziare) e lo stile di `references/template.md` (esempio di formattazione,
non un elenco fisso di componenti).

## 1. Risolvi progetto e modulo target

- Il progetto da manutenere è **di default la working directory corrente**
  (il repository in cui è stata lanciata questa skill). Non chiedere un
  percorso progetto: usa la cwd, salvo il caso raro in cui `$ARGUMENTS`
  contenga esplicitamente un percorso a un'altra directory.
- Verifica se la root del progetto è un **monorepo** (workspaces in
  `package.json`/`pnpm-workspace.yaml`, cartelle tipo `packages/`, `apps/`,
  `services/`, `modules/`, più sotto-progetti con proprio manifest):
  - Se `$ARGUMENTS` indica un modulo, quello è il modulo target: la
    manutenzione va scoped a quel modulo (dipendenze, patch, test), non
    all'intero monorepo.
  - Se non è indicato alcun modulo, elenca i moduli trovati e chiedi
    all'utente su quale operare. Non assumere "tutti i moduli" di default.
- Se non è un monorepo (progetto singolo), procedi sull'intero repository;
  eventuali argomenti extra vanno trattati come note, non come modulo.

## 2. Determina periodo e file di report

- Calcola `yyyy_mm` dalla data odierna (es. agosto 2026 → `2026_08`).
- Percorso del report: **sempre alla root del progetto/monorepo**,
  `<root-progetto>/docs/maintenance/yyyy_mm.md`, anche quando si sta lavorando su
  un singolo modulo. Un solo report per periodo copre tutti i moduli
  manutenuti nel tempo; il modulo lavorato in questa sessione va indicato
  come sistema coinvolto e come sottosezione del capitolo 2 (vedi punto 4).
  Crea la cartella `docs/maintenance/` alla root se non esiste.
  In alcuni progetti se è già stata creata la cartella `maintenance/` può essere 
  anche direttamente nella root, senza `docs/`, in tal caso usa quella, se esiste.

## 3. Report nuovo o esistente

**Leggi sempre il file per intero prima di scriverci**, se esiste già (può
contenere manutenzione già svolta nel mese da questa o altre sessioni).

- **Se il report del mese esiste già:**
  - Integra il contenuto esistente con quanto fatto in questa sessione:
    nuovi interventi si aggiungono alle liste esistenti, nuove CVE si
    aggiungono alla tabella CVE del componente pertinente. Non cancellare né
    riscrivere quanto documentato in precedenza.
  - Se una CVE già registrata cambia stato per effetto del lavoro svolto ora
    (es. da "Ancora presente" a "Risolta"), aggiorna quella riga invece di
    duplicarla.
- **Se il report non esiste:** crealo usando la struttura di
  `references/template.md`, compilando l'intestazione con periodo di
  riferimento e sistemi coinvolti (da individuare al punto 4).

## 4. Individua i componenti reali coinvolti

Il template ha Backend / Frontend / Card Hubspot / Infrastruttura AWS come
**esempio di un progetto specifico**, non uno standard da riprodurre a
prescindere. Esplora il progetto (o, se monorepo, il modulo scelto al punto
1), package.json, requirements.txt, Dockerfile/docker-compose, cartelle
infra/terraform/cdk, README, per capire quali servizi/componenti reali sono
coinvolti, e usa quelli come sottosezioni del capitolo 2 del report. In un
monorepo, se il report contiene già sottosezioni per altri moduli lavorati in
periodi/sessioni precedenti, lasciale intatte e aggiungi/aggiorna solo quella
del modulo su cui si sta operando ora.

## 5. Esegui la manutenzione

Per ciascun componente individuato:

- Controlla dipendenze, vulnerabilità note e qualità/sicurezza del codice
  usando **preferibilmente l'MCP di Codacy** (tool `codacy_cli_analyze`):
  copre sia il SAST che la SCA/dipendenze (Trivy è uno dei motori usati sotto
  il cofano da Codacy).
  - Se non è configurato in questo ambiente, **invita l'utente a
    installarlo** (serve un account Codacy e il token
    `CODACY_ACCOUNT_TOKEN`, da https://app.codacy.com/account/access-management)
    prima di ricorrere ad altro.
  - Solo se l'utente non vuole installarlo o preferisce procedere senza, usa
    gli strumenti CLI diretti realmente disponibili nell'ambiente (`npm
    audit`/`yarn audit`/`pnpm audit` per Node, `pip-audit`/`safety` per
    Python, `bundle audit` per Ruby, `trivy fs`/`trivy image` se presente,
    ecc.).
  - Esegui davvero i comandi/tool: non inventare mai un esito.
- **Oltre alle vulnerabilità note, verifica per ogni dipendenza se la
  versione installata è ancora supportata (non EOL) e non deprecata**, anche
  in assenza di CVE:
  - Usa `npm outdated`/`pnpm outdated`/`yarn outdated`, `pip list
    --outdated`, `bundle outdated` (o equivalente per l'ecosistema del
    progetto) per individuare pacchetti obsoleti rispetto all'ultima
    versione stabile, e presta attenzione ad avvisi di deprecazione emessi
    a install/build time (es. `npm deprecate`, pacchetti "yanked"/archiviati).
  - Per linguaggio/runtime (Node.js, Python, Ruby, PHP, .NET...) e framework
    principali, verifica lo stato di supporto (es. tramite endoflife.date o
    la pagina ufficiale del progetto) e segnala se la versione in uso è già
    end-of-life o lo diventerà a breve.
- Applica in autonomia gli aggiornamenti di sicurezza ragionevoli (patch/minor version)
  per le vulnerabilità rilevate, **e allo stesso modo aggiorna le dipendenze
  la cui versione non è più supportata/è deprecata**, senza refactoring o
  modifiche non richieste (vedi regole di qualità del codice).
- Major upgrade o modifiche rischiose/di ampio impatto, incluso il passaggio
  a una nuova major per uscire da una versione EOL, richiedono conferma
  esplicita dell'utente prima di essere applicate. Chiedi sempre all'utente
  spiegando quali major upgrade sono disponibili e perché sono consigliati (CVE, EOL, deprecazione, ecc.)
  poi procedi se l'utente conferma.
- Per **ogni** componente aggiornato annota sempre versione precedente e
  versione successiva, sia per interventi legati a una CVE sia per
  aggiornamenti dovuti a fine supporto/deprecazione: è un requisito
  obbligatorio delle linee guida (tracciabilità/compliance), non opzionale.
- Se uno strumento richiesto dalle linee guida non è raggiungibile in questa
  sessione, non simulare un risultato: per Codacy proponi l'installazione
  dell'MCP come sopra; per altri strumenti (es. AWS Security Hub) o se
  l'utente rinuncia a installare Codacy, segnala la mancanza in chat
  all'utente con il motivo, senza scriverla nel report (vedi regole ferree).

## 6. Verifica post-intervento

- Esegui la test suite del progetto se presente e riporta l'esito reale.
- Se l'MCP di Codacy è disponibile (o è stato installato al punto 5), esegui
  l'analisi SAST (`codacy_cli_analyze`) sui componenti toccati e riportane
  l'esito reale nel capitolo "Verifica": è la voce standard richiesta dalle
  linee guida per questo capitolo.
- Annota nel capitolo "Verifica" solo controlli realmente effettuati in
  questa sessione (o già presenti nel report). Ciò che non è verificabile da
  qui (staging, produzione, dashboard cloud) non va scritto nel report:
  segnalalo in chat all'utente.

## 7. Compila il report

Segui **esattamente** la struttura a 6 capitoli delle linee guida (l'ordine e
i capitoli sono fissi, il dettaglio dentro ciascuno si adatta al progetto):

1. Intestazione, periodo, persone coinvolte, sistemi coinvolti
2. Panoramica delle attività svolte (executive summary)
3. Interventi per singolo servizio/componente, una sottosezione per
   componente, con interventi effettuati e tabella CVE (gravità, libreria,
   versione pre, versione post, descrizione, stato: Risolta / Mitigata /
   Ancora presente). Gli aggiornamenti fatti per fine supporto/deprecazione
   (senza una CVE associata) vanno negli "interventi effettuati" del
   componente, con versione pre/post come sopra, non forzarli nella tabella
   CVE, che resta per le vulnerabilità
4. Impatti
5. Verifica
6. Note finali e azioni future

Usa `references/template.md` come riferimento di formattazione (titoli,
grassetti, struttura delle sottosezioni).

## Regole ferree

- **Il report contiene solo ciò che è stato fatto.** Non scrivere nel report
  cosa non è stato fatto, cosa non è riuscito o quali controlli non sono
  stati eseguibili (strumenti irraggiungibili, ambienti non accessibili,
  major upgrade rimandati, ecc.): queste informazioni vanno comunicate solo
  in chat all'utente, non nel documento.
- **Niente contenuti inventati.** Ogni frase del report deve corrispondere a
  un'azione o osservazione realmente avvenuta in questa sessione, o a
  contenuto già presente nel report da un intervento precedente. Se manca
  un'informazione (gravità di una CVE, referenti cliente, esito di un
  controllo non eseguibile da qui), chiedila all'utente invece di
  indovinarla.
- **Non perdere lavoro altrui.** Se il report del mese esiste già, è quasi
  certamente perché altri hanno già lavorato in questo ciclo di manutenzione:
  integra, non sovrascrivere.
- **Conferma prima delle azioni rischiose** sul progetto target (major
  upgrade, modifiche ampie, push, deploy).

## Al termine

Riepiloga in chat cosa è stato effettivamente fatto, il percorso del report
aggiornato, e cosa non è stato fatto o non è riuscito (con il motivo), questi
ultimi solo in chat, non nel report.
