'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(global, require('../../utils.js'));
const h = require('../../history.js');

const NOW = new Date(2026, 9, 4, 15, 0).getTime();
const DAY = 86400000;
function sample() {
    return normalizeData({
        works: [
            { id: 'a', type: 'book', title: 'Libro A', status: 'leyendo', progress: 10 },
            { id: 'b', type: 'series', title: 'Serie B', status: 'viendo', progress: 2 }
        ],
        notes: [{ id: 'n1', workId: 'a', workTitle: 'Libro A', content: 'Hola' }],
        collections: [{ id: 'c1', name: 'Top', items: ['a', 'b'] }],
        persons: [{ id: 'p1', name: 'Ana' }]
    });
}

describe('papelera', () => {
    it('normalizeData separa lo que está en la papelera aunque venga mezclado', () => {
        const d = normalizeData({ works: [{ id: 'x', type: 'book', title: 'X', trashedAt: NOW }, { id: 'y', type: 'book', title: 'Y' }] });
        assert.deepEqual(d.works.map(w => w.id), ['y']);
        assert.deepEqual(d.trash.works.map(w => w.id), ['x']);
        // y vuelve a separarlo si llega ya separado
        assert.deepEqual(normalizeData(d).trash.works.map(w => w.id), ['x']);
    });
    it('una obra va a la papelera con sus notas, sale de sus colecciones y vuelve a ellas al restaurarla', () => {
        const d = sample();
        h.trashRecord(d, 'works', 'a', NOW, { from: 'Libros' });
        assert.deepEqual(d.works.map(w => w.id), ['b']);
        assert.equal(d.notes.length, 0);
        assert.deepEqual(d.collections[0].items, ['b']);
        assert.equal(d.trash.works[0].trashInfo.from, 'Libros');
        assert.deepEqual(h.trashEntries(d).map(e => [e.kind, e.item.id, e.extra]), [['works', 'a', 1]]);
        h.restoreRecord(d, 'works', 'a');
        assert.deepEqual(d.works.map(w => w.id).sort(), ['a', 'b']);
        assert.equal(d.notes[0].id, 'n1');
        assert.equal(d.notes[0].trashedAt, undefined);
        assert.deepEqual(d.collections[0].items, ['b', 'a']);
        assert.equal(h.trashCount(d), 0);
    });
    it('borrar para siempre una obra también borra sus notas de la papelera', () => {
        const d = sample();
        h.trashRecord(d, 'works', 'a', NOW);
        h.purgeRecord(d, 'works', 'a');
        assert.equal(d.trash.works.length + d.trash.notes.length, 0);
    });
    it('lo que lleva más de 30 días se borra solo', () => {
        const d = sample();
        h.trashRecord(d, 'persons', 'p1', NOW - 31 * DAY);
        h.trashRecord(d, 'works', 'b', NOW - 2 * DAY);
        assert.equal(h.trashDaysLeft(d.trash.works[0], NOW), 28);
        assert.equal(h.purgeExpiredTrash(d, NOW), 1);
        assert.equal(d.trash.persons.length, 0);
        assert.equal(d.trash.works.length, 1);
    });
});

describe('deshacer y rehacer', () => {
    it('diffIndex + applyChanges deshacen y rehacen altas, cambios y borrados', () => {
        const d = sample();
        const before = h.indexRecords(d);
        d.works[0].title = 'Cambiado';
        d.works.push({ id: 'c', type: 'anime', title: 'Nuevo' });
        h.trashRecord(d, 'persons', 'p1', NOW);
        d.settings.userName = 'Eve';
        const changes = h.diffIndex(before, h.indexRecords(d));
        assert.equal(changes.length, 4);
        h.applyChanges(d, changes, 'before');
        assert.equal(d.works[0].title, 'Libro A');
        assert.ok(!d.works.some(w => w.id === 'c'));
        assert.equal(d.persons[0].id, 'p1');
        assert.equal(d.trash.persons.length, 0);
        assert.equal(d.settings.userName, 'Sara');
        h.applyChanges(d, changes, 'after');
        assert.equal(d.works[0].title, 'Cambiado');
        assert.ok(d.works.some(w => w.id === 'c'));
        assert.equal(d.trash.persons[0].id, 'p1');
        assert.equal(d.settings.userName, 'Eve');
    });
    it('sin cambios no hay nada que deshacer', () => {
        const d = sample();
        assert.deepEqual(h.diffIndex(h.indexRecords(d), h.indexRecords(d)), []);
    });
});

describe('versiones de una obra', () => {
    it('apunta los campos que cambian y junta los cambios seguidos', () => {
        const d = sample();
        let before = h.indexRecords(d);
        d.works[0].progress = 11;
        d.works[0].updatedAt = NOW; // no cuenta
        h.recordVersions(before, d, NOW);
        before = h.indexRecords(d);
        d.works[0].progress = 12;
        h.recordVersions(before, d, NOW + 60000);
        assert.deepEqual(d.works[0].versions, [{ at: NOW + 60000, changes: { progress: [10, 12] } }]);
        before = h.indexRecords(d);
        d.works[0].status = 'terminado';
        h.recordVersions(before, d, NOW + 3600000);
        assert.equal(d.works[0].versions.length, 2);
        assert.deepEqual(d.works[0].versions[1].changes, { status: ['leyendo', 'terminado'] });
    });
    it('si un cambio se deshace dentro de la misma entrada, la entrada desaparece', () => {
        const d = sample();
        let before = h.indexRecords(d);
        d.works[0].progress = 11;
        h.recordVersions(before, d, NOW);
        before = h.indexRecords(d);
        d.works[0].progress = 10;
        h.recordVersions(before, d, NOW + 1000);
        assert.equal(d.works[0].versions, undefined);
    });
    it('guarda como mucho 10 versiones', () => {
        const d = sample();
        for (let i = 0; i < 14; i++) {
            const before = h.indexRecords(d);
            d.works[0].progress = 20 + i;
            h.recordVersions(before, d, NOW + i * DAY);
        }
        assert.equal(d.works[0].versions.length, h.MAX_VERSIONS);
    });
    it('workBeforeVersion vuelve a como estaba antes de un cambio (deshaciendo los posteriores)', () => {
        const w = { id: 'a', title: 'B', status: 'terminado', rating: 5, versions: [
            { at: 1, changes: { title: ['A', 'B'] } },
            { at: 2, changes: { status: ['leyendo', 'terminado'], rating: [null, 5] } }
        ] };
        assert.deepEqual(h.workBeforeVersion(w, 1), { id: 'a', title: 'B', status: 'leyendo', versions: w.versions });
        const first = h.workBeforeVersion(w, 0);
        assert.equal(first.title, 'A');
        assert.equal(first.status, 'leyendo');
    });
});

describe('duplicar y títulos parecidos', () => {
    it('duplicateWork crea una copia pendiente sin progreso ni fechas, también de otro tipo', () => {
        const w = { id: 'a', type: 'manhwa', title: 'Solo Leveling', status: 'terminado', progress: 179, rating: 5, startDate: '2026-01-01', endDate: '2026-02-01', tags: 'acción', versions: [{}], activity: { x: 1 }, locked: true, favorite: true };
        const same = h.duplicateWork(w, { id: 'b', now: NOW });
        assert.equal(same.title, 'Solo Leveling (copia)');
        assert.equal(same.status, 'quiero leer');
        assert.equal(same.progress, 0);
        assert.equal(same.tags, 'acción');
        ['startDate', 'endDate', 'versions', 'activity', 'locked'].forEach(f => assert.equal(same[f], undefined, f));
        const anime = h.duplicateWork(w, { type: 'anime', id: 'c', now: NOW });
        assert.equal(anime.title, 'Solo Leveling');
        assert.equal(anime.type, 'anime');
        assert.equal(anime.status, 'quiero ver');
        assert.equal(w.progress, 179); // el original no cambia
    });
    it('titleSimilarity ignora tildes, mayúsculas y signos, y detecta erratas', () => {
        assert.equal(h.titleSimilarity('El Nombre del Viento', 'el nombre del viento!'), 1);
        assert.ok(h.titleSimilarity('Jujutsu Kaisen', 'Jujutsu Kaisn') > 0.85);
        assert.ok(h.titleSimilarity('Jujutsu Kaisen', 'Jujutsu Kaisen 0') >= 0.85);
        assert.ok(h.titleSimilarity('Solo Leveling', 'True Beauty') < 0.5);
    });
    it('findSimilarWorks devuelve las más parecidas, sin la propia obra', () => {
        const works = [{ id: '1', title: 'Spy x Family' }, { id: '2', title: 'Spy x Family Code: White' }, { id: '3', title: 'Bleach' }];
        assert.deepEqual(h.findSimilarWorks('spy x famly', works).map(x => x.work.id), ['1']);
        assert.deepEqual(h.findSimilarWorks('Spy x Family', works, { excludeId: '1' }).map(x => x.work.id), ['2']);
        assert.deepEqual(h.findSimilarWorks('ab', works), []);
    });
});
