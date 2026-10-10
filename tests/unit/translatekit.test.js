'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { detectTextLang, needsTranslation, splitForTranslation, parseMyMemory, translateToSpanish } = require('../../translatekit.js');

test('detecta si un texto está en español, inglés u otro alfabeto', () => {
    assert.equal(detectTextLang('Two young men fall in love while they study at the university.'), 'en');
    assert.equal(detectTextLang('Dos jóvenes se enamoran mientras estudian en la universidad.'), 'es');
    assert.equal(detectTextLang('二人の青年が大学で出会い、恋に落ちる物語です。'), 'other');
    assert.equal(detectTextLang('Hola'), '');
    assert.equal(needsTranslation('A spy, an assassin and a telepath form a family for the world.'), true);
    assert.equal(needsTranslation('Un espía, una asesina y una telépata forman una familia.'), false);
    assert.equal(needsTranslation(''), false);
});
test('trocea por frases sin pasarse del límite', () => {
    const text = 'Primera frase. '.repeat(10) + 'Una última frase más larga que las otras para cerrar.';
    const parts = splitForTranslation(text, 60);
    assert.ok(parts.length > 1);
    assert.ok(parts.every(p => p.length <= 60), parts.map(p => p.length).join());
    assert.equal(parts.join(' ').replace(/\s+/g, ' '), text.replace(/\s+/g, ' '));
    assert.equal(splitForTranslation('corta', 450).length, 1);
    const long = splitForTranslation('palabra '.repeat(200), 100);
    assert.ok(long.every(p => p.length <= 100));
});
test('lee la respuesta de MyMemory y avisa del cupo', () => {
    assert.equal(parseMyMemory({ responseStatus: 200, responseData: { translatedText: 'Hola &quot;mundo&quot;' } }), 'Hola "mundo"');
    assert.throws(() => parseMyMemory({ responseStatus: 429, responseData: { translatedText: '' } }), /cupo/);
    assert.throws(() => parseMyMemory({ responseStatus: 200, responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY' } }), /cupo/);
});
test('traduce por trozos y pega el resultado', async () => {
    const calls = [];
    const fetchFn = async url => { calls.push(url); const q = decodeURIComponent(new URL(url).searchParams.get('q')); return { ok: true, json: async () => ({ responseStatus: 200, responseData: { translatedText: 'ES:' + q.slice(0, 5) } }) }; };
    const text = 'The first sentence is here. '.repeat(30);
    const out = await translateToSpanish(text, { fetchFn });
    assert.ok(calls.length > 1);
    assert.ok(calls.every(u => u.includes('langpair=en%7Ces') || u.includes('langpair=en|es')));
    assert.match(out, /^ES:The f/);
    await assert.rejects(translateToSpanish('Some english text that is here for the world', { fetchFn: async () => ({ ok: false, status: 500 }) }), /HTTP 500/);
});
