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

@betting_bp.route('/teams', methods=['GET'])
def get_teams():
    teams = Team.query.all()
    return jsonify([{'id': t.id, 'name': t.name, 'logo_url': t.logo_url or ''} for t in teams])

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
            first_monday = competition.start_date - timedelta(days=competition.start_date.weekday())
            match_date = first_monday + timedelta(days=(m.week_number - 1) * 7 + (m.day_number - 1))
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
    elif platform == 'huya':
        return jsonify({'cover': ''})
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
        resp = urllib.request.urlopen(req, timeout=15)
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

def _fetch_cover(platform, room_id):
    import json as json_mod
    try:
        import urllib.request
        if platform == 'bilibili' and room_id:
            url = 'https://api.live.bilibili.com/room/v1/Room/get_info?room_id=' + str(room_id)
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            resp = urllib.request.urlopen(req, timeout=5)
            data = json_mod.loads(resp.read().decode())
            d = data.get('data', {})
            return d.get('cover') or d.get('user_cover') or d.get('keyframe') or ''
    except Exception:
        pass
    return ''

@betting_bp.route('/livestreams', methods=['GET'])
def get_livestreams():
    from models import Livestream
    items = Livestream.query.order_by(Livestream.sort_order, Livestream.id).all()
    return jsonify([{
        'id': i.id, 'name': i.name, 'intro': i.intro or '',
        'platform': i.platform or '', 'room_id': i.room_id or '',
        'url': i.url or '', 'cover_url': i.cover_url or '',
        'creator_id': i.creator_id
    } for i in items])

@betting_bp.route('/admin/livestreams', methods=['POST'])
def create_livestream():
    from models import Livestream, db
    user_id = request.headers.get('X-User-Id')
    user = User.query.get(int(user_id)) if user_id else None
    if not user or not user.is_admin:
        return jsonify({'error': '\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650'}), 403
    data = request.get_json()
    platform = data.get('platform', '')
    room_id = data.get('room_id', '')
    cover = data.get('cover_url', '') or _fetch_cover(platform, room_id)
    ls = Livestream(
        name=data.get('name', ''),
        intro=data.get('intro', ''),
        platform=platform,
        room_id=room_id,
        url=data.get('url', ''),
        cover_url=cover,
        creator_id=user.id
    )
    db.session.add(ls)
    db.session.commit()
    return jsonify({'message': 'OK', 'id': ls.id})

@betting_bp.route('/admin/livestreams/<int:ls_id>', methods=['PUT'])
def update_livestream(ls_id):
    from models import Livestream, db
    user_id = request.headers.get('X-User-Id')
    user = User.query.get(int(user_id)) if user_id else None
    if not user or not user.is_admin:
        return jsonify({'error': '\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650'}), 403
    ls = Livestream.query.get(ls_id)
    if not ls:
        return jsonify({'error': '\u672A\u627E\u5230'}), 404
    data = request.get_json()
    for field in ['name', 'intro', 'platform', 'room_id', 'url']:
        if field in data:
            setattr(ls, field, data[field])
    if 'cover_url' in data:
        ls.cover_url = data['cover_url']
    elif 'platform' in data or 'room_id' in data:
        ls.cover_url = _fetch_cover(ls.platform, ls.room_id) or ls.cover_url or ''
    db.session.commit()
    return jsonify({'message': 'OK'})

@betting_bp.route('/admin/livestreams/<int:ls_id>', methods=['DELETE'])
def delete_livestream(ls_id):
    from models import Livestream, db
    user_id = request.headers.get('X-User-Id')
    user = User.query.get(int(user_id)) if user_id else None
    if not user or not user.is_admin:
        return jsonify({'error': '\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650'}), 403
    ls = Livestream.query.get(ls_id)
    if not ls:
        return jsonify({'error': '\u672A\u627E\u5230'}), 404
    db.session.delete(ls)
    db.session.commit()
    return jsonify({'message': 'OK'})

# ========== 积分榜 ==========
@betting_bp.route('/leaderboard/<int:competition_id>/team', methods=['GET'])
def get_competition_leaderboard(competition_id):
    from models import LeaderboardEntry, Team
    entries = LeaderboardEntry.query.filter_by(competition_id=competition_id).order_by(LeaderboardEntry.rank).all()
    result = []
    for e in entries:
        team = db.session.get(Team, e.team_id)
        result.append({
            'id': e.id, 'team_id': e.team_id,
            'team_name': team.name if team else '',
            'team_logo': (Config.SERVER_URL + team.logo_url if team and team.logo_url and not team.logo_url.startswith('http') else (team.logo_url if team else '')),
            'rank': e.rank, 'prev_rank': e.prev_rank,
            'wins': e.wins, 'losses': e.losses,
            'draws': e.draws, 'net_wins': e.net_wins
        })
    return jsonify(result)

def _require_admin():
    user_id = request.headers.get('X-User-Id')
    user = User.query.get(int(user_id)) if user_id and user_id.isdigit() else None
    if not user or not user.is_admin:
        return None
    return user

@betting_bp.route('/leaderboard/<int:competition_id>/team', methods=['PUT'])
def update_competition_leaderboard(competition_id):
    from models import LeaderboardEntry, db
    if not _require_admin():
        return jsonify({'error': '需要管理员权限'}), 403
    data = request.get_json()
    entries_data = data.get('entries', [])
    for ed in entries_data:
        entry = LeaderboardEntry.query.filter_by(competition_id=competition_id, team_id=ed['team_id']).first()
        if not entry:
            entry = LeaderboardEntry(competition_id=competition_id, team_id=ed['team_id'])
            db.session.add(entry)
        entry.wins = ed.get('wins', 0)
        entry.losses = ed.get('losses', 0)
        entry.draws = ed.get('draws', 0)
        entry.net_wins = ed.get('net_wins', 0)
    db.session.commit()
    _rank_leaderboard(competition_id)
    return jsonify({'message': 'OK'})

# ========== 比赛比分录入 ==========
@betting_bp.route('/leaderboard/<int:competition_id>/match-scores', methods=['GET'])
def get_match_scores(competition_id):
    from models import MatchScore
    date = request.args.get('date', '')
    query = MatchScore.query.filter_by(competition_id=competition_id)
    if date:
        query = query.filter_by(match_date=date)
    scores = query.order_by(MatchScore.id).all()
    result = []
    for s in scores:
        result.append({
            'id': s.id, 'match_date': s.match_date,
            'home_team_id': s.home_team_id, 'away_team_id': s.away_team_id,
            'bo1_home': s.bo1_home, 'bo1_away': s.bo1_away,
            'bo2_home': s.bo2_home, 'bo2_away': s.bo2_away,
            'bo3_home': s.bo3_home, 'bo3_away': s.bo3_away,
            'bo4_home': s.bo4_home, 'bo4_away': s.bo4_away,
            'ot_winner_team_id': s.ot_winner_team_id,
            'home_wins': s.home_wins, 'away_wins': s.away_wins,
            'home_net': s.home_net, 'away_net': s.away_net,
            'home_draws': s.home_draws, 'away_draws': s.away_draws,
            'is_settled': s.is_settled
        })
    return jsonify(result)

@betting_bp.route('/leaderboard/<int:competition_id>/match-scores', methods=['POST'])
def create_match_score(competition_id):
    from models import MatchScore, db
    from sqlalchemy import or_, and_
    if not _require_admin():
        return jsonify({'error': '需要管理员权限'}), 403
    data = request.get_json()
    match_date = data.get('match_date', '')
    home_team_id = data.get('home_team_id')
    away_team_id = data.get('away_team_id')
    # 一场比赛只能有一条记录: 同日同对阵(不分主客)直接复用已有记录
    existing = MatchScore.query.filter_by(competition_id=competition_id, match_date=match_date).filter(or_(
        and_(MatchScore.home_team_id == home_team_id, MatchScore.away_team_id == away_team_id),
        and_(MatchScore.home_team_id == away_team_id, MatchScore.away_team_id == home_team_id)
    )).first()
    if existing:
        return jsonify({'id': existing.id, 'existed': True, 'message': 'OK'})
    ms = MatchScore(
        competition_id=competition_id,
        match_date=match_date,
        home_team_id=home_team_id,
        away_team_id=away_team_id
    )
    db.session.add(ms)
    db.session.commit()
    return jsonify({'id': ms.id, 'message': 'OK'})

# IVL计分: 按抓捕/逃生人数积分, 4->5分, 3->3分, 2->2分, 1->1分, 0->0分
_CATCH_POINTS = {0: 0, 1: 1, 2: 2, 3: 3, 4: 5}

def _calc_match_result(home_scores, away_scores, home_team_id=None, away_team_id=None, ot_winner_team_id=None):
    """按IVL官方规则计算一场比赛结果(BO3+加赛)。
    - 每局胜负: 上下半场积分之和高者胜, 相同平局
    - 官方: 前2局取得2胜即分出胜负, 后续局不再进行(不计入)
    - 三局打完未分胜负: 比较三局总积分, 高者直接获胜(无需加赛)
    - 三局打完且总积分相同: 进入加赛(BO4), 加赛积分定胜负; 加赛仍平则按ot_winner人工判定
    - 局数不足3局且无2胜: 比赛未打完, 不判胜负
    - 净胜局: 仅统计BO1-3局差(加赛结果不计入净胜局/平局记录)
    - 平局记录: 官方口径=负场平局数-胜场平局数, 胜方-ties/负方+ties; 未决出胜负为0
    返回: home_w, away_w, home_net, away_net, home_draws, away_draws, decided"""
    bo_results = []
    home_pts = away_pts = 0
    for i in range(3):
        hs = home_scores[i]
        as_ = away_scores[i]
        if hs == 0 and as_ == 0:
            continue  # 未录入的局
        # 单局积分: 主队 = 主抓f(h) + 主逃f(4-a), 客队 = 客抓f(a) + 客逃f(4-h)
        home_pts += _CATCH_POINTS.get(hs, 0) + _CATCH_POINTS.get(4 - as_, 0)
        away_pts += _CATCH_POINTS.get(as_, 0) + _CATCH_POINTS.get(4 - hs, 0)
        if hs > as_:
            bo_results.append('home')
        elif as_ > hs:
            bo_results.append('away')
        else:
            bo_results.append('tie')
        if bo_results.count('home') >= 2 or bo_results.count('away') >= 2:
            break  # 已分出胜负, 后续局不再统计
    hw_count = bo_results.count('home')
    aw_count = bo_results.count('away')
    ties = bo_results.count('tie')
    home_net = hw_count - aw_count
    away_net = aw_count - hw_count

    winner = None
    if hw_count >= 2:
        winner = 'home'
    elif aw_count >= 2:
        winner = 'away'
    elif len(bo_results) == 3 and home_pts != away_pts:
        winner = 'home' if home_pts > away_pts else 'away'  # 三局打完, 总积分决胜
    elif len(bo_results) == 3:
        # 三局打完且总积分相同 -> 加赛
        ot_home = home_scores[3] if len(home_scores) > 3 else 0
        ot_away = away_scores[3] if len(away_scores) > 3 else 0
        if not (ot_home == 0 and ot_away == 0):
            if ot_home > ot_away:
                winner = 'home'  # 加赛积分定胜负
            elif ot_away > ot_home:
                winner = 'away'
        if winner is None and ot_winner_team_id:
            try:
                ot_id = int(ot_winner_team_id)
            except (TypeError, ValueError):
                ot_id = None
            if ot_id and ot_id == home_team_id:
                winner = 'home'
            elif ot_id and ot_id == away_team_id:
                winner = 'away'
    # 局数不足3局且无2胜: 比赛未打完, 不判胜负

    if winner == 'home':
        home_w, away_w = 1, 0
        home_draws, away_draws = -ties, ties
    elif winner == 'away':
        home_w, away_w = 0, 1
        home_draws, away_draws = ties, -ties
    else:
        home_w, away_w = 0, 0
        home_draws, away_draws = 0, 0
    decided = winner is not None
    return home_w, away_w, home_net, away_net, home_draws, away_draws, decided

@betting_bp.route('/leaderboard/<int:competition_id>/match-scores/<int:score_id>', methods=['GET'])
def get_match_score(competition_id, score_id):
    from models import MatchScore
    s = MatchScore.query.get(score_id)
    if not s:
        return jsonify({'error': '\u672A\u627E\u5230'}), 404
    return jsonify({
        'id': s.id, 'match_date': s.match_date,
        'home_team_id': s.home_team_id, 'away_team_id': s.away_team_id,
        'bo1_home': s.bo1_home, 'bo1_away': s.bo1_away,
        'bo2_home': s.bo2_home, 'bo2_away': s.bo2_away,
        'bo3_home': s.bo3_home, 'bo3_away': s.bo3_away,
        'bo4_home': s.bo4_home, 'bo4_away': s.bo4_away,
        'ot_winner_team_id': s.ot_winner_team_id,
        'home_wins': s.home_wins, 'away_wins': s.away_wins,
        'home_net': s.home_net, 'away_net': s.away_net,
        'home_draws': s.home_draws, 'away_draws': s.away_draws,
        'is_settled': s.is_settled
    })

@betting_bp.route('/leaderboard/<int:competition_id>/match-scores/<int:score_id>', methods=['PUT'])
def update_match_score(competition_id, score_id):
    from models import MatchScore, db
    if not _require_admin():
        return jsonify({'error': '需要管理员权限'}), 403
    s = MatchScore.query.get(score_id)
    if not s:
        return jsonify({'error': '未找到'}), 404
    data = request.get_json()
    s.bo1_home = data.get('bo1_home', 0)
    s.bo1_away = data.get('bo1_away', 0)
    s.bo2_home = data.get('bo2_home', 0)
    s.bo2_away = data.get('bo2_away', 0)
    s.bo3_home = data.get('bo3_home', 0)
    s.bo3_away = data.get('bo3_away', 0)
    s.bo4_home = data.get('bo4_home', 0)
    s.bo4_away = data.get('bo4_away', 0)
    ot_winner_team_id = data.get('ot_winner_team_id') or s.ot_winner_team_id
    if 'ot_winner_team_id' in data and data['ot_winner_team_id']:
        try:
            s.ot_winner_team_id = int(data['ot_winner_team_id'])
        except (TypeError, ValueError):
            pass
    hw, aw, hn, an, hd, ad, decided = _calc_match_result(
        [s.bo1_home, s.bo2_home, s.bo3_home, s.bo4_home],
        [s.bo1_away, s.bo2_away, s.bo3_away, s.bo4_away],
        s.home_team_id, s.away_team_id, ot_winner_team_id
    )
    s.home_wins = hw
    s.away_wins = aw
    s.home_net = hn
    s.away_net = an
    s.home_draws = hd
    s.away_draws = ad
    s.is_settled = decided
    db.session.commit()
    _update_leaderboard_from_scores(competition_id)
    return jsonify({'message': 'OK'})

def _update_leaderboard_from_scores(competition_id):
    from models import MatchScore, LeaderboardEntry, db
    scores = MatchScore.query.filter_by(competition_id=competition_id).all()
    team_stats = {}
    def ensure(tid):
        if tid not in team_stats:
            team_stats[tid] = {'wins': 0, 'losses': 0, 'draws': 0, 'net_wins': 0}
        return team_stats[tid]
    for s in scores:
        if s.home_team_id is None or s.away_team_id is None:
            continue
        if s.is_settled:
            hs = ensure(s.home_team_id)
            hs['wins'] += s.home_wins
            hs['losses'] += s.away_wins
            hs['net_wins'] += s.home_net
            hs['draws'] += s.home_draws
            as_ = ensure(s.away_team_id)
            as_['wins'] += s.away_wins
            as_['losses'] += s.home_wins
            as_['net_wins'] += s.away_net
            as_['draws'] += s.away_draws
        else:
            # 未决出胜负的比赛: 只累计净胜局, 不计胜场/平局记录
            ensure(s.home_team_id)['net_wins'] += s.home_net
            ensure(s.away_team_id)['net_wins'] += s.away_net
    existing = {e.team_id: e for e in LeaderboardEntry.query.filter_by(competition_id=competition_id).all()}
    for tid, stats in team_stats.items():
        if tid in existing:
            e = existing[tid]
            e.wins = stats['wins']
            e.losses = stats['losses']
            e.draws = stats['draws']
            e.net_wins = stats['net_wins']
        else:
            e = LeaderboardEntry(competition_id=competition_id, team_id=tid,
                wins=stats['wins'], losses=stats['losses'],
                draws=stats['draws'], net_wins=stats['net_wins'])
            db.session.add(e)
    # 无比赛记录的队伍保留其手动编辑的数据(不删除不覆盖)
    db.session.commit()
    _rank_leaderboard(competition_id)

def _rank_leaderboard(competition_id):
    """排名: 胜场数 > 净胜局数 > 平局记录 > 相互胜负关系 > 相互对战净胜局数 (IVL官方口径)"""
    from models import LeaderboardEntry, MatchScore, db
    entries = LeaderboardEntry.query.filter_by(competition_id=competition_id).all()
    scores = MatchScore.query.filter_by(competition_id=competition_id, is_settled=True).all()
    h2h = {}  # (小id, 大id) -> {team_id: {'wins': 相互胜场, 'net': 相互对战净胜局}}
    def _h2h_rec(a, b):
        key = (a, b) if a < b else (b, a)
        return h2h.setdefault(key, {a: {'wins': 0, 'net': 0}, b: {'wins': 0, 'net': 0}})
    for s in scores:
        if s.home_team_id is None or s.away_team_id is None:
            continue
        if s.home_wins > s.away_wins:
            w, l = s.home_team_id, s.away_team_id
        elif s.away_wins > s.home_wins:
            w, l = s.away_team_id, s.home_team_id
        else:
            continue  # 无胜场的记录不参与相互胜负
        w_net = s.home_net if w == s.home_team_id else s.away_net
        l_net = s.away_net if w == s.home_team_id else s.home_net
        rec = _h2h_rec(s.home_team_id, s.away_team_id)
        rec[w]['wins'] += 1
        rec[w]['net'] += w_net
        rec[l]['net'] += l_net

    def primary_key(e):
        return (-e.wins, -e.net_wins, e.draws)
    entries.sort(key=lambda e: (primary_key(e), e.id))
    # 总分相同的队伍之间依次比较相互胜负关系、相互对战净胜局数
    i = 0
    while i < len(entries):
        j = i
        while j + 1 < len(entries) and primary_key(entries[j + 1]) == primary_key(entries[i]):
            j += 1
        if j > i:
            group = entries[i:j + 1]
            member_ids = [e.team_id for e in group]  # 先快照: key函数不能遍历正在排序的列表
            def h2h_key(e):
                w = n = 0
                for oid in member_ids:
                    if oid == e.team_id:
                        continue
                    key = (e.team_id, oid) if e.team_id < oid else (oid, e.team_id)
                    rec = h2h.get(key)
                    if rec and e.team_id in rec:
                        w += rec[e.team_id]['wins']
                        n += rec[e.team_id]['net']
                return (-w, -n)
            group.sort(key=h2h_key)  # 稳定排序, 战绩仍相同则保持原相对顺序
            entries[i:j + 1] = group
        i = j + 1
    for idx, e in enumerate(entries):
        if e.rank > 0:
            e.prev_rank = e.rank
        e.rank = idx + 1
    db.session.commit()
