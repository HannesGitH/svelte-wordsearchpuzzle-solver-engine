import * as Tess from 'svelte-tesseract';
import { derived, writable, Writable, Readable } from 'svelte/store';

export const initialize = async () => {
	await Tess.initialize();
};

/// the image to run recognition on
export const image = Tess.image;

/// what step of the recognition are we currently in
export const status = Tess.status;
/// how far has this step progressed
export const progress = Tess.progress;

/// the complete map of symbols, no words yet
export const symbolMap = derived(Tess.result, ($res) => {
	//TODO: this needs to be more intelligent by creating a bound box etc
	let shortestLength = Infinity;
	let charList: Tesseract.Symbol[][];
	for (const paragraph of $res.data.paragraphs) {
		const symbols = paragraph.symbols;
		if (symbols.length < shortestLength) shortestLength = symbols.length;
		charList.push(symbols);
	}
	//TODO: same thing here , we just cut the tail to make the map rectangular, but using the baselines of each paragraph would be way better..
	return charList.map((row) => row.slice(0, shortestLength));
});

///the language in which we try to find words
export const chosenLanguage = writable(<Language>{ id: 'en', name: 'English (US)' });

interface Word {
	word: string;
	symbols: Tesseract.Symbol[];
}

const _foundWords: Writable<Set<Word>> = writable();

/// the actual store to subscribe to
export const foundWords: Readable<Set<Word>> = { subscribe: _foundWords.subscribe };

/// triggers when language or symbolmap have change to find all words
const _findWords = derived([symbolMap, chosenLanguage], ([$map, $lang]) => {
	_foundWords.set(new Set());

	//check rows
	$map.forEach((row, x) => {
		row.forEach((symStart, y1) => {
			row.slice(y1 + 1).forEach((symEnd, y2) => {
				_checkSymbols(row.slice(y1, y2), $lang.id);
			});
		});
	});

	//check columns
	for (let y = 0; y < $map[0].length; y++) {
		for (let x1 = 0; x1 < $map.length - 1; x1++) {
			let currentSymbols: Tesseract.Symbol[] = [$map[x1][y], $map[x1 + 1][y]]; // at least to symbols
			for (let x2 = x1 + 1; x2 < $map.length; x2++) {
				currentSymbols.push($map[x2][y]);
				_checkSymbols(currentSymbols, $lang.id);
			}
		}
	}

	//TODO: check diagonals
});

///helperfunction to check whether a list of symbols is an actual word in the given language
const _checkSymbols = async (currentSymbols: Tesseract.Symbol[], lang: string) => {
	const wordstring = currentSymbols.map((sym) => sym.text).reduce((acc, val) => acc + val, '');
	const api_url = `https://api.dictionaryapi.dev/api/v2/entries/${lang}/${wordstring}`;
	const res = await fetch(api_url);
	if (res.status != 200) return;
	let json = await res.json();
	json.symbols = currentSymbols;
	_foundWords.update((words) => words.add(json as Word));
};

interface Language {
	id: string;
	name: string;
}

/// extracted from api.dictionaryapi.dev
export const SUPPORTED_LANGUAGES = new Set<Language>([
	{ id: 'hi', name: 'Hindi' },
	{ id: 'en', name: 'English (US)' },
	{ id: 'en-uk', name: 'English (UK)' },
	{ id: 'es', name: 'Spanish' },
	{ id: 'fr', name: 'French' },
	{ id: 'ja', name: 'Japanese' },
	{ id: 'cs', name: 'Czech' },
	{ id: 'nl', name: 'Dutch' },
	{ id: 'sk', name: 'Slovak' },
	{ id: 'ru', name: 'Russian' },
	{ id: 'de', name: 'German' },
	{ id: 'it', name: 'Italian' },
	{ id: 'ko', name: 'Korean' },
	{ id: 'pt-BR', name: 'Brazilian Portuguese' },
	{ id: 'ar', name: 'Arabic' },
	{ id: 'tr', name: 'Turkish' }
]);
