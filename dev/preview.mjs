import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

// Local fixtures only: no requests to Blackboard or external assets.
const portalPath = '/webapps/portal/execute/tabs/tabAction';
const listPath = '/webapps/blackboard/content/listContent.jsp';
const launcherPath = '/webapps/blackboard/execute/launcher';
const assignmentPath = '/webapps/assignment/uploadAssignment';
const scriptFile = new URL('../USTC-BB-Helper.user.js', import.meta.url);
const courses = [
    { id: '_103_1', title: 'MATH1007.01.2026FA: 线性代数 B', teacher: '示例教师 · 数学科学学院', states: ['submitted', 'graded'] },
    { id: '_101_1', title: 'CS2502A.02.2026FA: 数据结构与算法', teacher: '示例教师 · 计算机科学与技术学院', states: ['pending', 'pending', 'submitted', 'graded', 'error', 'pending'] },
    { id: '_104_1', title: '学术交流与职业发展', teacher: '示例教师 · 公共课程', states: null },
    { id: '_102_1', title: 'MATH2006.01.2026FA: 概率论与数理统计', teacher: '示例教师 · 数学科学学院', states: ['pending', 'submitted'] },
    { id: '_105_1', title: 'PHYS1004.03.2026FA: 大学物理实验', teacher: '示例教师 · 物理学院', error: true },
    { id: '_106_1', title: 'CS3001.01.2026FA: 人工智能基础：从数学原理到现代机器学习系统的设计与应用（跨学科联合课程）', teacher: '示例教师 · 人工智能与数据科学', states: ['graded'] },
    { id: '_107_1', title: 'CS4001.01.2026FA: 空作业区示例', teacher: '示例教师 · 计算机科学与技术学院', states: [] },
];
const titles = [
    '第三章 · 栈与队列',
    '综合实践：为校园图书馆设计一个支持检索、预约与借阅记录管理的数据结构系统',
    '第二章 · 线性表与链表',
    '第一章 · 算法复杂度分析',
    '补充练习 · 递归与分治',
    '选做作业 · 阅读与拓展',
];
const esc = (text) => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const listUrl = id => `${listPath}?course_id=${id}&content_id=_area_1`;
const assignmentUrl = (id, index) => `${assignmentPath}?course_id=${id}&content_id=${id}_hw${index + 1}`;
const itemIcon = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="6" y="3" width="20" height="26" rx="2" fill="#e9edf1" stroke="#8496a8"/><path d="M11 10h10M11 15h10M11 20h7" stroke="#6b8195" stroke-width="2"/></svg>')}`;

const baseCss = `
    * { box-sizing: border-box; }
    body { margin: 0; color: #30343b; background: #f1f2f4; font: 14px/1.6 Arial, "Microsoft YaHei", sans-serif; }
    a { color: #195789; text-decoration: none; } a:hover { text-decoration: underline; }
    header { background: #293b50; color: white; padding: 16px 28px; }
    header strong { font-size: 20px; } header span { opacity: .8; margin-left: 16px; }
    nav { display: flex; gap: 24px; padding: 12px 28px; background: white; border-bottom: 1px solid #d8dde3; }
    main { max-width: 1180px; padding: 24px; margin: auto; }
    .preview-note { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; margin-bottom: 22px; color: #56616f; font-size: 12px; }
    .preview-note button { font: inherit; color: #195789; background: white; border: 1px solid #bcc6d0; border-radius: 4px; padding: 4px 10px; cursor: pointer; }
    h1 { font-size: 24px; margin: 0 0 20px; } h2 { font-size: 17px; margin: 0; }
    .portal-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(230px, 1fr); gap: 22px; }
    .portal-grid.portal-compact { grid-template-columns: 260px minmax(0, 1fr); }
    .portlet { background: white; border: 1px solid #ced4db; min-width: 0; }
    .portlet > h2 { padding: 12px 16px; background: #e9edf1; border-bottom: 1px solid #ced4db; }
    .portlet .portlet-body { padding: 16px; }
    .courseListing { margin: 0; padding: 0; list-style: none; }
    .courseListing > li { padding: 12px 0; border-bottom: 1px solid #e3e6ea; }
    .courseListing > li:last-child { border-bottom: none; }
    .courseListing .course-meta { display: block; margin-top: 5px; font-size: 12px; color: #687381; }
    .announcement { padding: 0 0 14px; margin: 0 0 14px; border-bottom: 1px solid #e3e6ea; }
    .announcement p { margin: 6px 0 0; color: #687381; }
    .content-box { background: white; border: 1px solid #ced4db; padding: 20px; }
    #content_listContainer { list-style: none; margin: -20px; padding: 0; }
    #content_listContainer > li { padding: 18px 10px; border-bottom: 1px solid #dce1e6; }
    #content_listContainer > li::after { content: ''; display: block; clear: both; }
    .item_icon { float: left; width: 32px; height: 32px; margin: 2px 14px 0 0; }
    #content_listContainer .item, #content_listContainer .details { margin-left: 46px; }
    #content_listContainer h3 { margin: 0 0 8px; font-size: 16px; }
    .details { color: #687381; font-size: 13px; } .details p { margin: 4px 0; }
    @media (max-width: 650px) { .portal-grid, .portal-grid.portal-compact { grid-template-columns: 1fr; } main { padding: 16px 12px; } header { padding: 14px 16px; } header span { display: block; margin: 0; } nav { padding: 10px 16px; } .content-box { padding: 12px; } #content_listContainer { margin: -12px; } }
`;

function shell(title, body, baseline = false, compact = false, courseId = '_101_1') {
    const compareParams = new URLSearchParams();
    if (!baseline) compareParams.set('baseline', '1');
    if (compact) compareParams.set('compact', '1');
    if (title === '作业区') compareParams.set('course_id', courseId);
    const widthParams = new URLSearchParams();
    if (baseline) widthParams.set('baseline', '1');
    if (!compact) widthParams.set('compact', '1');
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} · BB 助手本地预览</title><style>${baseCss}</style></head><body>
        <header><strong>网络教学平台</strong><span>Blackboard · 本地模拟页面</span></header>
        <nav aria-label="预览导航"><a href="${portalPath}">我的主页</a><a href="${listUrl('_101_1')}">数据结构 · 作业区</a></nav>
        <main><div class="preview-note"><span>仅含虚构数据，不连接学校平台。${baseline ? '当前未加载助手。' : '正在加载仓库中的助手脚本。'}</span><button type="button" id="reset-preview">重置演示数据</button><a href="?${esc(compareParams.toString())}">${baseline ? '查看优化效果' : '查看原始页面'}</a>${title === '我的主页' ? `<a href="?${esc(widthParams.toString())}">${compact ? '查看标准门户列' : '查看 260px 窄门户列'}</a>` : ''}</div>${body}</main>
        <script>
            function resetFixture() {
                for (const key of Object.keys(localStorage)) {
                    if (key.startsWith('ustc-bb-')) localStorage.removeItem(key);
                }
                localStorage.setItem('ustc-bb-ignored:_101_1', JSON.stringify(['_101_1_hw6']));
                localStorage.setItem('bb-preview-seeded', '1');
            }
            if (!localStorage.getItem('bb-preview-seeded')) resetFixture();
            document.getElementById('reset-preview').addEventListener('click', () => { resetFixture(); location.reload(); });
        </script>${baseline ? '' : '<script src="/USTC-BB-Helper.user.js"></script>'}</body></html>`;
}

function portal(baseline, compact) {
    const rows = courses.map(course => `<li><a href="${launcherPath}?type=Course&id=${course.id}&url=">${esc(course.title)}</a><span class="course-meta">${esc(course.teacher)}</span></li>`).join('');
    return shell('我的主页', `<h1>我的主页</h1><div class="portal-grid${compact ? ' portal-compact' : ''}"><section class="portlet"><h2>当前学期课程</h2><div class="portlet-body"><ul class="courseListing">${rows}</ul></div></section><aside class="portlet"><h2>通知与公告</h2><div class="portlet-body"><div class="announcement"><strong>欢迎使用网络教学平台</strong><p>课程资料、作业和学习通知可以在对应课程中查看。</p></div><div class="announcement"><strong>学习小贴士</strong><p>请及时关注各门课程的作业要求与提交状态。</p></div><a href="${listUrl('_101_1')}">打开作业区示例 →</a></div></aside></div>`, baseline, compact);
}

function homework(course, baseline) {
    const rows = (course.states || []).map((state, index) => `<li id="content${index + 1}" class="clearfix read"><img class="item_icon" src="${itemIcon}" alt=""><div class="item clearfix"><h3><a href="${assignmentUrl(course.id, index)}"><span>${esc(titles[index] || `练习 ${index + 1}`)}</span></a></h3></div><div class="details"><div class="vtbegenerated"><p>请阅读课程讲义，按作业说明完成并上传解答文件。</p><p>附件：<a href="#instructions">作业说明.pdf</a> · 支持 PDF 格式</p></div></div></li>`).join('');
    const resource = `<li id="course-resource" class="clearfix read"><img class="item_icon" src="${itemIcon}" alt=""><div class="item clearfix"><h3><a href="#course-resource"><span>课程资料 · 作业规范与参考资料</span></a></h3></div><div class="details"><div class="vtbegenerated"><p>这是普通课程资料，不是作业；切换作业状态筛选时应始终保留。</p></div></div></li>`;
    return shell('作业区', `<p><a href="${portalPath}">我的主页</a> / ${esc(course.title)}</p><h1 id="pageTitleText"><span>作业区</span></h1><section class="content-box"><ul id="content_listContainer" class="contentList">${rows}${resource}</ul></section>`, baseline, false, course.id);
}

const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1:4173');
    const send = (status, body, type = 'text/html; charset=utf-8') => {
        response.writeHead(status, {
            'Content-Type': type,
            'Cache-Control': 'no-store',
            // Block external requests even if stale local preview storage contains a remote URL.
            'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'",
        });
        response.end(body);
    };
    try {
        if (url.pathname === '/') {
            response.writeHead(302, { Location: `${portalPath}${url.search}` });
            response.end();
        } else if (url.pathname === '/favicon.ico') {
            send(204, '');
        } else if (url.pathname === '/USTC-BB-Helper.user.js') {
            send(200, await readFile(scriptFile), 'text/javascript; charset=utf-8');
        } else if (url.pathname === portalPath) {
            send(200, portal(url.searchParams.has('baseline'), url.searchParams.get('compact') === '1'));
        } else {
            const course = courses.find(item => item.id === (url.searchParams.get('course_id') || url.searchParams.get('id')));
            if (!course) return send(404, 'Unknown fixture course');
            if (url.pathname === launcherPath) {
                if (course.error) return send(503, 'Simulated course query error');
                send(200, course.states ? `<a href="${listUrl(course.id)}">作业区</a>` : '<p>此课程暂无作业区。</p>');
            } else if (url.pathname === listPath || url.pathname === listPath.replace('listContent', 'listContentEditable')) {
                send(200, homework(course, url.searchParams.has('baseline')));
            } else if (url.pathname === assignmentPath) {
                const index = course.states?.findIndex((_, i) => `${course.id}_hw${i + 1}` === url.searchParams.get('content_id')) ?? -1;
                if (index < 0) return send(404, 'Unknown fixture assignment');
                const state = course.states[index];
                if (state === 'error') return send(503, 'Simulated assignment query error');
                if (state !== 'pending' && Number(process.env.BB_PREVIEW_SLOW_MS) > 0) {
                    await delay(Number(process.env.BB_PREVIEW_SLOW_MS));
                }
                const title = state === 'pending' ? '上载作业' : '复查提交历史记录';
                const grade = state === 'graded' ? '<input id="aggregateGrade" value="96" aria-label="成绩"><span id="aggregateGrade_pointsPossible"> / 100</span>' : '';
                send(200, shell(title, `<h1 id="pageTitleText">${title}</h1><section class="content-box"><h2>${esc(titles[index])}</h2><p>这是本地模拟作业页面。</p>${grade}<p><a href="${listUrl(course.id)}">返回作业区</a></p></section>`));
            } else {
                send(404, 'Not found');
            }
        }
    } catch (error) {
        console.error(error);
        if (!response.headersSent) send(500, 'Preview fixture error');
        else response.end();
    }
});
const port = Number(process.env.BB_PREVIEW_PORT) || 4173;
server.listen(port, '127.0.0.1', () => console.log(`BB Helper preview: http://127.0.0.1:${port}`));
