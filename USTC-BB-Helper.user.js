// ==UserScript==
// @name         USTC BB Helper
// @name:zh-CN   USTC BB 助手
// @license      gpl-3.0
// @namespace    ustc-bb-helper
// @version      1.4.7
// @description  Enhancements for USTC Blackboard: course and homework overviews, filterable homework status badges with keyboard-accessible ignore controls, courses sorted by unsubmitted homework with direct links, personalized color theme on all pages, auto login and off-campus authentication. Based on PRO's USTC Helper (GPL-3.0), no external dependencies.
// @description:zh-CN  为中科大 bb 网络教学平台增强：课程与作业概览、提交状态筛选、支持键盘操作的忽略按钮；主页按未提交作业数排序，点击课程直达作业区；主页个性化主题颜色全站生效；自动登录及校外认证。基于 PRO 的 USTC Helper (GPL-3.0) bb 模块修复而来，无任何外部依赖。
// @match        https://www.bb.ustc.edu.cn/*
// @match        https://bb.ustc.edu.cn/*
// @icon         https://www.bb.ustc.edu.cn/images/ci/icons/favicon.ico
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';
    const log = console.log.bind(console, "[USTC BB Helper]");
    const path = window.location.pathname;

    // ---------- 校外访问 / 登录页 ----------
    if (path === '/nginx_auth/') {
        // 校外访问时自动点击认证链接
        document.querySelector('a')?.click();
        return;
    }
    if (path === '/' || path === '/webapps/login/') {
        // 登录页自动点击「统一身份认证登录」
        document.querySelector('#login > table > tbody > tr > td:nth-child(2) > span > a')?.click();
        return;
    }

    const isContentList = path === '/webapps/blackboard/content/listContent.jsp'
        || path === '/webapps/blackboard/content/listContentEditable.jsp';
    const isPortal = path === '/webapps/portal/execute/tabs/tabAction';
    const isAssignment = path.startsWith('/webapps/assignment/');

    // ---------- 主题跟随：主页个性化配色应用到所有页面 ----------
    // BB 只给主页加载 /colorpalettes/<主题>/generated/colorpalette.generated.modern.css
    const themeLink = document.querySelector('link[href*="/colorpalettes/"]');
    if (isPortal) {
        // 记录当前主题；主页换主题（或换回无主题的默认样式）后打开一次主页即更新
        try {
            if (themeLink) localStorage.setItem('ustc-bb-theme', themeLink.href);
            else localStorage.removeItem('ustc-bb-theme');
        } catch (e) { /* ignore */ }
    } else if (!themeLink) {
        let themeHref = null;
        try { themeHref = localStorage.getItem('ustc-bb-theme'); } catch (e) { /* ignore */ }
        if (themeHref) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = themeHref;
            document.head.appendChild(link); // 追加在最后，覆盖默认配色
        }
    }

    if (!isContentList && !isPortal && !isAssignment) return;

    // ---------- 共用 ----------
    const css = document.createElement('style');
    css.textContent = `
        .ustc-bb-overview, .ustc-bb-hint, .ustc-bb-filters, .ustc-bb-ignore {
            font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
            box-sizing: border-box;
        }
        .ustc-bb-overview {
            margin: 12px 0 16px;
            padding: 14px 16px;
            border: 1px solid #dbe3ed;
            border-radius: 10px;
            background: #f8fafc;
            color: #172b4d;
        }
        .ustc-bb-overview h3 { margin: 0 0 10px; padding: 0; font-size: 15px; font-weight: 700; }
        .ustc-bb-overview p { margin: 10px 0 0; color: #52627a; font-size: 12px; line-height: 1.6; }
        /* BB 的 contentList 默认带负上外边距；插入概览后仅取消这一方向的负间距。 */
        .ustc-bb-overview + #content_listContainer { margin-top: 0; }
        .ustc-bb-stats { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 0; padding: 0; }
        .ustc-bb-stat { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; }
        .ustc-bb-stat dt { font-size: 12px; color: #52627a; }
        .ustc-bb-stat dd { margin: 0; color: #172b4d; font-size: 21px; font-weight: 700; line-height: 1.4; font-variant-numeric: tabular-nums; }
        .ustc-bb-stat:first-child dd { color: #b42318; }
        .ustc-bb-filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; }
        .ustc-bb-filters button {
            appearance: none; display: inline-flex; align-items: center; gap: 8px;
            min-height: 38px; padding: 6px 12px; margin: 0;
            border: 1px solid #cbd5e1; border-radius: 8px; background: #fff;
            color: #334155; font: inherit; font-size: 13px; line-height: 1.5; cursor: pointer;
            box-shadow: none; text-shadow: none;
        }
        .ustc-bb-filters button:hover { border-color: #7185a2; background: #eef2f7; }
        .ustc-bb-filters button[aria-pressed="true"] { color: #fff; background: #243e63; border-color: #243e63; }
        .ustc-bb-filter-count { font-size: 17px; font-weight: 700; line-height: 1.2; font-variant-numeric: tabular-nums; }
        .ustc-bb-hint {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            max-width: 100%;
            margin: 0;
            padding: 5px 10px;
            border: 1px solid transparent;
            border-radius: 7px;
            font-size: 12px;
            font-weight: 600;
            line-height: 1.6;
            text-align: left;
            white-space: normal;
            overflow-wrap: anywhere;
            vertical-align: middle;
            user-select: none;
            box-shadow: none;
            text-shadow: none;
        }
        .ustc-bb-hint::before { content: ""; flex: 0 0 6px; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .ustc-bb-ignore {
            appearance: none; min-height: 32px; padding: 4px 9px; margin: 0;
            border: 1px solid #cbd5e1; border-radius: 6px; background: #fff;
            color: #52627a; font-size: 12px; font-weight: 400; line-height: 1.6;
            cursor: pointer; box-shadow: none; text-shadow: none; white-space: nowrap;
        }
        .ustc-bb-ignore:hover:not(:disabled) { color: #17365d; border-color: #7185a2; background: #eef2f7; }
        .ustc-bb-ignore:disabled { cursor: wait; color: #66758a; background: #f1f4f8; }
        .ustc-bb-hw-actions { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 8px; max-width: 100%; vertical-align: middle; }
        .ustc-bb-hint-0, .ustc-bb-hint-4 { color: #475569; background: #edf1f5; }
        .ustc-bb-hint-1 { color: #166534; background: #e8f5ec; }
        .ustc-bb-hint-2 { color: #b42318; background: #fff0ed; }
        .ustc-bb-hint-3 { color: #854d0e; background: #fff6d9; }
        .ustc-bb-hint-5 { color: #1d4ed8; background: #eaf1ff; }
        .ustc-bb-ignore:focus-visible, .ustc-bb-filters button:focus-visible,
        .ustc-bb-course a:focus-visible { outline: 3px solid #2563eb; outline-offset: 3px; }
        .ustc-bb-course-list { padding: 0 !important; list-style: none; }
        .ustc-bb-course-list > .ustc-bb-course {
            box-sizing: border-box; margin: 10px 0; padding: 14px 16px 14px 18px !important;
            border: 1px solid #dbe3ed; border-left: 3px solid #cbd5e1;
            border-radius: 10px; background: #fff; color: #52627a;
            line-height: 1.7; overflow-wrap: anywhere; list-style: none;
        }
        .ustc-bb-course-list > .ustc-bb-course[data-status="2"] { border-left-color: #b42318; }
        .ustc-bb-course-list > .ustc-bb-course:hover { border-color: #94a3b8; }
        .ustc-bb-course-main { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 8px 12px; }
        .ustc-bb-course-heading { flex: 1 1 150px; min-width: 0; }
        .ustc-bb-course-heading > a { display: block; color: #17365d; font-size: 14px; font-weight: 600; line-height: 1.6; }
        .ustc-bb-course-main > .ustc-bb-hint { flex: 0 0 auto; }
        .ustc-bb-course .ustc-bb-course-code { display: block; margin-top: 4px; color: #617089; font-size: 11px; font-weight: 400; line-height: 1.5; overflow-wrap: anywhere; }
        .ustc-bb-assignment { border-radius: 10px; }
        .ustc-bb-assignment h3 { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; line-height: 1.8; overflow-wrap: anywhere; }
        .ustc-bb-assignment h3 > a { min-width: 0; }
        .ustc-bb-assignment[data-status="2"] { box-shadow: inset 3px 0 #b42318; }
        .ustc-bb-ignored { background: #f8fafc; }
        .ustc-bb-ignored > .details { display: none; }
        .ustc-bb-assignment[hidden] { display: none !important; }
        .ustc-bb-empty { margin: 16px 0; padding: 24px; text-align: center; color: #52627a; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; }
        @media (max-width: 480px) {
            .ustc-bb-overview { padding: 12px; }
            .ustc-bb-filters { gap: 6px; }
            .ustc-bb-filters button { padding: 6px 10px; }
            .ustc-bb-course-list > .ustc-bb-course { padding: 12px 12px 12px 16px !important; }
        }
    `;
    document.head.appendChild(css);

    // 0: 查询中  1: 已提交  2: 未提交  3: 查询错误  4: 已忽略  5: 已评分
    const hintText = ['查询中', '已提交', '未提交', '查询错误', '已忽略', '已评分'];

    function createOverview(list, title, labels = []) {
        const panel = document.createElement('section');
        panel.className = 'ustc-bb-overview';
        panel.setAttribute('aria-label', title);
        const heading = panel.appendChild(document.createElement('h3'));
        heading.textContent = title;
        const stats = document.createElement('dl');
        if (labels.length) {
            stats.className = 'ustc-bb-stats';
            panel.appendChild(stats);
        }
        const values = labels.map(label => {
            const stat = stats.appendChild(document.createElement('div'));
            stat.className = 'ustc-bb-stat';
            stat.appendChild(document.createElement('dt')).textContent = label;
            const value = stat.appendChild(document.createElement('dd'));
            value.textContent = '—';
            return value;
        });
        const note = panel.appendChild(document.createElement('p'));
        note.setAttribute('role', 'status');
        list.before(panel);
        return { panel, values, note };
    }

    function getIgnored(courseId) {
        try {
            return JSON.parse(localStorage.getItem('ustc-bb-ignored:' + courseId) || '[]');
        } catch (e) {
            return [];
        }
    }

    // 先回填已确认过的状态，后台仍用批量页面重新核验；打开单项作业时失效。
    function getSubmitted() {
        try {
            return JSON.parse(localStorage.getItem('ustc-bb-submitted') || '{}');
        } catch (e) {
            return {};
        }
    }

    function markSubmitted(contentId, submitted, status = 1, extra = null) {
        if (!contentId) return;
        try {
            const all = getSubmitted();
            const cached = all[contentId];
            if (submitted && (!cached || cached.s !== status || cached.e !== extra)) {
                all[contentId] = { s: status, e: extra };
                localStorage.setItem('ustc-bb-submitted', JSON.stringify(all));
            } else if (!submitted && cached) {
                // 作业区实时查询发现仍为未提交（如教师清空了提交），从缓存移除
                delete all[contentId];
                localStorage.setItem('ustc-bb-submitted', JSON.stringify(all));
            }
        } catch (e) { /* ignore */ }
    }

    const today = new Date().toLocaleDateString('sv'); // YYYY-MM-DD 本地时区
    const CACHE_SCHEMA = 2;
    const SNAPSHOT_MAX_AGE = 5 * 60 * 1000;

    function readCourseCache() {
        try {
            const raw = JSON.parse(localStorage.getItem('ustc-bb-portal') || 'null');
            if (!raw?.data || typeof raw.data !== 'object') return {};
            if (raw.schema === CACHE_SCHEMA) return raw.data;
            // 旧版可能把未执行完的查询存成 0，只保留入口，不能继承计数或状态。
            const data = {};
            for (const [courseId, entry] of Object.entries(raw.data)) {
                if (entry?.url) data[courseId] = { url: entry.url };
            }
            return data;
        } catch (e) {
            return {};
        }
    }

    function saveCourseCache(courseId, result) {
        try {
            const data = readCourseCache();
            const complete = !result.failed && !result.pending;
            data[courseId] = { ...result, u: complete ? result.u : null, t: Date.now() };
            localStorage.setItem('ustc-bb-portal', JSON.stringify({ schema: CACHE_SCHEMA, date: today, data }));
        } catch (e) { /* ignore */ }
    }

    // 使主页缓存中某门课的条目失效（忽略/提交作业后数目会变）
    function invalidatePortal(courseId) {
        try {
            const data = readCourseCache();
            if (!data[courseId]) return;
            data[courseId] = { url: data[courseId].url };
            localStorage.setItem('ustc-bb-portal', JSON.stringify({ schema: CACHE_SCHEMA, date: today, data }));
        } catch (e) { /* ignore */ }
    }

    // 门户和作业区共享逐项状态，切换页面时立即显示上次结果，同时重新核验。
    function syncPortalCount(courseId, unsub, url, entries = []) {
        const states = {};
        for (const entry of entries) {
            if (entry.contentId && [1, 2, 5].includes(entry.status)) {
                states[entry.contentId] = { s: entry.status, e: entry.extra };
            }
        }
        saveCourseCache(courseId, { u: unsub, hw: true, url, states, total: entries.length,
            ignored: entries.filter(entry => entry.ignored).length, pending: 0,
            failed: entries.filter(entry => entry.status === 3).length });
    }

    function ignoreHw(courseId, contentId, ignore) {
        let ignored = getIgnored(courseId);
        if (ignore && !ignored.includes(contentId)) {
            ignored.push(contentId);
            log(`Ignoring "${courseId}/${contentId}"...`);
        } else if (!ignore && ignored.includes(contentId)) {
            ignored = ignored.filter((v) => v != contentId);
            log(`Un-ignoring "${courseId}/${contentId}"...`);
        }
        if (ignored.length) localStorage.setItem('ustc-bb-ignored:' + courseId, JSON.stringify(ignored));
        else localStorage.removeItem('ustc-bb-ignored:' + courseId);
    }

    // 单项复查最多占一半连接，给其他课程的入口、列表和批量状态留出位置。
    const MAX_CONCURRENT = 6;
    const MAX_SLOW_FETCHES = 3;
    const FETCH_TIMEOUT = 12000;
    let activeFetches = 0;
    let activeSlowFetches = 0;
    const fetchQueue = [];
    function pumpFetchQueue() {
        while (activeFetches < MAX_CONCURRENT && fetchQueue.length) {
            const index = fetchQueue.findIndex(job => !job.slow || activeSlowFetches < MAX_SLOW_FETCHES);
            if (index < 0) break;
            const [job] = fetchQueue.splice(index, 1);
            activeFetches++;
            if (job.slow) activeSlowFetches++;
            runFetch(job);
        }
    }
    async function runFetch(job) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        try {
            const response = await fetch(job.url, { signal: controller.signal });
            if (!response.ok) {
                const error = new Error(`HTTP ${response.status} ${response.statusText}`);
                error.status = response.status;
                controller.abort();
                throw error;
            }
            // 超时和并发限制覆盖读取正文，不能收到响应头就释放连接。
            job.resolve(await response.text());
        } catch (error) {
            job.reject(error);
        } finally {
            clearTimeout(timer);
            activeFetches--;
            if (job.slow) activeSlowFetches--;
            pumpFetchQueue();
        }
    }
    function limitedFetch(url, slow) {
        return new Promise((resolve, reject) => {
            fetchQueue.push({ url, slow, resolve, reject });
            pumpFetchQueue();
        });
    }

    // 临时故障重试一次；超时、无权限和不存在的页面直接结束，避免翻倍等待。
    async function fetchWithRetry(url, slow = false) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                return await limitedFetch(url, slow);
            } catch (e) {
                console.warn(`[USTC BB Helper] Fetch "${url}" failed:`, e);
                if (e.name === 'AbortError' || (e.status >= 400 && e.status < 500)) break;
            }
        }
        return null;
    }

    async function queryStatus(link) {
        try {
            const html = await fetchWithRetry(link, true);
            if (html === null) return [3, null];
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const title = doc.getElementById('pageTitleText')?.textContent?.trim() ?? '';
            if (title.startsWith('上载作业')) {
                return [2, null];
            } else if (title.startsWith('复查提交历史记录')) {
                const grade = doc.getElementById('aggregateGrade');
                const suffix = doc.getElementById('aggregateGrade_pointsPossible');
                const score = grade ? parseFloat(grade.value) : NaN;
                if (!isNaN(score)) {
                    return [5, `${score}${suffix ? suffix.textContent.trim() : ''}`];
                }
                return [1, null];
            }
            return [3, null];
        } catch (e) {
            console.warn(`[USTC BB Helper] Query "${link}" failed:`, e);
            return [3, null];
        }
    }

    const normalizeName = name => name.replace(/\s+/g, ' ').trim();

    // 「我的成绩」一次返回全课状态。只匹配唯一的作业标题，不猜测重名或未知状态。
    async function queryGradeStatuses(courseId) {
        const statuses = new Map();
        const html = await fetchWithRetry(`/webapps/bb-mygrades-BBLEARN/myGrades?course_id=${encodeURIComponent(courseId)}&stream_name=mygrades&is_stream=false&callback=portal`);
        if (html === null) return statuses;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        for (const row of doc.querySelectorAll('#grades_wrapper > .row')) {
            if (row.classList.contains('calculatedRow')) continue;
            const cell = row.querySelector('.gradable');
            if (!cell || !/^(作业|Assignment)$/i.test(row.querySelector('.itemCat')?.textContent.trim() || '')) continue;
            const title = cell.cloneNode(true);
            title.querySelectorAll('.activityType, .itemCat, .eval-links').forEach(node => node.remove());
            const name = normalizeName(title.textContent);
            if (!name) continue;
            const activity = row.querySelector('.activity .activityType')?.textContent.trim() || '';
            const grade = row.querySelector('.grade > .grade')?.textContent.trim() || '';
            const history = cell.querySelector('a[onclick*="showHistory"], a[href*="showHistory"]');
            const needsGrading = row.querySelector('.gradeStatus img[src*="needs_grading"]');
            let result = null;
            if (needsGrading || row.classList.contains('submitted_item_row') || /^(已提交|Submitted)$/i.test(activity) || history) {
                const score = parseFloat(grade);
                const suffix = row.querySelector('.pointsPossible')?.textContent.trim() || '';
                result = Number.isFinite(score) ? [5, `${score}${suffix ? ' ' + suffix : ''}`] : [1, null];
            } else if (row.classList.contains('upcoming_item_row') && /^(尚未评分|Not graded)$/i.test(activity)
                && grade === '-' && !row.querySelector('.gradeStatus img, .gradeStatus .tooltip')) {
                result = [2, null];
            }
            // 重名即使状态相同也不能确定对应关系，留给单项查询。
            statuses.set(name, statuses.has(name) ? null : result);
        }
        return statuses;
    }

    async function refreshStatuses(entries, onResult, allEntries = entries) {
        const courseIds = new Set(entries.map(entry => entry.courseId));
        // BB 的 Prototype 1.7 把 Array.from 替换成只支持 length 的 $A，
        // Array.from(Set, mapper) 会静默返回 []，必须使用原生迭代语法。
        await Promise.all([...courseIds].map(async courseId => {
            const courseEntries = entries.filter(entry => entry.courseId === courseId);
            const grades = await queryGradeStatuses(courseId);
            await Promise.all(courseEntries.map(async entry => {
                const name = normalizeName(entry.name);
                const unique = allEntries.filter(other => other.courseId === courseId && normalizeName(other.name) === name).length === 1;
                const result = (unique && grades.get(name)) || await queryStatus(entry.link);
                const [status, extra] = result;
                if (status === 1 || status === 5) markSubmitted(entry.contentId, true, status, extra);
                else if (status === 2) markSubmitted(entry.contentId, false);
                onResult(entry, result);
            }));
        }));
    }

    async function findHomework(courseId) {
        try {
            const html = await fetchWithRetry(`/webapps/blackboard/execute/launcher?type=Course&id=${encodeURIComponent(courseId)}&url=`);
            if (html === null) return { u: 0, hw: true, url: null, failed: 1 };
            const doc = new DOMParser().parseFromString(html, 'text/html');
            if (doc.querySelector('#login, form[action*="login"]')) return { u: 0, hw: true, url: null, failed: 1 };
            const anchors = [...doc.querySelectorAll('a[href*="listContent.jsp"], a[href*="listContentEditable.jsp"]')];
            const hwAnchor = anchors.find(a => a.textContent.includes('作业区')) || anchors[0];
            if (!hwAnchor) return { u: 0, hw: false, url: null };
            const hwUrl = new URL(hwAnchor.getAttribute('href'), location.origin).href;
            return { u: 0, hw: true, url: hwUrl };
        } catch (e) {
            console.warn(`[USTC BB Helper] Query course "${courseId}" failed:`, e);
            return { u: 0, hw: true, url: null, failed: 1 };
        }
    }

    async function countUnsubmitted(courseId, cachedUrl, onProgress) {
        let result = cachedUrl ? { u: 0, hw: true, url: cachedUrl } : await findHomework(courseId);
        onProgress({ ...result, pending: result.hw && !result.failed ? 1 : 0 });
        if (!result.hw || result.failed) return result;
        let html = await fetchWithRetry(result.url);
        let doc = html === null ? null : new DOMParser().parseFromString(html, 'text/html');
        let list = doc?.getElementById('content_listContainer');
        // 作业区入口可能被老师调整；旧链接失效时重新发现一次。
        if (!list && cachedUrl) {
            result = await findHomework(courseId);
            onProgress({ ...result, pending: result.hw && !result.failed ? 1 : 0 });
            if (!result.hw || result.failed) return result;
            html = await fetchWithRetry(result.url);
            doc = html === null ? null : new DOMParser().parseFromString(html, 'text/html');
            list = doc?.getElementById('content_listContainer');
        }
        if (!list) return { ...result, failed: 1 };
        const ignored = getIgnored(courseId);
        const entries = [...list.children].flatMap(hw => {
            const a = hw.querySelector('h3 > a[href*="/webapps/assignment/"]');
            if (!a) return [];
            const link = new URL(a.getAttribute('href'), result.url);
            const contentId = link.searchParams.get('content_id');
            return [{ name: a.textContent, courseId, contentId, link: link.href,
                skip: ignored.includes(contentId) }];
        });
        const unknown = entries.filter(entry => !entry.skip);
        const progress = { ...result, pending: unknown.length, failed: 0, states: {}, total: entries.length,
            ignored: entries.length - unknown.length };
        onProgress({ ...progress });
        if (unknown.length) await refreshStatuses(unknown, (entry, [status, extra]) => {
            if (entry.contentId && [1, 2, 5].includes(status)) progress.states[entry.contentId] = { s: status, e: extra };
            if (status === 2) progress.u++;
            else if (status === 3) progress.failed++;
            progress.pending--;
            onProgress({ ...progress });
        }, entries);
        // 即使底层任务意外漏回调，也不能把初始的 0 当成已完成的统计。
        if (progress.pending) {
            progress.failed += progress.pending;
            progress.pending = 0;
        }
        return progress;
    }

    // ---------- 作业区：标注每个作业的提交状态 ----------
    function initHwList() {
        const pageTitle = document.getElementById('pageTitleText')?.children[0]?.textContent?.trim();
        if (pageTitle !== '作业区') return;
        const hwList = document.getElementById('content_listContainer');
        if (!hwList) {
            console.warn("[USTC BB Helper] 'content_listContainer' not found, skipped.");
            return;
        }

        // 先收集完整列表；筛选只改变可见性，不影响统计与主页缓存。
        const submitted = getSubmitted();
        const snapshots = readCourseCache();
        const entries = [...hwList.children].flatMap(hw => {
            const linkEl = hw.querySelector('h3 > a');
            if (!linkEl) return [];
            const link = linkEl.href;
            if (!link.includes('/webapps/assignment/')) return [];
            const name = linkEl.textContent.trim();
            const actions = document.createElement('span');
            actions.className = 'ustc-bb-hw-actions';
            const hint = actions.appendChild(document.createElement('span'));
            const toggle = actions.appendChild(document.createElement('button'));
            toggle.type = 'button';
            toggle.className = 'ustc-bb-ignore';
            linkEl.after(actions);
            hw.classList.add('ustc-bb-assignment');
            const params = new URL(link).searchParams;
            const courseId = params.get('course_id');
            const contentId = params.get('content_id');
            const ignored = getIgnored(courseId).includes(contentId);
            const snapshot = snapshots[courseId];
            const recent = snapshot?.t && Date.now() - snapshot.t < SNAPSHOT_MAX_AGE;
            const cached = contentId ? (recent && snapshot.states?.[contentId]) || submitted[contentId] : null;
            const cachedStatus = cached && [1, 2, 5].includes(cached.s) ? cached.s : 0;
            const cachedExtra = cached && cachedStatus === 5 ? cached.e : null;
            return [{ hw, hint, toggle, link, name, courseId, contentId, ignored, refreshing: !ignored,
                status: ignored ? 4 : cachedStatus, extra: cachedExtra }];
        });
        if (!entries.length) {
            const courseId = new URLSearchParams(location.search).get('course_id');
            if (courseId) syncPortalCount(courseId, 0, location.href);
            return;
        }

        const overview = createOverview(hwList, '作业概览');
        const filters = document.createElement('div');
        overview.note.before(filters);
        filters.className = 'ustc-bb-filters';
        filters.setAttribute('role', 'group');
        filters.setAttribute('aria-label', '筛选作业');
        const modes = [
            { label: '全部', matches: () => true },
            { label: '待提交', matches: entry => entry.status === 2 },
            { label: '已完成', matches: entry => entry.status === 1 || entry.status === 5 },
            { label: '已忽略', matches: entry => entry.status === 4 },
        ];
        let activeFilter = 0;
        const filterButtons = modes.map((mode, index) => {
            const button = filters.appendChild(document.createElement('button'));
            button.type = 'button';
            button.appendChild(document.createElement('span')).textContent = mode.label;
            const count = button.appendChild(document.createElement('span'));
            count.className = 'ustc-bb-filter-count';
            button.addEventListener('click', () => {
                activeFilter = index;
                render();
            });
            return { button, count };
        });
        const empty = document.createElement('p');
        empty.className = 'ustc-bb-empty';
        empty.hidden = true;
        hwList.after(empty);

        function render() {
            const totals = modes.map(mode => entries.filter(mode.matches).length);
            const pending = entries.filter(entry => entry.status === 0 || entry.refreshing).length;
            const failed = entries.filter(entry => entry.status === 3).length;
            overview.note.textContent = pending
                ? `共 ${entries.length} 项作业 · 正在核验 ${pending} 项，上次结果仅供参考…`
                : `共 ${entries.length} 项作业 · ${failed ? `${failed} 项查询失败，请打开作业确认` : '状态已更新，已忽略作业不计入待提交'}`;
            filterButtons.forEach(({ button, count }, index) => {
                count.textContent = totals[index];
                button.setAttribute('aria-pressed', String(activeFilter === index));
                button.setAttribute('aria-label', `${modes[index].label} ${totals[index]}`);
            });
            for (const entry of entries) {
                const { hw, hint, toggle, status, extra, ignored, name } = entry;
                const hidden = !modes[activeFilter].matches(entry);
                // 在禁用按钮/隐藏行之前转移焦点，避免键盘用户的焦点落回页面顶部。
                if ((hidden && hw.contains(document.activeElement)) || ((status === 0 || entry.refreshing) && toggle === document.activeElement)) {
                    filterButtons[activeFilter].button.focus();
                }
                hint.className = `ustc-bb-hint ustc-bb-hint-${status}`;
                hint.textContent = `${hintText[status]}${extra ? ' ' + extra : ''}${entry.refreshing && status !== 0 ? ' · 核验中' : ''}`;
                toggle.disabled = status === 0 || entry.refreshing;
                toggle.textContent = ignored ? '恢复' : '忽略';
                toggle.title = status === 0 || entry.refreshing ? '正在核验作业状态，请稍候'
                    : ignored ? '恢复显示并重新查询状态' : '忽略后收起详情，不计入待提交数量';
                toggle.setAttribute('aria-label', `${ignored ? '恢复' : '忽略'}作业：${name}`);
                hw.classList.toggle('ustc-bb-ignored', ignored);
                hw.dataset.status = status;
                hw.hidden = hidden;
            }
            empty.hidden = totals[activeFilter] > 0;
            empty.textContent = pending ? '正在查询作业，请稍候…' : '当前筛选下没有作业。';
        }

        function syncPortal() {
            if (entries.some(entry => entry.status === 0 || entry.refreshing)) return;
            for (const courseId of new Set(entries.map(entry => entry.courseId))) {
                const courseEntries = entries.filter(entry => entry.courseId === courseId);
                const unsub = courseEntries.filter(entry => entry.status === 2).length;
                syncPortalCount(courseId, unsub, location.href, courseEntries);
            }
        }

        async function refresh(toRefresh) {
            const token = {};
            for (const entry of toRefresh) {
                entry.refreshToken = token;
                entry.refreshing = true;
                if (entry.status === 4 || entry.status === 3) {
                    entry.status = 0;
                    entry.extra = null;
                }
            }
            render();
            await refreshStatuses(toRefresh, (entry, result) => {
                if (entry.refreshToken !== token) return;
                [entry.status, entry.extra] = result;
                entry.refreshing = false;
                render();
                syncPortal();
            }, entries);
            for (const entry of toRefresh) {
                if (entry.refreshToken === token && entry.refreshing) {
                    entry.status = 3;
                    entry.refreshing = false;
                }
            }
            render();
            syncPortal();
        }

        for (const entry of entries) {
            entry.toggle.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                if (entry.status === 0 || entry.refreshing) return;
                ignoreHw(entry.courseId, entry.contentId, !entry.ignored);
                invalidatePortal(entry.courseId);
                entry.ignored = !entry.ignored;
                if (entry.ignored) {
                    entry.status = 4;
                    entry.extra = null;
                    render();
                    syncPortal();
                } else {
                    refresh([entry]);
                }
            });
        }
        render();
        const toRefresh = entries.filter(entry => !entry.ignored);
        if (toRefresh.length) refresh(toRefresh);
        syncPortal();
    }

    // ---------- 主页「当前学期课程」：按未提交作业数排序 ----------
    function initPortal() {
        const h2 = [...document.querySelectorAll('h2')]
            .find(e => e.textContent.includes('当前学期课程'));
        if (!h2) return;
        const mod = h2.closest('.portlet');
        const ul = mod?.querySelector('ul.courseListing');
        if (!ul) return;

        const items = [...ul.children].map(li => {
            const a = li.querySelector('a[href*="type=Course"]');
            if (!a) return null;
            let courseId = null;
            try {
                courseId = new URL(a.href, location.origin).searchParams.get('id');
            } catch (e) { /* ignore */ }
            if (!courseId) return null;
            // 仅拆分可识别的课程编号前缀；没有编号或含其他节点的链接保持原内容。
            const match = a.textContent.trim().match(/^([A-Za-z0-9][A-Za-z0-9._-]*\.\d{4}[A-Za-z]{2})\s*[:：]\s*(.+)$/);
            let code = null;
            if (match && a.childNodes.length === 1 && a.firstChild.nodeType === Node.TEXT_NODE) {
                a.textContent = match[2];
                code = document.createElement('span');
                code.className = 'ustc-bb-course-code';
                code.textContent = match[1];
            }
            const main = document.createElement('div');
            main.className = 'ustc-bb-course-main';
            a.before(main);
            const heading = main.appendChild(document.createElement('div'));
            heading.className = 'ustc-bb-course-heading';
            heading.appendChild(a);
            if (code) heading.appendChild(code);
            const badge = main.appendChild(document.createElement('span'));
            badge.className = 'ustc-bb-hint ustc-bb-hint-0';
            badge.textContent = '作业查询中…';
            li.classList.add('ustc-bb-course');
            return { li, a, courseId, badge, unsub: 0, hasHw: true, ready: false, pending: 0, failed: 0 };
        }).filter(Boolean);
        if (!items.length) return;
        ul.classList.add('ustc-bb-course-list');
        const overview = createOverview(ul, '课程概览', ['已确认待交', '待办课程', '当前课程']);
        const retry = overview.panel.appendChild(document.createElement('button'));
        retry.type = 'button';
        retry.className = 'ustc-bb-ignore';
        retry.textContent = '刷新作业状态';

        function updateOverview() {
            const pending = items.filter(item => !item.ready).length;
            const failed = items.filter(item => item.ready && item.failed).length;
            overview.values[0].textContent = items.reduce((sum, item) => sum + Math.max(0, item.unsub), 0);
            overview.values[1].textContent = items.filter(item => item.unsub > 0).length;
            overview.values[2].textContent = items.length;
            overview.note.textContent = pending
                ? `正在查询 ${pending} 门课程，统计会自动更新…`
                : failed ? `${failed} 门课程未查完整，已查到的待交仍计入统计，可重试查询。`
                    : `最近核验 ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · 点击课程进入作业区`;
            retry.textContent = failed ? '重试未完成查询' : '刷新作业状态';
            retry.disabled = pending > 0;
        }
        updateOverview();

        // 缓存只用于先展示上次结果和直达链接，每次进入仍重新检查作业列表。
        let lastRefresh = Date.now();

        function sortCourses() {
            const key = item => item.unsub > 0 ? -item.unsub : item.ready && !item.failed && item.hasHw ? 0 : 1;
            const sorted = items.slice().sort((a, b) => key(a) - key(b));
            const focused = ul.contains(document.activeElement) ? document.activeElement : null;
            sorted.forEach((item, index) => {
                if (ul.children[index] !== item.li) ul.insertBefore(item.li, ul.children[index]);
            });
            if (focused && document.activeElement !== focused) focused.focus({ preventScroll: true });
        }

        function updateBadge(item) {
            if (!item.hasHw) {
                item.badge.className = 'ustc-bb-hint ustc-bb-hint-0';
                item.badge.textContent = '无作业区';
            } else if (item.unsub > 0) {
                item.badge.className = 'ustc-bb-hint ustc-bb-hint-2';
                item.badge.textContent = !item.ready || item.failed
                    ? `至少 ${item.unsub} 项待交${!item.ready ? ' · 核验中…' : ` · ${item.failed} 项待确认`}`
                    : `未提交 ${item.unsub}`;
            } else if (!item.ready) {
                item.badge.className = 'ustc-bb-hint ustc-bb-hint-0';
                item.badge.textContent = typeof item.previousCount === 'number'
                    ? `上次待交 ${item.previousCount} · 正在重新核验`
                    : item.pending ? `作业查询中 · 剩余 ${item.pending}` : '作业查询中…';
            } else if (!item.failed) {
                item.badge.className = 'ustc-bb-hint ustc-bb-hint-1';
                item.badge.textContent = item.total === 0 ? '作业区暂无作业'
                    : item.ignored ? `暂无待交 · 已忽略 ${item.ignored} 项` : '暂无待交 · 刚核验';
            } else {
                item.badge.className = 'ustc-bb-hint ustc-bb-hint-3';
                item.badge.textContent = '查询未完成，可重试';
            }
            item.li.dataset.status = item.unsub > 0 ? '2' : '0';
            updateOverview();
            sortCourses();
        }

        async function queryCourse(item) {
            item.ready = false;
            item.failed = 0;
            item.unsub = 0;
            item.hasHw = true;
            const cached = readCourseCache()[item.courseId];
            item.previousCount = cached?.u;
            if (cached?.url) {
                item.url = cached.url;
                item.a.href = cached.url;
            }
            updateBadge(item);
            const applyResult = res => {
                item.unsub = res.u;
                item.hasHw = res.hw;
                item.failed = (res.failed || 0) + (item.ready ? res.pending || 0 : 0);
                item.pending = res.pending || 0;
                item.total = res.total;
                item.ignored = res.ignored || 0;
                item.url = res.url || item.url;
                if (res.url) item.a.href = res.url;
            };
            try {
                const res = await countUnsubmitted(item.courseId, cached?.url, progress => {
                    applyResult(progress);
                    updateBadge(item);
                });
                item.ready = true;
                applyResult(res);
                saveCourseCache(item.courseId, { ...res, failed: item.failed });
            } catch (error) {
                console.warn(`[USTC BB Helper] Query course "${item.courseId}" failed:`, error);
                item.failed = Math.max(1, item.pending);
                item.ready = true;
            }
            updateBadge(item);
        }

        retry.addEventListener('click', () => {
            const failed = items.filter(item => item.ready && item.failed);
            const targets = failed.length ? failed : items;
            // 同一次重试先全部置为查询中，避免快速重复点击产生重复请求。
            targets.forEach(item => { item.ready = false; });
            updateOverview();
            lastRefresh = Date.now();
            targets.forEach(item => queryCourse(item));
        });
        function refreshAfterReturn() {
            if (items.some(item => !item.ready)) return;
            lastRefresh = Date.now();
            items.forEach(item => queryCourse(item));
        }
        window.addEventListener('pageshow', event => {
            if (event.persisted) refreshAfterReturn();
        });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && Date.now() - lastRefresh > 60000) refreshAfterReturn();
        });
        items.forEach(item => queryCourse(item));
    }

    if (isContentList) initHwList();
    else if (isPortal) initPortal();
    else {
        // 查看/提交作业后状态可能变化，使主页缓存中该课程的数目失效
        const cid = new URLSearchParams(location.search).get('course_id');
        if (cid) invalidatePortal(cid);
        if (isAssignment) markSubmitted(new URLSearchParams(location.search).get('content_id'), false);
    }
})();
