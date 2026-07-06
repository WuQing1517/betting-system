# -*- coding: utf-8 -*-
"""从backup.json导入数据到新服务器的数据库"""
import json, sys, os

if len(sys.argv) < 2:
    print("Usage: python restore.py backup.json")
    sys.exit(1)

with open(sys.argv[1], 'r', encoding='utf-8') as f:
    data = json.load(f)

os.chdir(os.path.join(os.path.dirname(__file__), 'backend'))
sys.path.insert(0, os.getcwd())

from app import create_app
from datetime import datetime

app = create_app()
with app.app_context():
    from models import db, User, Team, Competition, Match, Question, Option, Bet, Prize, OperationLog, Livestream

    db.create_all()

    # Import users
    for u_data in data.get('users', []):
        user = User.query.filter_by(openid=u_data['openid']).first()
        if not user:
            user = User(openid=u_data['openid'])
            db.session.add(user)
        user.nickname = u_data.get('nickname', '')
        user.cn = u_data.get('cn', '')
        user.coins = u_data.get('coins', 5000)
        user.is_admin = u_data.get('is_admin', False)
    db.session.commit()
    print(f"Users: {len(data.get('users', []))}")

    # Import teams
    for t_data in data.get('teams', []):
        team = Team.query.get(t_data['id'])
        if not team:
            team = Team(id=t_data['id'])
            db.session.add(team)
        team.name = t_data.get('name', '')
        team.logo_url = t_data.get('logo_url', '')
    db.session.commit()
    print(f"Teams: {len(data.get('teams', []))}")

    # Import competitions
    for c_data in data.get('competitions', []):
        comp = Competition.query.get(c_data['id'])
        if not comp:
            comp = Competition(id=c_data['id'])
            db.session.add(comp)
        comp.name = c_data.get('name', '')
        comp.year = c_data.get('year')
        comp.season = c_data.get('season', '')
        comp.status = c_data.get('status', 'active')
        sd = c_data.get('start_date')
        if sd:
            try: comp.start_date = date_type.fromisoformat(sd)
            except: pass
    db.session.commit()
    print(f"Competitions: {len(data.get('competitions', []))}")

    # Import matches
    for m_data in data.get('matches', []):
        match = Match.query.get(m_data['id'])
        if not match:
            match = Match(id=m_data['id'])
            db.session.add(match)
        match.match_code = m_data.get('match_code', '')
        match.competition_id = m_data.get('competition_id')
        match.week_number = m_data.get('week_number')
        match.day_number = m_data.get('day_number')
        match.match_number = m_data.get('match_number')
        match.home_team = m_data.get('home_team', '')
        match.away_team = m_data.get('away_team', '')
        match.status = m_data.get('status', 'active')
    db.session.commit()
    print(f"Matches: {len(data.get('matches', []))}")

    # Import questions
    for q_data in data.get('questions', []):
        q = Question.query.get(q_data['id'])
        if not q:
            q = Question(id=q_data['id'])
            db.session.add(q)
        q.question_code = q_data.get('question_code', '')
        q.question_text = q_data.get('question_text', '')
        q.match_id = q_data.get('match_id')
        q.status = q_data.get('status', 'active')
        q.correct_option_id = q_data.get('correct_option_id')
    db.session.commit()
    print(f"Questions: {len(data.get('questions', []))}")

    # Import options
    for o_data in data.get('options', []):
        opt = Option.query.get(o_data['id'])
        if not opt:
            opt = Option(id=o_data['id'])
            db.session.add(opt)
        opt.question_id = o_data.get('question_id')
        opt.option_text = o_data.get('option_text', '')
        opt.base_rate = o_data.get('base_rate', 2.0)
        opt.total_coins = o_data.get('total_coins', 0)
    db.session.commit()
    print(f"Options: {len(data.get('options', []))}")

    # Import bets
    for b_data in data.get('bets', []):
        bet = Bet.query.get(b_data['id'])
        if not bet:
            bet = Bet(id=b_data['id'])
            db.session.add(bet)
        bet.user_id = b_data.get('user_id')
        bet.question_id = b_data.get('question_id')
        bet.option_id = b_data.get('option_id')
        bet.coins = b_data.get('coins', 0)
    db.session.commit()
    print(f"Bets: {len(data.get('bets', []))}")

    # Import prizes
    for p_data in data.get('prizes', []):
        prize = Prize.query.get(p_data['id'])
        if not prize:
            prize = Prize(id=p_data['id'])
            db.session.add(prize)
        prize.competition_id = p_data.get('competition_id')
        prize.name = p_data.get('name', '')
        prize.quantity = p_data.get('quantity', 1)
        prize.condition = p_data.get('condition', '')
        prize.provider = p_data.get('provider', '')
        prize.notes = p_data.get('notes', '')
        prize.creator_id = p_data.get('creator_id')
    db.session.commit()
    print(f"Prizes: {len(data.get('prizes', []))}")

    # Ensure super admin exists
    if not User.query.filter_by(openid='dev_wuqing').first():
        u = User(openid='dev_wuqing', password='adminwq', nickname='wuqing', cn='\u96FE\u6E05', coins=5000, is_admin=True, rules_viewed=True)
        db.session.add(u)
        db.session.commit()
        print("Super admin created")

    print("\nRestore complete!")
