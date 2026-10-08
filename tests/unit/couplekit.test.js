'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(global, require('../../utils.js'));
Object.assign(global, require('../../history.js'));
Object.assign(global, require('../../peoplekit.js'));
Object.assign(global, require('../../coherence.js'));
const k = require('../../couplekit.js');

const persons = () => [
    { id: 'a', name: 'Pooh Krittin', nativeName: 'ปูห์ กฤตินทร์', birthName: 'Krittin Infahsaeng' },
    { id: 'b', name: 'Pavel Naiyana', aliases: 'Pavel' },
    { id: 'c', name: 'Perth Tanapon' }, { id: 'd', name: 'Santa Pongsakorn' }
];
const w = (id, year, actors) => ({ id, title: 'Obra ' + id, year, actors });

describe('parejas: estado, línea de tiempo y nombres', () => {
    it('sin dramatismos: recién juntos, consolidada o "trabajaron juntos" según tus obras', () => {
        const couple = { personA: 'a', personB: 'b' };
        const ws = [w(1, 2025, 'Pooh Krittin, Pavel Naiyana'), w(2, 2024, 'Otro')];
        let st = k.coupleStatus(couple, ws, persons(), 2026);
        assert.deepEqual([st.key, st.auto, st.count, st.first, st.last, st.span], ['nueva', true, 1, 2025, 2025, '2025']);
        const three = [w(1, 2021, 'Pooh Krittin, Pavel Naiyana'), w(2, 2023, 'Pavel Naiyana, Pooh Krittin'), w(3, 2025, 'Pooh Krittin, Pavel Naiyana')];
        st = k.coupleStatus(couple, three, persons(), 2026);
        assert.deepEqual([st.key, st.label, st.span], ['consolidada', 'Pareja consolidada', '2021–2025']);
        st = k.coupleStatus(couple, three, persons(), 2029); // desde 2025 hay 4 años sin coincidir
        assert.equal(st.key, 'pasada');
        assert.equal(k.coupleStatus(couple, three, persons(), 2027).key, 'consolidada'); // 2 años: todavía no
        assert.equal(k.coupleStatus({ personA: 'a', personB: 'b' }, [], persons(), 2026), null); // nada que decir
    });
    it('lo que eliges a mano manda, y el primer año sirve si no hay obras con año', () => {
        const couple = { personA: 'a', personB: 'b', status: 'consolidada', since: 2022 };
        const st = k.coupleStatus(couple, [w(1, 2025, 'Pooh Krittin, Pavel Naiyana')], persons(), 2026);
        assert.deepEqual([st.key, st.auto, st.first, st.last, st.span], ['consolidada', false, 2022, 2025, '2022–2025']);
        const manual = k.coupleStatus({ name: 'X', works: 4 }, [], [], 2026); // pareja sin vincular, solo con un número
        assert.deepEqual([manual.key, manual.count, manual.span], ['consolidada', 4, '']);
    });
    it('las obras se encuentran por cualquier nombre artístico, nativo o de nacimiento', () => {
        const couple = { personA: 'a', personB: 'b' };
        const ws = [w(1, 2025, 'ปูห์ กฤตินทร์, Pavel'), w(2, 2023, 'Krittin Infahsaeng, Pavel Naiyana'), w(3, 2020, 'Pooh Krittin')];
        assert.deepEqual(k.coupleTimeline(couple, ws, persons()).map(x => x.work.id), [2, 1]); // de la más antigua a la más nueva
    });
    it('la línea de tiempo deja las obras sin año al final', () => {
        const couple = { workIds: [1, 2, 3] };
        const ws = [{ id: 1, title: 'B', year: 2024 }, { id: 2, title: 'A' }, { id: 3, title: 'C', startDate: '2019-05-01' }];
        assert.deepEqual(k.coupleTimeline(couple, ws, []).map(x => [x.work.id, x.year]), [[3, 2019], [1, 2024], [2, 0]]);
    });
    it('nombre de ship: se sugiere con los nombres artísticos y se busca con o sin espacios', () => {
        assert.equal(k.suggestShip(persons()[0], persons()[1]), 'PoohPavel');
        assert.equal(k.suggestShip(persons()[2], persons()[3]), 'PerthSanta');
        assert.equal(k.suggestShip({ name: 'Win' }, { name: 'win' }), '');
        assert.equal(k.suggestShip(null, persons()[0]), '');
        assert.equal(k.coupleTitle({ name: 'Pooh Krittin & Pavel Naiyana', ship: ' PoohPavel ' }), 'PoohPavel');
        assert.equal(k.coupleTitle({ name: 'Solo nombre' }), 'Solo nombre');
        assert.equal(k.coupleNames({ personA: 'a', personB: 'b' }, persons()), 'Pooh Krittin & Pavel Naiyana');
        const c = { personA: 'a', personB: 'b', ship: 'PoohPavel', name: 'Pareja' };
        assert.equal(k.coupleMatches(c, 'pooh pavel', persons()), true);
        assert.equal(k.coupleMatches(c, 'POOHPAVEL', persons()), true);
        assert.equal(k.coupleMatches(c, 'krittin', persons()), true); // por el nombre de nacimiento de uno
        assert.equal(k.coupleMatches(c, 'ปูห์', persons()), true);    // y por el nativo
        assert.equal(k.coupleMatches(c, 'perth', persons()), false);
        assert.equal(k.coupleMatches(c, '', persons()), true);
        assert.equal(k.coupleMatches(c, 'กฤติ', persons()), true);   // una parte del nombre nativo
        assert.equal(k.coupleMatches(c, 'ไม่มี', persons()), false); // otro texto en tailandés no encaja
    });
});
