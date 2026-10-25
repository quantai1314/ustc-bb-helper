import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../USTC-BB-Helper.user.js', import.meta.url), 'utf8');
const previewSource = await readFile(new URL('./preview.mjs', import.meta.url), 'utf8');
const prototypeArrayFrom = `
    function $A(iterable) {
        if (!iterable) return [];
        if ('toArray' in Object(iterable)) return iterable.toArray();
        var length = iterable.length || 0, results = new Array(length);
        while (length--) results[length] = iterable[length];
        return results;
    }
    Array.from = $A;
`;

function extractFunction(name, indent = 4) {
    const spaces = ' '.repeat(indent);
    const match = new RegExp(`^${spaces}(?:async )?function ${name}\\(`, 'm').exec(source);
    assert.ok(match, `userscript function ${name} must exist`);
    const boundary = `\n${spaces}}`;
    const end = source.indexOf(boundary, match.index);
    assert.ok(end > match.index, `userscript function ${name} must have a closing boundary`);
    return source.slice(match.index, end + boundary.length);
}

function contextFor(name, bindings = {}) {
    const context = vm.createContext({ console, URL, ...bindings });
    vm.runInContext(prototypeArrayFrom, context);
    vm.runInContext(`const normalizeName = name => name.replace(/\\s+/g, ' ').trim();\n${extractFunction(name)}`, context);
    return context;
}

const entry = (courseId, contentId, name) => ({
    courseId, contentId, name,
    link: `https://bb.fixture/webapps/assignment/uploadAssignment?course_id=${courseId}&content_id=${contentId}`,
});

test('fixture reproduces Prototype Array.from dropping Set and mapper', () => {
    const context = vm.createContext({});
    vm.runInContext(prototypeArrayFrom, context);
    const result = vm.runInContext(`(() => {
        let calls = 0;
        const values = Array.from(new Set(['course-a', 'course-b']), () => { calls++; });
        return { length: values.length, calls };
    })()`, context);
    assert.equal(result.length, 0);
    assert.equal(result.calls, 0);
});

test('preview enables the real compatibility shim and legacy zero seed', () => {
    const storage = {
        getItem(key) { return this[key] ?? null; },
        setItem(key, value) { this[key] = String(value); },
        removeItem(key) { delete this[key]; },
    };
    const context = vm.createContext({
        process: { env: { BB_PREVIEW_LEGACY_ZERO_CACHE: '1' } },
        URLSearchParams, baseCss: '', portalPath: '/portal',
        listUrl: id => `/list?course_id=${id}`, esc: text => String(text),
        localStorage: storage,
        location: { origin: 'https://bb.fixture', reload() {} },
        document: { getElementById: () => ({ addEventListener() {} }) },
    });
    const start = previewSource.indexOf('function shell(');
    const end = previewSource.indexOf('\nfunction portal(', start);
    assert.ok(start >= 0 && end > start);
    vm.runInContext(previewSource.slice(start, end), context);
    const html = context.shell('我的主页', '');
    const inlineScript = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
    assert.ok(inlineScript);
    vm.runInContext(inlineScript, context);
    assert.equal(vm.runInContext('Array.from(new Set([1])).length', context), 0);
    const cached = JSON.parse(storage.getItem('ustc-bb-portal'));
    assert.equal(cached.schema, undefined);
    assert.equal(cached.data._102_1.u, 0);
    assert.equal(cached.data._102_1.url, 'https://bb.fixture/list?course_id=_102_1');
});

test('batch dispatch and all callbacks survive Blackboard Prototype override', async () => {
    const entries = [entry('a', 'a1', '第一项'), entry('a', 'a2', '第二项'), entry('b', 'b1', '第三项')];
    const requested = [];
    const completed = [];
    const submitted = [];
    const context = contextFor('refreshStatuses', {
        queryGradeStatuses: async courseId => {
            requested.push(courseId);
            return new Map([['第一项', [2, null]], ['第二项', [1, null]], ['第三项', [5, '96 /100']]]);
        },
        queryStatus: async () => assert.fail('unique known batch results must not open assignment pages'),
        markSubmitted: (...args) => submitted.push(args),
    });
    await context.refreshStatuses(entries, (item, result) => completed.push([item.contentId, result[0]]));
    assert.deepEqual(requested.sort(), ['a', 'b']);
    assert.deepEqual(completed.sort(), [['a1', 2], ['a2', 1], ['b1', 5]]);
    assert.equal(submitted.length, entries.length);
});

test('duplicate titles fall back even when one duplicate is outside refresh subset', async () => {
    const allEntries = [entry('a', 'a1', '同名'), entry('a', 'a2', '同名')];
    const requested = [];
    const completed = [];
    const context = contextFor('refreshStatuses', {
        queryGradeStatuses: async () => new Map([['同名', [1, null]]]),
        queryStatus: async link => { requested.push(link); return [2, null]; },
        markSubmitted: () => {},
    });
    await context.refreshStatuses([allEntries[0]], (item, result) => completed.push(result[0]), allEntries);
    assert.deepEqual(requested, [allEntries[0].link]);
    assert.deepEqual(completed, [2]);
});

test('unavailable or ambiguous batch results fall back and report individual failures', async () => {
    const entries = [entry('a', 'a1', '缺失'), entry('a', 'a2', '不明确')];
    const requested = [];
    const completed = [];
    const context = contextFor('refreshStatuses', {
        queryGradeStatuses: async () => new Map([['不明确', null]]),
        queryStatus: async link => { requested.push(link); return link === entries[0].link ? [2, null] : [3, null]; },
        markSubmitted: () => {},
    });
    await context.refreshStatuses(entries, (item, result) => completed.push([item.contentId, result[0]]));
    assert.deepEqual(requested.sort(), entries.map(item => item.link).sort());
    assert.deepEqual(completed.sort(), [['a1', 2], ['a2', 3]]);
});

function countContext(refreshStatuses) {
    const entries = [entry('a', 'a1', '第一项'), entry('a', 'a2', '第二项')];
    const list = { children: entries.map(item => ({
        querySelector: () => ({ textContent: item.name, getAttribute: () => item.link }),
    })) };
    class FixtureDOMParser {
        parseFromString() { return { getElementById: () => list }; }
    }
    return contextFor('countUnsubmitted', {
        DOMParser: FixtureDOMParser,
        fetchWithRetry: async () => '<fixture list>',
        getIgnored: () => [],
        getSubmitted: () => ({}),
        refreshStatuses,
    });
}

test('partial results retain known count and failure instead of complete zero', async () => {
    const progress = [];
    const context = countContext(async (entries, onResult) => {
        onResult(entries[0], [2, null]);
        onResult(entries[1], [3, null]);
    });
    const result = await context.countUnsubmitted('a', 'https://bb.fixture/area', value => progress.push(value));
    assert.equal(result.u, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.pending, 0);
    assert.ok(progress.some(value => value.u === 1 && value.pending === 1));
});

test('silently skipped callbacks cannot leave a successful zero result', async () => {
    // This was the production failure: Promise.all([]) fulfilled without processing any item.
    const context = countContext(async () => {});
    const result = await context.countUnsubmitted('a', 'https://bb.fixture/area', () => {});
    assert.ok(result.failed >= 2, 'unresolved items must be marked as failed, never cached as a complete zero');
});

function cacheContext(initial = null) {
    let stored = initial === null ? null : JSON.stringify(initial);
    const context = vm.createContext({
        localStorage: {
            getItem: () => stored,
            setItem: (_key, value) => { stored = value; },
        },
    });
    const schema = source.match(/^    const CACHE_SCHEMA = .+;$/m)?.[0];
    assert.ok(schema, 'cache schema must be versioned');
    vm.runInContext(`${prototypeArrayFrom}\n${schema}\nconst today = '2026-10-25';\n${[
        'readCourseCache', 'saveCourseCache', 'syncPortalCount',
    ].map(name => extractFunction(name)).join('\n')}`, context);
    return { context, readStored: () => JSON.parse(stored) };
}

test('legacy zero statistics migrate as URL only and cannot suppress a fresh count', () => {
    const { context } = cacheContext({
        date: '2026-10-25',
        data: { a: { u: 0, hw: true, url: 'https://bb.fixture/area', states: { a1: { s: 1 } } } },
    });
    const entry = context.readCourseCache().a;
    assert.equal(entry.url, 'https://bb.fixture/area');
    assert.equal(entry.u, undefined);
    assert.equal(entry.states, undefined);
});

test('cache rejects a zero with unresolved items or failures but retains reusable states', () => {
    const { context, readStored } = cacheContext();
    const states = { a1: { s: 2, e: null } };
    context.saveCourseCache('a', { u: 0, pending: 1, failed: 0, states });
    assert.equal(readStored().data.a.u, null);
    context.saveCourseCache('a', { u: 0, pending: 0, failed: 1, states });
    assert.equal(readStored().data.a.u, null);
    assert.deepEqual(readStored().data.a.states, states);
    context.saveCourseCache('a', { u: 1, pending: 0, failed: 0, states });
    assert.equal(readStored().data.a.u, 1);
});

test('homework synchronization shares pending and completed item snapshots', () => {
    const { context, readStored } = cacheContext();
    context.syncPortalCount('a', 1, 'https://bb.fixture/area', [
        { contentId: 'a1', status: 2, extra: null },
        { contentId: 'a2', status: 5, extra: '96 /100' },
        { contentId: 'a3', status: 4, ignored: true },
    ]);
    const cached = readStored().data.a;
    assert.equal(cached.u, 1);
    assert.equal(cached.total, 3);
    assert.equal(cached.ignored, 1);
    assert.deepEqual(cached.states, { a1: { s: 2, e: null }, a2: { s: 5, e: '96 /100' } });
});

test('older refresh completion cannot unlock a restored item or count a later ignore', async () => {
    const a = { ...entry('a', 'a1', '第一项'), status: 0, refreshing: true, ignored: false };
    const b = { ...entry('a', 'a2', '第二项'), status: 0, refreshing: true, ignored: false };
    const entries = [a, b];
    const requests = [];
    const ignoreWrites = [];
    const syncedCounts = [];
    const context = vm.createContext({
        entries, entry: a, location: { href: 'https://bb.fixture/area' },
        render() {}, invalidatePortal() {},
        ignoreHw: (...args) => ignoreWrites.push(args),
        syncPortalCount: (_courseId, count) => syncedCounts.push(count),
        refreshStatuses(items, onResult) {
            let resolve;
            const promise = new Promise(done => { resolve = done; });
            requests.push({ items, onResult, promise, resolve });
            return promise;
        },
    });
    vm.runInContext(`${prototypeArrayFrom}\n${extractFunction('syncPortal', 8)}\n${extractFunction('refresh', 8)}`, context);
    // Exercise the real ignore/restore handler, including its pending-query guard.
    const marker = "entry.toggle.addEventListener('click', ";
    const start = source.indexOf(marker) + marker.length;
    const end = source.indexOf('\n            });', start);
    assert.ok(start >= marker.length && end > start);
    vm.runInContext(`var clickHandler = ${source.slice(start, end)}\n};`, context);
    const click = () => context.clickHandler({ preventDefault() {}, stopPropagation() {} });

    const firstRefresh = context.refresh(entries);
    requests[0].onResult(a, [2, null]);
    click(); // Ignore the already resolved A while B is still being queried.
    click(); // Restore A and start a second, independent query for it.
    assert.equal(requests.length, 2);
    assert.equal(a.refreshing, true);

    requests[0].onResult(b, [2, null]);
    requests[0].resolve();
    await firstRefresh;
    assert.equal(a.refreshing, true, 'old batch cleanup must leave the newer restore query running');
    assert.equal(a.status, 0, 'a valid newer query must not be changed into a failure');
    click(); // Must remain disabled until the restore query returns.
    assert.equal(ignoreWrites.length, 2, 'pending restore must not accept another ignore action');
    assert.equal(a.ignored, false);
    assert.deepEqual(syncedCounts, [], 'no complete count may be synchronized while the restore is pending');

    requests[1].onResult(a, [2, null]);
    requests[1].resolve();
    await requests[1].promise;
    assert.equal(a.refreshing, false);
    assert.equal(a.status, 2);
    click(); // Once enabled, ignoring A must persist and remove it from the count.
    assert.equal(a.ignored, true);
    assert.equal(a.status, 4);
    assert.equal(syncedCounts.at(-1), 1);
});
