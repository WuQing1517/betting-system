var API_BASE = window.location.origin + '/api';
var currentUser = JSON.parse(localStorage.getItem('user') || 'null');
var currentPage = 'auth';
var pageHistory = [];
var currentQuestion = null;
var currentCompetition = null;
var questionDataCache = null;

async function api(url, method, data) {
    var opts = { method: method || 'GET', headers: { 'Content-Type': 'application/json' } };
    if (currentUser) opts.headers['X-User-Id'] = String(currentUser.user_id || currentUser.id);
    if (data) opts.body = JSON.stringify(data);
    var res = await fetch(API_BASE + url, opts);
    var json = await res.json();
    if (!res.ok) throw new Error(json.error || '\u8BF7\u6C42\u5931\u8D25');
    return json;
}

function showPage(name) {
    pageHistory.push(currentPage);
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    var target = document.getElementById(name + 'Page');
    if (target) target.classList.add('active');
    currentPage = name;
    window.scrollTo(0, 0);
    var bb = document.getElementById('bottomBar');
    if (bb) bb.style.display = (name === 'home' || name === 'leaderboard' || name === 'profile') ? 'flex' : 'none';
}

function bottomTabClick(tab, el) {
    document.querySelectorAll('.bottom-bar-item').forEach(function(item) { item.classList.remove('active'); });
    el.classList.add('active');
    if (tab === 'home') { initHomePage(); }
    else if (tab === 'leaderboard') { showLeaderboard(); }
    else if (tab === 'profile') { showProfile(); }
}

function goBack() {
    var prev = pageHistory.pop() || 'home';
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    var target = document.getElementById(prev + 'Page');
    if (target) target.classList.add('active');
    currentPage = prev;
    window.scrollTo(0, 0);
    var bb = document.getElementById('bottomBar');
    if (bb) bb.style.display = (prev === 'home' || prev === 'leaderboard' || prev === 'profile') ? 'flex' : 'none';
    if (prev === 'home') refreshHomeData();
    // Update bottom bar active state
    document.querySelectorAll('.bottom-bar-item').forEach(function(item) { item.classList.remove('active'); });
    if (prev === 'home') document.querySelector('.bottom-bar-item:nth-child(1)').classList.add('active');
    else if (prev === 'leaderboard') document.querySelector('.bottom-bar-item:nth-child(2)').classList.add('active');
    else if (prev === 'profile') document.querySelector('.bottom-bar-item:nth-child(3)').classList.add('active');
}

async function refreshHomeData() {
    try {
        var u = await api('/user/profile');
        currentUser = u;
        localStorage.setItem('user', JSON.stringify(currentUser));
        updateUserInfo();
        loadRecentSchedule();
    } catch (e) {}
}

function showToast(msg, type) {
    var t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 2500);
}

// MIUIX自定义下拉框
var openMiuiSelect = null;
document.addEventListener('click', function(e) {
    if (openMiuiSelect && !openMiuiSelect.contains(e.target)) {
        openMiuiSelect.classList.remove('open');
        openMiuiSelect = null;
    }
});

function miuiSelect(id, options, selectedVal, onchange) {
    var h = '<div class="miui-select" id="' + id + '">';
    h += '<div class="miui-select-trigger" onclick="toggleMiuiSelect(event, \'' + id + '\')"></div>';
    h += '<div class="miui-select-dropdown">';
    options.forEach(function(o) {
        var cls = o.value === selectedVal ? ' selected' : '';
        h += '<div class="miui-select-option' + cls + '" data-value="' + o.value + '" onclick="pickMiuiOption(\'' + id + '\',\'' + o.value + '\')">' + o.label + '</div>';
    });
    h += '</div></div>';
    var el = document.getElementById(id);
    if (el) {
        el.outerHTML = h;
    }
    updateMiuiSelectDisplay(id, selectedVal);
    var wrapper = document.getElementById(id);
    wrapper._onchange = onchange;
}

function toggleMiuiSelect(e, id) {
    e.stopPropagation();
    var el = document.getElementById(id);
    if (!el) return;
    var isOpen = el.classList.contains('open');
    if (openMiuiSelect) openMiuiSelect.classList.remove('open');
    if (!isOpen) {
        el.classList.add('open');
        openMiuiSelect = el;
    } else {
        openMiuiSelect = null;
    }
}

function pickMiuiOption(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    el.querySelectorAll('.miui-select-option').forEach(function(opt) {
        opt.classList.toggle('selected', opt.getAttribute('data-value') === value);
    });
    updateMiuiSelectDisplay(id, value);
    el.classList.remove('open');
    openMiuiSelect = null;
    if (el._onchange) el._onchange(value);
}

function updateMiuiSelectDisplay(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    var trigger = el.querySelector('.miui-select-trigger');
    var selected = el.querySelector('.miui-select-option[data-value="' + value + '"]');
    if (trigger && selected) trigger.textContent = selected.textContent;
}

function getMiuiSelectValue(id) {
    var el = document.getElementById(id);
    if (!el) return '';
    var selected = el.querySelector('.miui-select-option.selected');
    return selected ? selected.getAttribute('data-value') : '';
}

// MIUIX弹窗组件
function miuiAlert(msg) {
    return new Promise(function(resolve) {
        var h = '<div id="miuiDialog" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.35);z-index:10000;display:flex;align-items:center;justify-content:center" onclick="if(event.target===this)closeMiuiDialog()">';
        h += '<div style="background:#fff;border-radius:16px;padding:24px 20px 16px;width:85%;max-width:320px;animation:miuiFadeIn 0.2s">';
        h += '<div style="font-size:16px;font-weight:500;color:#1a1a1a;text-align:center;margin-bottom:20px;line-height:1.5">' + msg + '</div>';
        h += '<div style="text-align:center"><button class="miui-dialog-btn" onclick="closeMiuiDialog()" style="color:#3478f6;font-size:16px;font-weight:500;background:none;border:none;padding:8px 24px;cursor:pointer">\u786E\u5B9A</button></div>';
        h += '</div></div>';
        document.body.insertAdjacentHTML('beforeend', h);
        document.getElementById('miuiDialog')._resolve = resolve;
    });
}

function miuiConfirm(msg) {
    return new Promise(function(resolve) {
        var h = '<div id="miuiDialog" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.35);z-index:10000;display:flex;align-items:center;justify-content:center" onclick="if(event.target===this)closeMiuiDialog()">';
        h += '<div style="background:#fff;border-radius:16px;padding:24px 20px 16px;width:85%;max-width:320px;animation:miuiFadeIn 0.2s">';
        h += '<div style="font-size:16px;font-weight:500;color:#1a1a1a;text-align:center;margin-bottom:20px;line-height:1.5">' + msg + '</div>';
        h += '<div style="display:flex;border-top:0.5px solid #f2f3f5">';
        h += '<button class="miui-dialog-btn" onclick="closeMiuiDialog(false)" style="flex:1;color:#86868b;font-size:16px;background:none;border:none;padding:12px;cursor:pointer;border-right:0.5px solid #f2f3f5">\u53D6\u6D88</button>';
        h += '<button class="miui-dialog-btn" onclick="closeMiuiDialog(true)" style="flex:1;color:#3478f6;font-size:16px;font-weight:500;background:none;border:none;padding:12px;cursor:pointer">\u786E\u5B9A</button>';
        h += '</div></div></div>';
        document.body.insertAdjacentHTML('beforeend', h);
        document.getElementById('miuiDialog')._resolve = resolve;
    });
}

function miuiPrompt(msg, defaultVal) {
    return new Promise(function(resolve) {
        var h = '<div id="miuiDialog" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.35);z-index:10000;display:flex;align-items:center;justify-content:center" onclick="if(event.target===this)closeMiuiDialog()">';
        h += '<div style="background:#fff;border-radius:16px;padding:24px 20px 16px;width:85%;max-width:320px;animation:miuiFadeIn 0.2s">';
        h += '<div style="font-size:16px;font-weight:500;color:#1a1a1a;text-align:center;margin-bottom:16px;line-height:1.5">' + msg + '</div>';
        h += '<input id="miuiPromptInput" type="text" value="' + (defaultVal || '') + '" style="width:100%;padding:12px;border:none;border-radius:10px;background:#f2f3f5;font-size:15px;box-sizing:border-box;outline:none;margin-bottom:16px">';
        h += '<div style="display:flex;border-top:0.5px solid #f2f3f5">';
        h += '<button class="miui-dialog-btn" onclick="closeMiuiDialog(null)" style="flex:1;color:#86868b;font-size:16px;background:none;border:none;padding:12px;cursor:pointer;border-right:0.5px solid #f2f3f5">\u53D6\u6D88</button>';
        h += '<button class="miui-dialog-btn" onclick="closeMiuiDialog(document.getElementById(\'miuiPromptInput\').value)" style="flex:1;color:#3478f6;font-size:16px;font-weight:500;background:none;border:none;padding:12px;cursor:pointer">\u786E\u5B9A</button>';
        h += '</div></div></div>';
        document.body.insertAdjacentHTML('beforeend', h);
        var input = document.getElementById('miuiPromptInput');
        input.focus();
        input.onkeydown = function(e) { if (e.key === 'Enter') closeMiuiDialog(input.value); };
        document.getElementById('miuiDialog')._resolve = resolve;
    });
}

function miuiPromptMulti(fields) {
    return new Promise(function(resolve) {
        var h = '<div id="miuiDialog" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.35);z-index:10000;display:flex;align-items:center;justify-content:center" onclick="if(event.target===this)closeMiuiDialog()">';
        h += '<div style="background:#fff;border-radius:16px;padding:24px 20px 16px;width:85%;max-width:340px;animation:miuiFadeIn 0.2s">';
        fields.forEach(function(f, i) {
            h += '<div style="margin-bottom:12px"><div style="font-size:13px;color:#86868b;margin-bottom:6px;font-weight:500">' + f.label + '</div>';
            if (f.type === 'select' && f.options) {
                h += '<select id="miuiPromptField' + i + '" onchange="onMiuiFieldChange(' + i + ')" style="width:100%;padding:11px;border:none;border-radius:10px;background:#f2f3f5;font-size:14px;box-sizing:border-box;outline:none;-webkit-appearance:none">';
                f.options.forEach(function(o) {
                    var sel = (f.defaultValue && String(o.value) === String(f.defaultValue)) ? ' selected' : '';
                    h += '<option value="' + o.value + '"' + sel + '>' + o.label + '</option>';
                });
                h += '</select>';
                if (f.customKey) {
                    h += '<div id="miuiCustomWrap' + i + '" style="display:none;margin-top:8px"><input id="miuiCustomField' + i + '" type="text" placeholder="' + (f.customPlaceholder || '') + '" style="width:100%;padding:11px;border:none;border-radius:10px;background:#f2f3f5;font-size:14px;box-sizing:border-box;outline:none"></div>';
                }
            } else {
                h += '<input id="miuiPromptField' + i + '" type="' + (f.type || 'text') + '" placeholder="' + (f.placeholder || '') + '" value="' + (f.defaultValue || '') + '" style="width:100%;padding:11px;border:none;border-radius:10px;background:#f2f3f5;font-size:14px;box-sizing:border-box;outline:none">';
            }
            h += '</div>';
        });
        h += '<div style="display:flex;border-top:0.5px solid #f2f3f5;margin-top:4px">';
        h += '<button onclick="closeMiuiDialog(null)" style="flex:1;color:#86868b;font-size:16px;background:none;border:none;padding:12px;cursor:pointer;border-right:0.5px solid #f2f3f5">\u53D6\u6D88</button>';
        h += '<button id="miuiDialogOk" style="flex:1;color:#3478f6;font-size:16px;font-weight:500;background:none;border:none;padding:12px;cursor:pointer">\u786E\u5B9A</button>';
        h += '</div></div></div>';
        document.body.insertAdjacentHTML('beforeend', h);
        var d = document.getElementById('miuiDialog');
        d._resolve = resolve;
        d._fields = fields;
        document.getElementById('miuiDialogOk').onclick = function() {
            var result = {};
            fields.forEach(function(f, i) {
                if (f.type === 'select') {
                    var sel = document.getElementById('miuiPromptField' + i);
                    result[f.key] = sel ? sel.value : '';
                    if (f.customKey && result[f.key] === '') {
                        var customEl = document.getElementById('miuiCustomField' + i);
                        result[f.key] = customEl ? customEl.value : '';
                    }
                } else {
                    var el = document.getElementById('miuiPromptField' + i);
                    result[f.key] = el ? el.value : '';
                }
            });
            closeMiuiDialog(result);
        };
        var firstInput = document.getElementById('miuiPromptField0');
        if (firstInput && firstInput.tagName !== 'SELECT') firstInput.focus();
    });
}

function onMiuiFieldChange(index) {
    var sel = document.getElementById('miuiPromptField' + index);
    var wrap = document.getElementById('miuiCustomWrap' + index);
    if (sel && wrap) {
        wrap.style.display = sel.value === '' ? 'block' : 'none';
    }
}

function closeMiuiDialog(val) {
    var d = document.getElementById('miuiDialog');
    if (!d) return;
    if (val === undefined) val = null;
    if (d._resolve) d._resolve(val);
    d.remove();
}

var _miuiFieldMap = {};

// ========== \u767B\u5F55 ==========
function showLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
}
function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
}

async function login() {
    var username = document.getElementById('loginUsername').value.trim();
    var password = document.getElementById('loginPassword').value.trim();
    if (!username || !password) { showToast('\u8BF7\u8F93\u5165\u8D26\u53F7\u5BC6\u7801', 'error'); return; }
    try {
        var data = await api('/dev-login', 'POST', { username: username, password: password });
        currentUser = data;
        localStorage.setItem('user', JSON.stringify(data));
        showToast('\u767B\u5F55\u6210\u529F', 'success');
        initHomePage();
    } catch (e) { showToast(e.message, 'error'); }
}

async function register() {
    var username = document.getElementById('regUsername').value.trim();
    var password = document.getElementById('regPassword').value.trim();
    var cn = document.getElementById('regCn').value.trim();
    if (!username || !password || !cn) { showToast('\u8BF7\u586B\u5199\u5B8C\u6574\u4FE1\u606F', 'error'); return; }
    try {
        var data = await api('/dev-register', 'POST', { username: username, password: password, cn: cn });
        currentUser = data;
        localStorage.setItem('user', JSON.stringify(data));
        showToast('\u6CE8\u518C\u6210\u529F', 'success');
        initHomePage();
    } catch (e) { showToast(e.message, 'error'); }
}

function switchAccount() {
    currentUser = null;
    localStorage.removeItem('user');
    pageHistory = [];
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    document.getElementById('authPage').classList.add('active');
    currentPage = 'auth';
}

// ========== \u4E3B\u9875 ==========
function initHomePage() {
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    document.getElementById('homePage').classList.add('active');
    currentPage = 'home';
    pageHistory = [];
    updateUserInfo();
    loadRecentSchedule();
    var bb = document.getElementById('bottomBar');
    if (bb) { bb.style.display = 'flex'; document.querySelectorAll('.bottom-bar-item').forEach(function(item) { item.classList.remove('active'); }); document.querySelector('.bottom-bar-item:nth-child(1)').classList.add('active'); }
}

function updateUserInfo() {
    if (!currentUser) return;
    document.getElementById('userName').textContent = currentUser.nickname || '\u672A\u8BBE\u7F6E';
    document.getElementById('userCn').textContent = 'CN: ' + (currentUser.cn || '\u672A\u8BBE\u7F6E');
    document.getElementById('userCoins').textContent = currentUser.coins || 0;
    var avatar = document.getElementById('userAvatar');
    if (currentUser.avatar_url) {
        avatar.innerHTML = '<img src="' + currentUser.avatar_url + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
    } else {
        avatar.textContent = (currentUser.nickname || '?')[0].toUpperCase();
    }
    if (currentUser.is_admin) document.getElementById('navAdmin').style.display = 'inline';
    loadPendingCoins();
}

async function loadPendingCoins() {
    try {
        var data = await api('/pending-coins');
        var el = document.getElementById('pendingCoins');
        if (el) el.textContent = data.pending_coins || 0;
    } catch (e) {}
}

async function loadCompetitions() {
    try {
        var data = await api('/competitions');
        var html = '';
        if (data.length === 0) html = '<div style="text-align:center;color:#999;padding:40px">\u6682\u65E0\u8FDB\u884C\u4E2D\u7684\u7ADE\u731C</div>';
        data.forEach(function(c) {
            html += '<div class="list-item" onclick="openCompetition(' + c.id + ')">';
            html += '<div><div class="item-name">' + c.year + '\u5E74' + c.season + '</div>';
            html += '<div class="item-sub">' + c.name + '</div></div>';
            html += '<div class="item-right"><span class="status-badge status-active">\u8FDB\u884C\u4E2D</span></div>';
            html += '</div>';
        });
        document.getElementById('competitionList').innerHTML = html;
    } catch (e) { showToast('\u52A0\u8F7D\u5931\u8D25', 'error'); }
}

function getTargetDates() {
    var today = new Date();
    var dow = today.getDay();
    var targets = [];
    if (dow >= 1 && dow <= 5) {
        var fri = new Date(today);
        fri.setDate(today.getDate() + (5 - dow));
        var sat = new Date(fri);
        sat.setDate(fri.getDate() + 1);
        targets = [fri, sat];
    } else if (dow === 6) {
        var sat2 = new Date(today);
        var sun = new Date(today);
        sun.setDate(today.getDate() + 1);
        targets = [sat2, sun];
    } else {
        var sun2 = new Date(today);
        var nextFri = new Date(today);
        nextFri.setDate(today.getDate() + (5 - dow + 7));
        targets = [sun2, nextFri];
    }
    return targets.map(function(d) { return d.toISOString().split('T')[0]; });
}

async function loadRecentSchedule() {
    try {
        var comps = await api('/competitions');
        if (comps.length === 0) { document.getElementById('recentSchedule').innerHTML = ''; return; }
        var targetDates = getTargetDates();
        var allHtml = '';
        for (var ci = 0; ci < comps.length; ci++) {
            var data = await api('/competitions/' + comps[ci].id + '/full');
            var filtered = data.matches.filter(function(m) {
                return m.match_date && targetDates.indexOf(m.match_date) !== -1;
            });
            if (filtered.length === 0) continue;
            filtered.forEach(function(m) {
                allHtml += '<div style="margin:0 16px 8px">';
                allHtml += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">';
                var hLogo = m.home_logo ? '<img src="' + m.home_logo + '" style="width:20px;height:20px;border-radius:5px;object-fit:contain;background:#f2f3f5">' : '';
                var aLogo = m.away_logo ? '<img src="' + m.away_logo + '" style="width:20px;height:20px;border-radius:5px;object-fit:contain;background:#f2f3f5">' : '';
                allHtml += hLogo + '<span style="font-size:13px;font-weight:500">' + (m.home_team || '?') + ' vs ' + (m.away_team || '?') + '</span>' + aLogo;
                allHtml += '<span style="font-size:11px;color:#86868b;margin-left:auto">' + m.match_weekday + ' ' + (m.match_date || '').substring(5) + '</span>';
                allHtml += '</div>';
                m.questions.forEach(function(q) {
                    var sLabel = q.status === 'active' ? '\u5F00\u76D8\u4E2D' : q.status === 'closed' ? '\u5DF2\u5C01\u76D8' : '\u5DF2\u7ED3\u7B97';
                    var sColor = q.status === 'active' ? '#34a853' : q.status === 'closed' ? '#f57c00' : '#86868b';
                    allHtml += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#fff;border-radius:10px;margin-bottom:4px;cursor:pointer" onclick="loadBetPage(\'' + q.question_code + '\',\'' + q.status + '\',\'' + (m.home_team||'').replace(/'/g,"\\'") + '\',\'' + (m.away_team||'').replace(/'/g,"\\'") + '\',\'' + (m.home_logo||'') + '\',\'' + (m.away_logo||'') + '\',\'' + (q.question_text||'').replace(/'/g,"\\'") + '\')">';
                    allHtml += '<div><span style="font-size:14px;font-weight:500;color:#1a1a1a">' + q.question_text + '</span></div>';
                    allHtml += '<span style="font-size:12px;color:' + sColor + ';font-weight:500">' + sLabel + '</span>';
                    allHtml += '</div>';
                });
                allHtml += '</div>';
            });
        }
        if (!allHtml) allHtml = '<div style="padding:16px;text-align:center;color:#86868b;font-size:13px">\u8FD1\u671F\u6682\u65E0\u8D5B\u7A0B</div>';
        document.getElementById('recentSchedule').innerHTML = allHtml;
    } catch (e) {}
}

function showFullSchedule() {
    showPage('schedule');
    loadFullSchedule();
}

async function loadFullSchedule() {
    try {
        var comps = await api('/competitions');
        var filterHtml = '<div id="scheduleFilterArea"><div class="filter-bar">';
        filterHtml += '<div id="schWeekFilter"></div>';
        filterHtml += '</div></div>';
        document.getElementById('scheduleFilterArea').innerHTML = filterHtml;

        var allData = [];
        for (var ci = 0; ci < comps.length; ci++) {
            var data = await api('/competitions/' + comps[ci].id + '/full');
            allData.push(data);
        }

        var allWeeks = {};
        allData.forEach(function(d) { d.matches.forEach(function(m) { allWeeks[m.week_number] = true; }); });
        var weekOpts = [{value:'', label:'\u5168\u90E8\u5468'}];
        Object.keys(allWeeks).sort(function(a,b){return a-b;}).forEach(function(w) {
            weekOpts.push({value: String(w), label: w + '\u5468'});
        });
        miuiSelect('schWeekFilter', weekOpts, '', function() { renderFullSchedule(allData); });
        renderFullSchedule(allData);
    } catch (e) { document.getElementById('scheduleContent').innerHTML = '<div style="padding:40px;text-align:center;color:#e74c3c">\u52A0\u8F7D\u5931\u8D25</div>'; }
}

function renderFullSchedule(allData) {
    var wf = getMiuiSelectValue('schWeekFilter') || '';
    var h = '';
    allData.forEach(function(data) {
        var filtered = data.matches;
        if (wf) filtered = filtered.filter(function(m) { return String(m.week_number) === wf; });
        if (filtered.length === 0) return;
        h += '<div style="padding:12px 16px 4px;font-size:15px;font-weight:600;color:#1a1a1a">' + data.name + '</div>';
        filtered.forEach(function(m) {
            h += '<div style="margin:0 16px 4px">';
            h += '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fff;border-radius:10px;margin-bottom:4px;cursor:pointer" onclick="openCompetition(' + data.id + ')">';
            var hLogo = m.home_logo ? '<img src="' + m.home_logo + '" style="width:20px;height:20px;border-radius:5px;object-fit:contain;background:#f2f3f5">' : '';
            var aLogo = m.away_logo ? '<img src="' + m.away_logo + '" style="width:20px;height:20px;border-radius:5px;object-fit:contain;background:#f2f3f5">' : '';
            h += hLogo + '<span style="font-size:14px;font-weight:500;color:#1a1a1a">' + (m.home_team||'?') + ' vs ' + (m.away_team||'?') + '</span>' + aLogo;
            h += '<span style="font-size:11px;color:#86868b;margin-left:auto">';
            if (m.match_date) h += m.match_date.substring(5) + ' ' + (m.match_weekday||'') + ' ';
            h += 'W' + m.week_number + ' D' + m.day_number + '</span>';
            h += '</div></div>';
        });
    });
    if (!h) h = '<div style="padding:40px;text-align:center;color:#86868b">\u6682\u65E0\u8D5B\u7A0B</div>';
    document.getElementById('scheduleContent').innerHTML = h;
}

async function openCompetition(id) {
    try {
        var data = await api('/competitions/' + id + '/full');
        currentCompetition = data;
        document.getElementById('matchTitle').textContent = data.name;
        showPage('match');
        renderQuestions(data.matches);
    } catch (e) { showToast('\u52A0\u8F7D\u5931\u8D25', 'error'); }
}

function renderFilterBar(data) {
    var weeks = {};
    data.matches.forEach(function(m) { weeks[m.week_number] = true; });
    var h = '<div class="filter-bar">';
    h += '<div id="filterWeek"></div>';
    h += '<div id="filterDay"></div>';
    h += '<div id="filterMatch"></div>';
    h += '</div>';
    document.getElementById('filterArea').innerHTML = h;
    var weekOpts = [{value:'', label:'\u5168\u90E8\u5468'}];
    Object.keys(weeks).sort(function(a, b) { return a - b; }).forEach(function(w) {
        weekOpts.push({value: w, label: w + '\u5468'});
    });
    miuiSelect('filterWeek', weekOpts, '', function() {
        updateFilterSelects(currentCompetition, getMiuiSelectValue('filterWeek'));
        renderQuestions(currentCompetition.matches);
    });
    updateFilterSelects(data, '');
}

function updateFilterSelects(data, weekFilter) {
    var days = {}, matches = {};
    data.matches.forEach(function(m) {
        if (weekFilter && String(m.week_number) !== weekFilter) return;
        days[m.day_number] = true;
        matches[m.match_code] = (m.home_team || '?') + ' vs ' + (m.away_team || '?');
    });
    var dayOpts = [{value:'', label:'\u5168\u90E8\u5929'}];
    Object.keys(days).sort(function(a, b) { return a - b; }).forEach(function(d) {
        dayOpts.push({value: d, label: d + '\u5929'});
    });
    var matchOpts = [{value:'', label:'\u5168\u90E8\u6BD4\u8D5B'}];
    Object.keys(matches).sort().forEach(function(k) {
        matchOpts.push({value: k, label: matches[k]});
    });
    var curDay = getMiuiSelectValue('filterDay') || '';
    var curMatch = getMiuiSelectValue('filterMatch') || '';
    if (!days[curDay]) curDay = '';
    if (!matches[curMatch]) curMatch = '';
    miuiSelect('filterDay', dayOpts, curDay, function() {
        renderQuestions(currentCompetition.matches);
    });
    miuiSelect('filterMatch', matchOpts, curMatch, function() {
        renderQuestions(currentCompetition.matches);
    });
}

function applyFilter() {
    if (!currentCompetition) return;
    updateFilterSelects(currentCompetition, getMiuiSelectValue('filterWeek'));
    renderQuestions(currentCompetition.matches);
}

function renderQuestions(matches) {
    var html = '';
    matches.forEach(function(m) {
        var homeLogo = m.home_logo ? '<img src="' + m.home_logo + '" style="width:24px;height:24px;border-radius:6px;object-fit:contain;background:#f2f3f5">' : '<div style="width:24px;height:24px;border-radius:6px;background:#f2f3f5;display:flex;align-items:center;justify-content:center;font-size:11px;color:#86868b">?</div>';
        var awayLogo = m.away_logo ? '<img src="' + m.away_logo + '" style="width:24px;height:24px;border-radius:6px;object-fit:contain;background:#f2f3f5">' : '<div style="width:24px;height:24px;border-radius:6px;background:#f2f3f5;display:flex;align-items:center;justify-content:center;font-size:11px;color:#86868b">?</div>';
        var dateInfo = m.match_date ? '<span style="font-size:11px;color:#86868b;margin-left:8px">' + (m.match_date.substring(5)) + ' ' + (m.match_weekday || '') + '</span>' : '';
        html += '<div class="match-divider" style="display:flex;align-items:center;gap:8px">' + homeLogo + '<span>' + (m.home_team || '?') + '</span><span style="color:#86868b;font-weight:400">vs</span>' + awayLogo + '<span>' + (m.away_team || '?') + '</span>' + dateInfo + '</div>';
        m.questions.forEach(function(q, idx) {
            var sLabel = q.status === 'active' ? '\u5F00\u76D8\u4E2D' : q.status === 'closed' ? '\u5DF2\u5C01\u76D8' : '\u5DF2\u7ED3\u7B97';
            var sColor = q.status === 'active' ? '#34a853' : q.status === 'closed' ? '#f57c00' : '#86868b';
            var cardBg = q.status === 'active' ? '#e8f4fd' : q.status === 'closed' ? '#fff8e1' : q.correct_option_id ? '#e8f7ed' : '#fff0ed';
            html += '<div class="question-card" style="background:' + cardBg + '" onclick="loadBetPage(\'' + q.question_code + '\', \'' + q.status + '\', \'' + (m.home_team || '').replace(/'/g, "\\'") + '\', \'' + (m.away_team || '').replace(/'/g, "\\'") + '\', \'' + (m.home_logo || '') + '\', \'' + (m.away_logo || '') + '\', \'' + (q.question_text || '').replace(/'/g, "\\'") + '\')">';
            html += '<div class="question-header"><div class="question-label">' + (idx + 1) + '</div>';
            html += '<div class="question-text">' + q.question_text + '</div></div>';
            html += '<div class="bet-stats"><span style="color:#3478f6">\u7ADE\u731C\u6C60 ' + (q.total_coins || 0) + '\u5E01</span>';
            if (q.user_total_bet > 0) html += ' <span style="color:#86868b;margin-left:4px">| \u5DF2\u6295 ' + q.user_total_bet + '\u5E01</span>';
            html += '</div><div class="option-tags">';
            q.options.forEach(function(o) {
                var tb = '#f2f3f5';
                if (q.status === 'active') tb = '#e8f4fd';
                else if (q.correct_option_id && o.id === q.correct_option_id) tb = '#c8e6c9';
                else if (q.correct_option_id) tb = '#ffcdd2';
                html += '<span class="option-tag" style="background:' + tb + '">' + (o.option_text || '\u7A7A') + ' <span class="option-rate">' + o.base_rate + '\u500D</span></span>';
            });
            html += '</div><span style="font-size:12px;color:' + sColor + ';font-weight:500">' + sLabel + '</span></div>';
        });
    });
    if (!html) html = '<div style="padding:40px;text-align:center;color:#999">\u6682\u65E0\u5339\u914D\u7684\u6BD4\u8D5B</div>';
    document.getElementById('questionList').innerHTML = html;
}

// ========== \u6295\u6CE8 ==========
async function loadBetPage(code, status, homeTeam, awayTeam, homeLogo, awayLogo, questionText) {
    showPage('bet');
    try {
        var q = await api('/questions/' + code);
        currentQuestion = q;
        var homeLogoHtml = homeLogo ? '<img src="' + homeLogo + '" style="width:36px;height:36px;border-radius:10px;object-fit:contain;background:#f2f3f5">' : '<div style="width:36px;height:36px;border-radius:10px;background:#f2f3f5;display:flex;align-items:center;justify-content:center;font-size:13px;color:#86868b">?</div>';
        var awayLogoHtml = awayLogo ? '<img src="' + awayLogo + '" style="width:36px;height:36px;border-radius:10px;object-fit:contain;background:#f2f3f5">' : '<div style="width:36px;height:36px;border-radius:10px;background:#f2f3f5;display:flex;align-items:center;justify-content:center;font-size:13px;color:#86868b">?</div>';
        document.getElementById('betMatchInfo').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;gap:12px;padding:16px 0">' + homeLogoHtml + '<div style="text-align:center"><div style="font-size:20px;font-weight:700;color:#1a1a1a">' + (homeTeam || '?') + ' <span style="color:#86868b;font-weight:400">VS</span> ' + (awayTeam || '?') + '</div></div>' + awayLogoHtml + '</div>';
        document.getElementById('betQuestionText').textContent = questionText || q.question_text;
        document.getElementById('betBalance').textContent = currentUser.coins;
        var isCompleted = q.status === 'completed';
        var isClosed = q.status === 'closed';
        var isActive = q.status === 'active';
        var html = '';
        q.options.forEach(function(o) {
            var userBet = o.user_bet || 0;
            var ob = isActive ? '#f2f3f5' : isCompleted && q.correct_option_id === o.id ? '#e8f7ed' : isCompleted ? '#fff0ed' : '#f2f3f5';
            html += '<div class="option-item" style="background:' + ob + ';border-radius:14px;margin:0 16px 8px;padding:14px">';
            html += '<div style="flex:1"><div style="font-size:15px;font-weight:500;color:#1a1a1a">' + (o.option_text || '\u7A7A') + '</div>';
            html += '<div style="font-size:12px;color:#86868b;margin-top:2px">' + o.base_rate + '\u500D</div></div>';
            if (isActive) {
                html += '<div class="option-bet-area">';
                html += '<input type="number" class="bet-input-sm" id="bet_' + o.id + '" value="' + (userBet > 0 ? userBet : '') + '" placeholder="\u6295\u5E01\u6570" oninput="onOptionBetChange(\'' + o.id + '\', this.value)">';
                html += '<span class="bet-unit">\u5E01</span>';
                if (userBet > 0) html += '<span class="bet-done">\u5DF2\u6295' + userBet + '</span>';
                html += '</div>';
            } else {
                if (userBet > 0) html += '<div class="option-bet-area"><span class="bet-done">\u5DF2\u6295' + userBet + '</span></div>';
            }
            html += '</div>';
        });
        if (isCompleted) html += '<div style="padding:12px 16px;font-size:13px;color:#86868b;background:#f7f8fa;border-radius:12px;margin:0 16px">\u8BE5\u7ADE\u731C\u5DF2\u7ED3\u7B97</div>';
        else if (isClosed) html += '<div style="padding:12px 16px;font-size:13px;color:#f57c00;background:#fff8e1;border-radius:12px;margin:0 16px">\u5DF2\u5C01\u76D8\uFF0C\u6682\u505C\u4E0B\u6CE8</div>';
        document.getElementById('optionList').innerHTML = html;
    } catch (e) { showToast('\u52A0\u8F7D\u5931\u8D25', 'error'); }
}

async function onOptionBetChange(oid, value) {
    var coins = parseInt(value) || 0;
    if (coins < 0) { showToast('\u4E0D\u80FD\u4E3A\u8D1F\u6570', 'error'); return; }
    try {
        await api('/bets', 'POST', { question_id: currentQuestion.id, option_id: parseInt(oid), coins: coins });
        showToast('\u6295\u5E01\u6210\u529F', 'success');
        var q = await api('/questions/' + currentQuestion.question_code);
        currentQuestion = q;
        var profile = await api('/user/profile');
        currentUser.coins = profile.coins;
        localStorage.setItem('user', JSON.stringify(currentUser));
        document.getElementById('betBalance').textContent = currentUser.coins;
        q.options.forEach(function(o) {
            var input = document.getElementById('bet_' + o.id);
            if (!input) return;
            var done = input.parentElement.querySelector('.bet-done');
            if (o.user_bet > 0) {
                input.value = o.user_bet;
                if (done) done.textContent = '\u5DF2\u6295' + o.user_bet;
                else { var s = document.createElement('span'); s.className = 'bet-done'; s.textContent = '\u5DF2\u6295' + o.user_bet; input.parentElement.appendChild(s); }
            } else {
                input.value = '';
                if (done) done.remove();
            }
        });
    } catch (e) { showToast(e.message, 'error'); }
}

function goBackFromBet() { currentQuestion = null; goBack(); }

// ========== \u6392\u884C\u699C ==========
async function showLeaderboard() {
    showPage('leaderboard');
    try {
        var data = await api('/leaderboard');
        var html = '';
        data.forEach(function(u) {
            var rc = u.rank <= 3 ? ' top' + u.rank : '';
            html += '<div class="rank-item"><div class="rank-num' + rc + '">';
            if (u.avatar_url) html += '<img src="' + u.avatar_url + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
            else html += u.rank;
            html += '</div>';
            html += '<div class="rank-info"><div class="rank-name">' + u.nickname + '</div>';
            html += '<div class="rank-cn">CN: ' + (u.cn || '') + '</div></div>';
            html += '<div class="rank-coins">' + u.coins + '\u5E01</div></div>';
        });
        if (!html) html = '<div style="padding:40px;text-align:center;color:#999">\u6682\u65E0\u6570\u636E</div>';
        document.getElementById('leaderboardList').innerHTML = html;
    } catch (e) { showToast('\u52A0\u8F7D\u5931\u8D25', 'error'); }
}

// ========== \u4E2A\u4EBA\u4E2D\u5FC3 ==========
async function showProfile() {
    showPage('profile');
    try {
        var u = await api('/user/profile');
        currentUser = u;
        localStorage.setItem('user', JSON.stringify(u));
        var av = document.getElementById('profileAvatar');
        if (u.avatar_url) av.innerHTML = '<img src="' + u.avatar_url + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
        else av.textContent = (u.nickname || '?')[0].toUpperCase();
        document.getElementById('profileName').textContent = u.nickname || '\u672A\u8BBE\u7F6E';
        document.getElementById('profileCn').textContent = u.cn || '\u672A\u8BBE\u7F6E';
        document.getElementById('profileCoins').textContent = u.coins || 0;
        document.getElementById('editNickname').value = u.nickname || '';
        document.getElementById('editCn').value = u.cn || '';
    } catch (e) { showToast('\u52A0\u8F7D\u5931\u8D25', 'error'); }
}

async function saveProfile() {
    var nn = document.getElementById('editNickname').value.trim();
    var cn = document.getElementById('editCn').value.trim();
    if (!nn) { showToast('\u8BF7\u8F93\u5165\u6635\u79F0', 'error'); return; }
    try {
        await api('/user/profile', 'PUT', { nickname: nn, cn: cn });
        currentUser.nickname = nn; currentUser.cn = cn;
        localStorage.setItem('user', JSON.stringify(currentUser));
        showToast('\u4FDD\u5B58\u6210\u529F', 'success');
        showProfile();
    } catch (e) { showToast(e.message, 'error'); }
}

async function changePassword() {
    var o = document.getElementById('oldPassword').value.trim();
    var n = document.getElementById('newPassword').value.trim();
    var c = document.getElementById('confirmPassword').value.trim();
    if (!o || !n || !c) { showToast('\u8BF7\u586B\u5199\u5B8C\u6574', 'error'); return; }
    if (n !== c) { showToast('\u4E24\u6B21\u5BC6\u7801\u4E0D\u4E00\u81F4', 'error'); return; }
    try { await api('/user/password', 'PUT', { old_password: o, new_password: n }); showToast('\u5BC6\u7801\u4FEE\u6539\u6210\u529F', 'success'); }
    catch (e) { showToast(e.message, 'error'); }
}

function uploadAvatar() {
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async function() {
        var file = input.files[0]; if (!file) return;
        var fd = new FormData(); fd.append('file', file);
        try {
            var res = await fetch(API_BASE + '/user/avatar', { method: 'POST', headers: { 'X-User-Id': String(currentUser.user_id || currentUser.id) }, body: fd });
            var data = await res.json();
            if (!res.ok) throw new Error(data.error);
            currentUser.avatar_url = data.url;
            localStorage.setItem('user', JSON.stringify(currentUser));
            showToast('\u5934\u50CF\u4E0A\u4F20\u6210\u529F', 'success');
            showProfile();
        } catch (e) { showToast(e.message, 'error'); }
    };
    input.click();
}

// ========== \u5173\u4E8E ==========
function showAbout() {
    showPage('about');
    document.getElementById('testersList').innerHTML =
        '<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:0.5px solid #f2f3f5">' +
        '<div style="width:40px;height:40px;border-radius:50%;overflow:hidden;background:#f2f3f5;flex-shrink:0"><img src="/uploads/avatars/tester1.jpg" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML=\'<div style=\\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:16px;color:#86868b\\\'>&#x263A;</div>\'"></div>' +
        '<div><div style="font-size:15px;font-weight:500;color:#1a1a1a">幸幸睡醒了</div></div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:12px;padding:12px 0">' +
        '<div style="width:40px;height:40px;border-radius:50%;overflow:hidden;background:#f2f3f5;flex-shrink:0"><img src="/uploads/avatars/tester2.jpg" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML=\'<div style=\\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:16px;color:#86868b\\\'>&#x263A;</div>\'"></div>' +
        '<div><div style="font-size:15px;font-weight:500;color:#1a1a1a">癸</div></div>' +
        '</div>';
}

// ========== 竞猜奖品页 ==========
async function showPrizes() {
    showPage('prizes');
    try {
        var comps = await api('/competitions');
        var h = '';
        if (comps.length === 0) { h = '<div style="padding:40px;text-align:center;color:#86868b">\u6682\u65E0\u7ADE\u731C\u8D5B\u4E8B</div>'; }
        else {
            h += '<div style="padding:12px 16px"><button class="admin-btn btn-success" style="display:flex;align-items:center;gap:4px;padding:8px 14px;border-radius:10px;font-size:13px" onclick="addUserPrize()"><i class="ri-gift-line"></i> \u63D0\u4F9B\u5956\u54C1</button></div>';
            for (var ci = 0; ci < comps.length; ci++) {
                var prizes = await api('/prizes?competition_id=' + comps[ci].id);
                if (prizes.length === 0) continue;
                h += '<div style="padding:8px 16px 4px;font-size:13px;font-weight:600;color:#86868b">' + comps[ci].name + '</div>';
                prizes.forEach(function(p) {
                    var canEdit = currentUser && p.creator_id === currentUser.user_id;
                    h += '<div style="background:#fff;border-radius:14px;padding:12px;margin:0 16px 6px">';
                    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start">';
                    h += '<div style="flex:1"><div style="font-size:15px;font-weight:500;color:#1a1a1a">' + p.name + '</div>';
                    h += '<div style="font-size:12px;color:#86868b;margin-top:3px">';
                    if (p.quantity) h += '\u4EFD\u6570: ' + p.quantity;
                    if (p.condition) h += ' | \u6761\u4EF6: ' + p.condition;
                    if (p.provider) h += ' | \u63D0\u4F9B: ' + p.provider;
                    h += '</div>';
                    if (p.notes) h += '<div style="font-size:12px;color:#86868b;margin-top:2px">\u5907\u6CE8: ' + p.notes + '</div>';
                    h += '</div>';
                    if (canEdit) {
                        h += '<div style="display:flex;gap:6px;flex-shrink:0">';
                        h += '<button class="admin-btn btn-sm" style="font-size:16px;width:30px;height:30px;padding:0;display:flex;align-items:center;justify-content:center" onclick="editUserPrize(' + p.id + ')"><i class="ri-edit-line"></i></button>';
                        h += '<button class="admin-btn btn-danger" style="font-size:16px;width:30px;height:30px;padding:0;display:flex;align-items:center;justify-content:center" onclick="deleteUserPrize(' + p.id + ')"><i class="ri-delete-bin-line"></i></button>';
                        h += '</div>';
                    }
                    h += '</div></div>';
                });
            }
            if (!h.includes('padding:8px 16px 4px')) h += '<div style="padding:40px;text-align:center;color:#86868b">\u6682\u65E0\u5956\u54C1</div>';
        }
        document.getElementById('prizesPageContent').innerHTML = h;
    } catch (e) {}
}

async function addUserPrize() {
    var comps = await api('/competitions');
    var opts = comps.map(function(c) { return {value: String(c.id), label: c.name}; });
    var result = await miuiPromptMulti([
        {key:'competition_id',label:'\u7ADE\u731C\u8D5B\u4E8B',type:'select',options:opts},
        {key:'name',label:'\u5956\u54C1\u540D\u79F0',placeholder:'\u5982 \u8054\u540D\u5468\u8FB9',type:'text'},
        {key:'quantity',label:'\u4EFD\u6570',placeholder:'1',type:'number'},
        {key:'condition',label:'\u83B7\u53D6\u6761\u4EF6',placeholder:'\u5982 \u731C\u4E2D\u6BD4\u5206'},
        {key:'provider',label:'\u63D0\u4F9B\u4EBA',placeholder:'\u6211\u7684\u540D\u5B57'},
        {key:'notes',label:'\u5907\u6CE8',placeholder:'\u53EF\u9009'}
    ]);
    if (!result || !result.name) return;
    result.competition_id = parseInt(result.competition_id) || null;
    try { await api('/admin/prizes', 'POST', result); showToast('\u63D0\u4F9B\u6210\u529F', 'success'); showPrizes(); }
    catch (e) { showToast(e.message, 'error'); }
}

async function editUserPrize(id) {
    var prizes = await api('/prizes');
    var p = prizes.find(function(x) { return x.id === id; });
    if (!p) return;
    var result = await miuiPromptMulti([
        {key:'name',label:'\u5956\u54C1\u540D\u79F0',type:'text',defaultValue:p.name},
        {key:'quantity',label:'\u4EFD\u6570',type:'number',defaultValue:String(p.quantity)},
        {key:'condition',label:'\u83B7\u53D6\u6761\u4EF6',type:'text',defaultValue:p.condition},
        {key:'provider',label:'\u63D0\u4F9B\u4EBA',type:'text',defaultValue:p.provider},
        {key:'notes',label:'\u5907\u6CE8',type:'text',defaultValue:p.notes}
    ]);
    if (!result) return;
    try { await api('/admin/prizes/' + id, 'PUT', result); showToast('\u5DF2\u66F4\u65B0', 'success'); showPrizes(); }
    catch (e) { showToast(e.message, 'error'); }
}

async function deleteUserPrize(id) {
    if (!(await miuiConfirm('\u786E\u5B9A\u5220\u9664\uFF1F'))) return;
    try { await api('/admin/prizes/' + id, 'DELETE'); showToast('\u5DF2\u5220\u9664', 'success'); showPrizes(); }
    catch (e) { showToast(e.message, 'error'); }
}

// ========== 推荐直播 ==========
var LIVESTREAMS = [
    {name: '\u5B98\u65B9-\u4E2D\u7B49\u538B\u529B', platform: 'bilibili', room_id: '5555', url: 'https://live.bilibili.com/5555'},
    {name: '\u51C9\u54C8\u76AE-\u5B8C\u5168\u65E0\u538B\u529B', platform: 'bilibili', room_id: '1695', url: 'https://live.bilibili.com/1695'},
    {name: '\u5361\u68A6-\u5435\u5435\u95F9\u95F9', platform: 'bilibili', room_id: '25393570', url: 'https://live.bilibili.com/25393570'},
    {name: '\u54FC\u54FC-\u5706\u6DA6\u7684\u54B3\u54B3', platform: 'bilibili', room_id: '25326207', url: 'https://live.bilibili.com/25326207'},
    {name: '\u602A\u559C-\u61C2\u5F97\u90FD\u61C2', platform: 'bilibili', room_id: '11226953', url: 'https://live.bilibili.com/11226953'},
    {name: '\u4F2F\u5343-\u4E32\u5B50\u4E4B\u5BB6', platform: 'huya', room_id: '298142', url: 'https://www.huya.com/298142'}
];

async function showLivestream() {
    showPage('livestream');
    var h = '<div style="padding:12px 16px">';
    for (var i = 0; i < LIVESTREAMS.length; i++) {
        var ls = LIVESTREAMS[i];
        var coverUrl = '';
        if (ls.platform === 'bilibili') {
            try {
                var coverData = await api('/livestream/cover?platform=bilibili&room_id=' + ls.room_id);
                coverUrl = coverData.cover || '';
            } catch (e) {}
        }
        h += '<div onclick="window.open(\'' + ls.url + '\',\'_blank\')" style="background:#fff;border-radius:14px;overflow:hidden;margin-bottom:10px;cursor:pointer">';
        h += '<div style="height:160px;background:#f2f3f5;display:flex;align-items:center;justify-content:center">';
        if (coverUrl) {
            h += '<img src="/api/livestream/image?url=' + encodeURIComponent(coverUrl) + '" style="width:100%;height:100%;object-fit:cover" loading="lazy">';
        } else {
            h += '<i class="ri-live-line" style="font-size:40px;color:#c7c7cc"></i>';
        }
        h += '</div>';
        h += '<div style="padding:10px 14px"><div style="font-size:15px;font-weight:500;color:#1a1a1a">' + ls.name + '</div>';
        h += '<div style="font-size:12px;color:#86868b;margin-top:2px">' + ls.platform + ' \u76F4\u64AD\u95F4</div></div>';
        h += '</div>';
    }
    h += '</div>';
    document.getElementById('livestreamContent').innerHTML = h;
}

// ========== \u89C4\u5219 ==========
function showRules() {
    showPage('rules');
    document.getElementById('rulesContent').innerHTML =
        '<div style="padding:20px;line-height:1.8">' +
        '<h3 style="margin-bottom:10px">\u7ADE\u731C\u89C4\u5219</h3>' +
        '<p><strong>\u6CE8\u518C\u8D26\u53F7\uFF1A</strong>\u6BCF\u4E2A\u8D26\u53F7\u6CE8\u518C\u540E\u83B7\u5F97 5000 \u5E01\u3002</p>' +
        '<p><strong>\u4E0B\u6CE8\u89C4\u5219\uFF1A</strong>\u6BCF\u4E2A\u9009\u9879\u53EF\u4EE5\u5355\u72EC\u6295\u5E01\u3002\u5C01\u76D8\u524D\u53EF\u968F\u65F6\u4FEE\u6539\u6295\u5E01\u6570\uFF08\u8986\u76D6\u5F0F\uFF09\u3002\u8BBE\u4E3A 0 \u5373\u53D6\u6D88\u8BE5\u9009\u9879\u6295\u6CE8\uFF0C\u5E01\u6570\u5168\u989D\u9000\u56DE\u3002</p>' +
        '<p><strong>\u7ED3\u7B97\u89C4\u5219\uFF1A</strong>\u7BA1\u7406\u5458\u9009\u62E9\u6B63\u786E\u7B54\u6848\u540E\u81EA\u52A8\u7ED3\u7B97\u3002\u8D62\u5BB6\u83B7\u5F97\uFF1A\u6295\u6CE8\u5E01\u6570 \u00D7 \u57FA\u7840\u500D\u7387 \u00D7 (\u603B\u5E01\u6C60 / \u6B63\u786E\u9009\u9879\u5E01\u6570)\u3002\u4F8B\u5982\u603B\u6C60 300 \u5E01\uFF0C\u6B63\u786E\u9009\u9879 100 \u5E01\uFF0C\u57FA\u7840\u500D\u7387 2\u500D\uFF0C\u6295 100 \u5E01\u7684\u8D62\u5BB6\u83B7\u5F97 100 \u00D7 2 \u00D7 (300/100) = 600 \u5E01\u3002</p>' +
        '<p><strong>\u91CD\u7F6E\u89C4\u5219\uFF1A</strong>\u7BA1\u7406\u5458\u91CD\u7F6E\u5DF2\u7ED3\u7B97\u95EE\u9898\u65F6\uFF0C\u6240\u6709\u6295\u6CE8\u91D1\u5E01\u548C\u5DF2\u53D1\u5956\u91D1\u5C06\u5168\u989D\u9000\u56DE\u3002</p>' +
        '<p><strong>\u6392\u884C\u699C\uFF1A</strong>\u6309\u603B\u5E01\u6570\u6392\u540D\u3002</p>' +
        '</div>';
}

// ========== \u7BA1\u7406\u540E\u53F0 ==========
var currentAdminTab = 'stats';

async function showAdmin() {
    try {
        var data = await api('/user/profile');
        if (!data.is_admin) { showToast('\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650', 'error'); return; }
    } catch (e) { showToast('\u9A8C\u8BC1\u5931\u8D25', 'error'); return; }
    showPage('admin');
    switchAdminTab('users');
}

function switchAdminTab(tab, event) {
    currentAdminTab = tab;
    document.querySelectorAll('.admin-tabs .tab').forEach(function(t) { t.classList.remove('active'); });
    if (event && event.target) event.target.classList.add('active');
    else {
        var names = { users: '\u7528\u6237', teams: '\u961F\u4F0D', matches: '\u8D5B\u7A0B', questions: '\u7ADE\u731C', logs: '\u65E5\u5FD7' };
        document.querySelectorAll('.admin-tabs .tab').forEach(function(t) { if (t.textContent.trim() === names[tab]) t.classList.add('active'); });
    }
    if (tab === 'users') loadAdminUsers();
    else if (tab === 'teams') loadAdminTeams();
    else if (tab === 'matches') loadAdminMatches();
    else if (tab === 'questions') loadAdminQuestions();
    else if (tab === 'logs') loadAdminLogs();
}

async function loadAdminStats() {
    try {
        var s = await api('/admin/stats');
        var h = '<div class="admin-section"><div class="stat-grid">';
        h += '<div class="stat-card"><div class="stat-value">' + s.total_users + '</div><div class="stat-label">\u7528\u6237</div></div>';
        h += '<div class="stat-card"><div class="stat-value">' + s.total_matches + '</div><div class="stat-label">\u6BD4\u8D5B</div></div>';
        h += '<div class="stat-card"><div class="stat-value">' + s.total_questions + '</div><div class="stat-label">\u95EE\u9898</div></div>';
        h += '<div class="stat-card"><div class="stat-value">' + s.total_bets + '</div><div class="stat-label">\u6295\u6CE8</div></div>';
        h += '</div></div>';
        document.getElementById('adminContent').innerHTML = h;
    } catch (e) { showToast('\u52A0\u8F7D\u5931\u8D25', 'error'); }
}

// ---- \u7528\u6237 ----
async function loadAdminUsers() {
    try {
        var users = await api('/admin/users');
        var isSuper = currentUser && currentUser.is_superadmin;
        var h = '<div class="admin-section">';
        users.forEach(function(u) {
            var isTargetSuper = u.openid === 'dev_wuqing';
            h += '<div style="background:#fff;border-radius:14px;padding:14px;margin-bottom:8px">';
            h += '<div style="display:flex;justify-content:space-between;align-items:center">';
            h += '<div><div style="font-size:15px;font-weight:500;color:#1a1a1a">' + (u.nickname || '\u672A\u547D\u540D') + (isTargetSuper ? ' <span style="font-size:11px;color:#3478f6;background:#e8f4fd;padding:2px 6px;border-radius:4px">\u8D85\u7EA7\u7BA1\u7406</span>' : '') + (u.is_admin && !isTargetSuper ? ' <span style="font-size:11px;color:#f57c00;background:#fff8e1;padding:2px 6px;border-radius:4px">\u7BA1\u7406\u5458</span>' : '') + '</div>';
            h += '<div style="font-size:12px;color:#86868b;margin-top:2px">CN: ' + (u.cn || '-') + ' | \u5E01: ' + u.coins + '</div></div>';
            h += '<div style="display:flex;gap:6px;flex-shrink:0">';
            if (isSuper && !isTargetSuper) {
                h += '<button class="admin-btn ' + (u.is_admin ? 'btn-danger' : 'btn-success') + '" style="font-size:18px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="toggleAdmin(' + u.id + ',' + !u.is_admin + ')" title="' + (u.is_admin ? '\u53D6\u6D88\u7BA1\u7406' : '\u8BBE\u4E3A\u7BA1\u7406') + '">' + (u.is_admin ? '<i class="ri-shield-cross-line"></i>' : '<i class="ri-shield-user-line"></i>') + '</button>';
                h += '<button class="admin-btn btn-danger" style="font-size:18px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="deleteUserWeb(' + u.id + ')" title="\u5220\u9664"><i class="ri-delete-bin-line"></i></button>';
            }
            h += '<button class="admin-btn btn-sm" style="font-size:18px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="adjustCoins(' + u.id + ')" title="\u8C03\u5E01"><i class="ri-coin-line"></i></button>';
            h += '</div></div></div>';
        });
        h += '</div>';
        document.getElementById('adminContent').innerHTML = h;
    } catch (e) { showToast('\u52A0\u8F7D\u5931\u8D25', 'error'); }
}

async function deleteUserWeb(uid) {
    if (!(await miuiConfirm('\u786E\u5B9A\u5220\u9664\u8BE5\u7528\u6237\uFF1F\u6240\u6709\u6295\u6CE8\u8BB0\u5F55\u5C06\u4E00\u5E76\u5220\u9664'))) return;
    try { await api('/admin/users/' + uid, 'DELETE'); showToast('\u5220\u9664\u6210\u529F', 'success'); loadAdminUsers(); }
    catch (e) { showToast(e.message, 'error'); }
}

async function toggleAdmin(uid, isA) {
    try { await api('/admin/users/' + uid + '/admin', 'PUT', { is_admin: isA }); showToast('\u6210\u529F', 'success'); loadAdminUsers(); }
    catch (e) { showToast(e.message, 'error'); }
}

async function adjustCoins(uid) {
    var result = await new Promise(function(resolve) {
        var h = '<div id="miuiDialog" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.35);z-index:10000;display:flex;align-items:center;justify-content:center" onclick="if(event.target===this)closeMiuiDialog()">';
        h += '<div style="background:#fff;border-radius:16px;padding:24px 20px 16px;width:85%;max-width:320px;animation:miuiFadeIn 0.2s">';
        h += '<div style="font-size:16px;font-weight:500;color:#1a1a1a;text-align:center;margin-bottom:16px">\u8C03\u5E01\u6570\u91CF</div>';
        h += '<div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:20px">';
        h += '<button id="coinMinus" style="width:44px;height:44px;border-radius:50%;border:none;background:#f2f3f5;font-size:22px;color:#3478f6;cursor:pointer;display:flex;align-items:center;justify-content:center" onclick="var inp=document.getElementById(\'coinInput\');inp.value=Math.max(0,parseInt(inp.value||0)-100)">-</button>';
        h += '<input id="coinInput" type="number" value="100" min="1" style="width:100px;text-align:center;font-size:22px;font-weight:600;border:none;border-bottom:2px solid #3478f6;outline:none;padding:8px 0;background:transparent;color:#1a1a1a">';
        h += '<button id="coinPlus" style="width:44px;height:44px;border-radius:50%;border:none;background:#f2f3f5;font-size:22px;color:#3478f6;cursor:pointer;display:flex;align-items:center;justify-content:center" onclick="var inp=document.getElementById(\'coinInput\');inp.value=parseInt(inp.value||0)+100">+</button>';
        h += '</div>';
        h += '<div style="display:flex;border-top:0.5px solid #f2f3f5">';
        h += '<button onclick="var v=document.getElementById(\'coinInput\');closeMiuiDialog({action:\'subtract\',coins:v?parseInt(v.value):0})" style="flex:1;color:#e74c3c;font-size:15px;font-weight:500;background:none;border:none;padding:12px;cursor:pointer;border-right:0.5px solid #f2f3f5">\u51CF\u5C11</button>';
        h += '<button onclick="var v=document.getElementById(\'coinInput\');closeMiuiDialog({action:\'add\',coins:v?parseInt(v.value):0})" style="flex:1;color:#34a853;font-size:15px;font-weight:500;background:none;border:none;padding:12px;cursor:pointer">\u589E\u52A0</button>';
        h += '</div></div></div>';
        document.body.insertAdjacentHTML('beforeend', h);
        document.getElementById('miuiDialog')._resolve = resolve;
    });
    if (!result) return;
    var coins = result.coins || 0;
    if (isNaN(coins) || coins <= 0) { showToast('\u8BF7\u8F93\u5165\u6709\u6548\u6570\u5B57', 'error'); return; }
    try { await api('/admin/users/' + uid + '/coins', 'PUT', { amount: coins, action: result.action }); showToast('\u6210\u529F', 'success'); loadAdminUsers(); }
    catch (e) { showToast(e.message, 'error'); }
}

// ---- \u961F\u4F0D ----
async function loadAdminTeams() {
    try {
        var teams = await api('/admin/teams');
        var h = '<div class="admin-section">';
        h += '<button class="admin-btn btn-success" style="font-size:16px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="addTeam()" title="\u6DFB\u52A0\u961F\u4F0D"><i class="ri-add-circle-line"></i></button>';
        teams.forEach(function(t) {
            var logoUrl = t.logo_url ? (t.logo_url.startsWith('http') ? t.logo_url : 'http://106.53.67.7' + t.logo_url) : '';
            h += '<div style="background:#fff;border-radius:14px;padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:10px">';
            if (logoUrl) h += '<img src="' + logoUrl + '" style="height:36px;width:36px;object-fit:contain;border-radius:8px;flex-shrink:0">';
            else h += '<div style="height:36px;width:36px;background:#f2f3f5;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;color:#86868b;flex-shrink:0"><i class="ri-team-line"></i></div>';
            h += '<div style="flex:1;font-size:15px;font-weight:500;color:#1a1a1a">' + t.name + '</div>';
            h += '<div style="display:flex;gap:6px;flex-shrink:0">';
            h += '<button class="admin-btn btn-sm" style="font-size:16px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="uploadTeamLogo(' + t.id + ')" title="Logo"><i class="ri-image-line"></i></button>';
            h += '<button class="admin-btn btn-danger" style="font-size:16px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="deleteTeam(' + t.id + ')" title="\u5220\u9664"><i class="ri-delete-bin-line"></i></button>';
            h += '</div></div>';
        });
        h += '</div>';
        document.getElementById('adminContent').innerHTML = h;
    } catch (e) { showToast('\u52A0\u8F7D\u5931\u8D25', 'error'); }
}

async function addTeam() {
    var name = await miuiPrompt('\u961F\u4F0D\u540D\u79F0');
    if (!name) return;
    try { await api('/admin/teams', 'POST', { name: name }); showToast('\u6210\u529F', 'success'); loadAdminTeams(); }
    catch (e) { showToast(e.message, 'error'); }
}

function uploadTeamLogo(tid) {
    var input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
    input.onchange = async function() {
        var file = input.files[0]; if (!file) return;
        var fd = new FormData(); fd.append('file', file);
        try {
            var res = await fetch(API_BASE + '/admin/teams/' + tid + '/logo', { method: 'POST', headers: { 'X-User-Id': String(currentUser.user_id || currentUser.id) }, body: fd });
            var data = await res.json(); if (!res.ok) throw new Error(data.error);
            showToast('Logo\u5DF2\u66F4\u65B0', 'success'); loadAdminTeams();
        } catch (e) { showToast(e.message, 'error'); }
    };
    input.click();
}

async function deleteTeam(id) {
    if (!(await miuiConfirm('\u786E\u5B9A\u5220\u9664\uFF1F'))) return;
    try { await api('/admin/teams/' + id, 'DELETE'); showToast('\u5220\u9664\u6210\u529F', 'success'); loadAdminTeams(); }
    catch (e) { showToast(e.message, 'error'); }
}

// ---- \u8D5B\u7A0B ----
async function loadAdminMatches() {
    try {
        var comps = await api('/competitions');
        var h = '<div class="admin-section"><div class="admin-select-wrap">';
        h += '<span>\u9009\u62E9\u8D5B\u4E8B\uFF1A</span>';
        h += '<div id="matchCompSelect"></div>';
        h += '<button class="admin-btn btn-success" style="font-size:16px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="createCompetitionWeb()" title="\u521B\u5EFA\u8D5B\u4E8B"><i class="ri-add-circle-line"></i></button></div>';
        h += '<div id="matchContent"></div></div>';
        document.getElementById('adminContent').innerHTML = h;
        var opts = comps.map(function(c) { return {value: String(c.id), label: c.name}; });
        miuiSelect('matchCompSelect', opts, opts.length > 0 ? opts[0].value : '', function(val) { onMatchCompChange(); });
        if (comps.length > 0) onMatchCompChange();
    } catch (e) { showToast('\u52A0\u8F7D\u5931\u8D25', 'error'); }
}

async function onMatchCompChange() {
    var cid = getMiuiSelectValue('matchCompSelect');
    if (!cid) { document.getElementById('matchContent').innerHTML = ''; return; }
    var c = document.getElementById('matchContent');
    c.innerHTML = '<div style="text-align:center;padding:20px;color:#999">\u52A0\u8F7D\u4E2D..</div>';
    try {
        var data = await api('/competitions/' + cid + '/full');
        var h = '<div style="margin-top:10px">';
        h += '<div style="display:flex;gap:6px;margin-bottom:10px">';
        h += '<button class="admin-btn btn-success" style="font-size:16px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="importMatchExcel()" title="Excel\u5BFC\u5165"><i class="ri-file-excel-2-line"></i></button>';
        h += '<input type="file" id="matchExcelFile" accept=".xlsx,.xls" style="display:none" onchange="handleMatchExcelImport(this)">';
        h += '<button class="admin-btn btn-sm" style="font-size:16px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="downloadMatchTemplate()" title="\u4E0B\u8F7D\u6A21\u677F"><i class="ri-download-line"></i></button>';
        h += '<button class="admin-btn btn-sm" style="font-size:16px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="editStartDate(\'' + cid + '\', \'' + (data.start_date || '') + '\')" title="\u8D77\u59CB\u65E5\u671F"><i class="ri-calendar-line"></i></button>';
        h += '<button class="admin-btn btn-danger" style="font-size:16px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center;margin-left:auto" onclick="deleteCompetitionWeb(' + cid + ')" title="\u5220\u9664\u8D5B\u4E8B"><i class="ri-delete-bin-line"></i></button>';
        h += '</div>';
        data.matches.forEach(function(m) {
            h += '<div style="background:#fff;border-radius:12px;padding:12px;margin-bottom:6px">';
            h += '<div style="display:flex;justify-content:space-between;align-items:center">';
            h += '<div><div style="font-size:15px;font-weight:500;color:#1a1a1a">' + (m.home_team || '?') + ' vs ' + (m.away_team || '?') + '</div>';
            h += '<div style="font-size:11px;color:#86868b;margin-top:2px">';
            if (m.match_date) h += '<i class="ri-calendar-line" style="margin-right:2px"></i>' + m.match_date.substring(5) + ' ';
            var wdNames = ['\u5468\u65E5','\u5468\u4E00','\u5468\u4E8C','\u5468\u4E09','\u5468\u56DB','\u5468\u4E94','\u5468\u516D'];
            var wdIdx = m.match_date ? new Date(m.match_date).getDay() : -1;
            var wdName = wdIdx >= 0 ? wdNames[wdIdx] : 'D' + m.day_number;
            h += 'W' + m.week_number + ' ' + wdName + ' M' + m.match_number + '</div></div>';
            h += '<div style="display:flex;gap:4px;flex-shrink:0">';
            h += '<button class="admin-btn btn-sm" style="font-size:16px;width:30px;height:30px;padding:0;display:flex;align-items:center;justify-content:center" onclick="editMatchDialog(' + m.id + ',' + cid + ')" title="\u7F16\u8F91"><i class="ri-edit-line"></i></button>';
            h += '<button class="admin-btn btn-danger" style="font-size:16px;width:30px;height:30px;padding:0;display:flex;align-items:center;justify-content:center" onclick="deleteMatchWeb(' + m.id + ')" title="\u5220\u9664"><i class="ri-delete-bin-line"></i></button>';
            h += '</div></div></div>';
        });
        h += '<button class="admin-btn btn-success" onclick="addNewMatch(' + cid + ')" style="width:100%;margin-top:8px;padding:12px;border-radius:12px;font-size:15px">\u2795 \u624B\u52A8\u6DFB\u52A0\u6BD4\u8D5B</button>';
        h += '</div>';
        c.innerHTML = h;
    } catch (e) { c.innerHTML = '<div style="color:red;padding:20px">\u52A0\u8F7D\u5931\u8D25</div>'; }
}

function calcDayNumber(weekday, weekNum, matches) {
    var sameWeek = matches.filter(function(m) { return m.week_number === weekNum; });
    var dayWeekdays = {};
    sameWeek.forEach(function(m) {
        if (m.match_date) {
            var d = new Date(m.match_date);
            var dw = d.getDay();
            if (dw === 0) dw = 7;
            dayWeekdays[m.day_number] = dw;
        }
    });
    var existingDays = Object.keys(dayWeekdays).map(Number).sort(function(a,b){return a-b;});
    for (var i = 0; i < existingDays.length; i++) {
        if (dayWeekdays[existingDays[i]] === weekday) return existingDays[i];
    }
    var maxDay = existingDays.length > 0 ? Math.max.apply(null, existingDays) : 0;
    return maxDay + 1;
}

function getWeekdayNum(match) {
    if (match.match_date) {
        var d = new Date(match.match_date);
        var dw = d.getDay();
        return dw === 0 ? 7 : dw;
    }
    return match.day_number;
}

async function editMatchDialog(matchId, compId) {
    var data = await api('/competitions/' + compId + '/full');
    var match = data.matches.find(function(m) { return m.id === matchId; });
    if (!match) return;
    var teams = await api('/admin/teams');
    var teamOpts = teams.map(function(t) { return {value: t.name, label: t.name}; });
    teamOpts.unshift({value: '', label: '\u65E0'});
    var weekOpts = [];
    for (var w = 1; w <= 20; w++) weekOpts.push({value: String(w), label: w + '\u5468'});
    var wdOpts = [{value:'1',label:'\u5468\u4E00'},{value:'2',label:'\u5468\u4E8C'},{value:'3',label:'\u5468\u4E09'},{value:'4',label:'\u5468\u56DB'},{value:'5',label:'\u5468\u4E94'},{value:'6',label:'\u5468\u516D'},{value:'7',label:'\u5468\u65E5'}];
    var matchOpts = [];
    for (var m = 1; m <= 10; m++) matchOpts.push({value: String(m), label: 'M' + m});
    var curWd = getWeekdayNum(match);
    var result = await miuiPromptMulti([
        {key:'home_team',label:'\u4E3B\u573A\u961F\u4F0D',type:'select',options:teamOpts,defaultValue:match.home_team||''},
        {key:'away_team',label:'\u5BA2\u573A\u961F\u4F0D',type:'select',options:teamOpts,defaultValue:match.away_team||''},
        {key:'week_number',label:'\u5468\u6570',type:'select',options:weekOpts,defaultValue:String(match.week_number)},
        {key:'weekday',label:'\u661F\u671F\u51E0',type:'select',options:wdOpts,defaultValue:String(curWd)},
        {key:'match_number',label:'\u6BD4\u8D5B\u573A\u6B21',type:'select',options:matchOpts,defaultValue:String(match.match_number)}
    ]);
    if (!result) return;
    var newWd = parseInt(result.weekday);
    var newWeek = parseInt(result.week_number);
    var newDay = calcDayNumber(newWd, newWeek, data.matches);
    try {
        await api('/admin/matches/' + matchId, 'PUT', {
            home_team: result.home_team || null,
            away_team: result.away_team || null,
            week_number: newWeek,
            day_number: newDay,
            match_number: parseInt(result.match_number)
        });
        showToast('\u5DF2\u66F4\u65B0', 'success');
        onMatchCompChange();
    } catch (e) { showToast(e.message, 'error'); }
}

function importMatchExcel() { document.getElementById('matchExcelFile').click(); }

async function editStartDate(cid, currentVal) {
    var val = await miuiPrompt('\u8D77\u59CB\u65E5\u671F\uFF08\u683C\u5F0F: 2026-07-04\uFF09', currentVal || '');
    if (val === null) return;
    try {
        await api('/admin/competitions/' + cid, 'PUT', { start_date: val || null });
        showToast('\u5DF2\u66F4\u65B0', 'success');
        onMatchCompChange();
    } catch (e) { showToast(e.message, 'error'); }
}

function downloadMatchTemplate() {
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet([
        ['\u5468\u6570', '\u661F\u671F\u51E0', '\u573A\u6B21', '\u4E3B\u573A\u961F\u4F0D', '\u5BA2\u573A\u961F\u4F0D'],
        [1, '\u5468\u4E94', 1, 'TE', 'MRC'],
        [1, '\u5468\u516D', 1, 'FPX.ZQ', 'GR']
    ]);
    XLSX.utils.book_append_sheet(wb, ws, '\u8D5B\u7A0B');
    XLSX.writeFile(wb, '\u8D5B\u7A0B\u683C\u5F0F.xlsx');
}

var WD_MAP = {'\u5468\u4E00':1,'\u5468\u4E8C':2,'\u5468\u4E09':3,'\u5468\u56DB':4,'\u5468\u4E94':5,'\u5468\u516D':6,'\u5468\u65E5':7,
    '1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'D1':1,'D2':2,'D3':3,'D4':4,'D5':5,'D6':6,'D7':7,
    '\u5468\u4E00':1,'\u5468\u4E8C':2,'\u5468\u4E09':3,'\u5468\u56DB':4,'\u5468\u4E94':5,'\u5468\u516D':6,'\u5468\u65E5':7,'\u5468\u5929':7};

async function handleMatchExcelImport(input) {
    var file = input.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = async function(e) {
        try {
            var data = new Uint8Array(e.target.result);
            var wb = XLSX.read(data, { type: 'array' });
            var sheet = wb.Sheets[wb.SheetNames[0]];
            var jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            if (jsonData.length < 2) { showToast('\u6587\u4EF6\u65E0\u6548', 'error'); return; }
            var cid = getMiuiSelectValue('matchCompSelect');
            console.log('Import cid:', cid, 'type:', typeof cid);
            showToast('\u8D5B\u4E8BID: ' + cid, 'success');
            if (!cid) { showToast('\u8BF7\u5148\u9009\u62E9\u8D5B\u4E8B', 'error'); return; }
            var count = 0;
            var compData = await api('/competitions/' + cid + '/full');
            for (var i = 1; i < jsonData.length; i++) {
                var row = jsonData[i];
                if (!row || row.length < 5) continue;
                var week = parseInt(row[0]);
                var wdVal = String(row[1]).trim();
                var wd = WD_MAP[wdVal] || parseInt(wdVal) || 1;
                var match = parseInt(row[2]);
                var home = String(row[3] || '').trim(), away = String(row[4] || '').trim();
                if (isNaN(week) || isNaN(match)) continue;
                try {
                    var dayNum = calcDayNumber(wd, week, compData.matches);
                    var resp = await api('/admin/matches', 'POST', { competition_id: parseInt(cid), week_number: week, day_number: dayNum, match_number: match, home_team: home, away_team: away });
                    count++;
                } catch (e) { console.error('Import error row', i, e.message, {week, wd, match, home, away, cid}); showToast('\u5BFC\u5165\u5931\u8D25: ' + e.message, 'error'); }
            }
            showToast('\u6210\u529F\u5BFC\u5165 ' + count + ' \u573A\u6BD4\u8D5B', 'success');
            onMatchCompChange();
        } catch (e) { showToast('\u5BFC\u5165\u5931\u8D25', 'error'); }
    };
    reader.readAsArrayBuffer(file);
}

async function addNewMatch(cid) {
    var existing = document.getElementById('newMatchForm');
    if (existing) { existing.scrollIntoView(); return; }
    var teams = await api('/admin/teams');
    var teamOptsHtml = '<option value="">\u65E0</option>';
    teams.forEach(function(t) { teamOptsHtml += '<option value="' + t.name + '">' + t.name + '</option>'; });
    var wdOpts = '<option value="1">\u5468\u4E00</option><option value="2">\u5468\u4E8C</option><option value="3">\u5468\u4E09</option><option value="4">\u5468\u56DB</option><option value="5">\u5468\u4E94</option><option value="6">\u5468\u516D</option><option value="7">\u5468\u65E5</option>';
    var form = document.createElement('div');
    form.id = 'newMatchForm';
    form.style.cssText = 'background:#fff;border-radius:14px;padding:16px;margin-top:10px;box-sizing:border-box';
    var selStyle = 'flex:1 1 100px;min-width:80px;padding:10px;border:none;border-radius:10px;font-size:14px;background:#f2f3f5;box-sizing:border-box;-webkit-appearance:none';
    form.innerHTML = '<div style="font-weight:600;margin-bottom:10px;font-size:15px;color:#1a1a1a">\u6DFB\u52A0\u6BD4\u8D5B</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">' +
        '<input id="nmWeek" type="number" placeholder="\u5468\u6570" style="flex:1 1 70px;min-width:60px;padding:10px;border:none;border-radius:10px;font-size:14px;background:#f2f3f5;box-sizing:border-box">' +
        '<select id="nmWeekday" style="' + selStyle + '">' + wdOpts + '</select>' +
        '<input id="nmMatch" type="number" placeholder="\u573A\u6B21" style="flex:1 1 70px;min-width:60px;padding:10px;border:none;border-radius:10px;font-size:14px;background:#f2f3f5;box-sizing:border-box"></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">' +
        '<select id="nmHome" style="' + selStyle + '">' + teamOptsHtml + '</select>' +
        '<select id="nmAway" style="' + selStyle + '">' + teamOptsHtml + '</select></div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button class="admin-btn btn-success" style="font-size:16px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="saveNewMatch(this,' + cid + ')" title="\u4FDD\u5B58"><i class="ri-check-line"></i></button>' +
        '<button class="admin-btn btn-sm" style="font-size:16px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="this.closest(\'#newMatchForm\').remove()" title="\u53D6\u6D88"><i class="ri-close-line"></i></button></div>';
    var container = document.getElementById('matchContent');
    container.appendChild(form);
    form.scrollIntoView({ behavior: 'smooth' });
}

async function saveNewMatch(btn, cid) {
    var w = parseInt(document.getElementById('nmWeek').value);
    var wd = parseInt(document.getElementById('nmWeekday').value);
    var m = parseInt(document.getElementById('nmMatch').value);
    var home = document.getElementById('nmHome').value.trim(), away = document.getElementById('nmAway').value.trim();
    if (!w || !wd || !m) { showToast('\u8BF7\u586B\u5199\u5468\u6570/\u661F\u671F\u51E0/\u573A\u6B21', 'error'); return; }
    try {
        var data = await api('/competitions/' + cid + '/full');
        var dayNum = calcDayNumber(wd, w, data.matches);
        await api('/admin/matches', 'POST', { competition_id: cid, week_number: w, day_number: dayNum, match_number: m, home_team: home, away_team: away });
        showToast('\u6DFB\u52A0\u6210\u529F', 'success'); onMatchCompChange();
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteMatchWeb(mid) {
    if (!(await miuiConfirm('\u786E\u5B9A\u5220\u9664\uFF1F'))) return;
    try { await api('/admin/matches/' + mid, 'DELETE'); showToast('\u5220\u9664\u6210\u529F', 'success'); onMatchCompChange(); }
    catch (e) { showToast(e.message, 'error'); }
}

async function createCompetitionWeb() {
    var result = await miuiPromptMulti([
        {key:'type',label:'\u8D5B\u4E8B\u7C7B\u578B',placeholder:'\u9009\u62E9',type:'select',options:[{value:'IVL',label:'IVL'},{value:'IVS',label:'IVS'},{value:'COA',label:'COA'},{value:'',label:'\u81EA\u5B9A\u4E49'}],customKey:'customType',customPlaceholder:'\u8F93\u5165\u8D5B\u4E8B\u7C7B\u578B'},
        {key:'year',label:'\u5E74\u4EFD',placeholder:'\u5982 2026',type:'number'},
        {key:'suffix',label:'\u540E\u7F00',placeholder:'\u5982 \u590F\u5B63\u8D5B'},
        {key:'start_date',label:'\u8D77\u59CB\u65E5\u671F',placeholder:'\u5982 2026-07-04',type:'date'}
    ]);
    if (!result) return;
    var compType = result.type || result.customType || '';
    var compName = (result.year || '') + compType + (result.suffix || '');
    if (!compName) { showToast('\u8BF7\u586B\u5199\u5B8C\u6574\u4FE1\u606F', 'error'); return; }
    try {
        await api('/admin/competitions', 'POST', { name: compName, year: parseInt(result.year) || 0, season: result.suffix || '', start_date: result.start_date || null });
        showToast('\u521B\u5EFA\u6210\u529F', 'success'); loadAdminMatches();
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteCompetitionWeb(cid) {
    if (!(await miuiConfirm('\u786E\u5B9A\u5220\u9664\u8D5B\u4E8B\uFF1F'))) return;
    try { await api('/admin/competitions/' + cid, 'DELETE'); showToast('\u5220\u9664\u6210\u529F', 'success'); loadAdminMatches(); }
    catch (e) { showToast(e.message, 'error'); }
}

// ---- \u65E5\u5FD7 ----
async function loadAdminLogs() {
    try {
        var res = await api('/operation-logs?per_page=100');
        var h = '<div class="admin-section">';
        if (res.length === 0) {
            h += '<div style="padding:20px;text-align:center;color:#86868b">\u6682\u65E0\u64CD\u4F5C\u8BB0\u5F55</div>';
        } else {
            h += '<table class="admin-table"><thead><tr><th>\u65F6\u95F4</th><th>\u7528\u6237</th><th>\u64CD\u4F5C</th><th>\u8BE6\u60C5</th></tr></thead><tbody>';
            res.forEach(function(l) {
                h += '<tr><td style="font-size:11px;color:#86868b">' + l.created_at + '</td>';
                h += '<td>' + l.nickname + '</td>';
                h += '<td><span style="background:#e8f4fd;padding:2px 6px;border-radius:4px;font-size:12px;color:#3478f6">' + l.action + '</span></td>';
                h += '<td style="font-size:12px">' + l.detail + '</td></tr>';
            });
            h += '</tbody></table>';
        }
        h += '</div>';
        document.getElementById('adminContent').innerHTML = h;
    } catch (e) { showToast('\u52A0\u8F7D\u5931\u8D25', 'error'); }
}

// ---- \u95EE\u9898 ----
async function loadAdminQuestions() {
    try {
        var comps = await api('/competitions');
        var h = '<div class="admin-section"><div class="admin-select-wrap">';
        h += '<span>\u9009\u62E9\u8D5B\u4E8B\uFF1A</span>';
        h += '<div id="questionCompSelect"></div>';
        h += '</div><div id="questionContent"></div></div>';
        document.getElementById('adminContent').innerHTML = h;
        var opts = comps.map(function(c) { return {value: String(c.id), label: c.name}; });
        miuiSelect('questionCompSelect', opts, opts.length > 0 ? opts[0].value : '', function(val) { onQuestionCompChange(); });
        if (comps.length > 0) onQuestionCompChange();
    } catch (e) { showToast('\u52A0\u8F7D\u5931\u8D25', 'error'); }
}

async function onQuestionCompChange() {
    var cid = getMiuiSelectValue('questionCompSelect');
    if (!cid) { document.getElementById('questionContent').innerHTML = ''; return; }
    var c = document.getElementById('questionContent');
    c.innerHTML = '<div style="text-align:center;padding:20px;color:#999">\u52A0\u8F7D\u4E2D..</div>';
    try {
        var data = await api('/competitions/' + cid + '/full');
        questionDataCache = data;
        renderQuestionContent(data);
    } catch (e) { c.innerHTML = '<div style="color:red;padding:20px">\u52A0\u8F7D\u5931\u8D25</div>'; }
}

function renderQuestionContent(data) {
    var c = document.getElementById('questionContent');
    var h = '<div style="margin-top:10px">';
    data.matches.forEach(function(m) {
        h += '<div class="match-divider">' + (m.home_team || '?') + ' vs ' + (m.away_team || '?') + '</div>';
        m.questions.forEach(function(q) {
            var sl = q.status === 'active' ? '\u5F00\u76D8\u4E2D' : q.status === 'closed' ? '\u5DF2\u5C01\u76D8' : '\u5DF2\u7ED3\u7B97';
            var sc = q.status === 'active' ? '#34a853' : q.status === 'closed' ? '#f57c00' : '#86868b';
            var qb = q.status === 'active' ? '#e8f4fd' : q.status === 'completed' ? '#e8f7ed' : '#fff8e1';
            var shortCode = q.question_code.replace(/^.*?(Week\d+Day\d+Match\d+Q\d+)$/, '$1');
            h += '<div id="qrow_' + q.id + '" style="background:' + qb + ';border-radius:14px;padding:14px;margin:8px 0">';
            h += '<div style="display:flex;justify-content:space-between;align-items:flex-start">';
            h += '<div style="flex:1;min-width:0">';
            h += '<div style="font-size:14px;font-weight:600;color:#1a1a1a;word-break:break-all">' + shortCode + '</div>';
            h += '<div style="display:flex;align-items:center;gap:6px;margin-top:6px">';
            h += '<input class="inline-input-sm" value="' + (q.question_text || '').replace(/"/g, '&quot;') + '" onblur="updateQuestionText(' + q.id + ',this.value)" style="flex:1;min-width:0;background:#fff;border:1px solid #e8edf5;border-radius:8px;padding:6px 10px">';
            h += '</div>';
            h += '<div style="font-size:12px;color:' + sc + ';margin-top:4px;font-weight:500">' + sl + '</div>';
            h += '</div>';
            h += '<div style="display:flex;gap:4px;flex-shrink:0;margin-left:8px;flex-wrap:wrap;justify-content:flex-end">';
            if (q.status === 'active') {
                h += '<button class="admin-btn btn-danger" style="font-size:18px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="closeQuestion(' + q.id + ')" title="\u5C01\u76D8"><i class="ri-stop-circle-line"></i></button>';
                h += '<button class="admin-btn btn-sm" style="font-size:18px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="deleteQuestionWeb(' + q.id + ')" title="\u5220\u9664"><i class="ri-delete-bin-line"></i></button>';
            } else if (q.status === 'closed') {
                h += '<button class="admin-btn btn-success" style="font-size:18px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="openQuestion(' + q.id + ')" title="\u5F00\u76D8"><i class="ri-play-circle-line"></i></button>';
                h += '<button class="admin-btn btn-sm" style="font-size:18px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="deleteQuestionWeb(' + q.id + ')" title="\u5220\u9664"><i class="ri-delete-bin-line"></i></button>';
                h += '<button class="admin-btn btn-warning" style="font-size:18px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="openSettleDialog(' + q.id + ')" title="\u7ED3\u7B97"><i class="ri-check-double-line"></i></button>';
            } else {
                h += '<button class="admin-btn btn-warning" style="font-size:18px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="resetQuestionWeb(' + q.id + ')" title="\u91CD\u7F6E"><i class="ri-refresh-line"></i></button>';
            }
            h += '<button class="admin-btn btn-sm" style="font-size:11px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="showBetDetail(' + q.id + ')" title="\u6295\u6CE8\u8BE6\u60C5"><i class="ri-information-line"></i></button>';
            h += '</div></div>';
            q.options.forEach(function(o) {
                var ob = '#fff8e1';
                if (q.status === 'active') ob = '#e8f4fd';
                else if (q.correct_option_id && o.id === q.correct_option_id) ob = '#e8f7ed';
                else if (q.correct_option_id) ob = '#fff0ed';
                h += '<div style="display:flex;align-items:center;gap:6px;margin:4px 0;padding:4px 8px;border-radius:8px;background:' + ob + '">';
                h += '<input class="inline-input-sm" value="' + (o.option_text || '').replace(/"/g, '&quot;') + '" data-oid="' + o.id + '" data-field="text" onblur="saveOptionField(this)" placeholder="\u9009\u9879\u5185\u5BB9" style="flex:2;background:#f2f3f5;border-radius:8px;padding:6px 8px">';
                h += '<input class="inline-input-num" type="number" value="' + o.base_rate + '" data-oid="' + o.id + '" data-field="rate" onblur="saveOptionField(this)" style="width:56px;background:#fff8e1;border-radius:8px;padding:6px">';
                h += '<span style="font-size:11px;color:#3478f6;font-weight:500">' + (o.total_coins || 0) + '</span>';
                if (q.status !== 'completed') h += '<button class="admin-btn btn-danger" style="font-size:14px;width:26px;height:26px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:6px" onclick="deleteOptionWeb(' + o.id + ')"><i class="ri-close-line"></i></button>';
                h += '</div>';
            });
            if (q.options.length < 3 && q.status !== 'completed') h += '<div style="margin-top:6px"><button class="admin-btn btn-sm" style="border-radius:8px;padding:6px 12px;display:flex;align-items:center;gap:4px" onclick="addOptionWeb(' + q.id + ')"><i class="ri-add-line"></i> \u6DFB\u52A0\u9009\u9879</button></div>';
            h += '</div>';
        });
    });
    h += '</div>';
    c.innerHTML = h;
}

async function refreshQuestionRow(qid) {
    if (!questionDataCache) { onQuestionCompChange(); return; }
    var cid = getMiuiSelectValue('questionCompSelect') || questionDataCache.id;
    var data = await api('/competitions/' + cid + '/full');
    questionDataCache = data;
    renderQuestionContent(data);
}

async function updateQuestionText(qid, text) {
    try { await api('/admin/questions/' + qid, 'PUT', { question_text: text }); } catch (e) { showToast(e.message, 'error'); }
}

async function saveOptionField(el) {
    var oid = el.getAttribute('data-oid'), field = el.getAttribute('data-field');
    var value = field === 'rate' ? parseFloat(el.value) : el.value;
    try { var d = {}; d[field === 'text' ? 'option_text' : 'base_rate'] = value; await api('/admin/options/' + oid, 'PUT', d); }
    catch (e) { showToast(e.message, 'error'); }
}

async function closeQuestion(qid) { try { await api('/admin/questions/' + qid + '/close', 'PUT'); showToast('\u5C01\u76D8\u6210\u529F', 'success'); refreshQuestionRow(qid); } catch (e) { showToast(e.message, 'error'); } }
async function openQuestion(qid) { try { await api('/admin/questions/' + qid + '/close', 'PUT'); showToast('\u5F00\u76D8\u6210\u529F', 'success'); refreshQuestionRow(qid); } catch (e) { showToast(e.message, 'error'); } }
async function deleteQuestionWeb(qid) { if (!(await miuiConfirm('\u786E\u5B9A\u5220\u9664\uFF1F'))) return; try { await api('/admin/questions/' + qid, 'DELETE'); showToast('\u5220\u9664\u6210\u529F', 'success'); refreshQuestionRow(qid); } catch (e) { showToast(e.message, 'error'); } }
async function resetQuestionWeb(qid) { if (!(await miuiConfirm('\u91CD\u7F6E\u540E\u6240\u6709\u5E01\u6570\u5C06\u9000\u56DE\uFF0C\u786E\u5B9A\uFF1F'))) return; try { await api('/admin/questions/' + qid + '/reset', 'PUT'); showToast('\u91CD\u7F6E\u6210\u529F', 'success'); refreshQuestionRow(qid); } catch (e) { showToast(e.message, 'error'); } }
async function deleteOptionWeb(oid) { if (!(await miuiConfirm('\u5220\u9664\u9009\u9879\uFF1F'))) return; try { await api('/admin/options/' + oid, 'DELETE'); showToast('\u5220\u9664\u6210\u529F', 'success'); onQuestionCompChange(); } catch (e) { showToast(e.message, 'error'); } }
async function addOptionWeb(qid) { try { await api('/admin/options', 'POST', { question_id: qid, option_text: '', base_rate: 2.0 }); showToast('\u6DFB\u52A0\u6210\u529F', 'success'); refreshQuestionRow(qid); } catch (e) { showToast(e.message, 'error'); } }

// ---- \u7ED3\u7B97\u5F39\u7A97 ----
function openSettleDialog(qid) {
    var q = null;
    if (!questionDataCache) return;
    questionDataCache.matches.forEach(function(m) { m.questions.forEach(function(question) { if (question.id === qid) q = question; }); });
    if (!q) return;
    var h = '<div id="settleOverlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center" onclick="if(event.target===this)this.remove()">';
    h += '<div style="background:#fff;border-radius:12px;padding:20px;width:90%;max-width:400px">';
    h += '<div style="font-size:16px;font-weight:bold;margin-bottom:12px">\u9009\u62E9\u6B63\u786E\u7B54\u6848</div>';
    h += '<div style="font-size:13px;color:#666;margin-bottom:12px">' + q.question_text + '</div>';
    q.options.forEach(function(o) {
        h += '<div style="padding:12px;margin:6px 0;background:#f8f9fa;border-radius:8px;cursor:pointer;border:2px solid transparent" onclick="confirmSettle(' + qid + ',' + o.id + ')" onmouseover="this.style.borderColor=\'#81c784\'" onmouseout="this.style.borderColor=\'transparent\'">';
        h += '<span style="font-size:14px">' + (o.option_text || '\u7A7A') + '</span> <span style="font-size:12px;color:#667eea">' + o.base_rate + '\u500D</span></div>';
    });
    h += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', h);
}

async function confirmSettle(qid, oid) {
    if (!(await miuiConfirm('\u786E\u5B9A\u7ED3\u7B97\uFF1F'))) return;
    var ov = document.getElementById('settleOverlay'); if (ov) ov.remove();
    try { await api('/admin/questions/' + qid + '/answer', 'PUT', { option_id: oid }); showToast('\u7ED3\u7B97\u6210\u529F', 'success'); refreshQuestionRow(qid); }
    catch (e) { showToast(e.message, 'error'); }
}

// ---- \u6295\u6CE8\u8BE6\u60C5 ----
async function showBetDetail(qid) {
    try {
        var bets = await api('/questions/' + qid + '/bets');
        var h = '<div id="betDetailOverlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center" onclick="if(event.target===this)this.remove()">';
        h += '<div style="background:#fff;border-radius:12px;padding:20px;width:90%;max-width:500px;max-height:70vh;overflow-y:auto">';
        h += '<div style="font-size:16px;font-weight:bold;margin-bottom:12px">\u6295\u6CE8\u8BE6\u60C5</div>';
        if (bets.length === 0) { h += '<div style="padding:20px;text-align:center;color:#999">\u6682\u65E0\u6295\u6CE8</div>'; }
        else {
            h += '<table style="width:100%;border-collapse:collapse;font-size:13px">';
            h += '<tr style="background:#f8f9fa"><th style="padding:6px;text-align:left">\u7528\u6237</th><th style="padding:6px;text-align:left">\u9009\u9879</th><th style="padding:6px;text-align:right">\u5E01\u6570</th></tr>';
            bets.forEach(function(b) {
                h += '<tr><td style="padding:6px;border-top:1px solid #eee">' + b.nickname + '(' + b.cn + ')</td>';
                h += '<td style="padding:6px;border-top:1px solid #eee">' + b.option_text + '</td>';
                h += '<td style="padding:6px;border-top:1px solid #eee;text-align:right;font-weight:bold;color:#667eea">' + b.coins + '</td></tr>';
            });
            h += '</table>';
        }
        h += '<div style="text-align:center;margin-top:12px"><button class="admin-btn btn-sm" onclick="document.getElementById(\'betDetailOverlay\').remove()">\u5173\u95ED</button></div>';
        h += '</div></div>';
        document.body.insertAdjacentHTML('beforeend', h);
    } catch (e) { showToast('\u52A0\u8F7D\u5931\u8D25', 'error'); }
}

window.onload = function() { if (currentUser) initHomePage(); };
