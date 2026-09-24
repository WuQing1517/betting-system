# -*- coding: utf-8 -*-
"""备份功能端到端测试 (需先启动: BACKUP_TOKEN=testtoken123 ADMIN_PASSWORD=adminpwd 的本地实例)"""
import json, sys, urllib.request, urllib.error

B = 'http://127.0.0.1:5000/api'
TOKEN = 'testtoken123'
ADMIN_PWD = 'adminpwd'

def req(method, path, data=None, headers=None):
    h = {'Content-Type': 'application/json'}
    if headers: h.update(headers)
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(B + path, data=body, method=method, headers=h)
    try:
        resp = urllib.request.urlopen(r, timeout=30)
        code, payload = resp.status, resp.read()
    except urllib.error.HTTPError as e:
        code, payload = e.code, e.read()
    try: return code, json.loads(payload)
    except Exception: return code, payload.decode('utf-8', 'replace')

results = []
def check(name, ok, detail=''):
    results.append(ok)
    print(('  PASS ' if ok else '  FAIL ') + name + ('  [' + str(detail)[:70] + ']' if detail is not None and str(detail) else ''))

print('--- 1. 注册/登录/导出基础 ---')
c, bk1 = req('POST', '/dev-register', {'username': 'bk1', 'password': 'p1', 'cn': 'A1'})
t1, u1 = bk1.get('session_token'), bk1.get('user_id')
check('注册bk1并签发令牌', c == 200 and bool(t1))
c, adm = req('POST', '/dev-login', {'username': 'admin', 'password': 'admin'})
t2, u2 = adm.get('session_token'), adm.get('user_id')
check('登录bootstrap超管', c == 200 and bool(t2))
c, exp = req('GET', '/admin/export', headers={'X-Backup-Token': TOKEN})
check('带令牌导出(version=2)', c == 200 and isinstance(exp, dict) and exp.get('version') == 2)
c1, _ = req('GET', '/admin/export')
c2, _ = req('GET', '/admin/export', headers={'X-Backup-Token': 'wrong'})
check('无令牌/错误令牌导出均403', c1 == 403 and c2 == 403, '%s,%s' % (c1, c2))

print('--- 2. 场景A: 令牌认证同步 → 数据恢复且不掉线 ---')
req('POST', '/dev-register', {'username': 'bk5', 'password': 'p5', 'cn': 'C5'})
req('PUT', '/admin/users/%s/coins' % u1, {'action': 'add', 'amount': 777}, headers={'X-User-Id': str(u2), 'X-Session-Token': t2})
c, prof = req('GET', '/user/profile', headers={'X-User-Id': str(u1), 'X-Session-Token': t1})
check('调币后bk1=5777', c == 200 and prof.get('coins') == 5777, prof.get('coins'))
c, _ = req('POST', '/admin/import', exp, headers={'X-Backup-Token': TOKEN})
check('令牌认证导入', c == 200)
c, prof = req('GET', '/user/profile', headers={'X-User-Id': str(u1), 'X-Session-Token': t1})
check('同步后bk1旧令牌仍在线', c == 200)
check('bk1币数恢复5000(数据回滚)', prof.get('coins') == 5000, prof.get('coins'))
c, _ = req('POST', '/dev-login', {'username': 'bk5', 'password': 'p5'})
check('备份外账号bk5被清除', c == 401)

print('--- 3. 场景B: 管理员手动导入(在备份中) → 不掉线 ---')
req('POST', '/dev-register', {'username': 'bk6', 'password': 'p6', 'cn': 'C6'})
req('PUT', '/admin/users/%s/coins' % u1, {'action': 'add', 'amount': 100}, headers={'X-User-Id': str(u2), 'X-Session-Token': t2})
c, imp = req('POST', '/admin/import', exp, headers={'X-Admin-Password': ADMIN_PWD, 'X-User-Id': str(u2), 'X-Session-Token': t2})
check('手动导入成功且响应带令牌', c == 200 and imp.get('session_token') == t2, imp if c != 200 else '')
c, prof = req('GET', '/user/profile', headers={'X-User-Id': str(u2), 'X-Session-Token': t2})
check('admin导入后仍在线', c == 200)
c, _ = req('POST', '/dev-login', {'username': 'bk6', 'password': 'p6'})
check('bk6被清除', c == 401)

print('--- 4. 场景D: 同步后用户id变化 → session-resolve找回 ---')
exp2 = json.loads(json.dumps(exp))
for u in exp2['users']:
    if u['openid'] == 'dev_bk1': u['id'] = 99
c, _ = req('POST', '/admin/import', exp2, headers={'X-Backup-Token': TOKEN})
check('id变化备份导入', c == 200)
c, _ = req('GET', '/user/profile', headers={'X-User-Id': str(u1), 'X-Session-Token': t1})
check('旧id访问401', c == 401)
c, me = req('GET', '/session-resolve', headers={'X-Session-Token': t1})
check('session-resolve返回新id=99', c == 200 and me.get('user_id') == 99, me.get('user_id'))
c, prof = req('GET', '/user/profile', headers={'X-User-Id': str(me.get('user_id')), 'X-Session-Token': t1})
check('新id+旧令牌访问200', c == 200)

print('--- 5. 场景C: 导入者不在备份中 → 补发令牌+新id ---')
exp3 = json.loads(json.dumps(exp2))
exp3['users'] = [u for u in exp3['users'] if u['openid'] != 'dev_admin']
c, imp = req('POST', '/admin/import', exp3, headers={'X-Admin-Password': ADMIN_PWD, 'X-User-Id': str(u2), 'X-Session-Token': t2})
check('导入成功且响应带新id和令牌', c == 200 and imp.get('session_token') and imp.get('user_id'), imp if c != 200 else '')
c, prof = req('GET', '/user/profile', headers={'X-User-Id': str(imp.get('user_id')), 'X-Session-Token': str(imp.get('session_token'))})
check('新id+续用令牌访问200', c == 200)

fails = len(results) - sum(1 for x in results if x)
print('=== 本轮: %d/%d 通过 ===' % (len(results) - fails, len(results)))
sys.exit(1 if fails else 0)
