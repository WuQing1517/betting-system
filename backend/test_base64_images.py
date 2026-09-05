# -*- coding: utf-8 -*-
"""图片base64化改造测试: 上传存库/data URI透出/备份往返/转换脚本"""
import os, sys, json, tempfile, base64, subprocess

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
tmp_db = os.path.join(tempfile.gettempdir(), 't_b64.db')
if os.path.exists(tmp_db):
    os.remove(tmp_db)
os.environ['DATABASE_URL'] = 'sqlite:///' + tmp_db.replace(os.sep, '/')
sys.path.insert(0, HERE)
from app import create_app
from models import db, Team, User

app = create_app()
failures = []

def check(name, cond, detail=''):
    print(f'  [{"PASS" if cond else "FAIL"}] {name} {detail}')
    if not cond:
        failures.append(name)

def is_data_uri(s):
    return isinstance(s, str) and s.startswith('data:image/') and ';base64,' in s

with app.test_client() as c:
    def H(uid):
        return {'X-User-Id': str(uid)}

    r = c.post('/api/dev-login', headers={'Content-Type': 'application/json'},
               data=json.dumps({'username': 'admin', 'password': 'admin'}))
    admin_uid = json.loads(r.data)['user_id']

    print('== 头像上传base64化 (文件实际为JPEG内容, 应按文件头识别) ==')
    img_path = os.path.join(HERE, 'uploads', 'avatars', '8651eced6ce04028a542bcfb5ece2a1b.png')
    r = c.post('/api/user/avatar', headers=H(admin_uid),
               data={'file': (open(img_path, 'rb'), 'a.png')}, content_type='multipart/form-data')
    d = json.loads(r.data)
    check('头像上传成功且为data URI', r.status_code == 200 and is_data_uri(d.get('url')),
          (d.get('url') or r.data)[:40] if r.status_code == 200 else r.data[:80])
    check('按文件头识别为jpeg', d.get('url', '').startswith('data:image/jpeg;base64,'))
    r = c.get('/api/user/profile', headers=H(admin_uid))
    prof = json.loads(r.data)
    check('profile原样透出data URI', is_data_uri(prof.get('avatar_url')))
    r = c.post('/api/dev-login', headers={'Content-Type': 'application/json'},
               data=json.dumps({'username': 'admin', 'password': 'admin'}))
    check('登录响应头像为data URI', is_data_uri(json.loads(r.data).get('avatar_url')))

    print('== 超大图片被拒绝 ==')
    big = b'\x89PNG\r\n' + b'0' * (301 * 1024)
    r = c.post('/api/user/avatar', headers=H(admin_uid),
               data={'file': (big, 'big.png')}, content_type='multipart/form-data')
    check('301KB图片返回400', r.status_code == 400, f'got {r.status_code}')

    print('== 队伍logo上传base64化 ==')
    r = c.post('/api/admin/teams', headers=H(admin_uid), data=json.dumps({'name': '测试队', 'logo_url': ''}),
               content_type='application/json')
    tid = json.loads(r.data)['id']
    r = c.post(f'/api/admin/teams/{tid}/logo', headers=H(admin_uid),
               data={'file': (open(img_path, 'rb'), 't.png')}, content_type='multipart/form-data')
    d = json.loads(r.data)
    check('logo上传成功且为data URI', r.status_code == 200 and is_data_uri(d.get('url')),
          (d.get('url') or r.data)[:40] if r.status_code == 200 else r.data[:80])

    print('== 备份导出导入: data URI完整往返 ==')
    r = c.get('/api/admin/export', headers=H(admin_uid))
    backup = json.loads(r.data)
    team_b = next(t for t in backup['teams'] if t['name'] == '测试队')
    check('导出的logo是data URI', is_data_uri(team_b['logo_url']))

    tmp_db2 = os.path.join(tempfile.gettempdir(), 't_b64_2.db')
    if os.path.exists(tmp_db2):
        os.remove(tmp_db2)
    backup_path = os.path.join(tempfile.gettempdir(), 't_b64_backup.json')
    with open(backup_path, 'w', encoding='utf-8') as f:
        json.dump(backup, f, ensure_ascii=False)

    sub_env = dict(os.environ)
    sub_env['DATABASE_URL'] = 'sqlite:///' + tmp_db2.replace(os.sep, '/')
    sub_env['TEST_DB_URL'] = sub_env['DATABASE_URL']
    r = subprocess.run([sys.executable, os.path.join(HERE, 'test_backup.py'), 'import', backup_path],
                       capture_output=True, text=True, env=sub_env)
    check('第二个库导入成功', '导入响应: 200' in r.stdout, r.stdout.strip().splitlines()[0] if r.stdout.strip() else r.stderr[-150:])

    print('== 转换脚本: 旧地址→base64 ==')
    conv_backup = {'version': 2, 'users': [], 'teams': [
        {'id': 1, 'name': 'MRC', 'logo_url': 'https://106.53.67.7/uploads/teams/a1162c7f69054bd8afde4b209a84b379.jpg'},
        {'id': 2, 'name': 'X', 'logo_url': '/uploads/teams/不存在.png'},
    ], 'competitions': [], 'matches': [], 'questions': [], 'options': [], 'bets': [], 'prizes': [],
       'livestreams': [], 'leaderboard': [], 'match_scores': [], 'logs': []}
    src_p = os.path.join(tempfile.gettempdir(), 'conv_src.json')
    dst_p = os.path.join(tempfile.gettempdir(), 'conv_dst.json')
    json.dump(conv_backup, open(src_p, 'w', encoding='utf-8'), ensure_ascii=False)
    r = subprocess.run([sys.executable, os.path.join(HERE, 'convert_backup_images.py'), src_p, dst_p],
                       capture_output=True, text=True)
    print(' ', r.stdout.strip().replace('\n', '\n  '))
    conv = json.load(open(dst_p, encoding='utf-8'))
    check('死链jpg成功转base64', conv['teams'][0]['logo_url'].startswith('data:image/jpeg;base64,'))
    check('缺失文件保持原地址并报缺', conv['teams'][1]['logo_url'] == '/uploads/teams/不存在.png' and '不存在' in r.stdout)

for p in (tmp_db, tmp_db2, backup_path, src_p, dst_p):
    try:
        os.remove(p)
    except OSError:
        pass
print()
print(f'总结: {len(failures)} 项失败')
for f in failures:
    print('  -', f)
sys.exit(1 if failures else 0)
