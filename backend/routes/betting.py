# -*- coding: utf-8 -*-
from flask import Blueprint, request, jsonify
from config import Config
from models import db, User, Team, Competition, Match, Question, Option, Bet
from datetime import date, timedelta
from models import OperationLog

def log_operation(user_id, action, detail):
    from models import User
    u = User.query.get(user_id) if user_id else None
    entry = OperationLog(user_id=user_id, nickname=u.nickname if u else '', action=action, detail=detail)
    db.session.add(entry)

betting_bp = Blueprint('betting', __name__)

@betting_bp.route('/competitions', methods=['GET'])
def get_competitions():
    competitions = Competition.query.filter_by(status='active').all()
    return jsonify([{'id': c.id, 'name': c.name, 'year': c.year, 'season': c.season, 'status': c.status} for c in competitions])

@betting_bp.route('/competitions/<int:competition_id>/matches', methods=['GET'])
def get_competition_matches(competition_id):
    matches = Match.query.filter_by(competition_id=competition_id).order_by(Match.week_number, Match.day_number, Match.match_number).all()
    teams = Team.query.all()
    team_logos = {t.name: t.logo_url for t in teams}
    return jsonify([{
        'id': m.id, 'match_code': m.match_code, 'competition_id': m.competition_id,
        'week_number': m.week_number, 'day_number': m.day_number, 'match_number': m.match_number,
        'home_team': m.home_team, 'away_team': m.away_team, 'status': m.status,
        'home_logo': (Config.SERVER_URL + team_logos.get(m.home_team) if team_logos.get(m.home_team) and not team_logos.get(m.home_team, '').startswith('http') else (team_logos.get(m.home_team) or '')),
        'away_logo': (Config.SERVER_URL + team_logos.get(m.away_team) if team_logos.get(m.away_team) and not team_logos.get(m.away_team, '').startswith('http') else (team_logos.get(m.away_team) or ''))
    } for m in matches])

@betting_bp.route('/competitions/<int:competition_id>/full', methods=['GET'])
def get_competition_full(competition_id):
    competition = Competition.query.get(competition_id)
    if not competition:
        return jsonify({'error': 'Competition not found'}), 404
    user_id = request.headers.get('X-User-Id')
    matches = Match.query.filter_by(competition_id=competition_id).order_by(Match.week_number, Match.day_number, Match.match_number).all()
    teams = Team.query.all()
    team_logos = {t.name: t.logo_url for t in teams}
    def make_logo(url):
        if url and not url.startswith('http'):
            return Config.SERVER_URL + url
        return url or ''
    weekday_names = ['\u5468\u4E00', '\u5468\u4E8C', '\u5468\u4E09', '\u5468\u56DB', '\u5468\u4E94', '\u5468\u516D', '\u5468\u65E5']
    match_ids = [m.id for m in matches]
    all_questions = Question.query.filter(Question.match_id.in_(match_ids)).all() if match_ids else []
    questions_by_match = {}
    for q in all_questions:
        if q.match_id not in questions_by_match:
            questions_by_match[q.match_id] = []
        questions_by_match[q.match_id].append(q)
    question_ids = [q.id for q in all_questions]
    all_options = Option.query.filter(Option.question_id.in_(question_ids)).all() if question_ids else []
    options_by_question = {}
    for o in all_options:
        if o.question_id not in options_by_question:
            options_by_question[o.question_id] = []
        options_by_question[o.question_id].append(o)
    all_bets = {}
    if user_id and question_ids:
        all_bets_list = Bet.query.filter(Bet.user_id == user_id, Bet.question_id.in_(question_ids)).all()
        for b in all_bets_list:
            all_bets[(b.question_id, b.option_id)] = b.coins
    matches_data = []
    start_date_str = competition.start_date.isoformat() if competition.start_date else None
    for m in matches:
        questions = questions_by_match.get(m.id, [])
        match_date_str = None
        match_weekday = None
        if competition.start_date:
            match_date = competition.start_date + timedelta(days=(m.week_number - 1) * 7 + (m.day_number - 1))
            match_date_str = match_date.isoformat()
            match_weekday = weekday_names[match_date.weekday()]
        questions_data = []
        for q in questions:
            options = options_by_question.get(q.id, [])
            total_coins = sum(o.total_coins for o in options)
            options_data = []
            for o in options:
                user_bet = all_bets.get((q.id, o.id), 0)
                options_data.append({'id': o.id, 'option_text': o.option_text, 'base_rate': o.base_rate, 'total_coins': o.total_coins, 'user_bet': user_bet})
            user_total_bet = sum(x['user_bet'] for x in options_data)
            questions_data.append({'id': q.id, 'question_code': q.question_code, 'question_text': q.question_text, 'status': q.status, 'correct_option_id': q.correct_option_id, 'total_coins': total_coins, 'user_total_bet': user_total_bet, 'options': options_data})
        matches_data.append({'id': m.id, 'match_code': m.match_code, 'week_number': m.week_number, 'day_number': m.day_number, 'match_number': m.match_number, 'home_team': m.home_team, 'away_team': m.away_team, 'home_logo': make_logo(team_logos.get(m.home_team)), 'away_logo': make_logo(team_logos.get(m.away_team)), 'match_date': match_date_str, 'match_weekday': match_weekday, 'status': m.status, 'questions': questions_data})
    return jsonify({'id': competition.id, 'name': competition.name, 'year': competition.year, 'season': competition.season, 'status': competition.status, 'start_date': start_date_str, 'matches': matches_data})

@betting_bp.route('/matches/<match_code>', methods=['GET'])
def get_match(match_code):
    match = Match.query.filter_by(match_code=match_code).first()
    if not match:
        return jsonify({'error': 'Match not found'}), 404
    user_id = request.headers.get('X-User-Id')
    questions = Question.query.filter_by(match_id=match.id).all()
    question_ids = [q.id for q in questions]
    all_options = Option.query.filter(Option.question_id.in_(question_ids)).all() if question_ids else []
    options_by_question = {}
    for o in all_options:
        if o.question_id not in options_by_question:
            options_by_question[o.question_id] = []
        options_by_question[o.question_id].append(o)
    all_bets = {}
    if user_id and question_ids:
        all_bets_list = Bet.query.filter(Bet.user_id == user_id, Bet.question_id.in_(question_ids)).all()
        for b in all_bets_list:
            all_bets[(b.question_id, b.option_id)] = b.coins
    questions_data = []
    for q in questions:
        options = options_by_question.get(q.id, [])
        total_coins = sum(o.total_coins for o in options)
        options_data = []
        for o in options:
            user_bet = all_bets.get((q.id, o.id), 0)
            options_data.append({'id': o.id, 'option_text': o.option_text, 'base_rate': o.base_rate, 'total_coins': o.total_coins, 'user_bet': user_bet})
        user_total_bet = sum(x['user_bet'] for x in options_data)
        questions_data.append({'id': q.id, 'question_code': q.question_code, 'question_text': q.question_text, 'status': q.status, 'correct_option_id': q.correct_option_id, 'total_coins': total_coins, 'user_total_bet': user_total_bet, 'options': options_data})
    return jsonify({'id': match.id, 'match_code': match.match_code, 'week_number': match.week_number, 'day_number': match.day_number, 'match_number': match.match_number, 'home_team': match.home_team, 'away_team': match.away_team, 'status': match.status, 'questions': questions_data})

@betting_bp.route('/questions/<question_code>', methods=['GET'])
def get_question(question_code):
    question = Question.query.filter_by(question_code=question_code).first()
    if not question:
        return jsonify({'error': 'Question not found'}), 404
    user_id = request.headers.get('X-User-Id')
    options = Option.query.filter_by(question_id=question.id).all()
    total_coins = sum(o.total_coins for o in options)
    options_data = []
    for o in options:
        user_bet = 0
        if user_id:
            bet = Bet.query.filter_by(user_id=user_id, question_id=question.id, option_id=o.id).first()
            if bet:
                user_bet = bet.coins
        options_data.append({'id': o.id, 'option_text': o.option_text, 'base_rate': o.base_rate, 'total_coins': o.total_coins, 'user_bet': user_bet})
    user_total_bet = sum(x['user_bet'] for x in options_data)
    return jsonify({'id': question.id, 'question_code': question.question_code, 'question_text': question.question_text, 'status': question.status, 'correct_option_id': question.correct_option_id, 'total_coins': total_coins, 'user_total_bet': user_total_bet, 'options': options_data})

@betting_bp.route('/bets', methods=['POST'])
def place_bet():
    user_id = request.headers.get('X-User-Id')
    if not user_id:
        return jsonify({'error': 'Missing user id'}), 400
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    data = request.get_json()
    question_id = data.get('question_id')
    option_id = data.get('option_id')
    coins = data.get('coins')
    if question_id is None or option_id is None or coins is None:
        return jsonify({'error': 'Missing required fields'}), 400
    coins = int(coins)
    if coins < 0:
        return jsonify({'error': 'Invalid coins'}), 400
    question = Question.query.get(question_id)
    if not question or question.status not in ['active', 'closed']:
        return jsonify({'error': 'Question not found'}), 400
    if question.status == 'closed':
        return jsonify({'error': 'Question is closed'}), 400
    option = Option.query.get(option_id)
    if not option or option.question_id != question_id:
        return jsonify({'error': 'Invalid option'}), 400
    existing_bet = Bet.query.filter_by(user_id=user_id, question_id=question_id, option_id=option_id).first()
    if existing_bet:
        if coins == 0:
            user.coins += existing_bet.coins
            option.total_coins -= existing_bet.coins
            db.session.delete(existing_bet)
            log_operation(user_id, '\u6295\u5E01\u53D6\u6D88', f'\u95EE\u9898\u3010{question.question_text}\u3011\u9009\u9879\u3010{option.option_text}\u3011\u9000\u56DE{existing_bet.coins}\u5E01')
            db.session.commit()
            return jsonify({'message': 'Bet cancelled', 'new_coins': user.coins})
        diff = coins - existing_bet.coins
        if diff > 0 and user.coins < diff:
            return jsonify({'error': 'Insufficient coins'}), 400
        existing_bet.coins = coins
        option.total_coins += diff
        user.coins -= diff
        log_operation(user_id, '\u6295\u5E01\u4FEE\u6539', f'\u95EE\u9898\u3010{question.question_text}\u3011\u9009\u9879\u3010{option.option_text}\u3011\u6539\u4E3A{coins}\u5E01')
        db.session.commit()
        return jsonify({'message': 'Bet updated', 'new_coins': user.coins})
    if user.coins < coins:
        return jsonify({'error': 'Insufficient coins'}), 400
    bet = Bet(user_id=user_id, question_id=question_id, option_id=option_id, coins=coins)
    user.coins -= coins
    option.total_coins += coins
    db.session.add(bet)
    log_operation(user_id, '\u6295\u5E01', f'\u95EE\u9898\u3010{question.question_text}\u3011\u9009\u9879\u3010{option.option_text}\u3011\u6295{coins}\u5E01')
    db.session.commit()
    return jsonify({'message': 'Bet placed'})

@betting_bp.route('/questions/<int:question_id>/bets', methods=['GET'])
def get_question_bets(question_id):
    question = Question.query.get(question_id)
    if not question:
        return jsonify({'error': 'Question not found'}), 404
    bets = Bet.query.filter_by(question_id=question_id).all()
    result = []
    for b in bets:
        user = User.query.get(b.user_id)
        option = Option.query.get(b.option_id)
        result.append({
            'user_id': b.user_id,
            'nickname': user.nickname if user else 'Unknown',
            'cn': user.cn if user else '',
            'option_id': b.option_id,
            'option_text': option.option_text if option else '',
            'coins': b.coins
        })
    return jsonify(result)

@betting_bp.route('/pending-coins', methods=['GET'])
def get_pending_coins():
    user_id = request.headers.get('X-User-Id')
    if not user_id:
        return jsonify({'error': 'Missing user id'}), 400
    bets = Bet.query.filter(Bet.user_id == user_id).all()
    pending = 0
    for b in bets:
        q = Question.query.get(b.question_id)
        if q and q.status in ['active', 'closed']:
            pending += b.coins
    return jsonify({'pending_coins': pending})

@betting_bp.route('/leaderboard', methods=['GET'])
def get_leaderboard():
    users = User.query.order_by(User.coins.desc()).limit(100).all()
    return jsonify([{'rank': i + 1, 'user_id': u.id, 'nickname': u.nickname, 'cn': u.cn, 'coins': u.coins, 'avatar_url': (Config.SERVER_URL + u.avatar_url if u.avatar_url and not u.avatar_url.startswith('http') else (u.avatar_url or ''))} for i, u in enumerate(users)])

@betting_bp.route('/prizes', methods=['GET'])
def get_prizes():
    from models import Prize
    comp_id = request.args.get('competition_id')
    if comp_id:
        prizes = Prize.query.filter_by(competition_id=int(comp_id)).order_by(Prize.id.desc()).all()
    else:
        prizes = Prize.query.order_by(Prize.id.desc()).all()
    result = []
    for p in prizes:
        creator = User.query.get(p.creator_id) if p.creator_id else None
        result.append({
            'id': p.id, 'competition_id': p.competition_id, 'name': p.name, 'quantity': p.quantity,
            'condition': p.condition or '', 'provider': p.provider or '',
            'notes': p.notes or '', 'creator_id': p.creator_id,
            'creator_name': creator.nickname if creator else ''
        })
    return jsonify(result)

@betting_bp.route('/livestream/cover', methods=['GET'])
def get_livestream_cover():
    import json as json_mod
    platform = request.args.get('platform', 'bilibili')
    room_id = request.args.get('room_id', '')
    if platform == 'bilibili' and room_id:
        try:
            import urllib.request
            url = 'https://api.live.bilibili.com/room/v1/Room/get_info?room_id=' + str(room_id)
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            resp = urllib.request.urlopen(req, timeout=5)
            data = json_mod.loads(resp.read().decode())
            d = data.get('data', {})
            cover = d.get('cover') or d.get('user_cover') or d.get('keyframe') or ''
            return jsonify({'cover': cover})
        except Exception:
            return jsonify({'cover': ''})

@betting_bp.route('/livestream/image', methods=['GET'])
def proxy_livestream_image():
    img_url = request.args.get('url', '')
    if not img_url or not img_url.startswith('http'):
        return '', 400
    try:
        import urllib.request
        req = urllib.request.Request(img_url, headers={
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://www.bilibili.com/'
        })
        resp = urllib.request.urlopen(req, timeout=10)
        data = resp.read()
        content_type = resp.headers.get('Content-Type', 'image/jpeg')
        return data, 200, {'Content-Type': content_type, 'Cache-Control': 'public, max-age=3600'}
    except Exception:
        return '', 404

@betting_bp.route('/operation-logs', methods=['GET'])
def get_operation_logs():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    logs = OperationLog.query.order_by(OperationLog.id.desc()).paginate(page=page, per_page=per_page, error_out=False)
    return jsonify([{
        'id': l.id, 'user_id': l.user_id, 'nickname': l.nickname,
        'action': l.action, 'detail': l.detail,
        'created_at': l.created_at.strftime('%Y-%m-%d %H:%M:%S') if l.created_at else ''
    } for l in logs.items])
    return jsonify({'cover': ''})
