# -*- coding: utf-8 -*-
"""超级管理员默认账号(admin/admin)与首次修改流程测试
场景1: 全新数据库 默认admin/admin -> need_setup提示 -> 修改后不再提示
场景2: 旧数据库(dev_wuqing无标识列)升级 -> 自动继承超管权限
场景3: 备份导入后导入者保持超管身份
"""
import os, sys, json, tempfile, subprocess

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))

def fresh_db(name):
    p = os.path.join(tempfile.gettempdir(), name)
    if os.path.exists(p):
        os.remove(p)
    return p

failures = []

def check(name, cond, detail=''):
    print(f'  [{"PASS" if cond else "FAIL"}] {name} {detail}')
    if not cond:
        failures.append(name)

# ================= 场景1: 全新数据库 =================
db1 = fresh_db('t_admin_fresh.db')
os.environ['DATABASE_URL'] = 'sqlite:///' + db1.replace(os.sep, '/')
sys.path.insert(0, HERE)
from app import create_app
from models import db, User

app = create_app()

def H(uid):
    return {'Content-Type': 'application/json', 'X-User-Id': str(uid)}

with app.test_client() as c:
    print('== 场景1a: 默认账号 admin/admin ==')
    r = c.post('/api/dev-login', headers=H(0), data=json.dumps({'username': 'admin', 'password': 'admin'}))
    d = json.loads(r.data)
    check('admin/admin 可登录', r.status_code == 200, f'got {r.status_code}')
    check('is_superadmin=True', d.get('is_superadmin') is True)
    check('need_setup=True (提示修改)', d.get('need_setup') is True)
    admin_uid = d.get('user_id')

    r = c.post('/api/dev-login', headers=H(0), data=json.dumps({'username': 'wuqing', 'password': 'adminwq'}))
    check('旧账号 wuqing/adminwq 已失效', r.status_code == 401, f'got {r.status_code}')

    print('== 场景1b: 权限边界 ==')
    r = c.get('/api/admin/export', headers=H(admin_uid))
    check('默认超管可导出', r.status_code == 200, f'got {r.status_code}')
    c.post('/api/dev-register', headers=H(0), data=json.dumps({'username': 'u1', 'password': 'p1234', 'cn': 'U1'}))
    with app.app_context():
        u1 = User.query.filter_by(openid='dev_u1').first()
        u1_id = u1.id
    r = c.get('/api/admin/export', headers=H(u1_id))
    check('普通用户导出403', r.status_code == 403, f'got {r.status_code}')
    r = c.put('/api/admin/setup-superadmin', headers=H(u1_id), data=json.dumps({'username': 'xx', 'password': 'yyyy'}))
    check('普通用户改号403', r.status_code == 403, f'got {r.status_code}')
    r = c.post('/api/dev-register', headers=H(0), data=json.dumps({'username': 'admin', 'password': 'x1234', 'cn': 'X'}))
    check('注册占用admin被拒', r.status_code == 400, f'got {r.status_code}')

    print('== 场景1c: 首次修改账号/密码/CN ==')
    r = c.put('/api/admin/setup-superadmin', headers=H(admin_uid), data=json.dumps({'username': 'b', 'password': 'secret1', 'cn': 'B'}))
    check('账号过短被拒', r.status_code == 400, f'got {r.status_code}')
    r = c.put('/api/admin/setup-superadmin', headers=H(admin_uid), data=json.dumps({'username': 'u1', 'password': 'secret1', 'cn': 'B'}))
    check('占用他人账号被拒', r.status_code == 400, f'got {r.status_code}')
    r = c.put('/api/admin/setup-superadmin', headers=H(admin_uid), data=json.dumps({'username': 'boss', 'password': 'secret1', 'cn': 'BOSS'}))
    check('修改成功', r.status_code == 200, r.data[:80])
    r = c.post('/api/dev-login', headers=H(0), data=json.dumps({'username': 'boss', 'password': 'secret1'}))
    d = json.loads(r.data)
    check('新账号可登录', r.status_code == 200)
    check('need_setup=False (不再提示)', d.get('need_setup') is False)
    check('CN已更新', d.get('cn') == 'BOSS')
    check('超管权限保留(改号后)', d.get('is_superadmin') is True)
    boss_uid = d.get('user_id')
    r = c.get('/api/admin/export', headers=H(boss_uid))
    check('改号后超管接口仍可用', r.status_code == 200, f'got {r.status_code}')
    r = c.post('/api/dev-login', headers=H(0), data=json.dumps({'username': 'admin', 'password': 'admin'}))
    check('旧默认账号已失效', r.status_code == 401, f'got {r.status_code}')

    print('== 场景1d: 后台入口(admin/login) ==')
    r = c.post('/api/admin/login', headers=H(0), data=json.dumps({'username': 'boss', 'password': 'secret1'}))
    check('后台可用新账号登录', r.status_code == 200 and json.loads(r.data).get('success'), f'got {r.status_code}')
    r = c.post('/api/admin/login', headers=H(0), data=json.dumps({'username': 'wuqing', 'password': 'adminwq'}))
    check('后台旧密码被拒', r.status_code == 401, f'got {r.status_code}')

    print('== 场景1e: 备份导入后导入者保持超管 ==')
    backup = {'version': 2,
              'users': [{'id': 20, 'openid': 'dev_someone', 'password': 'x', 'nickname': 's', 'cn': '',
                         'coins': 1, 'is_admin': False, 'is_superadmin': False, 'avatar_url': '', 'rules_viewed': False}],
              'teams': [], 'competitions': [], 'matches': [], 'questions': [], 'options': [],
              'bets': [], 'prizes': [], 'livestreams': [], 'leaderboard': [], 'match_scores': []}
    r = c.post('/api/admin/import', headers=H(boss_uid), data=json.dumps(backup))
    check('导入成功', r.status_code == 200, r.data[:80])
    with app.app_context():
        boss = User.query.filter_by(openid='dev_boss').first()
        check('导入者(boss)重建且仍是超管', boss is not None and bool(boss.is_superadmin))

# ================= 场景2: 旧库升级 =================
print('== 场景2: 旧库(dev_wuqing无标识)升级自动继承 ==')
db2 = fresh_db('t_admin_legacy.db')
env = dict(os.environ, DATABASE_URL='sqlite:///' + db2.replace(os.sep, '/'))

# 模拟旧版本数据库: 不含is_superadmin列, 只有dev_wuqing
conn_sql = f'''
import sqlite3
conn = sqlite3.connect(r"{db2}")
conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, openid VARCHAR(128) UNIQUE, password VARCHAR(128), nickname VARCHAR(64), avatar_url VARCHAR(256), cn VARCHAR(64), coins INTEGER, is_admin BOOLEAN, rules_viewed BOOLEAN, created_at DATETIME)")
conn.execute("INSERT INTO users (openid, password, nickname, cn, coins, is_admin, rules_viewed) VALUES ('dev_wuqing','adminwq','\u96fe\u6e05','WuQing',999999,1,1)")
conn.commit(); conn.close()
print('old db made')
'''
r = subprocess.run([sys.executable, '-c', conn_sql], capture_output=True, text=True, env=env)
if r.returncode != 0:
    print(r.stdout, r.stderr)
    check('构造旧库', False)

upgrade_sql = '''
import os, sys, json
sys.path.insert(0, r"%s")
from app import create_app
app = create_app()
with app.test_client() as c:
    r = c.post('/api/dev-login', headers={'Content-Type': 'application/json'},
               data=json.dumps({'username': 'wuqing', 'password': 'adminwq'}))
    d = json.loads(r.data)
    print('RESULT', r.status_code, d.get('is_superadmin'), d.get('need_setup'))
''' % HERE
r = subprocess.run([sys.executable, '-c', upgrade_sql], capture_output=True, text=True, env=env)
out = r.stdout.strip()
print(' ', out.replace('\n', '\n  ')[:300])
check('旧库升级: wuqing/adminwq 可登录且获得超管', 'RESULT 200 True False' in out, out[-120:])

print()
print(f'总结: {len(failures)} 项失败')
for f in failures:
    print('  -', f)
sys.exit(1 if failures else 0)
