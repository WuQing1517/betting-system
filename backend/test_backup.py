# -*- coding: utf-8 -*-
"""备份导出/导入 round-trip 测试
用法:
  TEST_DB_URL=sqlite:///源库 python test_backup.py export <backup.json>
  TEST_DB_URL=sqlite:///空库 python test_backup.py import <backup.json>
  TEST_DB_URL=sqlite:///空库 python test_backup.py import_v1 <v1.json>
"""
import os, sys, json

sys.stdout.reconfigure(encoding='utf-8')
mode = sys.argv[1]
backup_path = sys.argv[2]
os.environ['DATABASE_URL'] = os.environ['TEST_DB_URL']
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import create_app

app = create_app()
H = {'Content-Type': 'application/json', 'X-User-Id': '1'}
SECTIONS = ['users', 'teams', 'competitions', 'matches', 'questions', 'options',
            'bets', 'prizes', 'livestreams', 'leaderboard', 'match_scores']

if mode == 'export':
    with app.test_client() as c:
        r = c.get('/api/admin/export', headers={'X-User-Id': '4'})
        assert r.status_code == 200, r.data[:200]
        open(backup_path, 'wb').write(r.data)
        data = json.loads(r.data)
        print('导出成功:', {k: len(data.get(k, [])) for k in SECTIONS})
        print('backup version:', data.get('version'))
elif mode == 'import':
    data = json.load(open(backup_path, encoding='utf-8'))
    with app.test_client() as c:
        r = c.post('/api/admin/import', headers=H, data=json.dumps(data))
        print('导入响应:', r.status_code, r.data.decode('utf-8')[:200])
        if r.status_code != 200:
            sys.exit(1)
    with app.app_context():
        from models import User, Team, Competition, Match, Question, Option, Bet, Prize, Livestream, LeaderboardEntry, MatchScore
        counts = {
            'users': User.query.count(), 'teams': Team.query.count(), 'competitions': Competition.query.count(),
            'matches': Match.query.count(), 'questions': Question.query.count(), 'options': Option.query.count(),
            'bets': Bet.query.count(), 'prizes': Prize.query.count(), 'livestreams': Livestream.query.count(),
            'leaderboard': LeaderboardEntry.query.count(), 'match_scores': MatchScore.query.count(),
        }
        ok = True
        for k in SECTIONS:
            exp, got = len(data.get(k, [])), counts[k]
            status = 'PASS' if got == exp else 'FAIL'
            if got != exp:
                ok = False
            print(f'  [{status}] {k}: 期望{exp} 实际{got}')
        e = LeaderboardEntry.query.filter_by(team_id=8).first()
        exp_e = next(x for x in data['leaderboard'] if x['team_id'] == 8)
        s1 = e and (e.wins, e.losses, e.draws, e.net_wins, e.rank) == (exp_e['wins'], exp_e['losses'], exp_e['draws'], exp_e['net_wins'], exp_e['rank'])
        print(f'  [{"PASS" if s1 else "FAIL"}] 抽查积分榜 team8')
        ms = MatchScore.query.first()
        exp_ms = data['match_scores'][0]
        s2 = ms and (ms.bo1_home, ms.bo1_away, ms.is_settled) == (exp_ms['bo1_home'], exp_ms['bo1_away'], exp_ms['is_settled'])
        print(f'  [{"PASS" if s2 else "FAIL"}] 抽查比分 match_scores')
        # 导入后新用户主键不能与已有冲突 (SQLite天然max+1; PG由序列重置保证)
        from models import db
        u = User(openid='newuser_after_import', password='x')
        db.session.add(u)
        db.session.commit()
        print(f'  [{"PASS" if u.id > max(x["id"] for x in data["users"]) else "FAIL"}] 导入后新增用户 id={u.id} (最大导入id={max(x["id"] for x in data["users"])})')
        db.session.delete(u)
        db.session.commit()
        sys.exit(0 if ok and s1 and s2 else 1)
elif mode == 'import_v1':
    # 旧版v1备份: 走day_number换算+清空重录路径 (曾因 m.week_number 未赋值崩溃)
    v1 = {
        'version': 1,
        'users': [], 'teams': [{'id': 1, 'name': 'TA', 'logo_url': ''}],
        'competitions': [{'id': 1, 'name': 'V1赛', 'year': 2026, 'season': '测试', 'status': 'active', 'start_date': '2026-06-05'}],
        'matches': [{'id': 1, 'match_code': 'V1赛Week1Day1Match1', 'competition_id': 1, 'week_number': 1,
                     'day_number': 1, 'match_number': 1, 'home_team': 'TA', 'away_team': 'TB', 'status': 'active'}],
        'questions': [], 'options': [], 'bets': [], 'prizes': [],
    }
    with app.test_client() as c:
        r = c.post('/api/admin/import', headers=H, data=json.dumps(v1))
        print('v1导入响应:', r.status_code, r.data.decode('utf-8')[:200])
        if r.status_code != 200:
            sys.exit(1)
    with app.app_context():
        from models import Match
        m = Match.query.first()
        print(f'  [{"PASS" if m and m.match_code == "V1赛Week1Day1Match1" else "FAIL"}] v1 match_code={m.match_code if m else None}')
        sys.exit(0 if m else 1)
