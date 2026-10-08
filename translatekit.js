/*
 * Mi Mundo · translatekit.js
 * Sinopsis en español: detecta si un texto ya está en español y, si no, lo traduce con MyMemory
 * (servicio gratuito, sin clave, unos 5.000 caracteres al día). Si falla, el texto original se queda como estaba.
 * Las funciones de detección y troceado son puras; `translateToSpanish` recibe `fetchFn` para poder probarla.
 */
'use strict';

const ES_WORDS = new Set('el la los las de del que y en un una unos unas por con para su sus se es al lo como más pero sin sobre entre cuando también muy ya son fue ser hay esta este estos estas porque donde mientras tras desde hasta'.split(' '));
const EN_WORDS = new Set('the and of to in is a an that with for his her he she they their it on as at by from who which after when while into but not are was were be has have this these those one two young world after before between'.split(' '));
/** 'es' | 'en' | 'other' (otro alfabeto: japonés, coreano…) | '' (muy corto para saberlo). Solo mira palabras sueltas muy comunes. */
function detectTextLang(text) {
    const t = String(text || '').trim();
    if (t.replace(/[\s\d\p{P}]/gu, '').length < 12) return '';
    const letters = t.replace(/[\s\d\p{P}]/gu, '');
    const latin = (letters.match(/\p{Script=Latin}/gu) || []).length;
    if (latin / letters.length < 0.6) return 'other';
    const words = t.toLowerCase().normalize('NFC').split(/[^\p{L}']+/u).filter(Boolean);
    let es = 0, en = 0;
    words.forEach(w => { if (ES_WORDS.has(w)) es++; if (EN_WORDS.has(w)) en++; });
    if (/[ñ¿¡áéíóú]/i.test(t)) es += 2;
    if (!es && !en) return '';
    return es >= en ? 'es' : 'en';
}
/** ¿Hace falta traducirla? Sí si parece inglés (u otro idioma); no si ya está en español o no se sabe. */
const needsTranslation = text => ['en', 'other'].includes(detectTextLang(text));

/** Parte un texto en trozos de como mucho `max` caracteres, cortando entre frases. */
function splitForTranslation(text, max = 450) {
    const sentences = String(text || '').replace(/\s*\n+\s*/g, ' \n ').split(/(?<=[.!?…。！？])\s+/);
    const chunks = [];
    let cur = '';
    const push = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ''; };
    sentences.forEach(sn => {
        let s = sn;
        while (s.length > max) { // una "frase" enorme: se corta por espacios
            const cut = s.lastIndexOf(' ', max);
            const at = cut > max * 0.4 ? cut : max;
            if ((cur + ' ' + s.slice(0, at)).length > max) push();
            cur += (cur ? ' ' : '') + s.slice(0, at);
            push();
            s = s.slice(at).trim();
        }
        if ((cur + ' ' + s).length > max) push();
        cur += (cur ? ' ' : '') + s;
    });
    push();
    return chunks;
}
const decodeEntities = s => String(s || '').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
/** Respuesta de MyMemory → texto traducido (lanza error si el servicio avisa de que se acabó el cupo). */
function parseMyMemory(json) {
    const status = Number((json || {}).responseStatus);
    const text = decodeEntities(((json || {}).responseData || {}).translatedText);
    if (status && status !== 200) throw new Error(status === 429 ? 'cupo' : 'HTTP ' + status);
    if (!text || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(text)) throw new Error('cupo');
    return text;
}
/** Traduce un texto al español, trozo a trozo. Devuelve el texto traducido; lanza error si algo falla (sin conexión, cupo diario…). */
async function translateToSpanish(text, { fetchFn = fetch, from = '' } = {}) {
    const lang = from || (detectTextLang(text) === 'en' ? 'en' : 'Autodetect');
    const out = [];
    for (const chunk of splitForTranslation(text)) {
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 9000) : null;
        try {
            const res = await fetchFn(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${lang}|es`, ctrl ? { signal: ctrl.signal } : {});
            if (!res.ok) throw new Error('HTTP ' + res.status);
            out.push(parseMyMemory(await res.json()));
        } finally { if (timer) clearTimeout(timer); }
    }
    return out.join(' ').replace(/ ?\n ?/g, '\n').trim();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { detectTextLang, needsTranslation, splitForTranslation, parseMyMemory, translateToSpanish };
}
