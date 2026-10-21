// ==UserScript==
// @name         USTC BB Helper
// @name:zh-CN   USTC BB 助手
// @license      gpl-3.0
// @namespace    ustc-bb-helper
// @version      1.4.0
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
        .ustc-bb-overview, .ustc-bb-hint, .ustc-bb-filters {
            font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
            box-sizing: border-box;
        }
        .ustc-bb-overview {
            margin: 12px 0 20px;
            padding: 20px;
            border: 1px solid #dbe3ed;
            border-radius: 14px;
            background: #f8fafc;
            color: #172b4d;
        }
        .ustc-bb-overview h3 { margin: 0 0 6px; font-size: 18px; font-weight: 700; }
        .ustc-bb-overview p { margin: 0; color: #52627a; font-size: 13px; line-height: 1.7; }
        .ustc-bb-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 16px 0; }
        .ustc-bb-stat { padding: 12px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; }
        .ustc-bb-stat dt { font-size: 12px; color: #52627a; }
        .ustc-bb-stat dd { margin: 4px 0 0; color: #172b4d; font-size: 26px; font-weight: 700; line-height: 1.2; font-variant-numeric: tabular-nums; }
        .ustc-bb-stat:first-child dd { color: #b42318; }
        .ustc-bb-filters { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
        .ustc-bb-filters button {
            appearance: none; min-height: 36px; padding: 6px 14px; margin: 0;
            border: 1px solid #cbd5e1; border-radius: 8px; background: #fff;
            color: #334155; font: inherit; font-size: 13px; line-height: 1.5; cursor: pointer;
            box-shadow: none; text-shadow: none;
        }
        .ustc-bb-filters button[aria-pressed="true"] { color: #fff; background: #243e63; border-color: #243e63; }
        .ustc-bb-hint {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            max-width: 100%;
            margin: 4px 0 4px 10px;
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
        button.ustc-bb-hint { appearance: none; min-height: 32px; cursor: pointer; }
        button.ustc-bb-hint:hover:not(:disabled) { border-color: currentColor; }
        button.ustc-bb-hint:disabled { cursor: wait; opacity: 1; }
        .ustc-bb-hint-0, .ustc-bb-hint-4 { color: #475569; background: #edf1f5; }
        .ustc-bb-hint-1 { color: #166534; background: #e8f5ec; }
        .ustc-bb-hint-2 { color: #b42318; background: #fff0ed; }
        .ustc-bb-hint-3 { color: #854d0e; background: #fff6d9; }
        .ustc-bb-hint-5 { color: #1d4ed8; background: #eaf1ff; }
        .ustc-bb-hint:focus-visible, .ustc-bb-filters button:focus-visible,
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
        .ustc-bb-course > a { color: #17365d; font-weight: 600; line-height: 1.8; }
        .ustc-bb-assignment { border-radius: 10px; }
        .ustc-bb-assignment h3 { line-height: 1.8; overflow-wrap: anywhere; }
        .ustc-bb-assignment[data-status="2"] { box-shadow: inset 3px 0 #b42318; }
        .ustc-bb-ignored { background: #f8fafc; }
        .ustc-bb-ignored > .details { display: none; }
        .ustc-bb-assignment[hidden] { display: none !important; }
        .ustc-bb-empty { margin: 16px 0; padding: 24px; text-align: center; color: #52627a; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; }
        @media (max-width: 480px) {
            .ustc-bb-overview { padding: 14px; }
            .ustc-bb-stats { gap: 6px; }
            .ustc-bb-stat { padding: 10px 8px; }
            .ustc-bb-stat dd { font-size: 22px; }
            .ustc-bb-course-list > .ustc-bb-course { padding: 12px 12px 12px 16px !important; }
            .ustc-bb-course .ustc-bb-hint { display: flex; width: fit-content; margin-left: 0; }
        }
    `;
    document.head.appendChild(css);

    // 0: 查询中  1: 已提交  2: 未提交  3: 查询错误  4: 已忽略  5: 已评分
    const hintText = ['查询中', '已提交', '未提交', '查询错误', '已忽略', '已评分'];

    function createOverview(list, title, description, labels) {
        const panel = document.createElement('section');
        panel.className = 'ustc-bb-overview';
        panel.setAttribute('aria-label', title);
        const heading = panel.appendChild(document.createElement('h3'));
        heading.textContent = title;
        const intro = panel.appendChild(document.createElement('p'));
        intro.textContent = description;
        const stats = panel.appendChild(document.createElement('dl'));
        stats.className = 'ustc-bb-stats';
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

    const today = new Date().toLocaleDateString('sv'); // YYYY-MM-DD 本地时区

    // 使主页缓存中某门课的条目失效（忽略/提交作业后数目会变）
    function invalidatePortal(courseId) {
        try {
            const raw = JSON.parse(localStorage.getItem('ustc-bb-portal') || 'null');
            if (raw && raw.data && raw.data[courseId]) {
                delete raw.data[courseId];
                localStorage.setItem('ustc-bb-portal', JSON.stringify(raw));
            }
        } catch (e) { /* ignore */ }
    }

    // 用作业区的实时统计结果回写主页缓存（仅当缓存是今天的，否则主页会全量重查）
    function syncPortalCount(courseId, unsub, url) {
        try {
            const raw = JSON.parse(localStorage.getItem('ustc-bb-portal') || 'null');
            if (raw && raw.date === today && raw.data) {
                raw.data[courseId] = { u: unsub, hw: true, url };
                localStorage.setItem('ustc-bb-portal', JSON.stringify(raw));
            }
        } catch (e) { /* ignore */ }
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

    async function queryStatus(link) {
        try {
            const r = await fetch(link);
            if (!r.ok) {
                log(`Failed to fetch "${r.url}": ${r.status} ${r.statusText}`);
                return [3, null];
            }
            const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
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

    // 统计一门课作业区里「未提交」的数量（不含已忽略）；返回 { u, hw, url }
    // u: 未提交数（-1 表示查询出错）；hw: 是否存在作业区；url: 作业区地址
    async function countUnsubmitted(courseId) {
        try {
            const r = await fetch(`/webapps/blackboard/execute/launcher?type=Course&id=${courseId}&url=`);
            if (!r.ok) return { u: -1, hw: true, url: null };
            const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
            const anchors = Array.from(doc.querySelectorAll('a[href*="listContent.jsp"]'));
            const hwAnchor = anchors.find(a => a.textContent.includes('作业区')) || anchors[0];
            if (!hwAnchor) return { u: 0, hw: false, url: null };
            const hwUrl = new URL(hwAnchor.getAttribute('href'), location.origin).href;
            const r2 = await fetch(hwUrl);
            if (!r2.ok) return { u: -1, hw: true, url: hwUrl };
            const doc2 = new DOMParser().parseFromString(await r2.text(), 'text/html');
            const list = doc2.getElementById('content_listContainer');
            if (!list) return { u: 0, hw: true, url: hwUrl };
            const ignored = getIgnored(courseId);
            let unsub = 0, failed = false;
            const jobs = [];
            for (const hw of list.children) {
                const a = hw.querySelector('h3 > a');
                if (!a) continue;
                const href = a.getAttribute('href') || '';
                if (!href.includes('/webapps/assignment/')) continue;
                const link = new URL(href, location.origin);
                const contentId = link.searchParams.get('content_id');
                if (contentId && ignored.includes(contentId)) continue;
                jobs.push(queryStatus(link.href).then(([s]) => {
                    if (s === 2) unsub++;
                    if (s === 3) failed = true;
                }));
            }
            await Promise.all(jobs);
            return { u: failed ? -1 : unsub, hw: true, url: hwUrl };
        } catch (e) {
            console.warn(`[USTC BB Helper] Query course "${courseId}" failed:`, e);
            return { u: -1, hw: true, url: null };
        }
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
        const entries = Array.from(hwList.children).flatMap(hw => {
            const linkEl = hw.querySelector('h3 > a');
            if (!linkEl) return [];
            const link = linkEl.href;
            if (!link.includes('/webapps/assignment/')) return [];
            const name = linkEl.textContent.trim();
            const hint = document.createElement('button');
            hint.type = 'button';
            linkEl.after(hint);
            hw.classList.add('ustc-bb-assignment');
            const params = new URL(link).searchParams;
            const courseId = params.get('course_id');
            const contentId = params.get('content_id');
            const ignored = getIgnored(courseId).includes(contentId);
            return [{ hw, hint, link, name, courseId, contentId, ignored, status: ignored ? 4 : 0, extra: null }];
        });
        if (!entries.length) return;

        const overview = createOverview(hwList, '作业概览', '先处理待提交作业；点击状态按钮可忽略或恢复作业。', ['待提交', '已完成', '已忽略']);
        const filters = overview.panel.appendChild(document.createElement('div'));
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
            button.addEventListener('click', () => {
                activeFilter = index;
                render();
            });
            return button;
        });
        const empty = document.createElement('p');
        empty.className = 'ustc-bb-empty';
        empty.hidden = true;
        hwList.after(empty);

        function render() {
            const totals = modes.map(mode => entries.filter(mode.matches).length);
            const pending = entries.filter(entry => entry.status === 0).length;
            const failed = entries.filter(entry => entry.status === 3).length;
            overview.values.forEach((value, index) => { value.textContent = totals[index + 1]; });
            overview.note.textContent = pending
                ? `共 ${entries.length} 项作业 · 正在查询 ${pending} 项…`
                : `共 ${entries.length} 项作业 · ${failed ? `${failed} 项查询失败，请打开作业确认` : '状态已更新，已忽略作业不计入待提交'}`;
            filterButtons.forEach((button, index) => {
                button.textContent = `${modes[index].label} ${totals[index]}`;
                button.setAttribute('aria-pressed', String(activeFilter === index));
            });
            for (const entry of entries) {
                const { hw, hint, status, extra, ignored, name } = entry;
                const hidden = !modes[activeFilter].matches(entry);
                // 在禁用按钮/隐藏行之前转移焦点，避免键盘用户的焦点落回页面顶部。
                if ((hidden && hw.contains(document.activeElement)) || (status === 0 && hint === document.activeElement)) {
                    filterButtons[activeFilter].focus();
                }
                hint.className = `ustc-bb-hint ustc-bb-hint-${status}`;
                hint.textContent = `${hintText[status]}${extra ? ' ' + extra : ''}`;
                hint.disabled = status === 0;
                hint.setAttribute('aria-pressed', String(ignored));
                const action = ignored ? '取消忽略此作业' : '忽略此作业';
                hint.title = status === 0 ? '正在查询作业状态' : `点击${action}`;
                hint.setAttribute('aria-label', `${name}：${hint.textContent}，${status === 0 ? '请稍候' : action}`);
                hw.classList.toggle('ustc-bb-ignored', ignored);
                hw.dataset.status = status;
                hw.hidden = hidden;
            }
            empty.hidden = totals[activeFilter] > 0;
            empty.textContent = pending ? '正在查询作业，请稍候…' : '当前筛选下没有作业。';
        }

        function syncPortal() {
            if (entries.some(entry => entry.status === 0)) return;
            for (const courseId of new Set(entries.map(entry => entry.courseId))) {
                const courseEntries = entries.filter(entry => entry.courseId === courseId);
                const unsub = courseEntries.some(entry => entry.status === 3)
                    ? -1 : courseEntries.filter(entry => entry.status === 2).length;
                syncPortalCount(courseId, unsub, location.href);
            }
        }

        async function refresh(entry) {
            entry.status = 0;
            entry.extra = null;
            render();
            [entry.status, entry.extra] = await queryStatus(entry.link);
            render();
            syncPortal();
        }

        for (const entry of entries) {
            entry.hint.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                if (entry.status === 0) return;
                ignoreHw(entry.courseId, entry.contentId, !entry.ignored);
                entry.ignored = !entry.ignored;
                if (entry.ignored) {
                    entry.status = 4;
                    entry.extra = null;
                    render();
                    syncPortal();
                } else {
                    refresh(entry);
                }
            });
        }
        render();
        entries.filter(entry => !entry.ignored).forEach(refresh);
        syncPortal();
    }

    // ---------- 主页「当前学期课程」：按未提交作业数排序 ----------
    function initPortal() {
        const h2 = Array.from(document.querySelectorAll('h2'))
            .find(e => e.textContent.includes('当前学期课程'));
        if (!h2) return;
        const mod = h2.closest('.portlet');
        const ul = mod?.querySelector('ul.courseListing');
        if (!ul) return;

        const items = Array.from(ul.children).map(li => {
            const a = li.querySelector('a[href*="type=Course"]');
            if (!a) return null;
            let courseId = null;
            try {
                courseId = new URL(a.href, location.origin).searchParams.get('id');
            } catch (e) { /* ignore */ }
            if (!courseId) return null;
            const badge = a.appendChild(document.createElement('span'));
            badge.className = 'ustc-bb-hint ustc-bb-hint-0';
            badge.textContent = '作业查询中…';
            li.classList.add('ustc-bb-course');
            return { li, a, courseId, badge, unsub: -1, hasHw: true, ready: false };
        }).filter(Boolean);
        if (!items.length) return;
        ul.classList.add('ustc-bb-course-list');
        const overview = createOverview(ul, '课程概览', '有待交作业的课程优先显示，点击课程名称直达作业区。', ['已查到待交', '待办课程', '当前课程']);

        function updateOverview() {
            const pending = items.filter(item => !item.ready).length;
            const failed = items.filter(item => item.ready && item.hasHw && item.unsub < 0).length;
            overview.values[0].textContent = items.reduce((sum, item) => sum + Math.max(0, item.unsub), 0);
            overview.values[1].textContent = items.filter(item => item.unsub > 0).length;
            overview.values[2].textContent = items.length;
            overview.note.textContent = pending
                ? `正在查询 ${pending} 门课程，统计会自动更新…`
                : failed ? `${failed} 门课程查询失败，待交统计可能不完整；请进入作业区确认。`
                    : '按未提交数量排序 · 当日结果已缓存，进入作业区可更新状态';
        }
        updateOverview();

        // 当日缓存：同一天内不重复查询
        let cache = {};
        try {
            const raw = JSON.parse(localStorage.getItem('ustc-bb-portal') || 'null');
            if (raw && raw.date === today && raw.data) cache = raw.data;
        } catch (e) { /* ignore */ }
        const saveCache = () => {
            try {
                localStorage.setItem('ustc-bb-portal', JSON.stringify({ date: today, data: cache }));
            } catch (e) { /* ignore */ }
        };

        function updateBadge(item) {
            if (!item.hasHw) {
                item.badge.className = 'ustc-bb-hint ustc-bb-hint-0';
                item.badge.textContent = '无作业区';
            } else if (item.unsub > 0) {
                item.badge.className = 'ustc-bb-hint ustc-bb-hint-2';
                item.badge.textContent = `未提交 ${item.unsub}`;
            } else if (item.unsub === 0) {
                item.badge.className = 'ustc-bb-hint ustc-bb-hint-1';
                item.badge.textContent = '作业已交齐';
            } else {
                item.badge.className = 'ustc-bb-hint ustc-bb-hint-3';
                item.badge.textContent = '查询错误';
            }
            item.li.dataset.status = item.unsub > 0 ? '2' : '0';
            item.ready = true;
            updateOverview();
        }

        const jobs = items.map(async (item) => {
            const cached = cache[item.courseId];
            // 旧版本缓存没有 url 字段，视为过期并重新查询
            if (cached && typeof cached.u === 'number' && 'url' in cached) {
                item.unsub = cached.u;
                item.hasHw = cached.hw;
                if (cached.url) item.a.href = cached.url; // 直达作业区
            } else {
                const res = await countUnsubmitted(item.courseId);
                item.unsub = res.u;
                item.hasHw = res.hw;
                if (res.url) item.a.href = res.url; // 直达作业区
                cache[item.courseId] = res;
                saveCache();
                log(`Course ${item.courseId}: ${res.hw ? `unsubmitted ${res.u}` : 'no homework area'}.`);
            }
            updateBadge(item);
        });

        Promise.all(jobs).then(() => {
            // 排序：未提交多的在前；都交齐的居中；无作业区/查询错误的在最后
            const key = (item) => {
                if (item.hasHw && item.unsub > 0) return -item.unsub;
                if (item.hasHw && item.unsub === 0) return 0;
                return 1;
            };
            const sorted = items.slice().sort((a, b) => key(a) - key(b));
            for (const item of sorted) ul.appendChild(item.li);
            log('Courses sorted by unsubmitted homework count.');
        });
    }

    if (isContentList) initHwList();
    else if (isPortal) initPortal();
    else {
        // 查看/提交作业后状态可能变化，使主页缓存中该课程的数目失效
        const cid = new URLSearchParams(location.search).get('course_id');
        if (cid) invalidatePortal(cid);
    }
})();
