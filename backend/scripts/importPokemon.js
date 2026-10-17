
import { mkdir, writeFile, rename } from 'node:fs/promises';

// Configurazione (INVARIATA)
const limite = 9;
const dimensioneBlocco = 10;
const maxTentativi = 3;


// INVARIATA: scarica JSON con timeout e tentativi automatici.
async function scaricaJson(url) {
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
                throw new Error(`Download fallito: ${url}`, { cause: errore });
            }

            console.log(`Tentativo ${tentativo} fallito: ${url}`);

            await new Promise(resolve =>
                setTimeout(resolve, 1000 * tentativo)); // Attesa prima del prossimo tentativo
        }
    }
}


// INVARIATA: una riga per Pokémon, con ID, nome e sei statistiche.
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


// MODIFICA 1: correggo la funzione già preparata per l'anagrafica.
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

function estraiTipi(pokemon){
    return pokemon.types.map(voce => ({
        pokemon_id: pokemon.id,
        pokemon_name: pokemon.name,
        type_id: Number(voce.type.url.split('/').filter(Boolean).at(-1)),
        type_name: voce.type.name,
        slot: voce.slot
    }))
}

// MODIFICA 2: registro qui gli archivi ricavati dalla risposta /pokemon/.
// Per aggiungere tipi, abilità o mosse serviranno:
// - una nuova funzione estrattore
// - una nuova voce in questo oggetto
// Ogni estrattore può restituire un record, un array o null.
const estrattoriPokemon = {
    pokemon: estraiAnagrafica,
    pokemon_stats: estraiStatistiche,
    pokemon_types: estraiTipi
};


// MODIFICA 3: caricaPokemon coordina tutti gli estrattori registrati.
async function caricaPokemon() {
    const urlElenco = `https://pokeapi.co/api/v2/pokemon?limit=${limite}&offset=0`;
    const elencoPokemon = await scaricaJson(urlElenco);
    const elenco = elencoPokemon.results;

    // PRIMA (DISABILITATO): const risultati = [];
    // PRIMA (DISABILITATO): const anagrafiche = [];

    // MODIFICA: un array per ciascun archivio registrato.
    const archivi = {};

    for (const nomeFile of Object.keys(estrattoriPokemon)) {
        archivi[nomeFile] = [];
    }

    let elaborati = 0;

    for (let i = 0; i < elenco.length; i += dimensioneBlocco) {
        const blocco = elenco.slice(i, i + dimensioneBlocco);

        // PRIMA (DISABILITATO): scaricavamo e trasformavamo solo le statistiche.
        // const risultatiBlocco = await Promise.all(
        //     blocco.map(async (voce) => {
        //         const dettagliPokemon = await scaricaJson(voce.url);
        //         return estraiStatistiche(dettagliPokemon);
        //     })
        // );
        // risultati.push(...risultatiBlocco);

        // MODIFICA 4: scarico ogni Pokémon una sola volta.
        const dettagliBlocco = await Promise.all(
            blocco.map(voce => scaricaJson(voce.url))
        );

        // MODIFICA: applico tutti gli estrattori alla stessa risposta.
        for (const pokemon of dettagliBlocco) {

            for (const [nomeFile, estrattore] of Object.entries(estrattoriPokemon)) {

                const righe = estrattore(pokemon);

                if (righe == null) continue;

                // Gestione sia di singoli record sia di array di record.
                if (Array.isArray(righe)) {
                    archivi[nomeFile].push(...righe);
                } else {
                    archivi[nomeFile].push(righe);
                }
            }
        }

        elaborati += dettagliBlocco.length;

        // PRIMA (DISABILITATO): console.log(`Importati ${risultati.length}/${elenco.length} Pokémon`);
        console.log(`Importati ${elaborati}/${elenco.length} Pokémon`);
    }

    // PRIMA (DISABILITATO): const percorsoFile = await salvaJson('pokemon_stats', risultati);

    // MODIFICA 5: salvo automaticamente tutti gli archivi registrati.
    for (const [nomeFile, dati] of Object.entries(archivi)) {
        const percorsoFile = await salvaJson(nomeFile, dati);

        console.log(`Salvato ${nomeFile}.json: ${dati.length} record (${percorsoFile})`);
    }
}


// INVARIATA: salvataggio attraverso file temporaneo, poi rinomina.
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


caricaPokemon().catch(errore => {
    console.error('Errore durante l\'importazione dei Pokémon:', errore);
    process.exitCode = 1;
});
