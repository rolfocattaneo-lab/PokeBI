
import { mkdir, writeFile, rename } from 'node:fs/promises';

//Configurazione
const limite = 9;
const dimensioneBlocco = 10;
const maxTentativi = 3;

async function scaricaJson(url) {
    for (let tentativo = 1; tentativo <= maxTentativi; tentativo++) {
        try{
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

function estraiStatistiche(pokemon) {
    const statistiche = { 
        pokemon_id: pokemon.id, 
        pokemon_name: pokemon.name};

    for (const voce of pokemon.stats) {
        const nomeStatistica = voce.stat.name.replaceAll('-', '_');
        statistiche[nomeStatistica] = voce.base_stat;
    }

    return statistiche;
}

async function caricaPokemon() {
    const urlElenco = `https://pokeapi.co/api/v2/pokemon?limit=${limite}&offset=0`;
    const elencoPokemon = await scaricaJson(urlElenco);

    const risultati = [];
    const elenco = elencoPokemon.results;
    
    for (let i = 0; i < elenco.length; i += dimensioneBlocco){
        const blocco = elenco.slice(i, i + dimensioneBlocco);

        const risultatiBlocco = await Promise.all(
            blocco.map(async (voce) => {
                const dettagliPokemon = await scaricaJson(voce.url);
                return estraiStatistiche(dettagliPokemon);
            })
        );

        risultati.push(...risultatiBlocco);

        console.log(`Importati ${risultati.length}/${elenco.length} Pokémon`);
    }

    const cartella = new URL('../../data/', import.meta.url);
    const percorso = new URL('pokemon_stats.json', cartella);
    const temporaneo = new URL('pokemon_stats_temp.json', cartella);

    await mkdir(cartella, { recursive: true });
    await writeFile(temporaneo, JSON.stringify(risultati, null, 2), 'utf-8');
    await rename(temporaneo, percorso);

    console.log(`Importazione completata: ${risultati.length} Pokémon`);
    console.log(`File salvato: ${percorso}`);
}

caricaPokemon().catch(errore => {
    console.error('Errore durante l\'importazione dei Pokémon:', errore);
    process.exitCode = 1;
});