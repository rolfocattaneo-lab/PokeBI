
import { mkdir, writeFile, rename } from 'node:fs/promises';

// ======================================================
// CONFIGURAZIONE
// ======================================================

// INVARIATA: configurazione già utilizzata.
const limite = 9;
const dimensioneBlocco = 10;
const maxTentativi = 3;


// ======================================================
// SCARICAMENTO JSON
// ======================================================

// MODIFICATA:
// scaricaJson() diventa la funzione universale di download.
//
// Accetta:
// - un URL: scarica un singolo JSON
// - un array di URL: scarica tutti i JSON indicati
// - un URL con collezione=true: scarica l'elenco e i dettagli
//
// Non interpreta i dati: restituisce soltanto i JSON.
//
// La gestione HTTP originale rimane invariata,
// ma viene utilizzata internamente per ogni richiesta.

async function scaricaJson(sorgente, { collezione = false } = {}) {

    // PRIMA: async function scaricaJson(url) { ... }
    // MODIFICA: la vecchia logica HTTP è ora interna
    // alla funzione universale scaricaJson().

    async function scaricaSingolo(url) {

        for (let tentativo = 1; tentativo <= maxTentativi; tentativo++) {

            try {
                const risposta = await fetch(url, {
                    signal: AbortSignal.timeout(20000)
                });

                if (!risposta.ok) {
                    throw new Error(`HTTP error! status: ${risposta.status}`);
                }

                return await risposta.json();

            } catch (errore) {

                if (tentativo === maxTentativi) {
                    throw new Error(`Download fallito: ${url}`, {
                        cause: errore
                    });
                }

                console.log(`Tentativo ${tentativo} fallito: ${url}`);

                await new Promise(resolve =>
                    setTimeout(resolve, 1000 * tentativo)
                );
            }
        }
    }


    // MODIFICA: se riceviamo un solo URL senza opzioni,
    // restituiamo direttamente il suo JSON.

    if (!collezione && typeof sorgente === 'string') {
        return scaricaSingolo(sorgente);
    }


    let indirizzi;


    // NUOVO: gestione di un endpoint che restituisce
    // un elenco di risorse PokéAPI.

    if (collezione) {

        if (typeof sorgente !== 'string') {
            throw new Error('Una collezione richiede un URL');
        }

        const elenco = await scaricaSingolo(sorgente);

        if (!Array.isArray(elenco.results)) {
            throw new Error(`Elenco JSON non valido: ${sorgente}`);
        }

        indirizzi = elenco.results.map(voce => voce.url);

    } else if (Array.isArray(sorgente)) {

        // NUOVO: possiamo fornire direttamente gli URL.
        indirizzi = sorgente;

    } else {
        throw new Error('Sorgente JSON non valida');
    }


    // NUOVO: evita richieste duplicate all'interno
    // dello stesso elenco.

    const indirizziUnici = [
        ...new Set(indirizzi.filter(Boolean))
    ];

    const risultati = [];


    // MODIFICA: il download a blocchi si trova ora qui,
    // e non più nella funzione caricaPokemon().

    for (
        let i = 0;
        i < indirizziUnici.length;
        i += dimensioneBlocco
    ) {

        const blocco = indirizziUnici.slice(
            i,
            i + dimensioneBlocco
        );

        const risultatiBlocco = await Promise.all(
            blocco.map(url => scaricaSingolo(url))
        );

        risultati.push(...risultatiBlocco);

        console.log(
            `Scaricati ${risultati.length}/${indirizziUnici.length} JSON`
        );
    }

    return risultati;
}


// ======================================================
// SALVATAGGIO JSON
// ======================================================

// INVARIATA: salvaJson() continua a funzionare
// esattamente come nella versione precedente.

async function salvaJson(nomeFile, dati) {

    const cartella = new URL('../../data/', import.meta.url);
    const percorso = new URL(`${nomeFile}.json`, cartella);
    const temporaneo = new URL(`${nomeFile}_temp.json`, cartella);

    await mkdir(cartella, { recursive: true });

    await writeFile(
        temporaneo,
        JSON.stringify(dati, null, 2),
        'utf-8'
    );

    await rename(temporaneo, percorso);

    return percorso;
}


// ======================================================
// ESTRATTORI POKEMON
// ======================================================

// INVARIATA: estrazione delle statistiche.

function estraiStatistiche(pokemon) {

    const statistiche = {
        pokemon_id: pokemon.id,
        pokemon_name: pokemon.name
    };

    for (const voce of pokemon.stats) {
        const nomeStatistica = voce.stat.name.replaceAll('-', '_');
        statistiche[nomeStatistica] = voce.base_stat;
    }

    return statistiche;
}


// INVARIATA: estrazione dell'anagrafica.

function estraiAnagrafica(pokemon) {

    const speciesId = Number(
        pokemon.species.url.split('/').filter(Boolean).at(-1)
    );

    return {
        pokemon_id: pokemon.id,
        pokemon_name: pokemon.name,
        species_id: speciesId,
        height_m: pokemon.height / 10,
        weight_kg: pokemon.weight / 10,
        base_experience: pokemon.base_experience,
        is_default: pokemon.is_default,
        order: pokemon.order,
        sprite_url: pokemon.sprites.front_default,
        artwork_url: pokemon.sprites.other?.['official-artwork']?.front_default ?? null,
        cry_url: pokemon.cries?.latest ?? null
    };
}


// INVARIATA: estrazione dei tipi del Pokémon.

function estraiTipi(pokemon) {

    return pokemon.types.map(voce => ({
        pokemon_id: pokemon.id,
        pokemon_name: pokemon.name,
        type_id: Number(
            voce.type.url.split('/').filter(Boolean).at(-1)
        ),
        type_name: voce.type.name,
        slot: voce.slot
    }));
}


//
// NUOVO: estrattore delle specie Pokémon.
// Una riga per ogni specie, con i campi BI concordati.
//

function estraiSpecie(specie) {

    // Ricava l'ID numerico dall'URL di una risorsa PokéAPI.
    const idRisorsa = risorsa =>
        risorsa?.url
            ? Number(risorsa.url.split('/').filter(Boolean).at(-1))
            : null;

    return {
        species_id: specie.id,
        species_name: specie.name,

        generation_id: idRisorsa(specie.generation),
        generation_name: specie.generation?.name ?? null,

        is_baby: specie.is_baby,
        is_legendary: specie.is_legendary,
        is_mythical: specie.is_mythical,

        capture_rate: specie.capture_rate,
        base_happiness: specie.base_happiness,

        growth_rate_name: specie.growth_rate?.name ?? null,

        gender_rate: specie.gender_rate,
        hatch_counter: specie.hatch_counter,

        color_name: specie.color?.name ?? null,
        shape_name: specie.shape?.name ?? null,
        habitat_name: specie.habitat?.name ?? null,

        has_gender_differences: specie.has_gender_differences,

        evolves_from_species_id: idRisorsa(specie.evolves_from_species),
        evolution_chain_id: idRisorsa(specie.evolution_chain)
    };
}


//
// NUOVO: estrazione dei metodi evolutivi.
//
// Una riga per ogni alternativa evolutiva.
// Le condizioni si riferiscono alla specie di partenza.
// La funzione non scarica e non salva nulla.
//

function estraiMetodiEvoluzione(catena) {

    const risultati = [];

    const idRisorsa = risorsa =>
        risorsa?.url
            ? Number(risorsa.url.split("/").filter(Boolean).at(-1))
            : null;

    // Attraversa ricorsivamente i rami della catena.
    function visita(nodo) {

        for (const evoluzione of nodo.evolves_to ?? []) {

            // PokéAPI memorizza le condizioni sul nodo di arrivo.
            for (const condizione of evoluzione.evolution_details ?? []) {

                risultati.push({

                    // Specie di PARTENZA.
                    species_id: idRisorsa(nodo.species),
                    species_name: nodo.species.name,
                    evolution_chain_id: catena.id,

                    // Versione e metodo.
                    version_group_name:
                        condizione.version_group?.name ?? null,
                    is_default: condizione.is_default ?? null,
                    trigger_name: condizione.trigger?.name ?? null,

                    // Livello e strumenti.
                    min_level: condizione.min_level ?? null,
                    item_name: condizione.item?.name ?? null,
                    held_item_name: condizione.held_item?.name ?? null,

                    // Requisiti personali.
                    min_happiness: condizione.min_happiness ?? null,
                    min_affection: condizione.min_affection ?? null,
                    min_beauty: condizione.min_beauty ?? null,
                    gender: condizione.gender ?? null,

                    // Tempo e luogo.
                    time_of_day: condizione.time_of_day || null,
                    location_name: condizione.location?.name ?? null,
                    region_name: condizione.region?.name ?? null,

                    // Requisiti relativi alle mosse.
                    known_move_name: condizione.known_move?.name ?? null,
                    known_move_type_name:
                        condizione.known_move_type?.name ?? null,
                    used_move_name: condizione.used_move?.name ?? null,
                    min_move_count: condizione.min_move_count ?? null,

                    // Requisiti relativi alla squadra.
                    party_species_name:
                        condizione.party_species?.name ?? null,
                    party_type_name: condizione.party_type?.name ?? null,
                    trade_species_name:
                        condizione.trade_species?.name ?? null,

                    // Condizioni particolari.
                    relative_physical_stats:
                        condizione.relative_physical_stats ?? null,
                    needs_overworld_rain:
                        condizione.needs_overworld_rain ?? false,
                    needs_multiplayer:
                        condizione.needs_multiplayer ?? false,
                    near_special_rock:
                        condizione.near_special_rock ?? false,
                    turn_upside_down:
                        condizione.turn_upside_down ?? false,
                    min_steps: condizione.min_steps ?? null,
                    min_damage_taken:
                        condizione.min_damage_taken ?? null,

                    // Condizioni delle forme.
                    required_pokemon_form_name:
                        condizione.required_pokemon_form?.name ?? null,

                    // Condizioni rare con valori multipli.
                    allowed_natures:
                        condizione.allowed_natures?.map(
                            natura => natura.name
                        ) ?? null,

                    condition_expression:
                        condizione.condition_expression?.expression ?? null,

                    condition_percentage_chance:
                        condizione.condition_expression?.percentage_chance ?? null,

                    condition_variables:
                        condizione.condition_expression?.variables?.map(
                            variabile => variabile.name
                        ) ?? null
                });
            }

            // Prosegue lungo il ramo evolutivo.
            visita(evoluzione);
        }
    }

    // Parte dalla radice della catena.
    visita(catena.chain);

    return risultati;
}

// INVARIATO: registro degli estrattori Pokémon.
const estrattoriPokemon = {
    pokemon: estraiAnagrafica,
    pokemon_stats: estraiStatistiche,
    pokemon_types: estraiTipi
};

const estrattoriSpecie = {
  species: estraiSpecie
};

const estrattoriEvoluzione = {
  species_evolution: estraiMetodiEvoluzione
}

// ======================================================
// REGISTRO DELLE SORGENTI
// ======================================================

// NUOVO: definiamo quali sorgenti scaricare
// e quali estrattori utilizzare.
//
// Per ora registriamo soltanto la sorgente Pokémon.
//
// In futuro potremo aggiungere altre sorgenti
// senza modificare scaricaJson() e salvaJson().

const sorgenti = [
    {
        nome: 'pokemon',

        indirizzi: () =>
            `https://pokeapi.co/api/v2/pokemon?limit=${limite}&offset=0`,

        collezione: true,

        estrattori: estrattoriPokemon
    },
    {
      nome: 'species',

      indirizzi: contesto =>
        contesto.pokemon.map(pokemon => pokemon.species.url),
      collezione: false,
      estrattori: estrattoriSpecie 
    },
    {
      nome: 'evolution_chains',

      indirizzi: contesto =>
        contesto.species.map(specie => specie.evolution_chain?.url),
      collezione: false,
      estrattori: estrattoriEvoluzione
    }
];


// ======================================================
// ELABORAZIONE JSON
// ======================================================

// NUOVO: applica gli estrattori registrati.
//
// Non scarica dati e non salva file.
// Accetta i JSON già scaricati e li trasforma
// nei rispettivi archivi.

function elaboraJson(documenti, estrattori, archivi) {

    // Prepara gli array destinati ai singoli JSON.

    for (const nomeFile of Object.keys(estrattori)) {
        archivi[nomeFile] ??= [];
    }


    // Per ogni documento applica tutti gli estrattori.

    for (const documento of documenti) {

        for (
            const [nomeFile, estrattore]
            of Object.entries(estrattori)
        ) {

            const risultato = estrattore(documento);

            if (risultato == null) {
                continue;
            }


            // Alcuni estrattori restituiscono una riga,
            // altri possono restituire più righe.

            if (Array.isArray(risultato)) {
                archivi[nomeFile].push(...risultato);
            } else {
                archivi[nomeFile].push(risultato);
            }
        }
    }
}


// ======================================================
// COORDINAMENTO IMPORTAZIONE
// ======================================================

// NUOVO: il coordinatore non contiene più
// la logica HTTP o le trasformazioni specifiche.
//
// Legge le sorgenti registrate, scarica i documenti,
// applica gli estrattori e salva gli archivi.

async function eseguiImportazione() {

    const contesto = {};
    const archivi = {};


    // Elaborazione di tutte le sorgenti registrate.

    for (const sorgente of sorgenti) {

        const indirizzi = sorgente.indirizzi(contesto);

        const documenti = await scaricaJson(
            indirizzi,
            { collezione: sorgente.collezione }
        );

        // Conserviamo i dati scaricati per consentire
        // a eventuali sorgenti successive di utilizzarli.
        contesto[sorgente.nome] = documenti;

        elaboraJson(
            documenti,
            sorgente.estrattori,
            archivi
        );

        console.log(
            `Elaborata sorgente ${sorgente.nome}: ${documenti.length} JSON`
        );
    }


    // Salvataggio dopo il completamento
    // di tutti i download e delle trasformazioni.

    for (
        const [nomeFile, dati]
        of Object.entries(archivi)
    ) {

        const percorso = await salvaJson(nomeFile, dati);

        console.log(
            `Salvato ${nomeFile}.json: ${dati.length} record (${percorso})`
        );
    }

    console.log('Importazione completata');
}

// MODIFICA: avviamo il coordinatore generico.
eseguiImportazione().catch(errore => {
    console.error('Errore durante l\'importazione dei Pokémon:', errore);
    process.exitCode = 1;
});

//!======================================================
//! CODICE PRECEDENTE DISABILITATO
//!======================================================

// PRIMA: caricaPokemon() gestiva direttamente
// il download a blocchi, gli estrattori e il salvataggio.
//
// MODIFICA: queste operazioni sono state separate
// nelle funzioni scaricaJson(), elaboraJson()
// ed eseguiImportazione().
//
// Manteniamo il codice originale commentato.

// async function caricaPokemon() {
//     const urlElenco = `https://pokeapi.co/api/v2/pokemon?limit=${limite}&offset=0`;
//     const elencoPokemon = await scaricaJson(urlElenco);
//     const elenco = elencoPokemon.results;
//
//     // PRIMA (DISABILITATO): const risultati = [];
//     // PRIMA (DISABILITATO): const anagrafiche = [];
//
//     const archivi = {};
//
//     for (const nomeFile of Object.keys(estrattoriPokemon)) {
//         archivi[nomeFile] = [];
//     }
//
//     let elaborati = 0;
//
//     for (let i = 0; i < elenco.length; i += dimensioneBlocco) {
//         const blocco = elenco.slice(i, i + dimensioneBlocco);
//
//         const dettagliBlocco = await Promise.all(
//             blocco.map(voce => scaricaJson(voce.url))
//         );
//
//         for (const pokemon of dettagliBlocco) {
//
//             for (
//                 const [nomeFile, estrattore]
//                 of Object.entries(estrattoriPokemon)
//             ) {
//
//                 const righe = estrattore(pokemon);
//
//                 if (righe == null) continue;
//
//                 if (Array.isArray(righe)) {
//                     archivi[nomeFile].push(...righe);
//                 } else {
//                     archivi[nomeFile].push(righe);
//                 }
//             }
//         }
//
//         elaborati += dettagliBlocco.length;
//
//         console.log(
//             `Importati ${elaborati}/${elenco.length} Pokémon`
//         );
//     }
//
//     for (const [nomeFile, dati] of Object.entries(archivi)) {
//         const percorsoFile = await salvaJson(nomeFile, dati);
//
//         console.log(
//             `Salvato ${nomeFile}.json: ${dati.length} record (${percorsoFile})`
//         );
//     }
// }


// ======================================================
// AVVIO
// ======================================================

// PRIMA (DISABILITATO): avviavamo caricaPokemon().

// caricaPokemon().catch(errore => {
//     console.error('Errore durante l\'importazione dei Pokémon:', errore);
//     process.exitCode = 1;
// });



