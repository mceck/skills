# Linee Guida per la Redazione del Report di Manutenzione

L'obiettivo del Report è fornire al cliente un resoconto chiaro, trasparente e strutturato delle attività di manutenzione svolte, evidenziando il valore introdotto e lo stato di sicurezza dei sistemi.

**Nota su formato e contenuti:** Questo documento definisce la struttura dei capitoli che deve rimanere fissa. Il layout e il livello di dettaglio delle informazioni da inserire in ciascun capitolo dipendono dal progetto, dalle specificità del cliente e dagli accordi contrattuali.

# 1\. Intestazione

Questo capitolo iniziale serve a contestualizzare il report. Deve contenere i dati identificativi essenziali del periodo di manutenzione:

* **Periodo di riferimento:** Date esatte o intervallo di tempo coperto dal report (es. *Mese di Maggio 2026*).  
* **Persone coinvolte:** Elenco dei referenti o del team che ha preso parte alle attività.  
* **Sistemi coinvolti:** Elenco dei componenti d’architettura interessati (es. *Backend, Frontend, Microservizio X, Infrastruttura Cloud*).

# 2\. Panoramica delle Attività Svolte

Fornire un riassunto ad alto livello (executive summary) degli interventi principali eseguiti durante il periodo di riferimento.

Questa sezione deve fornire una visione d'insieme dello stato dei sistemi, permettendo al cliente di comprendere rapidamente l'andamento generale della manutenzione senza dover analizzare i dettagli tecnici di ogni singolo servizio.

Evidenziare i traguardi principali raggiunti nel periodo, per esempio:

* **Aggiornamenti critici:** implementazione di patch di sicurezza o passaggi di versione necessari per la stabilità.  
* **Interventi straordinari:** attività non pianificate ma essenziali per garantire la continuità operativa.

# 3\. Interventi per Singolo Servizio/Componente

*Nota: Questo capitolo va replicato per ogni servizio/compoenente.*

Per ciascun servizio analizzato, dettagliare:

* **Interventi effettuati:** Elenco sintetico delle attività di manutenzione ordinaria o straordinaria (es. refactoring, patch di sicurezza, ottimizzazione performance).  
* **Gestione delle CVE (Common Vulnerabilities and Exposures):** Elenco delle vulnerabilità rilevate nel servizio. Per ciascuna CVE, specificare:  
  * Gravità  
  * Libreria/componente coinvolto  
  * Versione pre  
  * Versione post  
  * Desrizione  
  * **stato post-intervento** scegliendo tra:  
    * **Risolta:** La vulnerabilità è stata completamente eliminata.  
    * **Mitigata:** La vulnerabilità è ancora presente, ma sono state applicate contromisure che ne riducono drasticamente l'impatto o la probabilità di sfruttamento.  
    * **Ancora presente:** La vulnerabilità non è stata gestita nel periodo di riferimento (richiede pianificazione successiva).

**IMPORTANTE: Tracciabilità delle Versioni e Compliance**  
In caso di aggiornamenti di qualsiasi componente (software o infrastrutturale), è obbligatorio indicare nel report sia la versione precedente che la versione successiva all'intervento.

Questa granularità è fondamentale per due ragioni:

1. **Conformità Normativa:** Consente al cliente di superare con successo gli audit e i controlli di sicurezza che richiedono lo storico esatto dei cambiamenti.  
2. **Garanzia di Rollback:** Dimostra formalmente, in qualità di fornitori, la nostra capacità di ripristinare lo stato precedente del sistema in caso di anomalie o regressioni post-rilascio.

# 4\. Impatti

Sezione dedicata agli effetti degli interventi sull'ecosistema e alle relative attività di collaudo.

Descrivere eventuali impatti (o assenza di essi) sulle funzionalità esistenti, sulle performance o sulla disponibilità del servizio durante o dopo la manutenzione.

# 5\. Verifica

In questo capitolo bisogna dimostrare l'affidabilità e la sicurezza degli interventi, indicando come sono stati testati i sistemi post-manutenzione.

Specificare le modalità e gli strumenti utilizzati, per esempio:

* **Test applicativi:** Esecuzione di test automatici e verifiche manuali del funzionamento nei vari ambienti (es. Staging, Produzione).  
* **Analisi SAST (Sicurezza del codice):** Scansioni statiche del codice (es. tramite *Codacy*) per escludere l'introduzione di nuove falle.  
* **Analisi SBOM (Dipendenze):** Scansioni delle librerie di terze parti (es. tramite *Trivy*) per confermare la risoluzione delle vulnerabilità.  
* **Sicurezza Infrastrutturale:** Verifiche sulla componente Cloud (es. tramite *AWS Security Hub*) per monitorare la riduzione del rischio.

# 6\. Note Finali e Azioni Future

* **Azioni future necessarie:** Attività pianificate o consigliate per i periodi successivi (es. upgrade di versione major, refactoring architetturali).  
* **Note su CVE mitigate o non risolte:** Spiegazione tecnica e di business del *perché* alcune CVE siano rimaste nello stato "mitigata" o "ancora presente", indicando il piano d'azione previsto per la loro risoluzione definitiva o la tolleranza del rischio accettata.

