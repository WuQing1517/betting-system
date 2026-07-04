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
}

function goBack() {
    var prev = pageHistory.pop() || 'home';
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    var target = document.getElementById(prev + 'Page');
    if (target) target.classList.add('active');
    currentPage = prev;
    window.scrollTo(0, 0);
    if (prev === 'home') refreshHomeData();
}

async function refreshHomeData() {
    try {
        var u = await api('/user/profile');
        currentUser = u;
        localStorage.setItem('user', JSON.stringify(currentUser));
        updateUserInfo();
        loadCompetitions();
    } catch (e) {}
}

function showToast(msg, type) {
    var t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 2500);
}

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
    loadCompetitions();
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
        if (data.length === 0) html = '<div style="text-align:center;color:#999;padding:40px">\u6682\u65E0\u8FDB\u884C\u4E2D\u7684\u6BD4\u8D5B</div>';
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

async function openCompetition(id) {
    try {
        var data = await api('/competitions/' + id + '/full');
        currentCompetition = data;
        document.getElementById('matchTitle').textContent = data.name;
        showPage('match');
        renderFilterBar(data);
        renderQuestions(data.matches);
    } catch (e) { showToast('\u52A0\u8F7D\u5931\u8D25', 'error'); }
}

function renderFilterBar(data) {
    var weeks = {};
    data.matches.forEach(function(m) { weeks[m.week_number] = true; });
    var h = '<div class="filter-bar">';
    h += '<select id="filterWeek" onchange="applyFilter()"><option value="">\u5168\u90E8\u5468</option>';
    Object.keys(weeks).sort(function(a, b) { return a - b; }).forEach(function(w) {
        h += '<option value="' + w + '">' + w + '\u5468</option>';
    });
    h += '</select>';
    h += '<select id="filterDay" onchange="applyFilter()"><option value="">\u5168\u90E8\u5929</option></select>';
    h += '<select id="filterMatch" onchange="applyFilter()"><option value="">\u5168\u90E8\u6BD4\u8D5B</option></select>';
    h += '</div>';
    document.getElementById('filterArea').innerHTML = h;
    updateFilterSelects(data, '');
}

function updateFilterSelects(data, weekFilter) {
    var days = {}, matches = {};
    data.matches.forEach(function(m) {
        if (weekFilter && String(m.week_number) !== weekFilter) return;
        days[m.day_number] = true;
        matches[m.match_code] = (m.home_team || '?') + ' vs ' + (m.away_team || '?');
    });
    var ds = document.getElementById('filterDay');
    var ms = document.getElementById('filterMatch');
    if (!ds || !ms) return;
    var cd = ds.value, cm = ms.value;
    ds.innerHTML = '<option value="">\u5168\u90E8\u5929</option>';
    Object.keys(days).sort(function(a, b) { return a - b; }).forEach(function(d) {
        ds.innerHTML += '<option value="' + d + '">' + d + '\u5929</option>';
    });
    ms.innerHTML = '<option value="">\u5168\u90E8\u6BD4\u8D5B</option>';
    Object.keys(matches).sort().forEach(function(k) {
        ms.innerHTML += '<option value="' + k + '">' + matches[k] + '</option>';
    });
    ds.value = cd;
    ms.value = cm;
}

function applyFilter() {
    if (!currentCompetition) return;
    updateFilterSelects(currentCompetition, document.getElementById('filterWeek').value);
    renderQuestions(currentCompetition.matches);
}

function renderQuestions(matches) {
    var wf = document.getElementById('filterWeek') ? document.getElementById('filterWeek').value : '';
    var df = document.getElementById('filterDay') ? document.getElementById('filterDay').value : '';
    var mf = document.getElementById('filterMatch') ? document.getElementById('filterMatch').value : '';
    var html = '';
    matches.forEach(function(m) {
        if (wf && String(m.week_number) !== wf) return;
        if (df && String(m.day_number) !== df) return;
        if (mf && m.match_code !== mf) return;
        html += '<div class="match-divider">' + (m.home_team || '?') + ' vs ' + (m.away_team || '?') + '</div>';
        m.questions.forEach(function(q, idx) {
            var sLabel = q.status === 'active' ? '\u53EF\u6295' : q.status === 'closed' ? '\u5DF2\u5C01\u76D8' : '\u5DF2\u7ED3\u7B97';
            var sColor = q.status === 'active' ? '#27ae60' : q.status === 'closed' ? '#e67e22' : '#999';
            var cardBg = q.status === 'active' ? '#e3f2fd' : q.status === 'closed' ? '#fff3e0' : q.correct_option_id ? '#e8f5e9' : '#fce4ec';
            html += '<div class="question-card" style="background:' + cardBg + '" onclick="loadBetPage(\'' + q.question_code + '\', \'' + q.status + '\')">';
            html += '<div class="question-header"><div class="question-label">' + (idx + 1) + '</div>';
            html += '<div class="question-text">' + q.question_text + '</div></div>';
            html += '<div class="bet-stats">\u603B\u6295\u6CE8 ' + (q.total_coins || 0) + '\u5E01';
            if (q.user_total_bet > 0) html += ' | \u5DF2\u6295 ' + q.user_total_bet + '\u5E01';
            html += '</div><div class="option-tags">';
            q.options.forEach(function(o) {
                var tb = '#fffde7';
                if (q.status === 'active') tb = '#e3f2fd';
                else if (q.correct_option_id && o.id === q.correct_option_id) tb = '#c8e6c9';
                else if (q.correct_option_id) tb = '#ffcdd2';
                html += '<span class="option-tag" style="background:' + tb + '">' + (o.option_text || '\u7A7A') + ' <span class="option-rate">' + o.base_rate + '\u500D</span></span>';
            });
            html += '</div><span style="font-size:12px;color:' + sColor + '">' + sLabel + '</span></div>';
        });
    });
    if (!html) html = '<div style="padding:40px;text-align:center;color:#999">\u6682\u65E0\u5339\u914D\u7684\u6BD4\u8D5B</div>';
    document.getElementById('questionList').innerHTML = html;
}

// ========== \u6295\u6CE8 ==========
async function loadBetPage(code, status) {
    showPage('bet');
    try {
        var q = await api('/questions/' + code);
        currentQuestion = q;
        document.getElementById('betQuestionCode').textContent = q.question_code;
        document.getElementById('betQuestionText').textContent = q.question_text;
        document.getElementById('betBalance').textContent = currentUser.coins;
        var isCompleted = q.status === 'completed';
        var isClosed = q.status === 'closed';
        var isActive = q.status === 'active';
        var html = '';
        q.options.forEach(function(o) {
            var userBet = o.user_bet || 0;
            var ob = isActive ? '#e3f2fd' : isCompleted && q.correct_option_id === o.id ? '#c8e6c9' : isCompleted ? '#ffcdd2' : '#fff3e0';
            html += '<div class="option-item" style="background:' + ob + '">';
            html += '<div class="option-text">' + (o.option_text || '\u7A7A') + '</div>';
            html += '<div class="option-rate" style="color:#667eea;font-weight:700">' + o.base_rate + '\u500D</div>';
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
        if (isCompleted) html += '<div style="padding:10px 20px;font-size:13px;color:#999">\u8BE5\u95EE\u9898\u5DF2\u7ED3\u7B97</div>';
        else if (isClosed) html += '<div style="padding:10px 20px;font-size:13px;color:#e67e22">\u5DF2\u5C01\u76D8\uFF0C\u6682\u505C\u4E0B\u6CE8</div>';
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
            html += '<div class="rank-item"><div class="rank-num' + rc + '">' + u.rank + '</div>';
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
    try { var d = await api('/user/profile'); if (!d.is_admin) { showToast('\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650', 'error'); return; } }
    catch (e) { showToast('\u9A8C\u8BC1\u5931\u8D25', 'error'); return; }
    showPage('admin');
    switchAdminTab('stats');
}

function switchAdminTab(tab, event) {
    currentAdminTab = tab;
    document.querySelectorAll('.admin-tabs .tab').forEach(function(t) { t.classList.remove('active'); });
    if (event && event.target) event.target.classList.add('active');
    else {
        var names = { stats: '\u7EDF\u8BA1', users: '\u7528\u6237', teams: '\u961F\u4F0D', matches: '\u8D5B\u7A0B', questions: '\u95EE\u9898' };
        document.querySelectorAll('.admin-tabs .tab').forEach(function(t) { if (t.textContent.trim() === names[tab]) t.classList.add('active'); });
    }
    if (tab === 'stats') loadAdminStats();
    else if (tab === 'users') loadAdminUsers();
    else if (tab === 'teams') loadAdminTeams();
    else if (tab === 'matches') loadAdminMatches();
    else if (tab === 'questions') loadAdminQuestions();
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
        var h = '<div class="admin-section"><table class="admin-table"><thead><tr><th>ID</th><th>\u6635\u79F0</th><th>CN</th><th>\u5E01\u6570</th><th>\u7BA1\u7406</th><th>\u64CD\u4F5C</th></tr></thead><tbody>';
        users.forEach(function(u) {
            h += '<tr><td>' + u.id + '</td><td>' + (u.nickname || '') + '</td><td>' + (u.cn || '') + '</td><td>' + u.coins + '</td><td>' + (u.is_admin ? '\u662F' : '\u5426') + '</td><td>';
            h += '<button class="admin-btn ' + (u.is_admin ? 'btn-danger' : 'btn-success') + '" onclick="toggleAdmin(' + u.id + ',' + !u.is_admin + ')">' + (u.is_admin ? '\u53D6\u6D88\u7BA1\u7406' : '\u8BBE\u4E3A\u7BA1\u7406') + '</button> ';
            h += '<button class="admin-btn btn-sm" onclick="adjustCoins(' + u.id + ')">\u8C03\u5E01</button></td></tr>';
        });
        h += '</tbody></table></div>';
        document.getElementById('adminContent').innerHTML = h;
    } catch (e) { showToast('\u52A0\u8F7D\u5931\u8D25', 'error'); }
}

async function toggleAdmin(uid, isA) {
    try { await api('/admin/users/' + uid + '/admin', 'PUT', { is_admin: isA }); showToast('\u6210\u529F', 'success'); loadAdminUsers(); }
    catch (e) { showToast(e.message, 'error'); }
}

async function adjustCoins(uid) {
    var amt = prompt('\u8BF7\u8F93\u5165\u5E01\u6570\uFF08\u6B63\u6570=\u589E\u52A0\uFF0C\u8D1F\u6570=\u6263\u9664\uFF09');
    if (!amt) return;
    amt = parseInt(amt);
    if (isNaN(amt) || amt === 0) { showToast('\u65E0\u6548\u6570\u5B57', 'error'); return; }
    try { await api('/admin/users/' + uid + '/coins', 'PUT', { amount: Math.abs(amt), action: amt > 0 ? 'add' : 'subtract' }); showToast('\u6210\u529F', 'success'); loadAdminUsers(); }
    catch (e) { showToast(e.message, 'error'); }
}

// ---- \u961F\u4F0D ----
async function loadAdminTeams() {
    try {
        var teams = await api('/admin/teams');
        var h = '<div class="admin-section">';
        h += '<button class="admin-btn btn-success" onclick="addTeam()">\u6DFB\u52A0\u961F\u4F0D</button>';
        h += '<table class="admin-table" style="margin-top:10px"><thead><tr><th>ID</th><th>\u540D\u79F0</th><th>Logo</th><th>\u64CD\u4F5C</th></tr></thead><tbody>';
        teams.forEach(function(t) {
            var logoUrl = t.logo_url ? (t.logo_url.startsWith('http') ? t.logo_url : 'http://106.53.67.7' + t.logo_url) : '';
            h += '<tr><td>' + t.id + '</td><td style="display:flex;align-items:center;gap:8px">';
            if (logoUrl) h += '<img src="' + logoUrl + '" style="height:28px;width:28px;object-fit:contain;border-radius:4px">';
            h += t.name + '</td><td>' + (logoUrl ? '<img src="' + logoUrl + '" style="height:30px">' : '-') + '</td><td>';
            h += '<button class="admin-btn btn-sm" onclick="uploadTeamLogo(' + t.id + ')">Logo</button> ';
            h += '<button class="admin-btn btn-danger" onclick="deleteTeam(' + t.id + ')">\u5220\u9664</button></td></tr>';
        });
        h += '</tbody></table></div>';
        document.getElementById('adminContent').innerHTML = h;
    } catch (e) { showToast('\u52A0\u8F7D\u5931\u8D25', 'error'); }
}

async function addTeam() {
    var name = prompt('\u961F\u4F0D\u540D\u79F0');
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
    if (!confirm('\u786E\u5B9A\u5220\u9664\uFF1F')) return;
    try { await api('/admin/teams/' + id, 'DELETE'); showToast('\u5220\u9664\u6210\u529F', 'success'); loadAdminTeams(); }
    catch (e) { showToast(e.message, 'error'); }
}

// ---- \u8D5B\u7A0B ----
async function loadAdminMatches() {
    try {
        var comps = await api('/competitions');
        var h = '<div class="admin-section"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">';
        h += '<select id="matchCompSelect" onchange="onMatchCompChange()" style="padding:8px;border-radius:6px;border:2px solid #eee">';
        comps.forEach(function(c) { h += '<option value="' + c.id + '">' + c.name + '</option>'; });
        h += '</select><button class="admin-btn btn-success" onclick="createCompetitionWeb()">\u521B\u5EFA\u5927\u6BD4\u8D5B</button></div>';
        h += '<div id="matchContent"></div></div>';
        document.getElementById('adminContent').innerHTML = h;
        if (comps.length > 0) { document.getElementById('matchCompSelect').value = comps[0].id; onMatchCompChange(); }
    } catch (e) { showToast('\u52A0\u8F7D\u5931\u8D25', 'error'); }
}

async function onMatchCompChange() {
    var cid = document.getElementById('matchCompSelect').value;
    if (!cid) { document.getElementById('matchContent').innerHTML = ''; return; }
    var c = document.getElementById('matchContent');
    c.innerHTML = '<div style="text-align:center;padding:20px;color:#999">\u52A0\u8F7D\u4E2D..</div>';
    try {
        var data = await api('/competitions/' + cid + '/full');
        var h = '<div style="margin-top:10px">';
        h += '<div style="display:flex;gap:8px;margin-bottom:10px">';
        h += '<button class="admin-btn btn-success" onclick="importMatchExcel()">Excel\u5BFC\u5165</button>';
        h += '<input type="file" id="matchExcelFile" accept=".xlsx,.xls" style="display:none" onchange="handleMatchExcelImport(this)">';
        h += '<button class="admin-btn btn-sm" onclick="downloadMatchTemplate()">\u4E0B\u8F7D\u6A21\u677F</button>';
        h += '<button class="admin-btn btn-danger" style="margin-left:auto" onclick="deleteCompetitionWeb(' + cid + ')">\u5220\u9664\u5927\u6BD4\u8D5B</button>';
        h += '</div>';
        data.matches.forEach(function(m) {
            h += '<div style="background:#fff;border-radius:8px;padding:12px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">';
            h += '<div style="display:flex;justify-content:space-between;align-items:center">';
            h += '<div><strong>' + (m.home_team || '?') + ' vs ' + (m.away_team || '?') + '</strong>';
            h += '<div style="font-size:12px;color:#999">' + m.match_code + ' | W' + m.week_number + ' D' + m.day_number + ' M' + m.match_number + '</div></div>';
            h += '<button class="admin-btn btn-danger" onclick="deleteMatchWeb(' + m.id + ')">\u5220\u9664</button></div></div>';
        });
        h += '<button class="admin-btn btn-success" onclick="addNewMatch(' + cid + ')" style="width:100%;margin-top:10px;padding:12px">+ \u624B\u52A8\u6DFB\u52A0\u6BD4\u8D5B</button>';
        h += '</div>';
        c.innerHTML = h;
    } catch (e) { c.innerHTML = '<div style="color:red;padding:20px">\u52A0\u8F7D\u5931\u8D25</div>'; }
}

function importMatchExcel() { document.getElementById('matchExcelFile').click(); }

function downloadMatchTemplate() {
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet([
        ['\u5468\u6570', '\u5929\u6570', '\u573A\u6B21', '\u4E3B\u573A\u961F\u4F0D', '\u5BA2\u573A\u961F\u4F0D'],
        [1, 1, 1, 'TE', 'MRC'],
        [1, 1, 2, 'Team A', 'Team B']
    ]);
    XLSX.utils.book_append_sheet(wb, ws, '\u8D5B\u7A0B');
    XLSX.writeFile(wb, '\u8D5B\u7A0B\u683C\u5F0F.xlsx');
}

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
            var cid = document.getElementById('matchCompSelect').value;
            var count = 0;
            for (var i = 1; i < jsonData.length; i++) {
                var row = jsonData[i];
                if (!row || row.length < 5) continue;
                var week = parseInt(row[0]), day = parseInt(row[1]), match = parseInt(row[2]);
                var home = String(row[3] || '').trim(), away = String(row[4] || '').trim();
                if (isNaN(week) || isNaN(day) || isNaN(match)) continue;
                try {
                    await api('/admin/matches', 'POST', { competition_id: parseInt(cid), week_number: week, day_number: day, match_number: match, home_team: home, away_team: away });
                    count++;
                } catch (e) {}
            }
            showToast('\u6210\u529F\u5BFC\u5165 ' + count + ' \u573A\u6BD4\u8D5B', 'success');
            onMatchCompChange();
        } catch (e) { showToast('\u5BFC\u5165\u5931\u8D25', 'error'); }
    };
    reader.readAsArrayBuffer(file);
}

function addNewMatch(cid) {
    var existing = document.getElementById('newMatchForm');
    if (existing) { existing.scrollIntoView(); return; }
    var form = document.createElement('div');
    form.id = 'newMatchForm';
    form.style.cssText = 'background:#fff;border-radius:8px;padding:15px;margin-top:10px;border:2px solid #667eea';
    form.innerHTML = '<div style="font-weight:bold;margin-bottom:10px">\u6DFB\u52A0\u6BD4\u8D5B</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">' +
        '<input id="nmWeek" type="number" placeholder="\u5468\u6570" style="padding:6px;border:1px solid #ddd;border-radius:4px">' +
        '<input id="nmDay" type="number" placeholder="\u5929\u6570" style="padding:6px;border:1px solid #ddd;border-radius:4px">' +
        '<input id="nmMatch" type="number" placeholder="\u573A\u6B21" style="padding:6px;border:1px solid #ddd;border-radius:4px"></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">' +
        '<input id="nmHome" placeholder="\u4E3B\u573A" style="padding:6px;border:1px solid #ddd;border-radius:4px">' +
        '<input id="nmAway" placeholder="\u5BA2\u573A" style="padding:6px;border:1px solid #ddd;border-radius:4px"></div>' +
        '<button class="admin-btn btn-success" onclick="saveNewMatch(this,' + cid + ')">\u4FDD\u5B58</button> <button class="admin-btn btn-sm" onclick="this.parentElement.remove()">\u53D6\u6D88</button>';
    var container = document.getElementById('matchContent');
    container.appendChild(form);
    form.scrollIntoView({ behavior: 'smooth' });
}

async function saveNewMatch(btn, cid) {
    var w = parseInt(document.getElementById('nmWeek').value), d = parseInt(document.getElementById('nmDay').value), m = parseInt(document.getElementById('nmMatch').value);
    var home = document.getElementById('nmHome').value.trim(), away = document.getElementById('nmAway').value.trim();
    if (!w || !d || !m) { showToast('\u8BF7\u586B\u5199\u5468\u6570/\u5929\u6570/\u573A\u6B21', 'error'); return; }
    try { await api('/admin/matches', 'POST', { competition_id: cid, week_number: w, day_number: d, match_number: m, home_team: home, away_team: away }); showToast('\u6DFB\u52A0\u6210\u529F', 'success'); onMatchCompChange(); }
    catch (e) { showToast(e.message, 'error'); }
}

async function deleteMatchWeb(mid) {
    if (!confirm('\u786E\u5B9A\u5220\u9664\uFF1F')) return;
    try { await api('/admin/matches/' + mid, 'DELETE'); showToast('\u5220\u9664\u6210\u529F', 'success'); onMatchCompChange(); }
    catch (e) { showToast(e.message, 'error'); }
}

function createCompetitionWeb() {
    var name = prompt('\u6BD4\u8D5B\u540D\u79F0\uFF08\u5982 2026IVL\u590F\u5B63\u8D5B\uFF09:'); if (!name) return;
    var year = prompt('\u5E74\u4EFD:'); if (!year) return;
    var season = prompt('\u8D5B\u5B63:'); if (!season) return;
    api('/admin/competitions', 'POST', { name: name, year: parseInt(year), season: season })
        .then(function() { showToast('\u521B\u5EFA\u6210\u529F', 'success'); loadAdminMatches(); })
        .catch(function(e) { showToast(e.message, 'error'); });
}

async function deleteCompetitionWeb(cid) {
    if (!confirm('\u786E\u5B9A\u5220\u9664\uFF1F')) return;
    try { await api('/admin/competitions/' + cid, 'DELETE'); showToast('\u5220\u9664\u6210\u529F', 'success'); loadAdminMatches(); }
    catch (e) { showToast(e.message, 'error'); }
}

// ---- \u95EE\u9898 ----
async function loadAdminQuestions() {
    try {
        var comps = await api('/competitions');
        var h = '<div class="admin-section"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">';
        h += '<span>\u9009\u62E9\u5927\u6BD4\u8D5B\uFF1A</span>';
        h += '<select id="questionCompSelect" onchange="onQuestionCompChange()" style="padding:8px;border-radius:6px;border:2px solid #eee">';
        comps.forEach(function(c) { h += '<option value="' + c.id + '">' + c.name + '</option>'; });
        h += '</select></div><div id="questionContent"></div></div>';
        document.getElementById('adminContent').innerHTML = h;
        if (comps.length > 0) { document.getElementById('questionCompSelect').value = comps[0].id; onQuestionCompChange(); }
    } catch (e) { showToast('\u52A0\u8F7D\u5931\u8D25', 'error'); }
}

async function onQuestionCompChange() {
    var cid = document.getElementById('questionCompSelect').value;
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
            var sc = q.status === 'active' ? '#27ae60' : q.status === 'closed' ? '#e67e22' : '#999';
            var qb = q.status === 'active' ? '#e3f2fd' : q.status === 'completed' ? '#e8f5e9' : '#fffde7';
            h += '<div id="qrow_' + q.id + '" style="background:' + qb + ';border-radius:6px;padding:10px 12px;margin:4px 0">';
            h += '<div style="display:flex;justify-content:space-between;align-items:center">';
            h += '<div><strong style="font-size:13px">' + q.question_code + '</strong> ';
            h += '<input class="inline-input-sm" value="' + (q.question_text || '').replace(/"/g, '&quot;') + '" onblur="updateQuestionText(' + q.id + ',this.value)" style="width:200px;background:#fffde7">';
            h += ' <span style="font-size:11px;color:' + sc + '">' + sl + '</span></div><div>';
            if (q.status === 'active') {
                h += '<button class="admin-btn btn-success" style="font-size:11px;padding:3px 8px" onclick="closeQuestion(' + q.id + ')">\u5C01\u76D8</button>';
                h += '<button class="admin-btn btn-danger" style="font-size:11px;padding:3px 8px" onclick="deleteQuestionWeb(' + q.id + ')">\u5220\u9664</button>';
            } else if (q.status === 'closed') {
                h += '<button class="admin-btn btn-success" style="font-size:11px;padding:3px 8px" onclick="openQuestion(' + q.id + ')">\u5F00\u76D8</button>';
                h += '<button class="admin-btn btn-warning" style="font-size:11px;padding:3px 8px" onclick="openSettleDialog(' + q.id + ')">\u7ED3\u7B97</button>';
            } else {
                h += '<button class="admin-btn btn-warning" style="font-size:11px;padding:3px 8px" onclick="resetQuestionWeb(' + q.id + ')">\u91CD\u7F6E</button>';
            }
            h += '<button class="admin-btn btn-sm" style="font-size:11px;padding:3px 8px" onclick="showBetDetail(' + q.id + ')">\u6295\u6CE8\u8BE6\u60C5</button>';
            h += '</div></div>';
            q.options.forEach(function(o) {
                var ob = '#fffde7';
                if (q.status === 'active') ob = '#e3f2fd';
                else if (q.correct_option_id && o.id === q.correct_option_id) ob = '#c8e6c9';
                else if (q.correct_option_id) ob = '#ffcdd2';
                h += '<div style="display:flex;align-items:center;gap:6px;margin:4px 0;padding:4px 8px;border-radius:4px">';
                h += '<input class="inline-input-sm" value="' + (o.option_text || '').replace(/"/g, '&quot;') + '" data-oid="' + o.id + '" data-field="text" onblur="saveOptionField(this)" placeholder="\u9009\u9879\u5185\u5BB9" style="flex:2;background:#f0f0f0">';
                h += '<input class="inline-input-num" type="number" value="' + o.base_rate + '" data-oid="' + o.id + '" data-field="rate" onblur="saveOptionField(this)" style="width:60px;background:#fff8e1">';
                h += '<span style="font-size:11px;color:#667eea">' + (o.total_coins || 0) + '\u5E01</span>';
                if (q.status !== 'completed') h += '<button class="admin-btn btn-danger" style="font-size:11px;padding:2px 6px" onclick="deleteOptionWeb(' + o.id + ')">X</button>';
                h += '</div>';
            });
            if (q.options.length < 3 && q.status !== 'completed') h += '<div style="padding-left:20px;margin:4px 0"><button class="admin-btn btn-sm" onclick="addOptionWeb(' + q.id + ')">+\u6DFB\u52A0\u9009\u9879</button></div>';
            h += '</div>';
        });
    });
    h += '</div>';
    c.innerHTML = h;
}

async function refreshQuestionRow(qid) {
    if (!questionDataCache) { onQuestionCompChange(); return; }
    var cid = document.getElementById('questionCompSelect') ? document.getElementById('questionCompSelect').value : questionDataCache.id;
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
async function deleteQuestionWeb(qid) { if (!confirm('\u786E\u5B9A\u5220\u9664\uFF1F')) return; try { await api('/admin/questions/' + qid, 'DELETE'); showToast('\u5220\u9664\u6210\u529F', 'success'); refreshQuestionRow(qid); } catch (e) { showToast(e.message, 'error'); } }
async function resetQuestionWeb(qid) { if (!confirm('\u91CD\u7F6E\u540E\u6240\u6709\u5E01\u6570\u5C06\u9000\u56DE\uFF0C\u786E\u5B9A\uFF1F')) return; try { await api('/admin/questions/' + qid + '/reset', 'PUT'); showToast('\u91CD\u7F6E\u6210\u529F', 'success'); refreshQuestionRow(qid); } catch (e) { showToast(e.message, 'error'); } }
async function deleteOptionWeb(oid) { if (!confirm('\u5220\u9664\u9009\u9879\uFF1F')) return; try { await api('/admin/options/' + oid, 'DELETE'); showToast('\u5220\u9664\u6210\u529F', 'success'); onQuestionCompChange(); } catch (e) { showToast(e.message, 'error'); } }
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
    if (!confirm('\u786E\u5B9A\u7ED3\u7B97\uFF1F')) return;
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
