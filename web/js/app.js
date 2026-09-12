var API_BASE = window.location.origin + '/api';

var currentUser = JSON.parse(localStorage.getItem('user') || 'null');

var currentPage = 'auth';

var pageHistory = [];

var currentQuestion = null;

var currentCompetition = null;

var questionDataCache = null;

// 限时竞猜缓存(工作台竞猜tab用, 与 questionDataCache 同步刷新)
var timedCache = [];

// 全部限时竞猜页缓存 + 周筛选锚点
var timedListCache = [];

var timedWeekAnchor = null;



// 登录态请求头: 用户ID + 会话令牌(账号信息变更后令牌轮换, 旧令牌会被服务端401拒绝)

function authHeaders() {

    var h = {};

    if (currentUser) {

        h['X-User-Id'] = String(currentUser.user_id || currentUser.id);

        if (currentUser.session_token) h['X-Session-Token'] = currentUser.session_token;

    }

    return h;

}



// 强制登出回登录页 (会话令牌失效/被踢下线时调用)

function forceLogout(msg) {

    switchAccount();

    showToast(msg || '登录状态已失效，请重新登录', 'error');

}



async function api(url, method, data, extraHeaders) {

    var opts = { method: method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()) };

    if (extraHeaders) Object.assign(opts.headers, extraHeaders);

    if (data) opts.body = JSON.stringify(data);

    var res = await fetch(API_BASE + url, opts);

    var json = await res.json();

    if (res.status === 401 && json.code === 'SESSION_EXPIRED') {

        // 同浏览器其他标签页可能刚改过账号信息(localStorage已更新令牌): 沿用新令牌重试一次

        var stored = JSON.parse(localStorage.getItem('user') || 'null');

        if (stored && stored.session_token && stored.session_token !== (currentUser && currentUser.session_token)) {

            currentUser = stored;

            return api(url, method, data, extraHeaders);

        }

        forceLogout(json.error);

        throw new Error(json.error || '登录状态已失效');

    }

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

        loadTimedBets();

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



// ========== MIUIX日期时间选择器 ==========

var miuiDtpState = null;

function openMiuiDatetimePicker(input) {

    if (miuiDtpState && miuiDtpState.input === input) { closeMiuiDatetimePicker(); return; }

    closeMiuiDatetimePicker();

    var mode = input.getAttribute('data-mode') === 'date' ? 'date' : 'datetime';

    var st = { input: input, mode: mode, year: null, month: null, day: null, hour: 12, minute: 0 };

    var v = (input.value || '').trim();

    if (v) {

        var parts = v.split(' ');

        var dp = parts[0].split('-');

        if (dp.length === 3) { st.year = parseInt(dp[0]); st.month = parseInt(dp[1]) - 1; st.day = parseInt(dp[2]); }

        if (mode === 'datetime' && parts[1]) {

            var hm = parts[1].split(':');

            st.hour = Math.min(23, parseInt(hm[0]) || 0);

            st.minute = Math.min(59, parseInt(hm[1]) || 0);

        }

    }

    if (st.year === null) { var now = new Date(); st.year = now.getFullYear(); st.month = now.getMonth(); }

    miuiDtpState = st;

    renderMiuiDtpPanel();

    setTimeout(function() { document.addEventListener('click', miuiDtpOutsideClose, true); }, 0);

}

function miuiDtpOutsideClose(e) {

    var panel = document.getElementById('miuiDtpPanel');

    if (!panel || !miuiDtpState) return;

    if (panel.contains(e.target) || e.target === miuiDtpState.input) return;

    closeMiuiDatetimePicker();

}

function closeMiuiDatetimePicker() {

    var p = document.getElementById('miuiDtpPanel');

    if (p) p.remove();

    document.removeEventListener('click', miuiDtpOutsideClose, true);

    miuiDtpState = null;

}

function miuiDtpShiftMonth(delta) {

    var st = miuiDtpState; if (!st) return;

    st.month += delta;

    if (st.month < 0) { st.month = 11; st.year--; }

    if (st.month > 11) { st.month = 0; st.year++; }

    var dim = new Date(st.year, st.month + 1, 0).getDate();

    if (st.day > dim) st.day = dim;

    renderMiuiDtpPanel();

}

function miuiDtpShiftYear(delta) {

    var st = miuiDtpState; if (!st) return;

    st.year += delta;

    var dim = new Date(st.year, st.month + 1, 0).getDate();

    if (st.day > dim) st.day = dim;

    renderMiuiDtpPanel();

}

function miuiDtpPickDay(d) {

    var st = miuiDtpState; if (!st) return;

    st.day = d;

    renderMiuiDtpPanel();

}

function miuiDtpSetTime(key, val) {

    var st = miuiDtpState; if (!st) return;

    st[key] = val;

    renderMiuiDtpPanel();

}

function miuiDtpNudge(key, dir) {

    var st = miuiDtpState; if (!st) return;

    var max = key === 'hour' ? 23 : 59;

    st[key] = (st[key] + dir + (max + 1)) % (max + 1);

    renderMiuiDtpPanel();

}

function miuiDtpRoller(key, max, val) {

    var items = '';

    for (var i = 0; i <= max; i++) {

        var disp = i < 10 ? '0' + i : '' + i;

        items += '<div' + (i === val ? ' id="miuiDtpSel_' + key + '"' : '') + ' onclick="miuiDtpSetTime(\'' + key + '\',' + i + ')" style="padding:4px 10px;font-size:13px;border-radius:8px;cursor:pointer;text-align:center;' + (i === val ? 'background:#3478f6;color:#fff;font-weight:600' : 'color:#1a1a1a') + '">' + disp + '</div>';

    }

    var label = key === 'hour' ? '\u65f6' : '\u5206';

    return '<div style="width:64px"><div style="text-align:center;color:#86868b;font-size:11px;margin-bottom:2px">' + label + '</div>'

        + '<div onclick="miuiDtpNudge(\'' + key + '\',-1)" style="text-align:center;cursor:pointer;color:#86868b;line-height:1"><i class="ri-arrow-up-s-line"></i></div>'

        + '<div id="miuiDtp_' + key + '" class="miui-dtp-roller">' + items + '</div>'

        + '<div onclick="miuiDtpNudge(\'' + key + '\',1)" style="text-align:center;cursor:pointer;color:#86868b;line-height:1"><i class="ri-arrow-down-s-line"></i></div></div>';

}

function renderMiuiDtpPanel() {

    var st = miuiDtpState; if (!st) return;

    var old = document.getElementById('miuiDtpPanel');

    var rect = st.input.getBoundingClientRect();

    if (old) old.remove();

    var navBtn = 'width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;color:#1a1a1a;background:#f2f3f5;font-style:normal';

    var html = '<div id="miuiDtpPanel" style="position:fixed;z-index:10010;background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.18);padding:14px;width:280px;box-sizing:border-box;animation:miuiFadeIn 0.2s" onclick="event.stopPropagation()">';

    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">';

    html += '<i class="' + navBtn + '" onclick="miuiDtpShiftYear(-1)">&laquo;</i><i class="' + navBtn + '" onclick="miuiDtpShiftMonth(-1)"><i class="ri-arrow-left-s-line"></i></i>';

    html += '<span style="font-size:14px;font-weight:600">' + st.year + '\u5e74' + (st.month + 1) + '\u6708</span>';

    html += '<i class="' + navBtn + '" onclick="miuiDtpShiftMonth(1)"><i class="ri-arrow-right-s-line"></i></i><i class="' + navBtn + '" onclick="miuiDtpShiftYear(1)">&raquo;</i></div>';

    html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center">';

    ['\u4e00', '\u4e8c', '\u4e09', '\u56db', '\u4e94', '\u516d', '\u65e5'].forEach(function(w) {

        html += '<span style="font-size:11px;color:#86868b;padding:4px 0">' + w + '</span>';

    });

    var first = new Date(st.year, st.month, 1);

    var offset = (first.getDay() + 6) % 7;

    var dim = new Date(st.year, st.month + 1, 0).getDate();

    for (var i = 0; i < offset; i++) html += '<span></span>';

    for (var d = 1; d <= dim; d++) {

        var sel = st.day === d;

        html += '<span onclick="miuiDtpPickDay(' + d + ')" style="font-size:13px;padding:6px 0;border-radius:8px;cursor:pointer;' + (sel ? 'background:#3478f6;color:#fff;font-weight:600' : 'color:#1a1a1a') + '">' + d + '</span>';

    }

    html += '</div>';

    if (st.mode === 'datetime') {

        html += '<div style="display:flex;gap:10px;justify-content:center;margin-top:10px">';

        html += miuiDtpRoller('hour', 23, st.hour);

        html += '<span style="align-self:center;font-weight:600;padding-top:14px">:</span>';

        html += miuiDtpRoller('minute', 59, st.minute);

        html += '</div>';

    }

    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;border-top:0.5px solid #f2f3f5;padding-top:10px">';

    html += '<button onclick="miuiDtpClear()" style="font-size:12px;color:#86868b;background:#f2f3f5;border:none;border-radius:8px;padding:6px 14px;cursor:pointer">\u6e05\u9664</button>';

    html += '<button onclick="miuiDtpCommit()" style="font-size:13px;color:#fff;background:#3478f6;border:none;border-radius:10px;padding:7px 22px;cursor:pointer;font-weight:600">\u786e\u5b9a</button></div>';

    html += '</div>';

    document.body.insertAdjacentHTML('beforeend', html);

    var panel = document.getElementById('miuiDtpPanel');

    var left = Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8);

    var top = rect.bottom + 8;

    if (top + panel.offsetHeight > window.innerHeight - 8) top = Math.max(8, rect.top - panel.offsetHeight - 8);

    panel.style.left = Math.max(8, left) + 'px';

    panel.style.top = top + 'px';

    ['hour', 'minute'].forEach(function(k) {

        var box = document.getElementById('miuiDtp_' + k);

        var selEl = document.getElementById('miuiDtpSel_' + k);

        if (box && selEl) box.scrollTop = selEl.offsetTop - box.clientHeight / 2 + selEl.clientHeight / 2;

    });

}

function miuiDtpCommit() {

    var st = miuiDtpState; if (!st) return;

    if (!st.day) { closeMiuiDatetimePicker(); return; }

    var val = st.year + '-' + String(st.month + 1).padStart(2, '0') + '-' + String(st.day).padStart(2, '0');

    if (st.mode === 'datetime') val += ' ' + String(st.hour).padStart(2, '0') + ':' + String(st.minute).padStart(2, '0');

    st.input.value = val;

    st.input.dispatchEvent(new Event('change'));

    closeMiuiDatetimePicker();

}

function miuiDtpClear() {

    var st = miuiDtpState; if (!st) return;

    st.input.value = '';

    st.input.dispatchEvent(new Event('change'));

    closeMiuiDatetimePicker();

}



// MIUIX弹窗组件

function miuiAlert(msg) {

    return new Promise(function(resolve) {

        var h = '<div id="miuiDialog" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.35);z-index:10000;display:flex;align-items:center;justify-content:center" class="dl-overlay" onclick="if(event.target===this)closeMiuiDialog()">';

        h += '<div class="dl-glass" style="width:85%;max-width:320px;padding:24px 20px 16px;animation:miuiFadeIn 0.2s">';

        h += '<div style="font-size:16px;font-weight:500;color:#1a1a1a;text-align:center;margin-bottom:20px;line-height:1.5">' + msg + '</div>';

        h += '<div style="text-align:center"><button class="miui-dialog-btn" onclick="closeMiuiDialog()" style="color:#3478f6;font-size:16px;font-weight:500;background:none;border:none;padding:8px 24px;cursor:pointer">\u786E\u5B9A</button></div>';

        h += '</div></div>';

        document.body.insertAdjacentHTML('beforeend', h);

        document.getElementById('miuiDialog')._resolve = resolve;

    });

}



function miuiConfirm(msg) {

    return new Promise(function(resolve) {

        var h = '<div id="miuiDialog" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.35);z-index:10000;display:flex;align-items:center;justify-content:center" class="dl-overlay" onclick="if(event.target===this)closeMiuiDialog()">';

        h += '<div class="dl-glass" style="width:85%;max-width:320px;padding:24px 20px 16px;animation:miuiFadeIn 0.2s">';

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

        var h = '<div id="miuiDialog" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.35);z-index:10000;display:flex;align-items:center;justify-content:center" class="dl-overlay" onclick="if(event.target===this)closeMiuiDialog()">';

        h += '<div class="dl-glass" style="width:85%;max-width:320px;padding:24px 20px 16px;animation:miuiFadeIn 0.2s">';

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

        var h = '<div id="miuiDialog" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.35);z-index:10000;display:flex;align-items:center;justify-content:center" class="dl-overlay" onclick="if(event.target===this)closeMiuiDialog()">';

        h += '<div class="dl-glass" style="width:85%;max-width:340px;padding:24px 20px 16px;animation:miuiFadeIn 0.2s">';

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

            } else if (f.type === 'date') {

                h += '<input id="miuiPromptField' + i + '" type="text" readonly class="miui-datetime" data-mode="date" placeholder="' + (f.placeholder || '') + '" value="' + (f.defaultValue || '') + '" onclick="openMiuiDatetimePicker(this)">';

            } else {

                h += '<input id="miuiPromptField' + i + '" type="' + (f.type || 'text') + '" class="miui-datetime" style="padding:11px;font-size:14px;font-weight:400" placeholder="' + (f.placeholder || '') + '" value="' + (f.defaultValue || '') + '">';

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

        checkBackupSiteNotice();

        if (currentUser.need_setup) showSuperadminSetup();

    } catch (e) { showToast(e.message, 'error'); }

}



// 超级管理员默认账号(admin/admin)首次登录强制修改, 修改后不再提示

async function showSuperadminSetup() {

    var result = await miuiPromptMulti([

        {key: 'username', label: '\u65B0\u8D26\u53F7 (\u81F3\u5C112\u4F4D)', defaultValue: 'admin'},

        {key: 'password', label: '\u65B0\u5BC6\u7801 (\u81F3\u5C114\u4F4D)', type: 'password', defaultValue: ''},

        {key: 'cn', label: 'CN', defaultValue: (currentUser && currentUser.cn) || ''}

    ]);

    if (!result) return;  // 取消则下次登录/刷新会再次提示

    if (!result.username || result.username.trim().length < 2 || !result.password || result.password.length < 4) {

        showToast('\u8D26\u53F7\u81F3\u5C112\u4F4D\u3001\u5BC6\u7801\u81F3\u5C114\u4F4D', 'error');

        showSuperadminSetup();

        return;

    }

    try {

        var resp = await api('/admin/setup-superadmin', 'PUT', {

            username: result.username.trim(), password: result.password, cn: (result.cn || '').trim()

        });

        Object.assign(currentUser, resp.user);

        if (resp.session_token) currentUser.session_token = resp.session_token;  // 账号信息已变更: 保存轮换后的新令牌

        currentUser.need_setup = false;

        localStorage.setItem('user', JSON.stringify(currentUser));

        showToast('\u7BA1\u7406\u5458\u8D26\u53F7\u5DF2\u66F4\u65B0', 'success');

        maybeShowNotice();

    } catch (e) {

        showToast(e.message, 'error');

        showSuperadminSetup();

    }

}



// 首页公告确认弹窗 (类似群公告): 未确认每次进首页都会弹出, 确认后不再显示

function maybeShowNotice() {

    if (!currentUser || currentUser.notice_confirmed) return;

    // 仅在已登录且当前正停留在首页时弹出, 避免盖在登录页等其他页面上
    if (currentPage !== 'home' || !document.getElementById('homePage').classList.contains('active')) return;

    if (document.getElementById('noticeOverlay')) return;

    var overlay = document.createElement('div');

    overlay.id = 'noticeOverlay';

    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:10004;display:flex;align-items:center;justify-content:center';
    overlay.classList.add('dl-overlay');

    var glass = 'background:rgba(255,255,255,0.95);border:0.5px solid rgba(255,255,255,0.7);border-radius:22px;box-shadow:0 12px 40px rgba(0,0,0,0.25);padding:24px;width:85%;max-width:340px;box-sizing:border-box';

    var item = 'display:flex;align-items:flex-start;gap:9px;margin-bottom:10px';

    var dot = 'flex-shrink:0;margin-top:8px;width:6px;height:6px;border-radius:50%;background:#3478f6';

    overlay.innerHTML = '<div style="' + glass + '">' +

        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">' +

        '<i class="ri-megaphone-line" style="font-size:22px;color:#3478f6"></i>' +

        '<span style="font-size:17px;font-weight:600;color:#1a1a1a">\u91CD\u8981\u516C\u544A</span></div>' +

        '<div style="font-size:14px;color:#3a3a3c;line-height:1.7;margin-bottom:18px">' +

        '<div style="' + item + '"><span style="' + dot + '"></span><span>本竞猜系统由雾清制作，永久免费开放，不会产生任何消费。</span></div>' +

        '<div style="' + item + '"><span style="' + dot + '"></span><span>系统不存在任何充值入口，也不存在充值的可能性。</span></div>' +

        '<div style="' + item + '"><span style="' + dot + '"></span><span>如有人攻击网站导致出现金钱交易，请第一时间联系雾清反馈问题！</span></div>' +

        '</div>' +

        '<button id="noticeOkBtn" class="admin-btn" style="width:100%;padding:12px;border:none;border-radius:12px;background:#3478f6;color:#fff;font-size:15px;font-weight:600;cursor:pointer">\u6211\u5DF2\u77E5\u6653</button>' +

        '</div>';

    document.body.appendChild(overlay);

    document.getElementById('noticeOkBtn').onclick = async function() {

        try {

            await api('/user/notice-confirm', 'PUT', {});

            currentUser.notice_confirmed = true;

            localStorage.setItem('user', JSON.stringify(currentUser));

            overlay.remove();

            showToast('\u611F\u8C22\u786E\u8BA4\uFF0C\u795D\u60A8\u7ADE\u731C\u6109\u5FEB', 'success');

        } catch (e) {

            showToast(e.message, 'error');

            // 本地缓存的账号已不存在(换库/被删号): 退出登录让用户重新登录
            if (/not found|不存在/i.test(e.message || '')) {

                overlay.remove();

                switchAccount();

            }

        }

    };

}



// 备用站提示: 后端SITE_ROLE=backup时(如PA镜像), 每次登录/注册后弹窗提醒前往主站竞猜

async function checkBackupSiteNotice() {

    try {

        var info = await api('/site-info');

        if (!info || info.role !== 'backup' || !info.main_site_url) return;

        if (document.getElementById('backupNoticeOverlay')) return;

        var overlay = document.createElement('div');

        overlay.id = 'backupNoticeOverlay';

        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:10005;display:flex;align-items:center;justify-content:center';
    overlay.classList.add('dl-overlay');

        var glass = 'background:rgba(255,255,255,0.95);border:0.5px solid rgba(255,255,255,0.7);border-radius:22px;box-shadow:0 12px 40px rgba(0,0,0,0.25);padding:24px;width:85%;max-width:340px;box-sizing:border-box';

        overlay.innerHTML = '<div style="' + glass + '" onclick="event.stopPropagation()">' +

            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px"><i class="ri-error-warning-line" style="font-size:22px;color:#f59e0b"></i><span style="font-size:17px;font-weight:600;color:#1a1a1a">\u5907\u7528\u7AD9\u63D0\u793A</span></div>' +

            '<div style="font-size:14px;color:#3a3a3c;line-height:1.8;margin-bottom:18px">' +

            '<div>\u672C\u7AD9\u91C7\u7528\u300C\u4E3B\u7AD9 + \u5907\u7528\u7AD9 + \u5B9A\u671F\u5907\u4EFD\u300D\u65B9\u6848\uFF0C\u60A8\u5F53\u524D\u8BBF\u95EE\u7684\u662F<b>\u5907\u7528\u7AD9</b>\u3002</div>' +

            '<div style="margin-top:6px">\u4E3B\u7AD9\u6B63\u5E38\u8FD0\u884C\u65F6\uFF0C\u5728\u672C\u7AD9\u8FDB\u884C\u7684\u4EFB\u4F55\u4FEE\u6539\uFF08\u542B\u6295\u5E01\u3001\u6CE8\u518C\u3001\u6539\u8D44\u6599\uFF09\u90FD<b>\u4E0D\u4F1A\u4FDD\u5B58\u5230\u6B63\u5F0F\u6570\u636E\u5E93</b>\uFF0C\u6570\u636E\u4F1A\u88AB\u5B9A\u671F\u5907\u4EFD\u8986\u76D6\u3002</div>' +

            '<div style="margin-top:6px">\u7ADE\u731C\u64CD\u4F5C\u8BF7\u524D\u5F80\u4E3B\u7AD9\uFF1ACoin-IVL by wuqing</div></div>' +

            '<a id="goMainSiteBtn" href="' + info.main_site_url + '" target="_blank" rel="noopener" style="display:block;text-align:center;text-decoration:none;margin-bottom:10px;padding:12px;border-radius:12px;background:#3478f6;color:#fff;font-size:15px;font-weight:600;cursor:pointer">\u524D\u5F80\u4E3B\u7AD9\u7ADE\u731C</a>' +

            '<button id="backupNoticeCloseBtn" style="width:100%;padding:11px;border:none;border-radius:12px;background:#f2f3f5;font-size:14px;cursor:pointer">\u5173\u95ED</button>' +

            '</div>';

        document.body.appendChild(overlay);

        document.getElementById('backupNoticeCloseBtn').onclick = function() { overlay.remove(); };

        overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    } catch (e) {}

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

        checkBackupSiteNotice();

    } catch (e) { showToast(e.message, 'error'); }

}



function switchAccount() {

    currentUser = null;

    localStorage.removeItem('user');

    pageHistory = [];

    // 关闭公告类弹窗: 提示只属于登录后的首页, 登出时不能留在登录页上
    ['noticeOverlay', 'backupNoticeOverlay'].forEach(function(id) {

        var el = document.getElementById(id);

        if (el) el.remove();

    });

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

    loadTimedBets();

    if (currentUser && !currentUser.need_setup) maybeShowNotice();

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

    var isAdminUser = !!currentUser.is_admin;

    ['navAdmin', 'navAdminLb', 'navAdminPf'].forEach(function(id) {

        var el = document.getElementById(id);

        if (el) el.style.display = isAdminUser ? 'inline' : 'none';

    });

    var btnScore = document.getElementById('btnMatchScore');

    if (btnScore) btnScore.style.display = isAdminUser ? 'flex' : 'none';

    loadPendingCoins();

    loadCoinDeltas();

}



async function loadPendingCoins() {

    try {

        var data = await api('/pending-coins');

        var el = document.getElementById('pendingCoins');

        if (el) el.textContent = data.pending_coins || 0;

    } catch (e) {}

}



// 币数增减: 今日 + 上次比赛日 (纯符号数字, 绿增红减)

async function loadCoinDeltas() {

    try {

        var d = await api('/user/coin-stats');

        var group = document.getElementById('deltaGroup');

        var tEl = document.getElementById('todayDelta');

        var lEl = document.getElementById('lastMatchDelta');

        if (!group || !tEl || !lEl) return;

        function fmt(v) {

            if (v === null || v === undefined) return null;

            return (v > 0 ? '+' : '') + v;

        }

        var t = fmt(d.today_delta), l = fmt(d.last_match_delta);

        if (t === null && l === null) { group.style.display = 'none'; return; }

        group.style.display = 'flex';

        if (t !== null) {

            tEl.textContent = t;

            tEl.style.color = d.today_delta > 0 ? '#6fe08b' : (d.today_delta < 0 ? '#ff8a8a' : 'inherit');

        } else { tEl.textContent = '—'; tEl.style.opacity = .4; }

        if (l !== null) {

            lEl.textContent = l;

            lEl.style.color = d.last_match_delta > 0 ? '#6fe08b' : (d.last_match_delta < 0 ? '#ff8a8a' : 'inherit');

        } else { lEl.textContent = '—'; lEl.style.opacity = .4; }

        if (d.last_match_date) lEl.title = '上次比赛日 ' + d.last_match_date;

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

        // 近期赛程标题行的小框: 提示当前默认赛程(全员可见), 未设默认则隐藏
        var chip = document.getElementById('defaultCompChip');

        if (chip) {

            var defName = '';

            comps.forEach(function(c) { if (c.is_default) defName = c.name; });

            chip.textContent = defName;

            chip.title = '\u5f53\u524d\u8d5b\u7a0b';

            chip.style.display = defName ? 'inline-block' : 'none';

        }

        if (comps.length === 0) { document.getElementById('recentSchedule').innerHTML = ''; return; }

        var today = new Date(); today.setHours(0,0,0,0);

        var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

        var allMatches = [];

        for (var ci = 0; ci < comps.length; ci++) {

            var data = await api('/competitions/' + comps[ci].id + '/full');

            data.matches.forEach(function(m) {

                if (m.match_date && m.match_date >= todayStr) allMatches.push(m);

            });

        }

        allMatches.sort(function(a, b) { return a.match_date > b.match_date ? 1 : -1; });

        var targetDates = [];

        for (var i = 0; i < allMatches.length && targetDates.length < 2; i++) {

            var d = allMatches[i].match_date;

            if (targetDates.indexOf(d) === -1) targetDates.push(d);

        }

        var allHtml = '';

        for (var ci = 0; ci < comps.length; ci++) {

            var data = await api('/competitions/' + comps[ci].id + '/full');

            var filtered = data.matches.filter(function(m) {

                return m.match_date && targetDates.indexOf(m.match_date) !== -1;

            });

            if (filtered.length === 0) continue;

            // 按日期分组

            var byDate = {};

            filtered.forEach(function(m) {

                if (!byDate[m.match_date]) byDate[m.match_date] = [];

                byDate[m.match_date].push(m);

            });

            targetDates.forEach(function(dateStr) {

                var dayMatches = byDate[dateStr];

                if (!dayMatches || dayMatches.length === 0) return;

                var first = dayMatches[0];

                var dateLabel = (first.match_weekday || '') + ' ' + dateStr.substring(5);

                dayMatches.forEach(function(m, mi) {

                    // 未结算的问题在前，已结算在后

                    var unsettled = m.questions.filter(function(q) { return q.status !== 'completed'; });

                    var settled = m.questions.filter(function(q) { return q.status === 'completed'; });

                    var sortedQ = unsettled.concat(settled);

                    if (sortedQ.length === 0) return;

                    allHtml += '<div style="margin:0 16px 8px">';

                    allHtml += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">';

                    var hLogo = m.home_logo ? '<img src="' + m.home_logo + '" style="width:20px;height:20px;border-radius:5px;object-fit:contain;background:#f2f3f5">' : '';

                    var aLogo = m.away_logo ? '<img src="' + m.away_logo + '" style="width:20px;height:20px;border-radius:5px;object-fit:contain;background:#f2f3f5">' : '';

                    allHtml += hLogo + '<span style="font-size:13px;font-weight:500">' + (m.home_team || '?') + ' vs ' + (m.away_team || '?') + '</span>' + aLogo;

                    if (mi === 0) allHtml += '<span style="font-size:11px;color:#86868b;margin-left:auto">' + dateLabel + '</span>';

                    allHtml += '</div>';

                    sortedQ.forEach(function(q) {

                        var sLabel = q.status === 'active' ? '\u5F00\u76D8\u4E2D' : q.status === 'closed' ? '\u5DF2\u5C01\u76D8' : '\u5DF2\u7ED3\u7B97';

                        var sColor = q.status === 'active' ? '#34a853' : q.status === 'closed' ? '#f57c00' : '#86868b';

                        allHtml += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#fff;border-radius:10px;margin-bottom:4px;cursor:pointer" onclick="loadBetPage(\'' + q.question_code + '\',\'' + q.status + '\',\'' + (m.home_team||'').replace(/'/g,"\\'") + '\',\'' + (m.away_team||'').replace(/'/g,"\\'") + '\',\'' + (m.home_logo||'') + '\',\'' + (m.away_logo||'') + '\',\'' + (q.question_text||'').replace(/'/g,"\\'") + '\')">';

                        allHtml += '<div><span style="font-size:14px;font-weight:500;color:#1a1a1a">' + q.question_text + '</span></div>';

                        allHtml += '<span style="font-size:12px;color:' + sColor + ';font-weight:500">' + sLabel + '</span>';

                        allHtml += '</div>';

                    });

                    allHtml += '</div>';

                });

            });

        }

        if (!allHtml) allHtml = '<div style="padding:16px;text-align:center;color:#86868b;font-size:13px">\u8FD1\u671F\u6682\u65E0\u8D5B\u7A0B</div>';

        document.getElementById('recentSchedule').innerHTML = allHtml;

    } catch (e) {}

}



// ========== 限时竞猜 ==========

// 'YYYY-MM-DD HH:MM:SS' -> 'MM-DD HH:mm'
function fmtShort(s) {

    if (!s || s.length < 16) return s || '';

    return s.substring(5, 10) + ' ' + s.substring(11, 16);

}

function timedStatusLabel(s) {

    return s === 'pending' ? '\u672A\u5F00\u76D8' : s === 'active' ? '\u5F00\u76D8\u4E2D' : s === 'closed' ? '\u5DF2\u5C01\u76D8' : '\u5DF2\u7ED3\u7B97';

}

function timedStatusColor(s) {

    return s === 'pending' ? '#86868b' : s === 'active' ? '#34a853' : s === 'closed' ? '#f57c00' : '#86868b';

}

function timedWindow(q) {

    return fmtShort(q.open_time) + ' ~ ' + fmtShort(q.close_time);

}

function parseYMD(s) {

    var p = s.split('-');

    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));

}

// 限时竞猜行(首页区块与全部限时竞猜页共用): 点击直接进投币页
function timedRowHtml(q) {

    var sLabel = timedStatusLabel(q.status);

    var sColor = timedStatusColor(q.status);

    var pool = q.total_coins || 0;

    var sub = '<i class="ri-time-line" style="font-size:12px"></i> ' + timedWindow(q);

    if (q.status === 'completed' && q.correct_option_id) {

        var co = q.options.filter(function(o) { return o.id === q.correct_option_id; })[0];

        if (co) sub += ' \u00B7 <span style="color:#34a853">\u7B54\u6848: ' + (co.option_text || '\u7A7A') + '</span>';

    }

    var h = '<div style="padding:10px 12px;background:#fff;border-radius:10px;margin:0 16px 4px;cursor:pointer;' + (q.status === 'completed' ? 'opacity:.6' : '') + '" onclick="loadBetPage(\'' + q.question_code + '\',\'' + q.status + '\',\'\',\'\',\'\',\'\',\'' + (q.question_text || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\')">';

    h += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">';

    h += '<span style="font-size:14px;font-weight:500;color:#1a1a1a;flex:1;min-width:0;word-break:break-all">' + q.question_text + '</span>';

    h += '<span style="font-size:12px;color:' + sColor + ';font-weight:500;flex-shrink:0">' + sLabel + '</span>';

    h += '</div>';

    h += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:3px">';

    h += '<span style="font-size:11px;color:#86868b">' + sub + '</span>';

    h += '<span style="font-size:11px;color:#3478f6;font-weight:500;flex-shrink:0">\u6C60 ' + pool + '\u5E01</span>';

    h += '</div></div>';

    return h;

}

async function loadTimedBets() {

    var section = document.getElementById('timedSection');

    var box = document.getElementById('timedBets');

    if (!section || !box) return;

    var list = [];

    try { list = await api('/timed-questions'); } catch (e) {}

    section.style.display = 'flex';

    if (!list.length) { box.innerHTML = '<div style="padding:16px;text-align:center;color:#86868b;font-size:13px">\u6682\u65E0\u9650\u65F6\u7ADE\u731C</div>'; return; }

    var h = '';

    list.forEach(function(q) { h += timedRowHtml(q); });

    box.innerHTML = h;

}

function timedWeekOf(dateStr) {

    if (!timedWeekAnchor || !dateStr) return null;

    var a = parseYMD(timedWeekAnchor);

    var firstMonday = new Date(a.getFullYear(), a.getMonth(), a.getDate() - ((a.getDay() + 6) % 7));

    var diff = Math.floor((parseYMD(dateStr) - firstMonday) / 86400000);

    return Math.floor(diff / 7) + 1;

}

async function showTimedList() {

    showPage('timedList');

    document.getElementById('timedListFilterArea').innerHTML = '';

    document.getElementById('timedListContent').innerHTML = '<div style="text-align:center;padding:20px;color:#999">\u52A0\u8F7D\u4E2D..</div>';

    try {

        var results = await Promise.all([api('/timed-questions?all=1'), api('/competitions')]);

        timedListCache = results[0];

        timedWeekAnchor = (results[1] && results[1][0] && results[1][0].start_date) || null;

        renderTimedListFilter();

        renderTimedList();

    } catch (e) {

        document.getElementById('timedListContent').innerHTML = '<div style="text-align:center;padding:20px;color:#999">\u52A0\u8F7D\u5931\u8D25</div>';

    }

}

function renderTimedListFilter() {

    var area = document.getElementById('timedListFilterArea');

    if (!timedWeekAnchor) { area.innerHTML = ''; return; }

    // 可选周 = 所有限时竞猜开盘~封盘窗口覆盖到的周(赛季周, 与比赛周同一周一锚点)
    var weeks = {};

    timedListCache.forEach(function(q) {

        if (!q.open_time || !q.close_time) return;

        var w1 = timedWeekOf(q.open_time.substring(0, 10));

        var w2 = timedWeekOf(q.close_time.substring(0, 10));

        if (w1 === null || w2 === null) return;

        var lo = Math.max(1, Math.min(w1, w2)), hi = Math.max(w1, w2);

        for (var w = lo; w <= hi && w - lo < 60; w++) weeks[w] = true;

    });

    var opts = [{ value: '', label: '\u5168\u90E8\u5468' }];

    Object.keys(weeks).map(Number).sort(function(a, b) { return a - b; }).forEach(function(w) { opts.push({ value: String(w), label: w + '\u5468' }); });

    area.innerHTML = '<div class="filter-bar"><div id="timedWeekFilter" style="display:flex;flex:1"></div></div>';

    miuiSelect('timedWeekFilter', opts, getMiuiSelectValue('timedWeekFilter') || '', function() { renderTimedList(); });

}

function renderTimedList() {

    var box = document.getElementById('timedListContent');

    if (!box) return;

    var wf = getMiuiSelectValue('timedWeekFilter') || '';

    var list = timedListCache;

    if (wf && timedWeekAnchor) {

        var a = parseYMD(timedWeekAnchor);

        var firstMonday = new Date(a.getFullYear(), a.getMonth(), a.getDate() - ((a.getDay() + 6) % 7));

        var weekStart = new Date(firstMonday.getFullYear(), firstMonday.getMonth(), firstMonday.getDate() + (parseInt(wf, 10) - 1) * 7);

        var weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);

        // 开盘时段覆盖: 开盘~封盘窗口与所选周有重叠即显示(跨周竞猜出现在多个周下)
        list = timedListCache.filter(function(q) {

            if (!q.open_time || !q.close_time) return false;

            var openDate = parseYMD(q.open_time.substring(0, 10));

            var closeDate = parseYMD(q.close_time.substring(0, 10));

            return openDate <= weekEnd && closeDate >= weekStart;

        });

    }

    if (!list.length) {

        box.innerHTML = '<div style="padding:16px;text-align:center;color:#86868b;font-size:13px">\u6682\u65E0\u9650\u65F6\u7ADE\u731C</div>';

        return;

    }

    var h = '<div style="margin:12px 0 8px">';

    list.forEach(function(q) { h += timedRowHtml(q); });

    h += '</div>';

    box.innerHTML = h;

}



// ========== 积分榜 ==========

var _lbFilterIds = [];

var _lbAllTeams = [];

function openLeaderboard() {

    document.getElementById('leaderboardOverlay').style.display = 'flex';

    loadLeaderboardForPopup();

}



function closeLeaderboard() {

    document.getElementById('leaderboardOverlay').style.display = 'none';

}



// 组装弹窗积分榜数据: 有排名数据的按后端排序(含相互战绩)展示, 无比赛数据的队伍附在最后

function buildLeaderboardView(entries, teams, filterIds) {

    filterIds = filterIds || [];

    var entryMap = {};

    entries.forEach(function(e) { entryMap[e.team_id] = e; });

    var allEntries = [];

    entries.forEach(function(e) {

        var t = null;

        for (var i = 0; i < teams.length; i++) { if (teams[i].id === e.team_id) { t = teams[i]; break; } }

        if (t && t.logo_url) {

            if (filterIds.length && filterIds.indexOf(e.team_id) < 0) return;

            allEntries.push({

                team_id: e.team_id, team_name: t.name, team_logo: t.logo_url.startsWith('http') ? t.logo_url : ('' + t.logo_url),

                rank: e.rank, prev_rank: e.prev_rank,

                wins: e.wins, losses: e.losses, draws: e.draws, net_wins: e.net_wins

            });

        }

    });

    teams.forEach(function(t) {

        if (t.logo_url && !entryMap[t.id]) {

            if (filterIds.length && filterIds.indexOf(t.id) < 0) return;

            allEntries.push({

                team_id: t.id, team_name: t.name, team_logo: t.logo_url.startsWith('http') ? t.logo_url : ('' + t.logo_url),

                rank: 0, prev_rank: 0, wins: 0, losses: 0, draws: 0, net_wins: 0

            });

        }

    });

    // 前段顺序与后端排名一致, 无数据队伍顺延编号

    allEntries.forEach(function(e, i) { e.rank = i + 1; });

    return allEntries;

}



async function loadLeaderboardForPopup() {

    try {

        var comps = await api('/competitions');

        if (comps.length === 0) { document.getElementById('leaderboardContent').innerHTML = '<div style="padding:20px;text-align:center;color:#86868b;font-size:13px">\u6682\u65E0\u8D5B\u4E8B</div>'; return; }

        var activeComp = comps.find(function(c) { return c.status === 'active'; }) || comps[0];

        var entries = await api('/leaderboard/' + activeComp.id + '/team');

        var teams = await api('/teams');

        var filterResp = await api('/leaderboard/' + activeComp.id + '/team-filter');

        _lbFilterIds = filterResp.team_ids || [];

        _lbAllTeams = teams;

        var allEntries = buildLeaderboardView(entries, teams, _lbFilterIds);

        var compOpts = comps.map(function(c) { return {value: String(c.id), label: c.name}; });

        renderLeaderboard(allEntries, activeComp.id, compOpts);

    } catch (e) {}

}



function renderLeaderboard(entries, compId, compOpts) {

    var isAdmin = currentUser && currentUser.is_admin;

    var h = '<div style="padding:0 16px 12px">';

    h += '<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">';

    h += '<div id="lbCompSelect" style="flex:1"></div>';

    if (isAdmin) {

        h += '<button class="admin-btn" style="font-size:16px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:8px;flex-shrink:0;margin-right:8px" onclick="showTeamFilterDialog()" title="筛选积分榜队伍"><i class="ri-filter-3-line"></i></button>';

        h += '<button class="admin-btn btn-success" style="font-size:16px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:8px;flex-shrink:0" onclick="addLBEntry(' + compId + ')" title="\u6DFB\u52A0\u6218\u961F"><i class="ri-add-line"></i></button>';

    }

    h += '</div>';

    if (entries.length === 0) {

        h += '<div style="padding:30px;text-align:center;color:#86868b;font-size:15px">\u6682\u65E0\u79EF\u5206\u6570\u636E\uFF0C\u70B9\u51FB\u53F3\u4E0A\u89D2 + \u6DFB\u52A0\u6218\u961F</div>';

    } else {

        var winColor = '#4caf50';

        var loseColor = '#e74c3c';

        var outColor = '#9e9e9e';

        entries.forEach(function(e) {

            var bgColor = e.rank <= 4 ? 'rgba(76,175,80,0.10)' : e.rank <= 8 ? 'rgba(233,30,99,0.06)' : 'rgba(158,158,158,0.06)';

            var rankColor = e.rank <= 4 ? winColor : e.rank <= 8 ? loseColor : outColor;

            var nw = e.net_wins;

            var nwStr = nw > 0 ? '+' + nw : String(nw);

            var change = e.prev_rank > 0 ? e.prev_rank - e.rank : 0;

            var changeIcon = change > 0 ? '<span style="color:#4caf50">\u25B2' + change + '</span>' : change < 0 ? '<span style="color:#e74c3c">\u25BC' + Math.abs(change) + '</span>' : '<span style="color:#999">-</span>';

            h += '<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:' + bgColor + ';backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,0.35);box-shadow:inset 0 1px 1px rgba(255,255,255,0.35),0 2px 8px rgba(0,0,0,0.04);border-radius:12px;margin-bottom:6px' + (isAdmin ? ';cursor:pointer' : '') + '"' + (isAdmin ? ' onclick="editLBEntry(' + e.team_id + ',' + compId + ')"' : '') + '>';

            h += '<span style="font-size:18px;font-weight:700;color:' + rankColor + ';width:24px;text-align:center">' + e.rank + '</span>';

            if (e.team_logo) h += '<img src="' + e.team_logo + '" style="width:28px;height:28px;border-radius:6px;object-fit:contain;background:#f2f3f5">';

            h += '<span style="font-size:16px;font-weight:500;color:#1a1a1a;flex:1">' + (e.team_name || '?') + '</span>';

            h += '<span style="font-size:14px;color:#666">W' + e.wins + '</span>';

            h += '<span style="font-size:14px;color:#666">L' + e.losses + '</span>';

            h += '<span style="font-size:14px;color:#3478f6;font-weight:500">净' + nwStr + '</span>';

            var drawStr = e.draws > 0 ? '+' + e.draws : String(e.draws);

            h += '<span style="font-size:14px;color:#666">平' + drawStr + '</span>';

            h += '<span style="font-size:14px;width:28px;text-align:right">' + changeIcon + '</span>';

            h += '</div>';

        });

    }

    h += '</div>';

    document.getElementById('leaderboardContent').innerHTML = h;

    if (compOpts && compOpts.length > 0) {

        miuiSelect('lbCompSelect', compOpts, String(compId), function(val) {

            loadLeaderboardByComp(val);

        });

    }

}



async function showTeamFilterDialog() {

    var compId = getMiuiSelectValue('lbCompSelect');

    if (!compId) { showToast('\u8BF7\u5148\u9009\u62E9\u8D5B\u4E8B', 'error'); return; }

    var teams = await api('/teams');

    var selected = (_lbFilterIds || []).slice();

    var overlay = document.createElement('div');

    overlay.id = 'teamFilterOverlay';

    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10002;display:flex;align-items:center;justify-content:center';
    overlay.classList.add('dl-overlay');

    var rows = teams.map(function(t) {

        var checked = selected.indexOf(t.id) >= 0 ? ' checked' : '';

        var logo = t.logo_url ? '<img src="' + t.logo_url + '" style="height:26px;width:26px;object-fit:contain;border-radius:6px;background:#f2f3f5">' : '<span style="height:26px;width:26px;display:inline-flex;align-items:center;justify-content:center;background:#f2f3f5;border-radius:6px"><i class="ri-team-line"></i></span>';

        return '<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:#f8f9fa;border-radius:10px;margin-bottom:6px;cursor:pointer">' +

            '<input type="checkbox" class="tfTeam" value="' + t.id + '"' + checked + ' style="width:18px;height:18px">' + logo +

            '<span style="font-size:14px;color:#1a1a1a;flex:1">' + t.name + '</span></label>';

    }).join('');

    overlay.innerHTML = '<div class="dl-glass" style="width:88%;max-width:360px;padding:18px;animation:miuiFadeIn 0.2s" onclick="event.stopPropagation()">' +

        '<div style="font-size:16px;font-weight:600;margin-bottom:6px">\u7B5B\u9009\u79EF\u5206\u699C\u961F\u4F0D</div>' +

        '<div style="font-size:12px;color:#86868b;margin-bottom:10px">\u52FE\u9009\u7684\u961F\u4F0D\u624D\u4F1A\u663E\u793A\u5728\u79EF\u5206\u699C\u5185\uFF1B\u4E00\u4E2A\u90FD\u4E0D\u52FE = \u663E\u793A\u5168\u90E8</div>' +

        '<div style="display:flex;gap:8px;margin-bottom:10px">' +

        '<button class="admin-btn btn-sm" style="flex:1;padding:8px" onclick="tfSelectAll(true)">\u5168\u9009</button>' +

        '<button class="admin-btn btn-sm" style="flex:1;padding:8px" onclick="tfSelectAll(false)">\u6E05\u7A7A</button></div>' +

        '<div id="tfList" style="max-height:46vh;overflow-y:auto">' + rows + '</div>' +

        '<div style="display:flex;gap:10px;margin-top:12px">' +

        '<button class="admin-btn" style="flex:1;padding:10px" onclick="document.getElementById(\'teamFilterOverlay\').remove()">\u53D6\u6D88</button>' +

        '<button class="admin-btn" style="flex:2;padding:10px;background:#3478f6;color:#fff;border:none;border-radius:10px" onclick="tfSave()">\u4FDD\u5B58</button></div>' +

        '</div>';

    document.body.appendChild(overlay);

}



function tfSelectAll(all) {

    document.querySelectorAll('#tfList .tfTeam').forEach(function(c) { c.checked = all; });

}



async function tfSave() {

    var ids = Array.from(document.querySelectorAll('#teamFilterOverlay .tfTeam:checked')).map(function(c) { return parseInt(c.value); });

    var compId = getMiuiSelectValue('lbCompSelect');

    if (!compId) { showToast('\u8BF7\u5148\u9009\u62E9\u8D5B\u4E8B', 'error'); return; }

    try {

        await api('/leaderboard/' + compId + '/team-filter', 'PUT', { team_ids: ids });

        showToast(ids.length ? '\u7B5B\u9009\u5DF2\u4FDD\u5B58\uFF0C\u5171' + ids.length + '\u652F\u961F\u4F0D' : '\u5DF2\u6E05\u9664\u7B5B\u9009\uFF0C\u663E\u793A\u5168\u90E8\u961F\u4F0D', 'success');

        document.getElementById('teamFilterOverlay').remove();

        loadLeaderboardByComp(compId);

    } catch (e) { showToast(e.message, 'error'); }

}





async function loadLeaderboardByComp(compId) {

    try {

        var entries = await api('/leaderboard/' + compId + '/team');

        var teams = await api('/teams');

        var comps = await api('/competitions');

        var filterResp = await api('/leaderboard/' + compId + '/team-filter');

        _lbFilterIds = filterResp.team_ids || [];

        _lbAllTeams = teams;

        var allEntries = buildLeaderboardView(entries, teams, _lbFilterIds);

        var compOpts = comps.map(function(c) { return {value: String(c.id), label: c.name}; });

        renderLeaderboard(allEntries, compId, compOpts);

    } catch (e) {}

}



async function addLBEntry(compId) {

    var teams = await api('/teams');

    if (teams.length === 0) { showToast('\u5148\u521B\u5EFA\u961F\u4F0D', 'error'); return; }

    var teamOpts = teams.map(function(t) { return {value: String(t.id), label: t.name}; });

    var result = await miuiPromptMulti([

        {key:'team_id', label:'\u9009\u62E9\u6218\u961F', type:'select', options: teamOpts},

        {key:'wins', label:'\u80DC\u5229\u573A\u6570', type:'number', defaultValue:'0'},

        {key:'losses', label:'\u5931\u8D25\u573A\u6570', type:'number', defaultValue:'0'},

        {key:'net_wins', label:'\u51C0\u80DC\u5C40', type:'number', defaultValue:'0'},

        {key:'draws', label:'\u5E73\u5C40\u8BB0\u5F55', type:'number', defaultValue:'0'}

    ]);

    if (!result) return;

    var entries = await api('/leaderboard/' + compId + '/team');

    var newEntry = {team_id: parseInt(result.team_id), wins: parseInt(result.wins)||0, losses: parseInt(result.losses)||0, draws: parseInt(result.draws)||0, net_wins: parseInt(result.net_wins)||0};

    var allEntries = entries.map(function(e) { return {team_id: e.team_id, wins: e.wins, losses: e.losses, draws: e.draws, net_wins: e.net_wins}; });

    allEntries.push(newEntry);

    try {

        await api('/leaderboard/' + compId + '/team', 'PUT', {entries: allEntries});

        showToast('\u6DFB\u52A0\u6210\u529F', 'success');

        loadLeaderboardByComp(compId);

    } catch (e) { showToast(e.message, 'error'); }

}



async function editLBEntry(teamId, compId) {

    var entries = await api('/leaderboard/' + compId + '/team');

    var entry = entries.find(function(e) { return e.team_id === teamId; });

    if (!entry) entry = { team_id: teamId, wins: 0, losses: 0, draws: 0 };

    var result = await miuiPromptMulti([

        {key:'wins', label:'\u80DC\u5229\u573A\u6570', type:'number', defaultValue: String(entry.wins)},

        {key:'losses', label:'\u5931\u8D25\u573A\u6570', type:'number', defaultValue: String(entry.losses)},

        {key:'net_wins', label:'\u51C0\u80DC\u5C40', type:'number', defaultValue: String(entry.net_wins)},

        {key:'draws', label:'\u5E73\u5C40\u8BB0\u5F55', type:'number', defaultValue: String(entry.draws)}

    ]);

    if (!result) return;

    try {

        var newEntries = entries.map(function(e) {

            if (e.team_id === teamId) {

                return {team_id: e.team_id, wins: parseInt(result.wins)||0, losses: parseInt(result.losses)||0, draws: parseInt(result.draws)||0, net_wins: parseInt(result.net_wins)||0};

            }

            return {team_id: e.team_id, wins: e.wins, losses: e.losses, draws: e.draws, net_wins: e.net_wins};

        });

        await api('/leaderboard/' + compId + '/team', 'PUT', {entries: newEntries});

        showToast('\u66F4\u65B0\u6210\u529F', 'success');

        loadLeaderboardByComp(compId);

    } catch (e) { showToast(e.message, 'error'); }

}



// ========== 比赛录入比分 ==========

async function openMatchScore() {

    if (!currentUser || !currentUser.is_admin) { showToast('\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650', 'error'); return; }

    var input = document.createElement('input');

    input.type = 'date';

    input.style.display = 'none';

    document.body.appendChild(input);

    input.onchange = async function() {

        var date = input.value;

        input.remove();

        if (!date) return;

        var cid = getMiuiSelectValue('lbCompSelect');

        if (!cid) { showToast('\u8BF7\u5148\u9009\u62E9\u8D5B\u4E8B', 'error'); return; }

        await loadMatchScores(cid, date);

    };

    input.showPicker ? input.showPicker() : input.click();

}



var _matchScoreCompId = null;

var _matchScoreDate = '';

var _currentTeamMap = {};



async function loadMatchScores(compId, date) {

    _matchScoreCompId = compId;

    _matchScoreDate = date;

    var content = document.getElementById('leaderboardContent');

    content.innerHTML = '<div style="text-align:center;padding:20px;color:#999">\u52A0\u8F7D\u4E2D...</div>';

    try {

        var data = await api('/competitions/' + compId + '/full');

        var teams = await api('/teams');

        var teamNameToId = {};

        var teamIdToName = {};

        teams.forEach(function(t) { 

            teamNameToId[t.name.trim()] = t.id; 

            teamIdToName[t.id] = t.name; 

            teamNameToId[t.name.toLowerCase().trim()] = t.id; 

        });

        _currentTeamMap = teamIdToName;

        var dayMatches = data.matches.filter(function(m) { return m.match_date === date; });

        var existingScores = [];

        try { var resp = await fetch(API_BASE + '/leaderboard/' + compId + '/match-scores?date=' + date, { headers: authHeaders() }); existingScores = await resp.json(); } catch (e) {}

        var scoreMap = {};

        existingScores.forEach(function(s) {

            scoreMap[s.home_team_id + '_' + s.away_team_id] = s;

            scoreMap[s.away_team_id + '_' + s.home_team_id] = s;  // 主客颠倒也能匹配到同一场比赛

        });

        var h = '<div style="padding:0 16px 12px">';

        h += '<div style="font-size:14px;color:#86868b;margin-bottom:10px">' + date + ' \u7684\u6BD4\u8D5B</div>';

        if (dayMatches.length > 0) {

            dayMatches.forEach(function(m) {

                var homeId = teamNameToId[m.home_team] || teamNameToId[(m.home_team||'').toLowerCase().trim()] || 0;

                var awayId = teamNameToId[m.away_team] || teamNameToId[(m.away_team||'').toLowerCase().trim()] || 0;

                var score = normalizeScore(scoreMap[homeId + '_' + awayId], homeId);

                var bg = score.is_settled ? '#f5f5f5' : '#e8f4fd';

                h += '<div style="background:' + bg + ';border-radius:12px;padding:14px;margin-bottom:10px;cursor:pointer" onclick="editMatchScoreByTeams(' + homeId + ',' + awayId + ',\'' + date + '\')">';

                h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">';

                h += '<span style="font-size:18px;font-weight:600">' + (m.home_team||'?') + '</span>';

                var scoreText = matchScoreText(score);

                h += '<span style="font-size:22px;font-weight:700;color:#333;margin:0 12px">' + scoreText + '</span>';

                h += '<span style="font-size:18px;font-weight:600">' + (m.away_team||'?') + '</span>';

                h += '</div>';

                h += '<div style="display:flex;justify-content:space-between;font-size:13px;color:#888">';

                for (var b = 1; b <= 3; b++) {

                    var bs = (score['bo'+b+'_home']||0) + ':' + (score['bo'+b+'_away']||0);

                    if ((score['bo'+b+'_home']||0) === 0 && (score['bo'+b+'_away']||0) === 0) bs = '--';

                    h += '<span>BO' + b + ' ' + bs + '</span>';

                }

                h += '</div></div>';

            });

        } else {

            h += '<div style="padding:20px;text-align:center;color:#86868b;font-size:13px">\u8BE5\u65E5\u65E0\u8D5B\u7A0B</div>';

        }

        h += '</div>';

        content.innerHTML = h;

    } catch (e) { showToast('\u52A0\u8F7D\u5931\u8D25', 'error'); }

}



// 若记录的主客顺序与赛程相反, 翻转字段使显示与赛程一致

function normalizeScore(s, homeId) {

    if (!s || !s.id) return {};

    if (s.home_team_id === homeId) return s;

    var r = Object.assign({}, s);

    ['bo1', 'bo2', 'bo3', 'bo4'].forEach(function(k) {

        var h = r[k + '_home']; r[k + '_home'] = r[k + '_away']; r[k + '_away'] = h;

    });

    var t;

    t = r.home_wins; r.home_wins = r.away_wins; r.away_wins = t;

    t = r.home_net; r.home_net = r.away_net; r.away_net = t;

    t = r.home_draws; r.home_draws = r.away_draws; r.away_draws = t;

    return r;

}



// 列表展示用局比分(如2:0), 打过加赛则附加标注

function matchScoreText(s) {

    var gwH = 0, gwA = 0, hasOT = false;

    for (var b = 1; b <= 3; b++) {

        var hv = s['bo' + b + '_home'] || 0, av = s['bo' + b + '_away'] || 0;

        if (hv === 0 && av === 0) continue;

        if (hv > av) gwH++; else if (av > hv) gwA++;

    }

    if ((s.bo4_home || 0) + (s.bo4_away || 0) > 0) hasOT = true;

    return gwH + ':' + gwA + (hasOT ? '+\u52A0\u8D5B' : '');

}



async function editMatchScoreByTeams(homeId, awayId, date) {

    var scores = [];

    try {

        var resp = await fetch(API_BASE + '/leaderboard/' + _matchScoreCompId + '/match-scores?date=' + date, {

            headers: authHeaders()

        });

        scores = await resp.json();

    } catch (e) {}

    var existing = scores.find(function(s) {

        return (s.home_team_id === homeId && s.away_team_id === awayId) ||

               (s.home_team_id === awayId && s.away_team_id === homeId);

    });

    var scoreId;

    if (existing) {

        scoreId = existing.id;

        // 以记录中的主客顺序打开弹窗, 保证比分写入正确的队伍

        homeId = existing.home_team_id;

        awayId = existing.away_team_id;

    } else {

        try {

            var resp = await fetch(API_BASE + '/leaderboard/' + _matchScoreCompId + '/match-scores', {

                method: 'POST',

                headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),

                body: JSON.stringify({ competition_id: parseInt(_matchScoreCompId), match_date: _matchScoreDate, home_team_id: homeId, away_team_id: awayId })

            });

            var data = await resp.json();

            scoreId = data.id;

        } catch (e) { showToast(e.message, 'error'); return; }

    }

    openScoreDialog(scoreId, homeId, awayId);

}



function openScoreDialog(scoreId, homeId, awayId) {

    var overlay = document.createElement('div');

    overlay.id = 'scoreDialogOverlay';

    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center';
    overlay.classList.add('dl-overlay');

    overlay.onclick = async function(e) { if (e.target === overlay) { await saveScore(); overlay.remove(); loadMatchScores(_matchScoreCompId, _matchScoreDate); } };

    document.body.appendChild(overlay);

    overlay._scoreId = scoreId;

    overlay._homeId = homeId;

    overlay._awayId = awayId;

    renderScoreDialog(scoreId, homeId, awayId);

}



async function renderScoreDialog(scoreId, homeId, awayId) {

    var overlay = document.getElementById('scoreDialogOverlay');

    var score = null;

    try {

        var resp = await fetch(API_BASE + '/leaderboard/' + _matchScoreCompId + '/match-scores/' + scoreId, {

            headers: authHeaders()

        });

        score = await resp.json();

    } catch (e) {}

    var homeName = _currentTeamMap[homeId] || '';

    var awayName = _currentTeamMap[awayId] || '';



    var bo1H = -1, bo1A = -1, bo2H = -1, bo2A = -1, bo3H = -1, bo3A = -1, otH = -1, otA = -1;

    if (score && score.id) {

        var total = score.bo1_home + score.bo1_away + score.bo2_home + score.bo2_away + score.bo3_home + score.bo3_away;

        if (total > 0) {

            bo1H = score.bo1_home; bo1A = score.bo1_away;

            bo2H = score.bo2_home; bo2A = score.bo2_away;

            bo3H = score.bo3_home; bo3A = score.bo3_away;

        }

        if (score.bo4_home + score.bo4_away > 0) { otH = score.bo4_home; otA = score.bo4_away; }

        if (score.ot_winner_team_id) overlay._otWinner = Number(score.ot_winner_team_id);

    }



    overlay._scoreId = scoreId;

    var h = '<div class="dl-glass" onclick="event.stopPropagation()" style="width:90%;max-width:420px;padding:20px;animation:miuiFadeIn 0.2s">';

    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">';

    h += '<span style="font-size:18px;font-weight:600">' + homeName + ' vs ' + awayName + '</span>';

    h += '<span onclick="doSaveAndClose()" style="font-size:22px;color:#667eea;cursor:pointer">&#x2713;</span>';

    h += '</div>';

    h += renderBORow('BO1', 1, bo1H, bo1A, false);

    h += renderBORow('BO2', 2, bo2H, bo2A, true);

    h += renderBORow('BO3', 3, bo3H, bo3A, true);

    h += renderBORow('OT', 4, otH, otA, true);

    h += '<div id="boSummary" style="font-size:12px;color:#3478f6;text-align:center;margin-top:4px;min-height:16px"></div>';

    h += '<div style="font-size:11px;color:#aaa;text-align:center;margin-top:2px">\u524D\u9762=\u4E3B\u961F\u6293\u51E0\u4E2A \u540E\u9762=\u5BA2\u961F\u6293\u51E0\u4E2A</div>';

    h += '</div>';

    overlay.innerHTML = h;

    updateBOStates();

}



var _boScoreMap = {4: [5,0], 3: [3,1], 2: [2,2], 1: [1,3], 0: [0,5]};



function readBOValues(boNum) {

    var hEl = document.getElementById('bo' + boNum + 'Home');

    var aEl = document.getElementById('bo' + boNum + 'Away');

    if (!hEl || !aEl) return [-1, -1];

    return [parseInt(hEl.value), parseInt(aEl.value)];

}



function isBOFilled(v) { return v[0] >= 0 && v[1] >= 0; }



// 计算当前录入状态: 局胜场/总积分 + 各行可用性 (官方: 2胜即结束; 未分胜负比总积分; 总分相同才加赛)

function updateBOStates() {

    var overlay = document.getElementById('scoreDialogOverlay');

    if (!overlay) return;

    var v1 = readBOValues(1), v2 = readBOValues(2), v3 = readBOValues(3), v4 = readBOValues(4);

    var bo1F = isBOFilled(v1), bo2F = isBOFilled(v2), bo3F = isBOFilled(v3);

    var hw = 0, aw = 0, tp = 0, ta = 0;

    [v1, v2, v3].forEach(function(r) {

        if (!isBOFilled(r)) return;

        if (r[0] > r[1]) hw++; else if (r[1] > r[0]) aw++;

        tp += (_boScoreMap[r[0]] || [0,0])[0] + (_boScoreMap[r[1]] || [0,0])[1];

        ta += (_boScoreMap[r[0]] || [0,0])[1] + (_boScoreMap[r[1]] || [0,0])[0];

    });

    var decided = hw >= 2 || aw >= 2;

    var bo2Enabled = bo1F;

    var bo3Enabled = bo1F && bo2F && !decided;

    var otStage = bo3F && !decided && tp === ta;  // 总积分相同才需要加赛

    var otEnabled = otStage;

    setBORowEnabled(2, bo2Enabled);

    setBORowEnabled(3, bo3Enabled);

    setBORowEnabled(4, otEnabled);

    overlay._otStage = otStage;

    // 各局半场比分展示

    [1, 2, 3, 4].forEach(function(n) {

        var r = readBOValues(n);

        var el = document.getElementById('bo' + n + 'Result');

        if (!el) return;

        if (!isBOFilled(r)) { el.textContent = '--'; return; }

        var hR = _boScoreMap[r[0]] || [0, 0];

        var aR = _boScoreMap[r[1]] || [0, 0];

        el.textContent = hR[0] + ':' + hR[1] + ' / ' + aR[1] + ':' + aR[0];

    });

    // 总积分提示

    var sumEl = document.getElementById('boSummary');

    if (sumEl) {

        var homeName = _currentTeamMap[overlay._homeId] || '主队';

        var awayName = _currentTeamMap[overlay._awayId] || '客队';

        if (decided) {

            sumEl.textContent = (hw >= 2 ? homeName : awayName) + ' 已胜2局，比赛结束';

        } else if (bo3F) {

            if (tp !== ta) {

                sumEl.textContent = '总积分 ' + tp + ':' + ta + '，' + (tp > ta ? homeName : awayName) + '凭总积分获胜（无需加赛）';

            } else {

                sumEl.textContent = '总积分 ' + tp + ':' + ta + '，平局，进入加赛';

            }

        } else if (bo1F) {

            sumEl.textContent = '总积分 ' + tp + ':' + ta;

        } else {

            sumEl.textContent = '';

        }

    }

}



function setBORowEnabled(boNum, enabled) {

    var row = document.getElementById('boRow' + boNum);

    if (!row) return;

    row.style.opacity = enabled ? '1' : '0.5';

    row.style.background = enabled ? '#f8f9fa' : '#e0e0e0';

    var hEl = document.getElementById('bo' + boNum + 'Home');

    var aEl = document.getElementById('bo' + boNum + 'Away');

    if (hEl) hEl.disabled = !enabled;

    if (aEl) aEl.disabled = !enabled;

}



function renderBORow(label, boNum, homeScore, awayScore, disabled) {

    var dis = disabled ? 'disabled' : '';

    var bg = disabled ? '#e0e0e0' : '#f8f9fa';

    var opts = '<option value="-1">\u8BF7\u9009\u62E9</option>';

    for (var v = 0; v <= 4; v++) {

        opts += '<option value="' + v + '"' + (homeScore === v ? ' selected' : '') + '>' + v + '</option>';

    }

    var opts2 = '<option value="-1">\u8BF7\u9009\u62E9</option>';

    for (var v = 0; v <= 4; v++) {

        opts2 += '<option value="' + v + '"' + (awayScore === v ? ' selected' : '') + '>' + v + '</option>';

    }

    var scoreMap = _boScoreMap;

    var hResult = homeScore >= 0 ? (scoreMap[homeScore] || [0,0]) : [0,0];

    var aResult = awayScore >= 0 ? (scoreMap[awayScore] || [0,0]) : [0,0];

    var overlay = document.getElementById('scoreDialogOverlay');

    var homeName = _currentTeamMap[overlay._homeId] || '\u4E3B\u961F';

    var awayName = _currentTeamMap[overlay._awayId] || '\u5BA2\u961F';

    var h = '<div id="boRow' + boNum + '" style="display:flex;align-items:center;gap:4px;margin-bottom:8px;padding:8px;background:' + bg + ';border-radius:10px;opacity:' + (disabled ? '0.5' : '1') + '">';

    h += '<span style="font-size:14px;font-weight:600;width:36px">' + label + '</span>';

    h += '<select id="bo' + boNum + 'Home" onchange="calcBO(' + boNum + ')" ' + dis + ' style="width:42px;padding:5px;border:1px solid #e8edf5;border-radius:8px;text-align:center;font-size:13px;background:#fff">' + opts + '</select>';

    h += '<span style="font-size:11px;color:#86868b">' + homeName + '\u6293</span>';

    h += '<select id="bo' + boNum + 'Away" onchange="calcBO(' + boNum + ')" ' + dis + ' style="width:42px;padding:5px;border:1px solid #e8edf5;border-radius:8px;text-align:center;font-size:13px;background:#fff">' + opts2 + '</select>';

    h += '<span style="font-size:11px;color:#86868b">' + awayName + '\u6293</span>';

    var scoreDisplay = (homeScore >= 0 && awayScore >= 0) ? (hResult[0] + ':' + hResult[1] + ' / ' + aResult[1] + ':' + aResult[0]) : '--';

    h += '<span id="bo' + boNum + 'Result" style="font-size:14px;font-weight:700;margin-left:auto">' + scoreDisplay + '</span>';

    h += '</div>';

    return h;

}

function calcBO(boNum) {

    updateBOStates();

    var overlay = document.getElementById('scoreDialogOverlay');

    if (boNum === 4 && overlay._otStage) {

        var ot = readBOValues(4);

        if (isBOFilled(ot) && ot[0] === ot[1]) {

            // 加赛平局 -> 人工选定获胜方

            if (!overlay._otWinner) { showOTWinnerDialog(); return; }  // 等用户选完胜者后再save

        }

    }

    saveScore();

}



function showOTWinnerDialog() {

    var overlay = document.getElementById('scoreDialogOverlay');

    var homeName = _currentTeamMap[overlay._homeId] || '主场';

    var awayName = _currentTeamMap[overlay._awayId] || '客场';

    var h = '<div id="otWinnerDialog" style="position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center" class="dl-overlay" onclick="if(event.target===this)this.remove()">';

    h += '<div class="dl-glass" style="width:80%;max-width:300px;padding:20px;text-align:center" onclick="event.stopPropagation()">';

    h += '<div style="font-size:16px;font-weight:600;margin-bottom:16px">\u52A0\u8D5B\u5E73\u5C40\uFF0C\u8BF7\u9009\u62E9\u83B7\u80DC\u961F\u4F0D</div>';

    h += '<button onclick="pickOTWinner(\'' + overlay._homeId + '\')" style="width:100%;padding:12px;margin-bottom:8px;border-radius:10px;border:none;background:#3478f6;color:#fff;font-size:15px;cursor:pointer">' + homeName + '</button>';

    h += '<button onclick="pickOTWinner(\'' + overlay._awayId + '\')" style="width:100%;padding:12px;border-radius:10px;border:none;background:#3478f6;color:#fff;font-size:15px;cursor:pointer">' + awayName + '</button>';

    h += '</div></div>';

    overlay.insertAdjacentHTML('beforeend', h);

}



function pickOTWinner(teamId) {

    var dialog = document.getElementById('otWinnerDialog');

    if (dialog) dialog.remove();

    var overlay = document.getElementById('scoreDialogOverlay');

    overlay._otWinner = parseInt(teamId);  // 转为整数, 后端按数字比较队伍ID

    saveScore();

}



async function saveScore() {

    var overlay = document.getElementById('scoreDialogOverlay');

    if (!overlay || !overlay._scoreId) return;

    var scoreId = overlay._scoreId;

    var boScores = {};

    for (var i = 1; i <= 4; i++) {

        var hEl = document.getElementById('bo' + i + 'Home');

        var aEl = document.getElementById('bo' + i + 'Away');

        if (hEl && aEl) {

            var hVal = parseInt(hEl.value);

            var aVal = parseInt(aEl.value);

            boScores['bo' + i + '_home'] = hVal >= 0 ? hVal : 0;

            boScores['bo' + i + '_away'] = aVal >= 0 ? aVal : 0;

        } else {

            boScores['bo' + i + '_home'] = 0;

            boScores['bo' + i + '_away'] = 0;

        }

    }

    var overlay = document.getElementById('scoreDialogOverlay');

    var payload = Object.assign({}, boScores);

    if (overlay._otWinner) {

        payload.ot_winner_team_id = overlay._otWinner;

    }

    try {

        await fetch(API_BASE + '/leaderboard/' + _matchScoreCompId + '/match-scores/' + scoreId, {

            method: 'PUT',

            headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),

            body: JSON.stringify(payload)

        });

    } catch (e) {}

}



async function doSaveAndClose() {

    await saveScore();

    var el = document.getElementById('scoreDialogOverlay');

    if (el) el.remove();

    openLeaderboard();

}



async function closeScoreDialog() {

    await saveScore();

    var el = document.getElementById('scoreDialogOverlay');

    if (el) el.remove();

    loadMatchScores(_matchScoreCompId, _matchScoreDate);

}

function showFullSchedule() {

    showPage('schedule');

    loadFullSchedule();

}



async function loadFullSchedule() {

    try {

        var comps = await api('/competitions');

        var filterHtml = '<div id="scheduleFilterArea"><div class="filter-bar">';

        filterHtml += '<div id="schWeekFilter"></div><div id="schDayFilter"></div>';

        filterHtml += '</div></div>';

        document.getElementById('scheduleFilterArea').innerHTML = filterHtml;



        var allData = [];

        for (var ci = 0; ci < comps.length; ci++) {

            var data = await api('/competitions/' + comps[ci].id + '/full');

            allData.push(data);

        }



        var allWeeks = {}, allDays = {};

        allData.forEach(function(d) { d.matches.forEach(function(m) { allWeeks[m.week_number] = true; allDays[m.day_number] = true; }); });

        var weekOpts = [{value:'', label:'\u5168\u90E8\u5468'}];

        Object.keys(allWeeks).sort(function(a,b){return a-b;}).forEach(function(w) {

            weekOpts.push({value: String(w), label: w + '\u5468'});

        });

        miuiSelect('schWeekFilter', weekOpts, '', function() { renderFullSchedule(allData); });

        var dayNames = ['','\u5468\u4E00','\u5468\u4E8C','\u5468\u4E09','\u5468\u56DB','\u5468\u4E94','\u5468\u516D','\u5468\u65E5'];

        var dayOpts = [{value:'', label:'\u5168\u90E8\u65E5'}];

        Object.keys(allDays).sort(function(a,b){return a-b;}).forEach(function(d) {

            dayOpts.push({value: String(d), label: dayNames[d] || ('D' + d)});

        });

        miuiSelect('schDayFilter', dayOpts, '', function() { renderFullSchedule(allData); });

        renderFullSchedule(allData);

    } catch (e) { document.getElementById('scheduleContent').innerHTML = '<div style="padding:40px;text-align:center;color:#e74c3c">\u52A0\u8F7D\u5931\u8D25</div>'; }

}



function renderFullSchedule(allData) {

    var wf = getMiuiSelectValue('schWeekFilter') || '';

    var df = getMiuiSelectValue('schDayFilter') || '';

    var h = '';

    allData.forEach(function(data) {

        var filtered = data.matches;

        if (wf) filtered = filtered.filter(function(m) { return String(m.week_number) === wf; });

        if (df) filtered = filtered.filter(function(m) { return String(m.day_number) === df; });

        if (filtered.length === 0) return;

        h += '<div style="padding:12px 16px 4px;font-size:15px;font-weight:600;color:#1a1a1a">' + data.name + '</div>';

        filtered.forEach(function(m) {

            h += '<div style="margin:0 16px 4px">';

            h += '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fff;border-radius:10px;margin-bottom:4px;cursor:pointer" onclick="openCompetition(' + data.id + ',\'' + m.match_code + '\')">';

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



async function openCompetition(id, matchCode) {

    try {

        var data = await api('/competitions/' + id + '/full');

        currentCompetition = data;

        document.getElementById('matchTitle').textContent = data.name;

        showPage('match');

        renderFilterBar(data);

        if (matchCode) {

            var m = data.matches.find(function(x) { return x.match_code === matchCode; });

            if (m) {

                renderQuestions([m]);

                return;

            }

        }

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

            var multiTag = (q.max_selections || 1) > 1 ? '<span style="font-size:10px;color:#3478f6;background:#e8f4fd;padding:1px 6px;border-radius:4px;margin-left:6px;flex-shrink:0">\u591A\u9009\u00B7\u6700\u591A' + (q.max_selections || 1) + '\u9879</span>' : '';

            html += '<div class="question-text">' + q.question_text + multiTag + '</div></div>';

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

        if (q.question_type === 'timed') {

            document.getElementById('betMatchInfo').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:16px 0"><i class="ri-lightbulb-flash-line" style="font-size:26px;color:#f57c00"></i><div style="text-align:center"><div style="font-size:20px;font-weight:700;color:#1a1a1a">\u9650\u65F6\u7ADE\u731C</div><div style="font-size:12px;color:#86868b;margin-top:2px">' + timedWindow(q) + '</div></div></div>';

        } else {

            var homeLogoHtml = homeLogo ? '<img src="' + homeLogo + '" style="width:36px;height:36px;border-radius:10px;object-fit:contain;background:#f2f3f5">' : '<div style="width:36px;height:36px;border-radius:10px;background:#f2f3f5;display:flex;align-items:center;justify-content:center;font-size:13px;color:#86868b">?</div>';

            var awayLogoHtml = awayLogo ? '<img src="' + awayLogo + '" style="width:36px;height:36px;border-radius:10px;object-fit:contain;background:#f2f3f5">' : '<div style="width:36px;height:36px;border-radius:10px;background:#f2f3f5;display:flex;align-items:center;justify-content:center;font-size:13px;color:#86868b">?</div>';

            document.getElementById('betMatchInfo').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;gap:12px;padding:16px 0">' + homeLogoHtml + '<div style="text-align:center"><div style="font-size:20px;font-weight:700;color:#1a1a1a">' + (homeTeam || '?') + ' <span style="color:#86868b;font-weight:400">VS</span> ' + (awayTeam || '?') + '</div></div>' + awayLogoHtml + '</div>';

        }

        document.getElementById('betQuestionText').textContent = questionText || q.question_text;

        var oldMultiHint = document.getElementById('betMultiHint');

        if (oldMultiHint) oldMultiHint.remove();

        var betMaxSel = q.max_selections || 1;

        if (betMaxSel > 1) {

            var multiHint = document.createElement('div');

            multiHint.id = 'betMultiHint';

            multiHint.style.cssText = 'margin:0 16px 8px;padding:8px 12px;background:#e8f4fd;color:#3478f6;font-size:13px;border-radius:10px;font-weight:500';

            multiHint.textContent = '\u591A\u9009\u9898\uFF1A\u6700\u591A\u53EF\u9009 ' + betMaxSel + ' \u4E2A\u9009\u9879';

            document.getElementById('betQuestionText').insertAdjacentElement('afterend', multiHint);

        }

        document.getElementById('betBalance').textContent = currentUser.coins;

        var isCompleted = q.status === 'completed';

        var isClosed = q.status === 'closed';

        var isPending = q.status === 'pending';

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

        else if (isPending) html += '<div style="padding:12px 16px;font-size:13px;color:#86868b;background:#f7f8fa;border-radius:12px;margin:0 16px">\u6682\u672A\u5F00\u76D8\uFF0C' + fmtShort(q.open_time) + ' \u5F00\u542F\u6295\u5E01</div>';

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

        // 编辑昵称/CN由showEditProfileDialog弹窗负责(个人中心按钮化后页面内不再有editNickname/editCn输入框)

    } catch (e) { showToast('\u52A0\u8F7D\u5931\u8D25', 'error'); }

}



function openCoinTrend() {

    document.getElementById('coinTrendOverlay').style.display = 'flex';

    coinChartGroup = 'day';

    updateToggleBtn();

    loadCoinHistory();

}



function closeCoinTrend() {

    document.getElementById('coinTrendOverlay').style.display = 'none';

}



function toggleCoinChart() {

    coinChartGroup = coinChartGroup === 'day' ? 'week' : 'day';

    updateToggleBtn();

    loadCoinHistory();

}



function updateToggleBtn() {

    var dayBtn = document.getElementById('trendToggleDay');

    var weekBtn = document.getElementById('trendToggleWeek');

    if (!dayBtn) return;

    var isDay = coinChartGroup === 'day';

    dayBtn.style.background = isDay ? 'rgba(52,120,246,0.1)' : 'transparent';

    dayBtn.style.color = isDay ? '#3478f6' : '#86868b';

    dayBtn.style.fontWeight = isDay ? '600' : '500';

    weekBtn.style.background = !isDay ? 'rgba(52,120,246,0.1)' : 'transparent';

    weekBtn.style.color = !isDay ? '#3478f6' : '#86868b';

    weekBtn.style.fontWeight = !isDay ? '600' : '500';

}



var coinChartGroup = 'day';



async function loadCoinHistory() {

    try {

        var data = await api('/user/coin-history?group=' + coinChartGroup);

        drawCoinChart(data);

    } catch (e) {}

}



function drawCoinChart(data) {

    var canvas = document.getElementById('coinChart');

    if (!canvas || !data || data.length < 2) {

        if (canvas) { var c0 = canvas.getContext('2d'); c0.clearRect(0, 0, canvas.width, canvas.height); c0.fillStyle = '#b9c0cc'; c0.font = '14px -apple-system,sans-serif'; c0.textAlign = 'center'; c0.fillText('\u6682\u65E0\u7ED3\u7B97\u6570\u636E', canvas.width / 2, canvas.height / 2); }

        return;

    }

    var pts = data.slice(Math.max(data.length - 10, 0));

    var dpr = 2;

    canvas.width = 720 * dpr; canvas.height = 400 * dpr;

    canvas.style.width = '100%'; canvas.style.height = 'auto';

    var ctx = canvas.getContext('2d');

    ctx.scale(dpr, dpr);

    var w = 720, h = 400;

    var pad = { top: 56, right: 44, bottom: 56, left: 44 };

    ctx.clearRect(0, 0, w, h);



    var balances = pts.map(function(d) { return d.balance; });

    var minB = Math.min.apply(null, balances), maxB = Math.max.apply(null, balances);

    var range = maxB - minB;

    if (range < 100) { minB -= 60; maxB += 60; range = maxB - minB; }

    minB -= range * 0.18; maxB += range * 0.18;

    var dataLeft = pad.left + 26, chartW = w - dataLeft - pad.right, chartH = h - pad.top - pad.bottom;

    function xPos(i) { return dataLeft + (i / Math.max(pts.length - 1, 1)) * chartW; }

    function yPos(v) { return pad.top + (1 - (v - minB) / (maxB - minB)) * chartH; }



    ctx.strokeStyle = '#eef1f5'; ctx.lineWidth = 1;

    for (var g = 1; g <= 3; g++) {

        var gy = pad.top + chartH * g / 4;

        ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(w - pad.right, gy); ctx.stroke();

    }

    ctx.strokeStyle = '#dfe3ea';

    ctx.beginPath(); ctx.moveTo(pad.left, h - pad.bottom); ctx.lineTo(w - pad.right, h - pad.bottom); ctx.stroke();



    var grad = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);

    grad.addColorStop(0, 'rgba(0, 47, 167, 0.14)');

    grad.addColorStop(1, 'rgba(0, 47, 167, 0)');

    ctx.beginPath();

    ctx.moveTo(xPos(0), yPos(pts[0].balance));

    for (var i = 1; i < pts.length; i++) ctx.lineTo(xPos(i), yPos(pts[i].balance));

    ctx.lineTo(xPos(pts.length - 1), h - pad.bottom);

    ctx.lineTo(xPos(0), h - pad.bottom);

    ctx.closePath();

    ctx.fillStyle = grad; ctx.fill();



    for (var i = 1; i < pts.length; i++) {

        var st = pts[i].status || pts[i - 1].status || 'pending';

        ctx.beginPath();

        ctx.moveTo(xPos(i - 1), yPos(pts[i - 1].balance));

        ctx.lineTo(xPos(i), yPos(pts[i].balance));

        ctx.strokeStyle = st === 'pending' ? '#002FA7' : '#e74c3c';

        ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';

        ctx.stroke();

    }



    for (var i = 0; i < pts.length; i++) {

        if (i !== 0 && i !== pts.length - 1) continue;

        var px = xPos(i), py = yPos(pts[i].balance);

        var st = pts[i].status || 'pending';

        var col = st === 'pending' ? '#002FA7' : '#e74c3c';

        ctx.beginPath(); ctx.arc(px, py, i === pts.length - 1 ? 5.5 : 4.5, 0, Math.PI * 2);

        ctx.fillStyle = '#fff'; ctx.fill();

        ctx.lineWidth = 2.5; ctx.strokeStyle = col; ctx.stroke();

        ctx.fillStyle = col;

        ctx.font = (i === pts.length - 1 ? 'bold ' : '') + '14px -apple-system,sans-serif';

        ctx.textAlign = 'center';

        ctx.fillText(Math.round(pts[i].balance), px, py + (i === pts.length - 1 ? 22 : -14));

    }



    var step = Math.ceil(pts.length / 5);

    ctx.fillStyle = '#9aa3af'; ctx.font = '12px -apple-system,sans-serif'; ctx.textAlign = 'center';

    for (var i = 0; i < pts.length; i += step) {

        ctx.fillText(pts[i].label || '', xPos(i), h - pad.bottom + 24);

    }

}



function showEditProfileDialog() {

    var overlay = document.createElement('div');

    overlay.id = 'editProfileOverlay';

    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:10002;display:flex;align-items:center;justify-content:center';
    overlay.classList.add('dl-overlay');

    var glass = 'width:85%;max-width:340px;padding:22px';

    overlay.innerHTML = '<div class="dl-glass" style="' + glass + '" onclick="event.stopPropagation()">' +

        '<div style="font-size:16px;font-weight:600;margin-bottom:14px">\u7F16\u8F91\u8D44\u6599</div>' +

        '<div style="margin-bottom:12px"><div style="font-size:12px;color:#86868b;margin-bottom:5px">\u6635\u79F0</div>' +

        '<input id="dlgNickname" type="text" value="' + (currentUser.nickname || '') + '" placeholder="\u8BF7\u8F93\u5165\u6635\u79F0" style="width:100%;padding:11px;border:none;border-radius:10px;background:#f2f3f5;font-size:14px;box-sizing:border-box;outline:none"></div>' +

        '<div style="margin-bottom:16px"><div style="font-size:12px;color:#86868b;margin-bottom:5px">CN</div>' +

        '<input id="dlgCn" type="text" value="' + (currentUser.cn || '') + '" placeholder="\u8BF7\u8F93\u5165CN" style="width:100%;padding:11px;border:none;border-radius:10px;background:#f2f3f5;font-size:14px;box-sizing:border-box;outline:none"></div>' +

        '<div style="display:flex;gap:10px">' +

        '<button class="admin-btn" style="flex:1;padding:11px;border:none;border-radius:12px;background:#f2f3f5;font-size:14px;cursor:pointer" onclick="document.getElementById(\'editProfileOverlay\').remove()">\u53D6\u6D88</button>' +

        '<button class="admin-btn" style="flex:2;padding:11px;border:none;border-radius:12px;background:#3478f6;color:#fff;font-size:14px;font-weight:600;cursor:pointer" onclick="saveProfileDialog()">\u4FDD\u5B58</button></div>' +

        '</div>';

    document.body.appendChild(overlay);

}



async function saveProfileDialog() {

    var nn = document.getElementById('dlgNickname').value.trim();

    var cn = document.getElementById('dlgCn').value.trim();

    if (!nn) { showToast('\u8BF7\u8F93\u5165\u6635\u79F0', 'error'); return; }

    try {

        var resp = await api('/user/profile', 'PUT', { nickname: nn, cn: cn });

        if (resp.session_token) currentUser.session_token = resp.session_token;  // 令牌已轮换: 本浏览器续用新令牌, 其他浏览器被踢

        currentUser.nickname = nn; currentUser.cn = cn;

        localStorage.setItem('user', JSON.stringify(currentUser));

        document.getElementById('editProfileOverlay').remove();

        showToast('\u4FDD\u5B58\u6210\u529F', 'success');

        showProfile();

    } catch (e) { showToast(e.message, 'error'); }

}



function showChangePasswordDialog() {

    var overlay = document.createElement('div');

    overlay.id = 'chgPwdOverlay';

    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:10002;display:flex;align-items:center;justify-content:center';
    overlay.classList.add('dl-overlay');

    var glass = 'width:85%;max-width:340px;padding:22px';

    overlay.innerHTML = '<div class="dl-glass" style="' + glass + '" onclick="event.stopPropagation()">' +

        '<div style="font-size:16px;font-weight:600;margin-bottom:14px">\u4FEE\u6539\u5BC6\u7801</div>' +

        '<div style="margin-bottom:12px"><div style="font-size:12px;color:#86868b;margin-bottom:5px">\u539F\u5BC6\u7801</div>' +

        '<input id="dlgOldPwd" type="password" placeholder="\u8BF7\u8F93\u5165\u539F\u5BC6\u7801" style="width:100%;padding:11px;border:none;border-radius:10px;background:#f2f3f5;font-size:14px;box-sizing:border-box;outline:none"></div>' +

        '<div style="margin-bottom:12px"><div style="font-size:12px;color:#86868b;margin-bottom:5px">\u65B0\u5BC6\u7801</div>' +

        '<input id="dlgNewPwd" type="password" placeholder="\u8BF7\u8F93\u5165\u65B0\u5BC6\u7801" style="width:100%;padding:11px;border:none;border-radius:10px;background:#f2f3f5;font-size:14px;box-sizing:border-box;outline:none"></div>' +

        '<div style="margin-bottom:16px"><div style="font-size:12px;color:#86868b;margin-bottom:5px">\u786E\u8BA4\u65B0\u5BC6\u7801</div>' +

        '<input id="dlgConfirmPwd" type="password" placeholder="\u518D\u6B21\u8F93\u5165\u65B0\u5BC6\u7801" style="width:100%;padding:11px;border:none;border-radius:10px;background:#f2f3f5;font-size:14px;box-sizing:border-box;outline:none"></div>' +

        '<div style="display:flex;gap:10px">' +

        '<button class="admin-btn" style="flex:1;padding:11px;border:none;border-radius:12px;background:#f2f3f5;font-size:14px;cursor:pointer" onclick="document.getElementById(\'chgPwdOverlay\').remove()">\u53D6\u6D88</button>' +

        '<button class="admin-btn" style="flex:2;padding:11px;border:none;border-radius:12px;background:#3478f6;color:#fff;font-size:14px;font-weight:600;cursor:pointer" onclick="savePasswordDialog()">\u4FDD\u5B58</button></div>' +

        '</div>';

    document.body.appendChild(overlay);

}



async function savePasswordDialog() {

    var o = document.getElementById('dlgOldPwd').value.trim();

    var n = document.getElementById('dlgNewPwd').value.trim();

    var c = document.getElementById('dlgConfirmPwd').value.trim();

    if (!o || !n || !c) { showToast('\u8BF7\u586B\u5199\u5B8C\u6574', 'error'); return; }

    if (n !== c) { showToast('\u4E24\u6B21\u5BC6\u7801\u4E0D\u4E00\u81F4', 'error'); return; }

    try {

        var resp = await api('/user/password', 'PUT', { old_password: o, new_password: n });

        if (resp.session_token) { currentUser.session_token = resp.session_token; localStorage.setItem('user', JSON.stringify(currentUser)); }

        document.getElementById('chgPwdOverlay').remove();

        showToast('\u5BC6\u7801\u4FEE\u6539\u6210\u529F', 'success');

    } catch (e) { showToast(e.message, 'error'); }

}



function uploadAvatar() {

    var input = document.createElement('input');

    input.type = 'file'; input.accept = 'image/*';

    input.onchange = async function() {

        var file = input.files[0]; if (!file) return;

        var fd = new FormData(); fd.append('file', file);

        try {

            var res = await fetch(API_BASE + '/user/avatar', { method: 'POST', headers: authHeaders(), body: fd });

            var data = await res.json();

            if (!res.ok) throw new Error(data.error);

            if (data.session_token) currentUser.session_token = data.session_token;  // 头像变更令牌轮换, 保存新令牌

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

                    var canEdit = currentUser && (p.creator_id === currentUser.user_id || currentUser.is_superadmin);

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

    var isAdmin = currentUser && currentUser.is_admin;

    var h = '<div style="padding:12px 16px">';

    if (isAdmin) {

        h += '<button class="admin-btn btn-success" style="display:flex;align-items:center;gap:4px;padding:8px 14px;border-radius:10px;font-size:13px;margin-bottom:12px" onclick="addLivestream()"><i class="ri-add-circle-line"></i> \u6DFB\u52A0\u76F4\u64AD</button>';

    }

    try {

        var livestreams = await api('/livestreams');

        for (var i = 0; i < livestreams.length; i++) {

            var ls = livestreams[i];

            var coverUrl = ls.cover_url || '';

            h += '<div class="livestream-card" data-id="' + ls.id + '" style="background:#fff;border-radius:14px;overflow:hidden;margin-bottom:10px;cursor:pointer" onclick="window.open(\'' + ls.url + '\',\'_blank\')" oncontextmenu="onLivestreamLongPress(event,' + ls.id + ')">';

            h += '<div style="height:160px;background:#f2f3f5;display:flex;align-items:center;justify-content:center">';

            if (coverUrl) {

                h += '<img src="' + coverUrl + '" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.style.display=\'none\'">';

            }

            h += '</div>';

            h += '<div style="padding:10px 14px"><div style="font-size:15px;font-weight:500;color:#1a1a1a">' + ls.name + '</div>';

            if (ls.intro) h += '<div style="font-size:12px;color:#86868b;margin-top:4px;line-height:1.4">' + ls.intro + '</div>';

            h += '</div></div>';

        }

        if (livestreams.length === 0) h += '<div style="padding:40px;text-align:center;color:#86868b">\u6682\u65E0\u63A8\u8350\u76F4\u64AD</div>';

    } catch (e) {}

    h += '</div>';

    document.getElementById('livestreamContent').innerHTML = h;

    document.querySelectorAll('.livestream-card').forEach(function(card) {

        var timer = null;

        card.addEventListener('touchstart', function(e) { timer = setTimeout(function() { onLivestreamLongPress(null, parseInt(card.dataset.id)); }, 500); });

        card.addEventListener('touchend', function() { clearTimeout(timer); });

        card.addEventListener('touchmove', function() { clearTimeout(timer); });

    });

}



async function onLivestreamLongPress(e, id) {

    if (e) e.preventDefault();

    if (!currentUser || !currentUser.is_admin) return;

    var result = await new Promise(function(resolve) {

        var h = '<div id="miuiDialog" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.35);z-index:10000;display:flex;align-items:center;justify-content:center" class="dl-overlay" onclick="if(event.target===this)closeMiuiDialog(false)">';

        h += '<div style="background:#fff;border-radius:16px;padding:24px 20px 16px;width:85%;max-width:340px;animation:miuiFadeIn 0.2s" onclick="event.stopPropagation()">';

        h += '<div style="font-size:16px;font-weight:500;color:#1a1a1a;text-align:center;margin-bottom:16px">\u7F16\u8F91\u76F4\u64AD</div>';

        h += '<div style="margin-bottom:12px"><div style="font-size:13px;color:#86868b;margin-bottom:6px;font-weight:500">\u540D\u79F0</div><input id="lsEditName" type="text" style="width:100%;padding:11px;border:none;border-radius:10px;background:#f2f3f5;font-size:14px;box-sizing:border-box;outline:none"></div>';

        h += '<div style="margin-bottom:12px"><div style="font-size:13px;color:#86868b;margin-bottom:6px;font-weight:500">\u4ECB\u7ECD</div><input id="lsEditIntro" type="text" style="width:100%;padding:11px;border:none;border-radius:10px;background:#f2f3f5;font-size:14px;box-sizing:border-box;outline:none"></div>';

        h += '<div style="margin-bottom:12px"><div style="font-size:13px;color:#86868b;margin-bottom:6px;font-weight:500">\u5E73\u53F0</div><input id="lsEditPlatform" type="text" placeholder="bilibili/huya" style="width:100%;padding:11px;border:none;border-radius:10px;background:#f2f3f5;font-size:14px;box-sizing:border-box;outline:none"></div>';

        h += '<div style="margin-bottom:12px"><div style="font-size:13px;color:#86868b;margin-bottom:6px;font-weight:500">\u623F\u95F4ID</div><input id="lsEditRoom" type="text" style="width:100%;padding:11px;border:none;border-radius:10px;background:#f2f3f5;font-size:14px;box-sizing:border-box;outline:none"></div>';

        h += '<div style="margin-bottom:16px"><div style="font-size:13px;color:#86868b;margin-bottom:6px;font-weight:500">\u94FE\u63A5</div><input id="lsEditUrl" type="text" style="width:100%;padding:11px;border:none;border-radius:10px;background:#f2f3f5;font-size:14px;box-sizing:border-box;outline:none"></div>';

        h += '<div style="display:flex;border-top:0.5px solid #f2f3f5">';

        h += '<button onclick="closeMiuiDialog(null)" style="flex:1;color:#e74c3c;font-size:15px;font-weight:500;background:none;border:none;padding:12px;cursor:pointer;border-right:0.5px solid #f2f3f5">\u5220\u9664</button>';

        h += '<button id="miuiDialogOk" style="flex:1;color:#3478f6;font-size:15px;font-weight:500;background:none;border:none;padding:12px;cursor:pointer">\u4FDD\u5B58</button>';

        h += '</div></div></div>';

        document.body.insertAdjacentHTML('beforeend', h);

        document.getElementById('miuiDialog')._resolve = resolve;

        api('/livestreams').then(function(list) {

            var item = list.find(function(x) { return x.id === id; });

            if (item) {

                document.getElementById('lsEditName').value = item.name || '';

                document.getElementById('lsEditIntro').value = item.intro || '';

                document.getElementById('lsEditPlatform').value = item.platform || '';

                document.getElementById('lsEditRoom').value = item.room_id || '';

                document.getElementById('lsEditUrl').value = item.url || '';

            }

        });

        document.getElementById('miuiDialogOk').onclick = function() {

            closeMiuiDialog({

                name: document.getElementById('lsEditName').value,

                intro: document.getElementById('lsEditIntro').value,

                platform: document.getElementById('lsEditPlatform').value,

                room_id: document.getElementById('lsEditRoom').value,

                url: document.getElementById('lsEditUrl').value

            });

        };

    });

    if (result === null) {

        if (await miuiConfirm('\u786E\u5B9A\u5220\u9664\u8BE5\u76F4\u64AD\uFF1F')) {

            try { await api('/admin/livestreams/' + id, 'DELETE'); showToast('\u5DF2\u5220\u9664', 'success'); showLivestream(); }

            catch (e) { showToast(e.message, 'error'); }

        }

    } else if (result) {

        if (result.platform && result.room_id) result.cover_url = await fetchCover(result.platform, result.room_id);

        try { await api('/admin/livestreams/' + id, 'PUT', result); showToast('\u5DF2\u66F4\u65B0', 'success'); showLivestream(); }

        catch (e) { showToast(e.message, 'error'); }

    }

}



async function fetchCover(platform, roomId) {

    if (!platform || !roomId) return '';

    try { var c = await api('/livestream/cover?platform=' + platform + '&room_id=' + roomId); return c.cover || ''; } catch (e) { return ''; }

}



async function addLivestream() {

    var result = await miuiPromptMulti([

        {key:'name',label:'\u76F4\u64AD\u540D\u79F0',placeholder:'\u5982 \u5B98\u65B9-\u4E2D\u7B49\u538B\u529B'},

        {key:'intro',label:'\u4ECB\u7ECD',placeholder:'\u53EF\u9009'},

        {key:'platform',label:'\u5E73\u53F0',type:'select',options:[{value:'bilibili',label:'B\u7AD9'},{value:'huya',label:'\u864E\u7259'}]},

        {key:'room_id',label:'\u623F\u95F4ID',placeholder:'\u5982 5555'},

        {key:'url',label:'\u94FE\u63A5',placeholder:'\u5982 https://live.bilibili.com/5555'}

    ]);

    if (!result || !result.name) return;

    result.cover_url = await fetchCover(result.platform, result.room_id);

    try { await api('/admin/livestreams', 'POST', result); showToast('\u6DFB\u52A0\u6210\u529F', 'success'); showLivestream(); }

    catch (e) { showToast(e.message, 'error'); }

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

        currentUser = data;

    } catch (e) { showToast('\u9A8C\u8BC1\u5931\u8D25', 'error'); return; }




    showPage('admin');

    // Super admin buttons

    var navRight = document.getElementById('adminNavRight');

    if (currentUser.is_superadmin) {

        navRight.innerHTML = '<button class="admin-btn btn-sm" style="font-size:16px;width:30px;height:30px;padding:0;display:flex;align-items:center;justify-content:center" onclick="exportData()" title="\u5BFC\u51FA\u6570\u636E"><i class="ri-download-line"></i></button>' +

            '<button class="admin-btn btn-sm" style="font-size:16px;width:30px;height:30px;padding:0;display:flex;align-items:center;justify-content:center" onclick="importData()" title="\u5BFC\u5165\u6570\u636E"><i class="ri-upload-line"></i></button>';

    } else {

        navRight.innerHTML = '';

    }

    switchAdminTab('users');

}



async function exportData() {

    try {

        var resp = await fetch(API_BASE + '/admin/export', { headers: authHeaders() });

        if (!resp.ok) { var err = await resp.json(); throw new Error(err.error || '\u5BFC\u51FA\u5931\u8D25'); }

        var blob = await resp.blob();

        var url = URL.createObjectURL(blob);

        var a = document.createElement('a');

        a.href = url;

        a.download = 'backup_' + new Date().toISOString().split('T')[0] + '.json';

        a.click();

        URL.revokeObjectURL(url);

        showToast('\u5907\u4EFD\u5DF2\u4E0B\u8F7D', 'success');

    } catch (e) { showToast('\u5BFC\u51FA\u5931\u8D25: ' + e.message, 'error'); }

}



async function importData() {

    var input = document.createElement('input');

    input.type = 'file';

    input.accept = '.json';

    input.onchange = async function() {

        var file = input.files[0];

        if (!file) return;

        if (!(await miuiConfirm('\u5BFC\u5165\u5C06\u8986\u76D6\u73B0\u6709\u6570\u636E\uFF0C\u786E\u5B9A\uFF1F'))) return;

        var pwd = await promptAdminPassword();

        if (!pwd) return;

        try {

            showToast('\u5BFC\u5165\u4E2D...', 'success');

            var text = await file.text();

            var resp = await fetch(API_BASE + '/admin/import', {

                method: 'POST',

                headers: Object.assign({ 'Content-Type': 'application/json', 'X-Admin-Password': pwd }, authHeaders()),

                body: text

            });

            var result;

            try { result = await resp.json(); } catch (e) { throw new Error('\u670D\u52A1\u5668\u8FD4\u56DE\u9519\u8BEF (' + resp.status + ')\uFF0C\u8BF7\u786E\u8BA4\u5DF2\u62C9\u53D6\u6700\u65B0\u4EE3\u7801\u5E76\u91CD\u52A0Web\u5E94\u7528'); }

            if (!resp.ok) throw new Error(result.error || '\u5BFC\u5165\u5931\u8D25');

            showToast('\u5BFC\u5165\u6210\u529F', 'success');

        } catch (e) { showToast('\u5BFC\u5165\u5931\u8D25: ' + e.message, 'error'); }

    };

    input.click();

}



function switchAdminTab(tab, event) {

    currentAdminTab = tab;

    document.querySelectorAll('.admin-tabs .tab').forEach(function(t) { t.classList.remove('active'); });

    var names = { users: '\u7528\u6237', teams: '\u961F\u4F0D', matches: '\u8D5B\u7A0B', questions: '\u7ADE\u731C', logs: '\u65E5\u5FD7' };

    if (event && event.target) { var t = event.target.closest ? event.target.closest('.tab') : null; if (t) t.classList.add('active'); }

    else {

        document.querySelectorAll('.admin-tabs .tab').forEach(function(t) { if (t.textContent.trim() === names[tab]) t.classList.add('active'); });

    }

    // 顶栏显示当前分类名称
    var navTitle = document.querySelector('#adminPage .nav-title');
    if (navTitle && names[tab]) navTitle.textContent = names[tab];

    if (tab === 'users') loadAdminUsers();

    else if (tab === 'teams') loadAdminTeams();

    else if (tab === 'matches') loadAdminMatches();

    else if (tab === 'questions') loadAdminQuestions();

    else if (tab === 'logs') loadAdminLogs();

}



function promptAdminPassword() {
    return new Promise(function(resolve) {
        var overlay = document.createElement('div');
        overlay.id = 'consolePwdOverlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:10003;display:flex;align-items:center;justify-content:center';
    overlay.classList.add('dl-overlay');
        var glass = 'width:85%;max-width:320px;padding:24px';
        overlay.innerHTML = '<div class="dl-glass" style="' + glass + '">' +
            '<div style="font-size:16px;font-weight:600;margin-bottom:6px">\u7BA1\u7406\u5BC6\u7801\u9A8C\u8BC1</div>' +
            '<div style="font-size:12px;color:#86868b;margin-bottom:14px">\u6B64\u64CD\u4F5C\u9700\u8981\u9A8C\u8BC1\u7BA1\u7406\u5BC6\u7801</div>' +
            '<input id="consolePwd" type="password" placeholder="\u8BF7\u8F93\u5165\u7BA1\u7406\u5BC6\u7801" style="width:100%;padding:12px;border:none;border-radius:10px;background:#f2f3f5;font-size:14px;box-sizing:border-box;outline:none;margin-bottom:14px">' +
            '<div style="display:flex;gap:10px">' +
            '<button class="admin-btn" id="pwdCancelBtn" style="flex:1;padding:11px;border:none;border-radius:12px;background:#f2f3f5;font-size:14px;cursor:pointer">\u53D6\u6D88</button>' +
            '<button class="admin-btn" id="pwdOkBtn" style="flex:2;padding:11px;border:none;border-radius:12px;background:#3478f6;color:#fff;font-size:14px;font-weight:600;cursor:pointer">\u786E\u8BA4</button></div>' +
            '</div>';
        document.body.appendChild(overlay);
        var inp = document.getElementById('consolePwd');
        setTimeout(function() { if (inp) inp.focus(); }, 100);
        inp.addEventListener('keydown', function(e) { if (e.key === 'Enter') document.getElementById('pwdOkBtn').click(); });
        document.getElementById('pwdCancelBtn').onclick = function() { overlay.remove(); resolve(null); };
        document.getElementById('pwdOkBtn').onclick = function() {
            var pwd = inp.value;
            if (!pwd) { showToast('\u8BF7\u8F93\u5165\u5BC6\u7801', 'error'); return; }
            overlay.remove();
            resolve(pwd);
        };
        overlay.addEventListener('click', function(e) { if (e.target === overlay) { overlay.remove(); resolve(null); } });
    });
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

            var isTargetSuper = u.is_superadmin;

            h += '<div style="background:#fff;border-radius:14px;padding:14px;margin-bottom:8px">';

            h += '<div style="display:flex;justify-content:space-between;align-items:center">';

            h += '<div><div style="font-size:15px;font-weight:500;color:#1a1a1a">' + (u.nickname || '\u672A\u547D\u540D') + (isTargetSuper ? ' <span style="font-size:11px;color:#3478f6;background:#e8f4fd;padding:2px 6px;border-radius:4px">\u8D85\u7EA7\u7BA1\u7406</span>' : '') + (u.is_admin && !isTargetSuper ? ' <span style="font-size:11px;color:#f57c00;background:#fff8e1;padding:2px 6px;border-radius:4px">\u7BA1\u7406\u5458</span>' : '') + (u.is_debug ? ' <span style="font-size:11px;color:#7b1fa2;background:#f3e5f5;padding:2px 6px;border-radius:4px">\u8C03\u8BD5</span>' : '') + '</div>';

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

    var pwd = await promptAdminPassword();

    if (!pwd) return;

    try { await api('/admin/users/' + uid, 'DELETE', null, { 'X-Admin-Password': pwd }); showToast('\u5220\u9664\u6210\u529F', 'success'); loadAdminUsers(); }

    catch (e) { showToast(e.message, 'error'); }

}



async function toggleAdmin(uid, isA) {

    try { await api('/admin/users/' + uid + '/admin', 'PUT', { is_admin: isA }); showToast('\u6210\u529F', 'success'); loadAdminUsers(); }

    catch (e) { showToast(e.message, 'error'); }

}



async function toggleDebug(uid, flag) {

    try {

        await api('/admin/users/' + uid + '/admin', 'PUT', { is_debug: flag });

        showToast(flag ? '\u5DF2\u8BBE\u4E3A\u8C03\u8BD5\u8D26\u53F7' : '\u5DF2\u53D6\u6D88\u8C03\u8BD5\u6807\u7B7E', 'success');

        loadAdminUsers();

    } catch (e) { showToast(e.message, 'error'); }

}



async function adjustCoins(uid) {

    var result = await new Promise(function(resolve) {

        var h = '<div id="miuiDialog" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.35);z-index:10000;display:flex;align-items:center;justify-content:center" class="dl-overlay" onclick="if(event.target===this)closeMiuiDialog()">';

        h += '<div class="dl-glass" style="width:85%;max-width:320px;padding:24px 20px 16px;animation:miuiFadeIn 0.2s">';

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

        var teams = await api('/teams');

        var h = '<div class="admin-section">';

        teams.forEach(function(t) {

            var logoUrl = t.logo_url || '';  // 相对地址(/api/img/...或/uploads/...)按当前站点解析, 不再拼接旧域名

            h += '<div style="background:#fff;border-radius:14px;padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:10px">';

            if (logoUrl) h += '<img src="' + logoUrl + '" style="height:36px;width:36px;object-fit:contain;border-radius:8px;flex-shrink:0">';

            else h += '<div style="height:36px;width:36px;background:#f2f3f5;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;color:#86868b;flex-shrink:0"><i class="ri-team-line"></i></div>';

            h += '<div style="flex:1;font-size:15px;font-weight:500;color:#1a1a1a">' + t.name + '</div>';

            h += '<div style="display:flex;gap:6px;flex-shrink:0">';

            h += '<button class="admin-btn btn-sm" style="font-size:16px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="uploadTeamLogo(' + t.id + ')" title="Logo"><i class="ri-image-line"></i></button>';

            h += '<button class="admin-btn btn-danger" style="font-size:16px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="deleteTeam(' + t.id + ')" title="\u5220\u9664"><i class="ri-delete-bin-line"></i></button>';

            h += '</div></div>';

        });

        h += '<button class="admin-btn btn-success" onclick="addTeam()" style="width:100%;margin-top:8px;margin-left:0;padding:12px;border-radius:12px;font-size:15px"><i class="ri-add-circle-line"></i> \u6DFB\u52A0\u961F\u4F0D</button>';

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

            var res = await fetch(API_BASE + '/admin/teams/' + tid + '/logo', { method: 'POST', headers: authHeaders(), body: fd });

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

var adminCompsCache = [];  // 工作台赛事列表缓存(含is_default, 供星标状态使用)

async function toggleDefaultComp(selectId) {

    var cid = getMiuiSelectValue(selectId);

    if (!cid) { showToast('\u8BF7\u5148\u9009\u62E9\u8D5B\u4E8B', 'error'); return; }

    try {

        var r = await api('/admin/competitions/' + cid + '/default', 'PUT');

        adminCompsCache.forEach(function(c) { c.is_default = String(c.id) === cid ? r.is_default : false; });

        showToast(r.is_default ? '\u5DF2\u8BBE\u4E3A\u9ED8\u8BA4\u8D5B\u7A0B(\u5168\u4F53\u7528\u6237\u751F\u6548)' : '\u5DF2\u53D6\u6D88\u9ED8\u8BA4\u8D5B\u7A0B', 'success');

        updateCompStarIcon(selectId);

    } catch (e) { showToast(e.message, 'error'); }

}

function updateCompStarIcon(selectId) {

    var btn = document.getElementById(selectId + '_star');

    if (!btn) return;

    var cid = getMiuiSelectValue(selectId);

    var isDef = false;

    adminCompsCache.forEach(function(c) { if (String(c.id) === cid && c.is_default) isDef = true; });

    btn.innerHTML = '<i class="' + (isDef ? 'ri-star-fill' : 'ri-star-line') + '"' + (isDef ? ' style="color:#f57c00"' : '') + '></i>';

}

function pickInitialComp(comps) {

    for (var i = 0; i < comps.length; i++) { if (comps[i].is_default) return String(comps[i].id); }

    return comps.length > 0 ? String(comps[0].id) : '';

}

async function loadAdminMatches() {

    try {

        var comps = await api('/competitions');

        adminCompsCache = comps;

        var h = '<div class="admin-section"><div class="admin-select-wrap">';

        h += '<span>\u9009\u62E9\u8D5B\u4E8B\uFF1A</span>';

        h += '<div id="matchCompSelect"></div>';

        h += '<button id="matchCompSelect_star" class="admin-btn" style="font-size:16px;width:34px;height:34px;padding:0;margin-left:0;display:flex;align-items:center;justify-content:center;background:transparent" onclick="toggleDefaultComp(\'matchCompSelect\')" title="\u8bbe\u4e3a\u9ed8\u8ba4\u8d5b\u7a0b(\u8d5b\u7a0b/\u7ade\u731c\u9875\u9ed8\u8ba4\u9009\u4e2d)"><i class="ri-star-line" style="color:#86868b"></i></button>';

        h += '<button class="admin-btn btn-success" style="font-size:16px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="createCompetitionWeb()" title="\u521B\u5EFA\u8D5B\u4E8B"><i class="ri-add-circle-line"></i></button></div>';

        h += '<div id="matchContent"></div></div>';

        document.getElementById('adminContent').innerHTML = h;

        var opts = comps.map(function(c) { return {value: String(c.id), label: c.name}; });

        miuiSelect('matchCompSelect', opts, pickInitialComp(comps), function(val) { onMatchCompChange(); updateCompStarIcon('matchCompSelect'); });

        updateCompStarIcon('matchCompSelect');

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

        h += '<div style="display:flex;gap:8px;margin-bottom:8px"><div id="matchWeekFilter"></div><div id="matchDayFilter"></div></div>';

        h += '<div id="matchListContent"></div>';

        h += '<button class="admin-btn btn-success" onclick="addNewMatch(' + cid + ')" style="width:100%;margin-top:8px;padding:12px;border-radius:12px;font-size:15px">\u2795 \u624B\u52A8\u6DFB\u52A0\u6BD4\u8D5B</button>';

        h += '</div>';

        c.innerHTML = h;

        var weeks = {}, days = {};

        data.matches.forEach(function(m) { weeks[m.week_number] = true; days[m.day_number] = true; });

        var weekOpts = [{value:'',label:'\u5168\u90E8\u5468'}];

        Object.keys(weeks).sort(function(a,b){return a-b;}).forEach(function(w) { weekOpts.push({value:String(w),label:w+'\u5468'}); });

        miuiSelect('matchWeekFilter', weekOpts, '', function() { renderMatchList(data, cid); });

        var dayNames = ['','\u5468\u4E00','\u5468\u4E8C','\u5468\u4E09','\u5468\u56DB','\u5468\u4E94','\u5468\u516D','\u5468\u65E5'];

        var dayOpts = [{value:'',label:'\u5168\u90E8\u65E5'}];

        Object.keys(days).sort(function(a,b){return a-b;}).forEach(function(d) { dayOpts.push({value:String(d),label:dayNames[d]||('D'+d)}); });

        miuiSelect('matchDayFilter', dayOpts, '', function() { renderMatchList(data, cid); });

        renderMatchList(data, cid);

    } catch (e) { c.innerHTML = '<div style="color:red;padding:20px">\u52A0\u8F7D\u5931\u8D25</div>'; }

}



function renderMatchList(data, cid) {

    var wf = getMiuiSelectValue('matchWeekFilter') || '';

    var df = getMiuiSelectValue('matchDayFilter') || '';

    var h = '';

    data.matches.forEach(function(m) {

        if (wf && String(m.week_number) !== wf) return;

        if (df && String(m.day_number) !== df) return;

        h += '<div id="matchcard_' + m.id + '" style="background:#fff;border-radius:12px;padding:12px;margin-bottom:6px">';

        h += '<div style="display:flex;justify-content:space-between;align-items:center">';

        h += '<div><div style="font-size:15px;font-weight:500;color:#1a1a1a">' + (m.home_team || '?') + ' vs ' + (m.away_team || '?') + '</div>';

        h += '<div style="font-size:11px;color:#86868b;margin-top:2px">';

        if (m.match_date) h += '<i class="ri-calendar-line" style="margin-right:2px"></i>' + m.match_date.substring(5) + ' ';

        var wdNames = ['','\u5468\u4E00','\u5468\u4E8C','\u5468\u4E09','\u5468\u56DB','\u5468\u4E94','\u5468\u516D','\u5468\u65E5'];

        h += 'W' + m.week_number + ' ' + (wdNames[m.day_number] || 'D' + m.day_number) + ' M' + m.match_number + '</div></div>';

        h += '<div style="display:flex;gap:4px;flex-shrink:0">';

        h += '<button class="admin-btn btn-sm" style="font-size:16px;width:30px;height:30px;padding:0;display:flex;align-items:center;justify-content:center" onclick="editMatchDialog(' + m.id + ',' + cid + ')" title="\u7F16\u8F91"><i class="ri-edit-line"></i></button>';

        h += '<button class="admin-btn btn-danger" style="font-size:16px;width:30px;height:30px;padding:0;display:flex;align-items:center;justify-content:center" onclick="deleteMatchWeb(' + m.id + ')" title="\u5220\u9664"><i class="ri-delete-bin-line"></i></button>';

        h += '</div></div></div>';

    });

    if (!h) h = '<div style="padding:20px;text-align:center;color:#86868b">\u65E0\u5339\u914D\u6BD4\u8D5B</div>';

    document.getElementById('matchListContent').innerHTML = h;

}



function calcDayNumber(weekday, weekNum, matches, startDate) {

    return weekday;

}



function getWeekdayNum(match) {

    return match.day_number;

}



async function editMatchDialog(matchId, compId) {

    var data = await api('/competitions/' + compId + '/full');

    var match = data.matches.find(function(m) { return m.id === matchId; });

    if (!match) return;

    var teams = await api('/teams');

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

    var newDay = calcDayNumber(newWd, newWeek, data.matches, data.start_date);

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

            if (!cid) { showToast('\u8BF7\u5148\u9009\u62E9\u8D5B\u4E8B', 'error'); return; }

            var compData = await api('/competitions/' + cid + '/full');

            var existMap = {};

            compData.matches.forEach(function(m) { existMap[m.week_number + '_' + m.day_number + '_' + m.match_number] = m; });

            var count = 0;

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

                    var dayNum = calcDayNumber(wd, week, compData.matches, compData.start_date);

                    var key = week + '_' + dayNum + '_' + match;

                    if (existMap[key]) {

                        await api('/admin/matches/' + existMap[key].id, 'PUT', { home_team: home, away_team: away });

                    } else {

                        await api('/admin/matches', 'POST', { competition_id: parseInt(cid), week_number: week, day_number: dayNum, match_number: match, home_team: home, away_team: away });

                    }

                    count++;

                } catch (e) { console.error('Import error row', i, e.message); }

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

    var teams = await api('/teams');

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

        var dayNum = calcDayNumber(wd, w, data.matches, data.start_date);

        await api('/admin/matches', 'POST', { competition_id: cid, week_number: w, day_number: dayNum, match_number: m, home_team: home, away_team: away });

        showToast('\u6DFB\u52A0\u6210\u529F', 'success'); onMatchCompChange();

    } catch (e) { showToast(e.message, 'error'); }

}



async function deleteMatchWeb(mid) {

    if (!(await miuiConfirm('\u786E\u5B9A\u5220\u9664\uFF1F'))) return;

    try { await api('/admin/matches/' + mid, 'DELETE'); showToast('\u5220\u9664\u6210\u529F', 'success'); var el = document.getElementById('matchcard_' + mid); if (el) el.remove(); }

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

        adminCompsCache = comps;

        var h = '<div class="admin-section"><div class="admin-select-wrap">';

        h += '<span>\u9009\u62E9\u8D5B\u4E8B\uFF1A</span>';

        h += '<div id="questionCompSelect"></div>';

        h += '<button id="questionCompSelect_star" class="admin-btn" style="font-size:16px;width:34px;height:34px;padding:0;margin-left:0;display:flex;align-items:center;justify-content:center;background:transparent" onclick="toggleDefaultComp(\'questionCompSelect\')" title="\u8bbe\u4e3a\u9ed8\u8ba4\u8d5b\u7a0b(\u8d5b\u7a0b/\u7ade\u731c\u9875\u9ed8\u8ba4\u9009\u4e2d)"><i class="ri-star-line" style="color:#86868b"></i></button>';

        h += '</div><div style="display:flex;gap:8px;padding:0 12px 4px;align-items:center"><div id="questionWeekFilter"></div><div id="questionDayFilter"></div><button class="admin-btn btn-success" style="font-size:18px;width:34px;height:34px;padding:0;flex-shrink:0;display:flex;align-items:center;justify-content:center;margin-left:0" onclick="showAddTimedQuestionDialog()" title="\u6DFB\u52A0\u9650\u65F6\u7ADE\u731C"><i class="ri-lightbulb-flash-line"></i></button></div>';

        h += '<div id="questionContent"></div></div>';

        document.getElementById('adminContent').innerHTML = h;

        var opts = comps.map(function(c) { return {value: String(c.id), label: c.name}; });

        miuiSelect('questionCompSelect', opts, pickInitialComp(comps), function(val) { onQuestionCompChange(); updateCompStarIcon('questionCompSelect'); });

        updateCompStarIcon('questionCompSelect');

        if (comps.length > 0) onQuestionCompChange();

    } catch (e) { showToast('\u52A0\u8F7D\u5931\u8D25', 'error'); }

}



async function onQuestionCompChange() {

    var cid = getMiuiSelectValue('questionCompSelect');

    if (!cid) { document.getElementById('questionContent').innerHTML = ''; return; }

    var c = document.getElementById('questionContent');

    c.innerHTML = '<div style="text-align:center;padding:20px;color:#999">\u52A0\u8F7D\u4E2D..</div>';

    try {

        var results = await Promise.all([api('/competitions/' + cid + '/full'), loadTimedCache()]);

        var data = results[0];

        questionDataCache = data;

        var weeks = {}, days = {};

        data.matches.forEach(function(m) { weeks[m.week_number] = true; days[m.day_number] = true; });

        // 限时竞猜覆盖的周也并入周筛选(比赛没有的周也能筛出限时竞猜)
        timedCache.forEach(function(q) {

            var wd = timedWeekDay(q, data.start_date);

            if (wd) weeks[wd.week] = true;

        });

        var weekOpts = [{value:'',label:'\u5168\u90E8\u5468'}];

        Object.keys(weeks).sort(function(a,b){return a-b;}).forEach(function(w) { weekOpts.push({value:String(w),label:w+'\u5468'}); });

        miuiSelect('questionWeekFilter', weekOpts, '', function() { renderQuestionContent(questionDataCache); });

        var dayOpts = [{value:'',label:'\u5168\u90E8\u65E5'}];

        var dayNames = ['','\u5468\u4E00','\u5468\u4E8C','\u5468\u4E09','\u5468\u56DB','\u5468\u4E94','\u5468\u516D','\u5468\u65E5'];

        Object.keys(days).sort(function(a,b){return a-b;}).forEach(function(d) { dayOpts.push({value:String(d),label:dayNames[d]||('D'+d)}); });

        miuiSelect('questionDayFilter', dayOpts, '', function() { renderQuestionContent(questionDataCache); });

        renderQuestionContent(data);

    } catch (e) { c.innerHTML = '<div style="color:red;padding:20px">\u52A0\u8F7D\u5931\u8D25</div>'; }

}



function timedWeekDay(q, startDateStr) {

    // 按赛季周一锚点把开盘日期换算成 (周, 日); 无法换算(未设起始日期/早于第1周周一)返回 null
    if (!startDateStr || !q.open_time) return null;

    var sd = parseYMD(startDateStr);

    var firstMonday = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate() - ((sd.getDay() + 6) % 7));

    var od = parseYMD(q.open_time.substring(0, 10));

    var diffDays = Math.floor((od - firstMonday) / 86400000);

    if (diffDays < 0) return null;

    return { week: Math.floor(diffDays / 7) + 1, day: ((od.getDay() + 6) % 7) + 1, date: q.open_time.substring(0, 10) };

}

function buildAdminQuestionCard(q, isTimed) {

    var h = '';

    var sl = q.status === 'active' ? '\u5F00\u76D8\u4E2D' : q.status === 'closed' ? '\u5DF2\u5C01\u76D8' : q.status === 'pending' ? '\u672A\u5F00\u76D8' : '\u5DF2\u7ED3\u7B97';

    var sc = q.status === 'active' ? '#34a853' : q.status === 'closed' ? '#f57c00' : '#86868b';

    var qb = q.status === 'active' ? '#e8f4fd' : q.status === 'completed' ? '#e8f7ed' : q.status === 'pending' ? '#f2f3f5' : '#fff8e1';

    h += '<div id="qrow_' + q.id + '" style="background:' + qb + ';border-radius:14px;padding:14px;margin:8px 0">';

    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start">';

    h += '<div style="flex:1;min-width:0">';

    if (isTimed) {

        h += '<div style="font-size:14px;font-weight:600;color:#1a1a1a;word-break:break-all"><i class="ri-time-line" style="color:#f57c00"></i> ' + timedWindow(q) + ' <span style="font-size:11px;font-weight:400;color:#86868b">' + q.question_code + '</span></div>';

    } else {

        var shortCode = q.question_code.replace(/^.*?(Week\d+Day\d+Match\d+Q\d+)$/, '$1');

        h += '<div style="font-size:14px;font-weight:600;color:#1a1a1a;word-break:break-all">' + shortCode + '</div>';

    }

    h += '<div style="display:flex;align-items:center;gap:6px;margin-top:6px">';

    h += '<input class="inline-input-sm" value="' + (q.question_text || '').replace(/"/g, '&quot;') + '" onblur="updateQuestionText(' + q.id + ',this.value)" style="flex:1;min-width:0;background:#fff;border:1px solid #e8edf5;border-radius:8px;padding:6px 10px">';

    h += '</div>';

    var ms = q.max_selections || 1;

    var typeCtrl = '<select onchange="updateQuestionMaxSel(' + q.id + ', this.value)" style="background:#fff;border:1px solid #e8edf5;border-radius:6px;padding:1px 4px;font-size:11px;color:#1a1a1a;outline:none;margin-left:6px"><option value="1"' + (ms <= 1 ? ' selected' : '') + '>\u5355\u9009</option><option value="multi"' + (ms > 1 ? ' selected' : '') + '>\u591A\u9009</option></select>'
        + (ms > 1 ? '<input type="number" min="2" max="30" value="' + ms + '" onchange="updateQuestionMaxSel(' + q.id + ', \'multi:\' + this.value)" title="\u6700\u591A\u53EF\u9009" style="width:56px;background:#fff;border:1px solid #e8edf5;border-radius:6px;padding:1px 4px;font-size:11px;color:#1a1a1a;outline:none;margin-left:4px">' : '');

    var closeVal = q.close_time ? q.close_time.substring(0, 16).replace(' ', 'T') : '';

    var closeCtrl = '<input type="text" readonly class="miui-datetime-sm" value="' + closeVal + '" placeholder="\u5c01\u76d8" onclick="openMiuiDatetimePicker(this)" onchange="updateQuestionCloseTime(' + q.id + ', this)" title="\u5c01\u76d8\u65f6\u95f4, \u5230\u70b9\u81ea\u52a8\u5c01\u76d8; \u6e05\u7a7a\u5219\u4e0d\u81ea\u52a8\u5c01\u76d8">';

    h += '<div style="font-size:12px;color:' + sc + ';margin-top:4px;font-weight:500;display:flex;align-items:center;flex-wrap:wrap;gap:4px">' + sl + typeCtrl + closeCtrl + '</div>';

    h += '</div>';

    h += '<div style="display:flex;gap:4px;flex-shrink:0;margin-left:8px;flex-wrap:wrap;justify-content:flex-end">';

    if (q.status === 'active') {

        h += '<button class="admin-btn btn-danger" style="font-size:18px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="closeQuestion(' + q.id + ')" title="\u5C01\u76D8"><i class="ri-stop-circle-line"></i></button>';

        h += '<button class="admin-btn btn-sm" style="font-size:18px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="deleteQuestionWeb(' + q.id + ')" title="\u5220\u9664"><i class="ri-delete-bin-line"></i></button>';

    } else if (q.status === 'closed') {

        h += '<button class="admin-btn btn-success" style="font-size:18px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="openQuestion(' + q.id + ')" title="\u5F00\u76D8"><i class="ri-play-circle-line"></i></button>';

        h += '<button class="admin-btn btn-sm" style="font-size:18px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="deleteQuestionWeb(' + q.id + ')" title="\u5220\u9664"><i class="ri-delete-bin-line"></i></button>';

        h += '<button class="admin-btn btn-warning" style="font-size:18px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="openSettleDialog(' + q.id + ')" title="\u7ED3\u7B97"><i class="ri-check-double-line"></i></button>';

    } else if (q.status === 'pending') {

        h += '<button class="admin-btn btn-sm" style="font-size:18px;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center" onclick="deleteQuestionWeb(' + q.id + ')" title="\u5220\u9664"><i class="ri-delete-bin-line"></i></button>';

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

        h += '<div id="optrow_' + o.id + '" style="display:flex;align-items:center;gap:6px;margin:4px 0;padding:4px 8px;border-radius:8px;background:' + ob + '">';

        h += '<input class="inline-input-sm" value="' + (o.option_text || '').replace(/"/g, '&quot;') + '" data-oid="' + o.id + '" data-field="text" onblur="saveOptionField(this)" placeholder="\u9009\u9879\u5185\u5BB9" style="flex:2;background:#f2f3f5;border-radius:8px;padding:6px 8px">';

        h += '<input class="inline-input-num" type="number" value="' + o.base_rate + '" data-oid="' + o.id + '" data-field="rate" onblur="saveOptionField(this)" style="width:56px;background:#fff8e1;border-radius:8px;padding:6px">';

        h += '<span style="font-size:11px;color:#3478f6;font-weight:500">' + (o.total_coins || 0) + '</span>';

        if (q.status !== 'completed') h += '<button class="admin-btn btn-danger" style="font-size:14px;width:26px;height:26px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:6px" onclick="deleteOptionWeb(' + o.id + ',' + q.id + ')"><i class="ri-close-line"></i></button>';

        h += '</div>';

    });

    if (q.status !== 'completed') h += '<div style="margin-top:6px"><button class="admin-btn btn-sm" style="border-radius:8px;padding:6px 12px;display:flex;align-items:center;gap:4px" onclick="addOptionWeb(' + q.id + ')"><i class="ri-add-line"></i> \u6DFB\u52A0\u9009\u9879</button></div>';

    h += '</div>';

    return h;

}

function renderQuestionContent(data) {

    var c = document.getElementById('questionContent');

    var wf = getMiuiSelectValue('questionWeekFilter') || '';

    var df = getMiuiSelectValue('questionDayFilter') || '';

    // 比赛按(周,日)分日组(保持原顺序); 限时竞猜按开盘日期归入对应日组, 渲染在该日最前面
    var dayGroups = [];

    var groupByKey = {};

    data.matches.forEach(function(m) {

        var key = m.week_number + '_' + m.day_number;

        if (!groupByKey[key]) {

            groupByKey[key] = { week: m.week_number, day: m.day_number, date: m.match_date || null, timed: [], matches: [] };

            dayGroups.push(groupByKey[key]);

        }

        groupByKey[key].matches.push(m);

    });

    var ungrouped = [];

    timedCache.forEach(function(q) {

        var wd = timedWeekDay(q, data.start_date);

        if (!wd) { ungrouped.push(q); return; }

        var g = groupByKey[wd.week + '_' + wd.day];

        if (!g) {

            g = { week: wd.week, day: wd.day, date: wd.date, timed: [], matches: [] };

            groupByKey[wd.week + '_' + wd.day] = g;

            dayGroups.push(g);

        }

        g.timed.push(q);

    });

    dayGroups.sort(function(a, b) {

        if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;

        return 0;

    });

    if (ungrouped.length) dayGroups.unshift({ week: null, day: null, date: null, timed: ungrouped, matches: [] });

    var h = '<div style="margin-top:10px">';

    dayGroups.forEach(function(g) {

        if (g.week !== null) {

            if (wf && String(g.week) !== wf) return;

            if (df && String(g.day) !== df) return;

        } else if (wf || df) {

            return;

        }

        if (g.timed.length) {

            h += '<div class="match-divider" style="color:#f57c00;border-left-color:#f57c00">\u23F0 \u9650\u65F6\u7ADE\u731C' + (g.date ? ' \u00B7 ' + g.date.substring(5) : '') + '</div>';

            g.timed.forEach(function(q) { h += buildAdminQuestionCard(q, true); });

        }

        g.matches.forEach(function(m) {

            h += '<div class="match-divider">' + (m.home_team || '?') + ' vs ' + (m.away_team || '?') + '</div>';

            m.questions.forEach(function(q) { h += buildAdminQuestionCard(q, false); });

            h += '<div style="margin-top:8px"><button class="admin-btn btn-sm" style="border-radius:8px;padding:6px 12px;display:flex;align-items:center;gap:4px;background:#667eea;color:#fff" onclick="showAddQuestionDialog(' + m.id + ', \'' + (m.match_date || '') + '\')"><i class="ri-add-line"></i> \u6DFB\u52A0\u95EE\u9898</button></div>';

        });

    });

    h += '</div>';

    c.innerHTML = h;

}



async function loadTimedCache() {

    try { timedCache = await api('/timed-questions?all=1'); } catch (e) { timedCache = []; }

}

async function refreshQuestionRow(qid) {

    if (!questionDataCache) { onQuestionCompChange(); return; }

    var scrollY = window.scrollY;

    var cid = getMiuiSelectValue('questionCompSelect') || questionDataCache.id;

    var results = await Promise.all([api('/competitions/' + cid + '/full'), loadTimedCache()]);

    questionDataCache = results[0];

    renderQuestionContent(questionDataCache);

    window.scrollTo(0, scrollY);

}



async function updateQuestionText(qid, text) {

    try { await api('/admin/questions/' + qid, 'PUT', { question_text: text }); } catch (e) { showToast(e.message, 'error'); }

}

async function updateQuestionMaxSel(qid, value) {

    // value: '1'/'multi'(来自题型下拉) 或 'multi:N'(来自最多可选输入)
    var ms;

    if (value === 'multi') ms = 2;  // 切到多选先默认2, 刷新后可在输入框里调

    else if (value.indexOf('multi:') === 0) ms = parseInt(value.split(':')[1]) || 2;

    else ms = 1;

    if (ms !== 1 && ms < 2) ms = 2;

    if (ms > 30) ms = 30;

    try { await api('/admin/questions/' + qid, 'PUT', { max_selections: ms }); showToast('\u9898\u578B\u5DF2\u66F4\u65B0', 'success'); refreshQuestionRow(qid); }

    catch (e) { showToast(e.message, 'error'); }

}



async function updateQuestionCloseTime(qid, el) {

    // datetime-local 值转 YYYY-MM-DD HH:MM:SS; 清空则不自动封盘
    var v = el.value ? el.value.replace('T', ' ') : '';

    if (v && v.length === 16) v += ':00';

    try { await api('/admin/questions/' + qid, 'PUT', { close_time: v || null }); showToast('\u5C01\u76D8\u65F6\u95F4\u5DF2\u66F4\u65B0', 'success'); refreshQuestionRow(qid); }

    catch (e) { showToast(e.message, 'error'); }

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



// ---- 添加问题弹窗 ----

function showAddQuestionDialog(matchId, matchDate) {

    var defaultClose = matchDate ? matchDate + ' 23:00' : '';

    var h = '<div id="addQuestionOverlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center" class="dl-overlay" onclick="if(event.target===this)this.remove()">';

    h += '<div class="dl-glass" style="width:90%;max-width:420px;padding:20px;max-height:80vh;overflow-y:auto;box-sizing:border-box">';

    h += '<div style="font-size:16px;font-weight:bold;margin-bottom:14px">\u6DFB\u52A0\u95EE\u9898</div>';

    h += '<div style="display:flex;gap:8px;margin-bottom:12px">';

    h += '<div style="flex:1;min-width:0"><label style="font-size:13px;color:#666;display:block;margin-bottom:4px">\u9898\u578B</label>';

    h += '<select id="addq_seltype" onchange="document.getElementById(\'addq_maxsel_wrap\').style.display=this.value===\'multi\'?\'block\':\'none\'" style="width:100%;box-sizing:border-box;background:#f2f3f5;border:1px solid #e8edf5;border-radius:8px;padding:8px 10px;font-size:14px;outline:none"><option value="1">\u5355\u9009</option><option value="multi">\u591A\u9009</option></select></div>';

    h += '<div style="flex:1;min-width:0;display:none" id="addq_maxsel_wrap"><label style="font-size:13px;color:#666;display:block;margin-bottom:4px">\u6700\u591A\u53EF\u9009</label>';

    h += '<input id="addq_maxsel" type="number" min="2" max="30" value="2" style="width:100%;box-sizing:border-box;background:#f2f3f5;border:1px solid #e8edf5;border-radius:8px;padding:8px 10px;font-size:14px"></div>';

    h += '</div>';

    h += '<div style="margin-bottom:12px"><label style="font-size:13px;color:#666;display:block;margin-bottom:4px">\u95EE\u9898\u5185\u5BB9</label>';

    h += '<input id="addq_text" style="width:100%;box-sizing:border-box;background:#f2f3f5;border:1px solid #e8edf5;border-radius:8px;padding:8px 10px;font-size:14px" placeholder="\u5982\uFF1A\u672C\u5C40MVP\u662F\u8C01\uFF1F"></div>';

    h += '<div style="margin-bottom:12px"><label style="font-size:13px;color:#666;display:block;margin-bottom:4px">\u5C01\u76D8\u65F6\u95F4</label>';

    h += '<input id="addq_close" type="text" readonly class="miui-datetime" value="' + defaultClose + '" placeholder="\u9ed8\u8ba4\u6bd4\u8d5b\u65e5 23:00" onclick="openMiuiDatetimePicker(this)" title="\u9ed8\u8ba4\u4e3a\u6bd4\u8d5b\u65e5 23:00, \u6e05\u7a7a\u5219\u4e0d\u81ea\u52a8\u5c01\u76d8"></div>';

    h += '<div id="addq_options">';

    h += '<div class="addq-opt" style="display:flex;gap:6px;margin-bottom:8px;align-items:center"><input class="addq-opt-text" style="flex:2;background:#f2f3f5;border:1px solid #e8edf5;border-radius:8px;padding:8px 10px;font-size:13px" placeholder="\u9009\u9879\u5185\u5BB9"><input class="addq-opt-rate" type="number" step="0.1" min="1.1" value="2.0" style="width:60px;background:#fff8e1;border:1px solid #e8edf5;border-radius:8px;padding:8px;font-size:13px" placeholder="\u500D\u7387"><button class="admin-btn btn-danger" style="font-size:16px;width:28px;height:28px;padding:0;flex-shrink:0" onclick="this.parentElement.remove()"><i class="ri-close-line"></i></button></div>';

    h += '<div class="addq-opt" style="display:flex;gap:6px;margin-bottom:8px;align-items:center"><input class="addq-opt-text" style="flex:2;background:#f2f3f5;border:1px solid #e8edf5;border-radius:8px;padding:8px 10px;font-size:13px" placeholder="\u9009\u9879\u5185\u5BB9"><input class="addq-opt-rate" type="number" step="0.1" min="1.1" value="2.0" style="width:60px;background:#fff8e1;border:1px solid #e8edf5;border-radius:8px;padding:8px;font-size:13px" placeholder="\u500D\u7387"><button class="admin-btn btn-danger" style="font-size:16px;width:28px;height:28px;padding:0;flex-shrink:0" onclick="this.parentElement.remove()"><i class="ri-close-line"></i></button></div>';

    h += '</div>';

    h += '<div style="display:flex;gap:8px;margin-bottom:14px"><button class="admin-btn btn-sm" style="border-radius:8px;padding:6px 12px;display:flex;align-items:center;gap:4px" onclick="addQuestionOptionRow()"><i class="ri-add-line"></i> \u6DFB\u52A0\u9009\u9879</button></div>';

    h += '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="admin-btn btn-sm" onclick="document.getElementById(\'addQuestionOverlay\').remove()">\u53D6\u6D88</button>';

    h += '<button class="admin-btn btn-sm" style="background:#667eea;color:#fff" onclick="submitAddQuestion(' + matchId + ')">\u786E\u5B9A</button></div>';

    h += '</div></div>';

    document.body.insertAdjacentHTML('beforeend', h);

}



function addQuestionOptionRow() {

    var c = document.getElementById('addq_options');

    if (c.children.length >= 30) { showToast('\u6700\u591A30\u4E2A\u9009\u9879', 'error'); return; }

    var d = document.createElement('div');

    d.className = 'addq-opt';

    d.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;align-items:center';

    d.innerHTML = '<input class="addq-opt-text" style="flex:2;background:#f2f3f5;border:1px solid #e8edf5;border-radius:8px;padding:8px 10px;font-size:13px" placeholder="\u9009\u9879\u5185\u5BB9"><input class="addq-opt-rate" type="number" step="0.1" min="1.1" value="2.0" style="width:60px;background:#fff8e1;border:1px solid #e8edf5;border-radius:8px;padding:8px;font-size:13px" placeholder="\u500D\u7387"><button class="admin-btn btn-danger" style="font-size:16px;width:28px;height:28px;padding:0;flex-shrink:0" onclick="this.parentElement.remove()"><i class="ri-close-line"></i></button>';

    c.appendChild(d);

}



async function submitAddQuestion(matchId) {

    var text = document.getElementById('addq_text').value.trim();

    if (!text) { showToast('\u8BF7\u8F93\u5165\u95EE\u9898\u5185\u5BB9', 'error'); return; }

    var selTypeEl = document.getElementById('addq_seltype');

    var maxSel = 1;

    if (selTypeEl && selTypeEl.value === 'multi') {

        maxSel = parseInt(document.getElementById('addq_maxsel').value) || 2;

        if (maxSel < 2) maxSel = 2;

        if (maxSel > 30) maxSel = 30;

    }

    var optRows = document.querySelectorAll('#addq_options .addq-opt');

    var options = [];

    for (var i = 0; i < optRows.length; i++) {

        var t = optRows[i].querySelector('.addq-opt-text').value.trim();

        var r = parseFloat(optRows[i].querySelector('.addq-opt-rate').value) || 2.0;

        if (t) options.push({ option_text: t, base_rate: r });

    }

    if (options.length < 2) { showToast('\u81F3\u5C11\u9700\u89812\u4E2A\u9009\u9879', 'error'); return; }

    try {

        var closeRaw = document.getElementById('addq_close') ? document.getElementById('addq_close').value : '';

        var closeTime = closeRaw ? closeRaw.replace('T', ' ') + (closeRaw.length === 16 ? ':00' : '') : '';

        await api('/admin/questions', 'POST', { match_id: matchId, question_text: text, options: options, max_selections: maxSel, close_time: closeTime });

        document.getElementById('addQuestionOverlay').remove();

        showToast('\u6DFB\u52A0\u6210\u529F', 'success');

        onQuestionCompChange();

    } catch (e) { showToast(e.message, 'error'); }

}



// ---- 添加限时竞猜弹窗(不依附比赛) ----

function showAddTimedQuestionDialog() {

    var h = '<div id="addTimedOverlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center" class="dl-overlay" onclick="if(event.target===this)this.remove()">';

    h += '<div class="dl-glass" style="width:90%;max-width:420px;padding:20px;max-height:80vh;overflow-y:auto;box-sizing:border-box">';

    h += '<div style="font-size:16px;font-weight:bold;margin-bottom:14px">\u6DFB\u52A0\u9650\u65F6\u7ADE\u731C</div>';

    h += '<div style="display:flex;gap:8px;margin-bottom:12px">';

    h += '<div style="flex:1;min-width:0"><label style="font-size:13px;color:#666;display:block;margin-bottom:4px">\u5F00\u76D8\u65F6\u95F4</label>';

    h += '<input id="addtq_open" type="text" readonly class="miui-datetime" placeholder="\u9009\u62E9\u5F00\u76D8\u65F6\u95F4" onclick="openMiuiDatetimePicker(this)"></div>';

    h += '<div style="flex:1;min-width:0"><label style="font-size:13px;color:#666;display:block;margin-bottom:4px">\u5C01\u76D8\u65F6\u95F4</label>';

    h += '<input id="addtq_close" type="text" readonly class="miui-datetime" placeholder="\u9009\u62E9\u5C01\u76D8\u65F6\u95F4" onclick="openMiuiDatetimePicker(this)"></div>';

    h += '</div>';

    h += '<div style="display:flex;gap:8px;margin-bottom:12px">';

    h += '<div style="flex:1;min-width:0"><label style="font-size:13px;color:#666;display:block;margin-bottom:4px">\u9898\u578B</label>';

    h += '<select id="addtq_seltype" onchange="document.getElementById(\'addtq_maxsel_wrap\').style.display=this.value===\'multi\'?\'block\':\'none\'" style="width:100%;box-sizing:border-box;background:#f2f3f5;border:1px solid #e8edf5;border-radius:8px;padding:8px 10px;font-size:13px;outline:none"><option value="1">\u5355\u9009</option><option value="multi">\u591A\u9009</option></select></div>';

    h += '<div style="flex:1;min-width:0;display:none" id="addtq_maxsel_wrap"><label style="font-size:13px;color:#666;display:block;margin-bottom:4px">\u6700\u591A\u53EF\u9009</label>';

    h += '<input id="addtq_maxsel" type="number" min="2" max="30" value="2" style="width:100%;box-sizing:border-box;background:#f2f3f5;border:1px solid #e8edf5;border-radius:8px;padding:8px 10px;font-size:13px"></div>';

    h += '</div>';

    h += '<div style="margin-bottom:12px"><label style="font-size:13px;color:#666;display:block;margin-bottom:4px">\u95EE\u9898\u5185\u5BB9</label>';

    h += '<input id="addtq_text" style="width:100%;box-sizing:border-box;background:#f2f3f5;border:1px solid #e8edf5;border-radius:8px;padding:8px 10px;font-size:14px" placeholder="\u5982\uFF1A\u672C\u5C40MVP\u662F\u8C01\uFF1F"></div>';

    h += '<div id="addtq_options">';

    h += '<div class="addq-opt" style="display:flex;gap:6px;margin-bottom:8px;align-items:center"><input class="addq-opt-text" style="flex:2;background:#f2f3f5;border:1px solid #e8edf5;border-radius:8px;padding:8px 10px;font-size:13px" placeholder="\u9009\u9879\u5185\u5BB9"><input class="addq-opt-rate" type="number" step="0.1" min="1.1" value="2.0" style="width:60px;background:#fff8e1;border:1px solid #e8edf5;border-radius:8px;padding:8px;font-size:13px" placeholder="\u500D\u7387"><button class="admin-btn btn-danger" style="font-size:16px;width:28px;height:28px;padding:0;flex-shrink:0" onclick="this.parentElement.remove()"><i class="ri-close-line"></i></button></div>';

    h += '<div class="addq-opt" style="display:flex;gap:6px;margin-bottom:8px;align-items:center"><input class="addq-opt-text" style="flex:2;background:#f2f3f5;border:1px solid #e8edf5;border-radius:8px;padding:8px 10px;font-size:13px" placeholder="\u9009\u9879\u5185\u5BB9"><input class="addq-opt-rate" type="number" step="0.1" min="1.1" value="2.0" style="width:60px;background:#fff8e1;border:1px solid #e8edf5;border-radius:8px;padding:8px;font-size:13px" placeholder="\u500D\u7387"><button class="admin-btn btn-danger" style="font-size:16px;width:28px;height:28px;padding:0;flex-shrink:0" onclick="this.parentElement.remove()"><i class="ri-close-line"></i></button></div>';

    h += '</div>';

    h += '<div style="display:flex;gap:8px;margin-bottom:14px"><button class="admin-btn btn-sm" style="border-radius:8px;padding:6px 12px;display:flex;align-items:center;gap:4px" onclick="addTimedOptionRow()"><i class="ri-add-line"></i> \u6DFB\u52A0\u9009\u9879</button></div>';

    h += '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="admin-btn btn-sm" onclick="document.getElementById(\'addTimedOverlay\').remove()">\u53D6\u6D88</button>';

    h += '<button class="admin-btn btn-sm" style="background:#667eea;color:#fff" onclick="submitAddTimedQuestion()">\u786E\u5B9A</button></div>';

    h += '</div></div>';

    document.body.insertAdjacentHTML('beforeend', h);

}

function addTimedOptionRow() {

    var c = document.getElementById('addtq_options');

    if (c.children.length >= 30) { showToast('\u6700\u591A30\u4E2A\u9009\u9879', 'error'); return; }

    var d = document.createElement('div');

    d.className = 'addq-opt';

    d.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;align-items:center';

    d.innerHTML = '<input class="addq-opt-text" style="flex:2;background:#f2f3f5;border:1px solid #e8edf5;border-radius:8px;padding:8px 10px;font-size:13px" placeholder="\u9009\u9879\u5185\u5BB9"><input class="addq-opt-rate" type="number" step="0.1" min="1.1" value="2.0" style="width:60px;background:#fff8e1;border:1px solid #e8edf5;border-radius:8px;padding:8px;font-size:13px" placeholder="\u500D\u7387"><button class="admin-btn btn-danger" style="font-size:16px;width:28px;height:28px;padding:0;flex-shrink:0" onclick="this.parentElement.remove()"><i class="ri-close-line"></i></button>';

    c.appendChild(d);

}

async function submitAddTimedQuestion() {

    var open = document.getElementById('addtq_open').value;

    var close = document.getElementById('addtq_close').value;

    var text = document.getElementById('addtq_text').value.trim();

    if (!open || !close) { showToast('\u8BF7\u9009\u62E9\u5F00\u76D8\u548C\u5C01\u76D8\u65F6\u95F4', 'error'); return; }

    if (close <= open) { showToast('\u5C01\u76D8\u65F6\u95F4\u5FC5\u987B\u665A\u4E8E\u5F00\u76D8\u65F6\u95F4', 'error'); return; }

    if (!text) { showToast('\u8BF7\u8F93\u5165\u95EE\u9898\u5185\u5BB9', 'error'); return; }

    var optRows = document.querySelectorAll('#addtq_options .addq-opt');

    var options = [];

    for (var i = 0; i < optRows.length; i++) {

        var t = optRows[i].querySelector('.addq-opt-text').value.trim();

        var r = parseFloat(optRows[i].querySelector('.addq-opt-rate').value) || 2.0;

        if (t) options.push({ option_text: t, base_rate: r });

    }

    if (options.length < 2) { showToast('\u81F3\u5C11\u9700\u89812\u4E2A\u9009\u9879', 'error'); return; }

    var selTypeEl = document.getElementById('addtq_seltype');

    var maxSel = 1;

    if (selTypeEl && selTypeEl.value === 'multi') {

        maxSel = parseInt(document.getElementById('addtq_maxsel').value) || 2;

        if (maxSel < 2) maxSel = 2;

        if (maxSel > 30) maxSel = 30;

    }

    try {

        await api('/admin/timed-questions', 'POST', { question_text: text, options: options, open_time: open, close_time: close, max_selections: maxSel });

        document.getElementById('addTimedOverlay').remove();

        showToast('\u6DFB\u52A0\u6210\u529F', 'success');

        await loadTimedCache();

        if (questionDataCache) renderQuestionContent(questionDataCache);

        else onQuestionCompChange();

    } catch (e) { showToast(e.message, 'error'); }

}

async function deleteOptionWeb(oid, qid) { if (!(await miuiConfirm('\u5220\u9664\u9009\u9879\uFF1F'))) return; try { await api('/admin/options/' + oid, 'DELETE'); showToast('\u5220\u9664\u6210\u529F', 'success'); var el = document.getElementById('optrow_' + oid); if (el) el.remove(); refreshQuestionRow(qid); } catch (e) { showToast(e.message, 'error'); } }

async function addOptionWeb(qid) { try { await api('/admin/options', 'POST', { question_id: qid, option_text: '', base_rate: 2.0 }); showToast('\u6DFB\u52A0\u6210\u529F', 'success'); refreshQuestionRow(qid); } catch (e) { showToast(e.message, 'error'); } }



// ---- \u7ED3\u7B97\u5F39\u7A97 ----

function openSettleDialog(qid) {

    var q = null;

    if (!questionDataCache) return;

    questionDataCache.matches.forEach(function(m) { m.questions.forEach(function(question) { if (question.id === qid) q = question; }); });

    if (!q) q = timedCache.filter(function(x) { return x.id === qid; })[0];

    if (!q) return;

    var h = '<div id="settleOverlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center" class="dl-overlay" onclick="if(event.target===this)this.remove()">';

    h += '<div class="dl-glass" style="width:90%;max-width:400px;padding:20px">';

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

        var h = '<div id="betDetailOverlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center" class="dl-overlay" onclick="if(event.target===this)this.remove()">';

        h += '<div class="dl-glass" style="width:90%;max-width:500px;padding:20px;max-height:70vh;overflow-y:auto;box-sizing:border-box">';

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



window.onload = function() { if (currentUser) { initHomePage(); if (currentUser.need_setup) showSuperadminSetup(); } };
