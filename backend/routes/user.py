# -*- coding: utf-8 -*-
from flask import Blueprint, request, jsonify, current_app
from config import Config
from models import db, User
import os
import uuid

user_bp = Blueprint('user', __name__)

@user_bp.route('/user/profile', methods=['GET'])
def get_profile():
    user_id = request.headers.get('X-User-Id')
    if not user_id:
        return jsonify({'error': 'Missing user id'}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    avatar_url = user.avatar_url if user.avatar_url and user.avatar_url.startswith('http') else (Config.SERVER_URL + user.avatar_url if user.avatar_url else '')

    return jsonify({
        'user_id': user.id,
        'openid': user.openid,
        'nickname': user.nickname,
        'avatar_url': avatar_url,
        'cn': user.cn,
        'coins': user.coins,
        'is_admin': user.is_admin,
        'is_superadmin': user.openid == 'dev_wuqing',
        'rules_viewed': user.rules_viewed
    })

@user_bp.route('/user/profile', methods=['PUT'])
def update_profile():
    user_id = request.headers.get('X-User-Id')
    if not user_id:
        return jsonify({'error': 'Missing user id'}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json()
    if 'nickname' in data and data['nickname'] != user.nickname:
        from routes.betting import log_operation
        log_operation(user_id, '\u66f4\u6539\u6635\u79f0', f'{user.nickname} \u6539\u4e3a {data["nickname"]}')
    if 'nickname' in data:
        user.nickname = data['nickname']
    if 'avatar_url' in data:
        user.avatar_url = data['avatar_url']
    if 'cn' in data:
        user.cn = data['cn']

    db.session.commit()
    return jsonify({'message': 'Profile updated'})

@user_bp.route('/user/password', methods=['PUT'])
def change_password():
    user_id = request.headers.get('X-User-Id')
    if not user_id:
        return jsonify({'error': 'Missing user id'}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json()
    old_password = data.get('old_password', '')
    new_password = data.get('new_password', '')

    if not old_password or not new_password:
        return jsonify({'error': 'Missing password'}), 400

    if user.password and user.password != old_password:
        return jsonify({'error': 'Old password incorrect'}), 400

    user.password = new_password
    db.session.commit()
    return jsonify({'message': 'Password updated'})

@user_bp.route('/user/avatar', methods=['POST'])
def upload_avatar():
    user_id = request.headers.get('X-User-Id') or request.form.get('user_id')
    if not user_id:
        return jsonify({'error': 'Missing user id'}), 400

    user = User.query.get(int(user_id))
    if not user:
        return jsonify({'error': 'User not found'}), 404

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    allowed_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_extensions:
        return jsonify({'error': 'Invalid file type'}), 400

    filename = uuid.uuid4().hex + ext
    upload_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], 'avatars')
    os.makedirs(upload_folder, exist_ok=True)
    filepath = os.path.join(upload_folder, filename)

    file.save(filepath)

    url = '/uploads/avatars/' + filename
    user.avatar_url = Config.SERVER_URL + url
    db.session.commit()

    response = jsonify({'url': url})
    response.headers['Content-Type'] = 'application/json'
    return response

@user_bp.route('/user/rules-viewed', methods=['PUT'])
def mark_rules_viewed():
    user_id = request.headers.get('X-User-Id')
    if not user_id:
        return jsonify({'error': 'Missing user id'}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    user.rules_viewed = True
    db.session.commit()

@user_bp.route('/user/coin-history', methods=['GET'])
def get_coin_history():
    user_id = request.headers.get('X-User-Id')
    if not user_id:
        return jsonify({'error': 'Missing user id'}), 400

    from models import Bet, Question, Option, Competition, Match
    from datetime import datetime, timedelta
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    group = request.args.get('group', 'day')
    bets = Bet.query.filter_by(user_id=user.id).all()

    # 当前总资产 = 当前币数 + 未结算投注总额
    pending_total = 0
    for b in bets:
        q = Question.query.get(b.question_id)
        if q and q.status != 'completed':
            pending_total += b.coins
    current_assets = user.coins + pending_total

    # 收集所有已结算投注的盈亏事件
    events = []
    for b in bets:
        q = Question.query.get(b.question_id)
        m = Match.query.get(q.match_id) if q else None
        dt = b.created_at or datetime.utcnow()
        if group == 'week':
            label = '\u7B2C' + str(m.week_number) + '\u5468' if m else dt.strftime('%m/%d')
            sort_key = str(m.week_number).zfill(3) if m else dt.strftime('%Y-%m-%d')
        else:
            if m and m.match_date:
                label = m.match_date.strftime('%m/%d')
                sort_key = m.match_date.strftime('%Y-%m-%d')
            else:
                label = dt.strftime('%m/%d')
                sort_key = dt.strftime('%Y-%m-%d')
        # 已结算的有盈亏变化，未结算的变化为0（余额不变）
        change = 0
        if q and q.status == 'completed' and q.correct_option_id:
            total_pool = sum(o.total_coins for o in q.options)
            correct_option = Option.query.get(q.correct_option_id)
            if not correct_option or correct_option.total_coins == 0:
                actual_rate = correct_option.base_rate
            else:
                actual_rate = correct_option.base_rate * (total_pool / correct_option.total_coins)
            is_win = b.option_id == q.correct_option_id
            change = int(b.coins * actual_rate) - b.coins if is_win else 0
        events.append({'sort_key': sort_key, 'label': label, 'change': change})

    events.sort(key=lambda x: x['sort_key'])

    grouped = {}
    for e in events:
        k = e['sort_key']
        if k not in grouped:
            grouped[k] = {'label': e['label'], 'total_change': 0}
        grouped[k]['total_change'] += e['change']

    comps = Competition.query.filter_by(status='active').order_by(Competition.start_date).first()
    if group == 'week':
        first_match = Match.query.filter_by(competition_id=comps.id).order_by(Match.week_number).first() if comps else None
        first_label = '\u7B2C' + str(first_match.week_number) + '\u5468' if first_match else ''
    else:
        if comps and comps.start_date:
            first_label = comps.start_date.strftime('%m/%d')
        elif grouped:
            first_label = list(grouped.values())[0]['label']
        else:
            first_label = ''

    # 从当前总资产反推，逐步减去每次结算的收益
    total_settled_change = sum(g['total_change'] for g in grouped.values())
    initial_assets = current_assets - total_settled_change

    result = [{'date': first_label, 'balance': initial_assets}]
    balance = initial_assets
    for g in grouped.values():
        balance += g['total_change']
        result.append({'date': g['label'], 'balance': balance, 'change': g['total_change']})
    return jsonify(result)
