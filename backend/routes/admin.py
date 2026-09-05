from flask import Blueprint, request, jsonify, current_app
from models import db, User, Team, Competition, Match, Question, Option, Bet, resolve_image_url, detect_image_mime
from config import Config
from functools import wraps
import base64
import os
import uuid

admin_bp = Blueprint('admin', __name__)

def admin_required(f):
    """管理员权限验证装饰器"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = request.headers.get('X-User-Id')
        if not user_id:
            return jsonify({'error': '缺少用户ID'}), 400
        
        user = User.query.get(user_id)
        if not user or not user.is_admin:
            return jsonify({'error': '需要管理员权限'}), 403
        
        return f(*args, **kwargs)
    return decorated_function

def superadmin_required(f):
    """超级管理员权限验证装饰器"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = request.headers.get('X-User-Id')
        if not user_id:
            return jsonify({'error': '缺少用户ID'}), 400

        user = User.query.get(int(user_id))
        if not user or not user.is_superadmin:
            return jsonify({'error': '需要超级管理员权限'}), 403

        return f(*args, **kwargs)
    return decorated_function

@admin_bp.route('/setup-superadmin', methods=['PUT'])
@superadmin_required
def setup_superadmin():
    """超级管理员首次登录修改默认账号/密码/CN (修改后不再提示)"""
    user_id = request.headers.get('X-User-Id')
    me = User.query.get(int(user_id))
    if not me:
        return jsonify({'error': '用户不存在'}), 404
    data = request.get_json()
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '').strip()
    cn = (data.get('cn') or '').strip()
    if len(username) < 2:
        return jsonify({'error': '账号至少2个字符'}), 400
    if len(password) < 4:
        return jsonify({'error': '密码至少4位'}), 400
    new_openid = 'dev_' + username
    exists = User.query.filter_by(openid=new_openid).first()
    if exists and exists.id != me.id:
        return jsonify({'error': '该账号已被使用'}), 400
    me.openid = new_openid
    me.password = password
    me.cn = cn
    me.is_superadmin = True
    db.session.commit()
    return jsonify({
        'message': 'OK',
        'user': {'user_id': me.id, 'openid': me.openid, 'nickname': me.nickname,
                 'cn': me.cn, 'is_superadmin': True, 'need_setup': False}
    })

# 文件上传
@admin_bp.route('/upload', methods=['POST'])
@admin_required
def upload_file():
    """上传文件"""
    if 'file' not in request.files:
        return jsonify({'error': '未上传文件'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '未选择文件'}), 400

    # 检查文文件类型
    allowed_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_extensions:
        return jsonify({'error': '文文件类型不支持'}), 400

    # 生成唯一文件名
    filename = f"{uuid.uuid4().hex}{ext}"
    upload_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], 'teams')
    os.makedirs(upload_folder, exist_ok=True)
    filepath = os.path.join(upload_folder, filename)

    file.save(filepath)

    # 返回可访问的URL
    url = f"/uploads/teams/{filename}"
    return jsonify({'url': url, 'filename': filename})

# 用户户管理
@admin_bp.route('/users', methods=['GET'])
@admin_required
def get_users():
    """获取用户户列表"""
    users = User.query.all()
    return jsonify([{
        'id': u.id,
        'openid': u.openid,
        'nickname': u.nickname,
        'avatar_url': u.avatar_url,
        'cn': u.cn,
        'coins': u.coins,
        'is_admin': u.is_admin,
        'created_at': u.created_at.isoformat() if u.created_at else None
    } for u in users])

@admin_bp.route('/users/<int:user_id>/coins', methods=['PUT'])
@admin_required
def update_user_coins(user_id):
    """调整用户户币数"""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': '用户户不存在在'}), 404
    
    data = request.get_json()
    amount = data.get('amount')
    action = data.get('action')  # 'add' or 'subtract'
    
    if not all([amount, action]):
        return jsonify({'error': '缺少必要参数'}), 400
    
    if action == 'add':
        user.coins += amount
    elif action == 'subtract':
        if user.coins < amount:
            return jsonify({'error': '币数不足'}), 400
        user.coins -= amount
    else:
        return jsonify({'error': '操作类型无效'}), 400
    
    db.session.commit()
    admin_user = User.query.get(int(request.headers.get('X-User-Id')))
    from routes.betting import log_operation
    log_operation(admin_user.id, '\u8C03\u5E01', f'\u7528\u6237{user.nickname}({user_id}) {action} {amount}\u5E01 \u7ED3\u679C{user.coins}\u5E01')
    db.session.commit()
    return jsonify({'message': 'Coins updated', 'new_coins': user.coins})

@admin_bp.route('/users/<int:user_id>/admin', methods=['PUT'])
@superadmin_required
def toggle_admin(user_id):
    """设置/取消管理员"""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': '用户户不存在在'}), 404

    data = request.get_json()
    is_admin = data.get('is_admin')

    if is_admin is None:
        return jsonify({'error': '缺少is_admin参数'}), 400

    user.is_admin = is_admin
    db.session.commit()
    admin_user = User.query.get(int(request.headers.get('X-User-Id')))
    from routes.betting import log_operation
    log_operation(admin_user.id, '\u8BBE\u7F6E\u7BA1\u7406\u5458' if is_admin else '\u53D6\u6D88\u7BA1\u7406\u5458', f'\u7528\u6237{user.nickname}({user_id})')
    db.session.commit()
    return jsonify({'message': 'Admin status updated'})

@admin_bp.route('/users/<int:user_id>', methods=['DELETE'])
@superadmin_required
def delete_user(user_id):
    """删除用户户"""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': '用户户不存在在'}), 404

    # 不能删除超级管理员
    if user.is_superadmin:
        return jsonify({'error': '不能删除超级管理员'}), 400

    # 删除该用户户的投注记录
    Bet.query.filter_by(user_id=user_id).delete()
    db.session.delete(user)
    db.session.commit()
    return jsonify({'message': 'User deleted'})

# 队伍管理
@admin_bp.route('/teams', methods=['GET'])
@admin_required
def get_teams():
    """获取队伍列表"""
    teams = Team.query.all()
    return jsonify([{
        'id': t.id,
        'name': t.name,
        'logo_url': t.logo_url,
        'created_at': t.created_at.isoformat()
    } for t in teams])

@admin_bp.route('/teams', methods=['POST'])
@admin_required
def create_team():
    """创建队伍"""
    data = request.get_json()
    name = data.get('name')
    logo_url = data.get('logo_url')

    if not name:
        return jsonify({'error': '缺少队伍名称'}), 400

    existing = Team.query.filter_by(name=name).first()
    if existing:
        return jsonify({'error': '队伍已存在在'}), 400

    team = Team(name=name, logo_url=logo_url)
    db.session.add(team)
    db.session.commit()

    return jsonify({'message': 'Team created', 'id': team.id})

@admin_bp.route('/teams/<int:team_id>/logo', methods=['POST'])
@admin_required
def upload_team_logo(team_id):
    """上传战队Logo"""
    team = Team.query.get(team_id)
    if not team:
        return jsonify({'error': '队伍不存在在'}), 404

    if 'file' not in request.files:
        return jsonify({'error': '未上传文件'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '未选择文件'}), 400

    allowed_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_extensions:
        return jsonify({'error': '文文件类型不支持'}), 400

    # 图片以base64存入数据库, 跟随数据库持久化(不写本地磁盘)
    data = file.read()
    if len(data) > 300 * 1024:
        return jsonify({'error': '图片大小不能超过300KB'}), 400
    mime = detect_image_mime(data, ext)
    team.logo_url = 'data:%s;base64,%s' % (mime, base64.b64encode(data).decode())
    db.session.commit()

    return jsonify({'url': team.logo_url})

@admin_bp.route('/teams/<int:team_id>', methods=['PUT'])
@admin_required
def update_team(team_id):
    """编辑队伍"""
    team = Team.query.get(team_id)
    if not team:
        return jsonify({'error': '队伍不存在在'}), 404

    data = request.get_json()
    if 'name' in data:
        team.name = data['name']
    if 'logo_url' in data:
        team.logo_url = data['logo_url']

    db.session.commit()
    return jsonify({'message': 'Team updated'})

@admin_bp.route('/teams/<int:team_id>', methods=['DELETE'])
@admin_required
def delete_team(team_id):
    """删除队伍"""
    team = Team.query.get(team_id)
    if not team:
        return jsonify({'error': '队伍不存在在'}), 404

    team_name = team.name

    # 清空比赛中的队伍
    Match.query.filter_by(home_team=team_name).update({'home_team': None})
    Match.query.filter_by(away_team=team_name).update({'away_team': None})

    db.session.delete(team)
    db.session.commit()
    return jsonify({'message': 'Team deleted'})

# 比赛管理
@admin_bp.route('/competitions', methods=['POST'])
@admin_required
def create_competition():
    """创建赛事"""
    data = request.get_json()
    name = data.get('name')
    year = data.get('year')
    season = data.get('season')
    start_date_str = data.get('start_date')
    
    if not all([name, year, season]):
        return jsonify({'error': '缺少必要参数'}), 400
    
    existing = Competition.query.filter_by(name=name).first()
    if existing:
        return jsonify({'error': '赛事已存在'}), 400
    
    from datetime import date as date_type
    start_date = None
    if start_date_str:
        try:
            start_date = date_type.fromisoformat(start_date_str)
        except ValueError:
            pass
    
    competition = Competition(
        name=name,
        year=year,
        season=season,
        start_date=start_date
    )
    db.session.add(competition)
    db.session.commit()
    
    return jsonify({'message': 'Competition created', 'id': competition.id})

@admin_bp.route('/matches', methods=['POST'])
@admin_required
def create_match():
    """创建比赛"""
    data = request.get_json()
    competition_id = data.get('competition_id')
    week_number = data.get('week_number')
    day_number = data.get('day_number')
    match_number = data.get('match_number')

    if not all([competition_id, week_number, day_number, match_number]):
        return jsonify({'error': '缺少必要参数'}), 400

    # 获取大比赛信息
    competition = Competition.query.get(competition_id)
    if not competition:
        return jsonify({'error': '比赛不存在在'}), 404

    # 计算周内比赛日序号: 同周的day_number排序后映射为Day1,Day2...
    same_week_days = sorted(set([m.day_number for m in Match.query.filter_by(
        competition_id=competition_id, week_number=week_number).all()] + [day_number]))
    day_seq = same_week_days.index(day_number) + 1

    # 生成比赛代码
    match_code = f"{competition.name}Week{week_number}Day{day_seq}Match{match_number}"

    # 检查是否已存在在，如果存在在则更新主客场信息
    existing = Match.query.filter_by(match_code=match_code).first()
    if existing:
        home_team = data.get('home_team')
        away_team = data.get('away_team')
        if home_team is not None:
            existing.home_team = home_team
        if away_team is not None:
            existing.away_team = away_team
        db.session.commit()
        return jsonify({'message': 'Match updated', 'id': existing.id, 'match_code': match_code})

    match = Match(
        match_code=match_code,
        competition_id=competition_id,
        week_number=week_number,
        day_number=day_number,
        match_number=match_number,
        home_team=data.get('home_team'),
        away_team=data.get('away_team')
    )
    db.session.add(match)
    db.session.flush()
    # Auto-add teams if not exist
    for team_name in [data.get('home_team'), data.get('away_team')]:
        if team_name and team_name.strip():
            existing_team = Team.query.filter_by(name=team_name.strip()).first()
            if not existing_team:
                db.session.add(Team(name=team_name.strip()))  # 获取match.id

    # 自动生成3个问题
    for i in range(1, 4):
        question_code = f"{match_code}Q{i}"
        question = Question(
            question_code=question_code,
            match_id=match.id,
            question_text=f"第{i}题"
        )
        db.session.add(question)
        db.session.flush()

        # 每题生成2个空选项
        for j in range(2):
            option = Option(
                question_id=question.id,
                option_text="",
                base_rate=2.0
            )
            db.session.add(option)

    db.session.commit()

    return jsonify({'message': 'Match created with 3 questions', 'id': match.id, 'match_code': match_code})

@admin_bp.route('/competitions/<int:competition_id>', methods=['PUT'])
@admin_required
def update_competition(competition_id):
    """编辑大比赛"""
    competition = Competition.query.get(competition_id)
    if not competition:
        return jsonify({'error': '比赛不存在在'}), 404
    
    data = request.get_json()
    if 'name' in data:
        competition.name = data['name']
    if 'year' in data:
        competition.year = data['year']
    if 'season' in data:
        competition.season = data['season']
    if 'status' in data:
        competition.status = data['status']
    if 'start_date' in data:
        from datetime import date as date_type
        sd = data['start_date']
        if sd:
            try:
                competition.start_date = date_type.fromisoformat(sd)
            except (ValueError, TypeError):
                pass
        else:
            competition.start_date = None
    
    db.session.commit()
    return jsonify({'message': 'Competition updated'})

@admin_bp.route('/competitions/<int:competition_id>', methods=['DELETE'])
@admin_required
def delete_competition(competition_id):
    """删除大比赛"""
    competition = Competition.query.get(competition_id)
    if not competition:
        return jsonify({'error': '比赛不存在在'}), 404
    
    # 检查是否有关联的比赛
    matches = Match.query.filter_by(competition_id=competition_id).first()
    if matches:
        return jsonify({'error': '不能删除有关联比赛的大比赛'}), 400
    
    db.session.delete(competition)
    db.session.commit()
    return jsonify({'message': 'Competition deleted'})

@admin_bp.route('/matches/<int:match_id>', methods=['PUT'])
@admin_required
def update_match(match_id):
    """编辑比赛"""
    match = Match.query.get(match_id)
    if not match:
        return jsonify({'error': '比赛不存在在'}), 404

    data = request.get_json()
    competition = Competition.query.get(match.competition_id)

    if 'week_number' in data:
        match.week_number = data['week_number']
    if 'day_number' in data:
        match.day_number = data['day_number']
    if 'match_number' in data:
        match.match_number = data['match_number']
    if 'status' in data:
        match.status = data['status']
    if 'home_team' in data:
        match.home_team = data['home_team']
    if 'away_team' in data:
        match.away_team = data['away_team']

    # 重新生成比赛代码（周内比赛日序号）
    same_week_days = sorted(set([m.day_number for m in Match.query.filter_by(
        competition_id=match.competition_id, week_number=match.week_number).all()]))
    day_seq = same_week_days.index(match.day_number) + 1 if match.day_number in same_week_days else 1
    match.match_code = f"{competition.name}Week{match.week_number}Day{day_seq}Match{match.match_number}"

    db.session.commit()
    return jsonify({'message': 'Match updated', 'match_code': match.match_code})

@admin_bp.route('/competitions/<int:competition_id>/matches', methods=['DELETE'])
@admin_required
def delete_competition_matches(competition_id):
    """删除赛事下所有比赛"""
    matches = Match.query.filter_by(competition_id=competition_id).all()
    for m in matches:
        questions = Question.query.filter_by(match_id=m.id).all()
        for q in questions:
            Option.query.filter_by(question_id=q.id).delete()
            Bet.query.filter_by(question_id=q.id).delete()
            db.session.delete(q)
        db.session.delete(m)
    db.session.commit()
    return jsonify({'message': 'All matches deleted', 'count': len(matches)})

@admin_bp.route('/matches/<int:match_id>', methods=['DELETE'])
@admin_required
def delete_match(match_id):
    """删除比赛（同时删除关联的问题和投注）"""
    match = Match.query.get(match_id)
    if not match:
        return jsonify({'error': '比赛不存在在'}), 404
    
    # 删除关联的问题、选项和投注
    questions = Question.query.filter_by(match_id=match_id).all()
    for q in questions:
        Option.query.filter_by(question_id=q.id).delete()
        Bet.query.filter_by(question_id=q.id).delete()
        db.session.delete(q)
    
    db.session.delete(match)
    db.session.commit()
    return jsonify({'message': 'Match deleted'})

@admin_bp.route('/matches/<int:match_id>/status', methods=['PUT'])
@admin_required
def update_match_status(match_id):
    """设置比赛状态"""
    match = Match.query.get(match_id)
    if not match:
        return jsonify({'error': '比赛不存在在'}), 404
    
    data = request.get_json()
    status = data.get('status')
    
    if status not in ['active', 'completed']:
        return jsonify({'error': '状态值无效'}), 400
    
    match.status = status
    db.session.commit()
    return jsonify({'message': 'Match status updated'})

# 问题管理
@admin_bp.route('/questions', methods=['POST'])
@admin_required
def create_question():
    """创建问题"""
    data = request.get_json()
    match_id = data.get('match_id')
    question_text = data.get('question_text')
    options = data.get('options')  # [{option_text, base_rate}]
    
    if not all([match_id, question_text, options]) or len(options) < 2 or len(options) > 3:
        return jsonify({'error': '输入内容无效'}), 400
    
    # 获取比赛信息
    match = Match.query.get(match_id)
    if not match:
        return jsonify({'error': '比赛不存在在'}), 404
    
    # 生成问题序号
    existing_count = Question.query.filter_by(match_id=match_id).count()
    question_number = existing_count + 1
    question_code = f"{match.match_code}Q{question_number}"
    
    # 创建问题
    question = Question(
        question_code=question_code,
        match_id=match_id,
        question_text=question_text
    )
    db.session.add(question)
    db.session.flush()  # 获取question.id
    
    # 创建选项
    for opt in options:
        option = Option(
            question_id=question.id,
            option_text=opt['option_text'],
            base_rate=opt['base_rate']
        )
        db.session.add(option)
    
    db.session.commit()
    return jsonify({'message': 'Question created', 'id': question.id, 'question_code': question_code})

@admin_bp.route('/questions/<int:question_id>', methods=['PUT'])
@admin_required
def update_question(question_id):
    """编辑问题"""
    question = Question.query.get(question_id)
    if not question:
        return jsonify({'error': '问题不存在在'}), 404
    
    data = request.get_json()
    if 'question_text' in data:
        question.question_text = data['question_text']
    
    db.session.commit()
    return jsonify({'message': 'Question updated'})

@admin_bp.route('/questions/<int:question_id>/answer', methods=['PUT'])
@admin_required
def set_correct_answer(question_id):
    """设置正确答案"""
    question = Question.query.get(question_id)
    if not question:
        return jsonify({'error': '问题不存在在'}), 404

    data = request.get_json()
    option_id = data.get('option_id')

    if not option_id:
        return jsonify({'error': '缺少option_id参数'}), 400

    option = Option.query.get(option_id)
    if not option or option.question_id != question_id:
        return jsonify({'error': '选项无效'}), 400

    question.correct_option_id = option_id
    question.status = 'completed'

    settle_bets(question_id, option_id)

    db.session.commit()

    print(f'[SETTLE] qid={question_id} option_id={option_id} settled OK')

    # 检查该比赛是否所有问题都已结算
    match = Match.query.get(question.match_id)
    if match:
        all_questions = Question.query.filter_by(match_id=match.id).all()
        all_completed = all(q.status == 'completed' for q in all_questions)
        if all_completed and len(all_questions) > 0:
            match.status = 'completed'
            db.session.commit()

    return jsonify({'message': 'Correct answer set and bets settled'})

@admin_bp.route('/questions/<int:question_id>/reset', methods=['PUT'])
@admin_required
def reset_question(question_id):
    """重置结算 - 退回所有投注金币"""
    question = Question.query.get(question_id)
    if not question:
        return jsonify({'error': 'Question not found'}), 404

    if question.status != 'completed':
        return jsonify({'error': 'Question not settled'}), 400

    # 退回所有赢家的奖金
    if question.correct_option_id:
        total_coins = sum(o.total_coins for o in question.options)
        correct_option = Option.query.get(question.correct_option_id)
        if correct_option and correct_option.total_coins > 0:
            actual_rate = correct_option.base_rate * (total_coins / correct_option.total_coins)
        else:
            actual_rate = correct_option.base_rate if correct_option else 2.0

        winning_bets = Bet.query.filter_by(question_id=question_id, option_id=question.correct_option_id).all()
        for bet in winning_bets:
            user = User.query.get(bet.user_id)
            if user:
                winnings = int(bet.coins * actual_rate)
                user.coins -= winnings

    # 退回所有投注本金并删除投注记录
    all_bets = Bet.query.filter_by(question_id=question_id).all()
    for bet in all_bets:
        user = User.query.get(bet.user_id)
        if user:
            user.coins += bet.coins
        option = Option.query.get(bet.option_id)
        if option:
            option.total_coins -= bet.coins
        db.session.delete(bet)

    # 重置选项投注额
    for opt in question.options:
        opt.total_coins = 0

    # 重置问题状态
    question.correct_option_id = None
    question.status = 'active'

    match = Match.query.get(question.match_id)
    if match and match.status == 'completed':
        match.status = 'active'

    db.session.commit()
    return jsonify({'message': 'Question reset, all coins returned'})

@admin_bp.route('/questions/<int:question_id>/close', methods=['PUT'])
@admin_required
def toggle_question_close(question_id):
    """开盘/封盘切换"""
    question = Question.query.get(question_id)
    if not question:
        return jsonify({'error': '问题不存在在'}), 404

    if question.status == 'active':
        question.status = 'closed'
        msg = '已封盘，停止下注'
    elif question.status == 'closed':
        question.status = 'active'
        msg = '已开盘，开始下注'
    else:
        return jsonify({'error': '已结算的问题不能操作'}), 400

    db.session.commit()
    return jsonify({'message': msg, 'status': question.status})

@admin_bp.route('/questions/<int:question_id>', methods=['DELETE'])
@admin_required
def delete_question(question_id):
    """删除问题"""
    question = Question.query.get(question_id)
    if not question:
        return jsonify({'error': '问题不存在在'}), 404

    # 删除关联的选项和投注
    Option.query.filter_by(question_id=question_id).delete()
    Bet.query.filter_by(question_id=question_id).delete()
    db.session.delete(question)
    db.session.commit()
    return jsonify({'message': 'Question deleted'})

# 选项管理
@admin_bp.route('/options', methods=['POST'])
@admin_required
def create_option():
    """添加选项"""
    data = request.get_json()
    question_id = data.get('question_id')
    option_text = data.get('option_text', '')
    base_rate = data.get('base_rate', 2.0)

    if not question_id:
        return jsonify({'error': '缺少question_id参数'}), 400

    question = Question.query.get(question_id)
    if not question:
        return jsonify({'error': '问题不存在在'}), 404

    option = Option(
        question_id=question_id,
        option_text=option_text,
        base_rate=base_rate
    )
    db.session.add(option)
    db.session.commit()

    return jsonify({'message': 'Option created', 'id': option.id})

@admin_bp.route('/options/<int:option_id>', methods=['PUT'])
@admin_required
def update_option(option_id):
    """编辑选项"""
    option = Option.query.get(option_id)
    if not option:
        return jsonify({'error': '选项不存在在'}), 404

    data = request.get_json()
    if 'option_text' in data:
        option.option_text = data['option_text']
    if 'base_rate' in data:
        option.base_rate = data['base_rate']

    db.session.commit()
    return jsonify({'message': 'Option updated'})

@admin_bp.route('/options/<int:option_id>', methods=['DELETE'])
@admin_required
def delete_option(option_id):
    """删除选项"""
    option = Option.query.get(option_id)
    if not option:
        return jsonify({'error': '选项不存在在'}), 404

    # 检查选项数量
    question = Question.query.get(option.question_id)
    if question and len(question.options) <= 2:
        return jsonify({'error': '每个问题至少需要2个选项'}), 400

    db.session.delete(option)
    db.session.commit()
    return jsonify({'message': 'Option deleted'})

def settle_bets(question_id, correct_option_id):
    """结算投注"""
    question = Question.query.get(question_id)
    correct_option = Option.query.get(correct_option_id)
    
    # 计算实际倍率
    total_coins = sum(o.total_coins for o in question.options)
    if correct_option.total_coins == 0:
        actual_rate = correct_option.base_rate
    else:
        actual_rate = correct_option.base_rate * (total_coins / correct_option.total_coins)
    
    # 获取所有投注正确选项的用户户
    winning_bets = Bet.query.filter_by(
        question_id=question_id,
        option_id=correct_option_id
    ).all()
    
    # 增加用户户币数
    for bet in winning_bets:
        user = User.query.get(bet.user_id)
        winnings = int(bet.coins * actual_rate)
        user.coins += winnings
        from routes.betting import log_operation
        log_operation(bet.user_id, '\u6295\u5E01\u80DC\u5229', f'\u95EE\u9898{question_id} \u6295{bet.coins}\u5E01 \u83B7\u5F97{winnings}\u5E01')

# 数据统计
@admin_bp.route('/stats', methods=['GET'])
@admin_required
def get_stats():
    """获取统计数据"""
    total_users = User.query.count()
    total_matches = Match.query.count()
    total_questions = Question.query.count()
    total_bets = Bet.query.count()
    total_coins_bet = db.session.query(db.func.sum(Bet.coins)).scalar() or 0
    
    return jsonify({
        'total_users': total_users,
        'total_matches': total_matches,
        'total_questions': total_questions,
        'total_bets': total_bets,
        'total_coins_bet': total_coins_bet
    })

# 奖品管理
from models import Prize

@admin_bp.route('/prizes', methods=['POST'])
@admin_required
def create_prize():
    user_id = request.headers.get('X-User-Id')
    data = request.get_json()
    prize = Prize(
        competition_id=data.get('competition_id'),
        name=data.get('name', ''),
        quantity=data.get('quantity', 1),
        condition=data.get('condition', ''),
        provider=data.get('provider', ''),
        notes=data.get('notes', ''),
        creator_id=int(user_id)
    )
    db.session.add(prize)
    db.session.commit()
    return jsonify({'message': 'Prize created', 'id': prize.id})

@admin_bp.route('/prizes/<int:prize_id>', methods=['PUT'])
@admin_required
def update_prize(prize_id):
    user_id = int(request.headers.get('X-User-Id'))
    user = User.query.get(user_id)
    prize = Prize.query.get(prize_id)
    if not prize:
        return jsonify({'error': 'Prize not found'}), 404
    is_superadmin = bool(user and user.is_superadmin)
    if not is_superadmin and prize.creator_id != user_id:
        return jsonify({'error': '\u53EA\u80FD\u7F16\u8F91\u81EA\u5DF1\u6DFB\u52A0\u7684\u5956\u54C1'}), 403
    data = request.get_json()
    for field in ['name', 'quantity', 'condition', 'provider', 'notes']:
        if field in data:
            setattr(prize, field, data[field])
    db.session.commit()
    return jsonify({'message': 'Prize updated'})

@admin_bp.route('/prizes/<int:prize_id>', methods=['DELETE'])
@admin_required
def delete_prize(prize_id):
    user_id = int(request.headers.get('X-User-Id'))
    user = User.query.get(user_id)
    prize = Prize.query.get(prize_id)
    if not prize:
        return jsonify({'error': 'Prize not found'}), 404
    is_superadmin = bool(user and user.is_superadmin)
    if not is_superadmin and prize.creator_id != user_id:
        return jsonify({'error': '\u53EA\u80FD\u5220\u9664\u81EA\u5DF1\u6DFB\u52A0\u7684\u5956\u54C1'}), 403
    db.session.delete(prize)
    db.session.commit()
    return jsonify({'message': 'Prize deleted'})

@admin_bp.route('/export', methods=['GET'])
def export_data():
    """导出所有数据为JSON (超级管理员登录 或 备份令牌)"""
    backup_token = os.environ.get('BACKUP_TOKEN', '')
    req_token = request.headers.get('X-Backup-Token', '')
    if not (backup_token and req_token and req_token == backup_token):
        # 无令牌或令牌不匹配: 按超级管理员身份校验
        from models import User as _User
        user_id = request.headers.get('X-User-Id')
        user = _User.query.get(int(user_id)) if user_id and user_id.isdigit() else None
        if not user or not user.is_superadmin:
            return jsonify({'error': '需要超级管理员权限'}), 403
    from models import User, Team, Competition, Match, Question, Option, Bet, Prize, OperationLog, Livestream, LeaderboardEntry, MatchScore
    data = {
        'version': 2,
        'users': [{'id': u.id, 'nickname': u.nickname, 'cn': u.cn, 'coins': u.coins, 'is_admin': u.is_admin, 'is_superadmin': u.is_superadmin, 'openid': u.openid, 'password': u.password, 'avatar_url': u.avatar_url, 'rules_viewed': u.rules_viewed} for u in User.query.all()],
        'teams': [{'id': t.id, 'name': t.name, 'logo_url': t.logo_url} for t in Team.query.all()],
        'competitions': [{'id': c.id, 'name': c.name, 'year': c.year, 'season': c.season, 'status': c.status, 'start_date': str(c.start_date) if c.start_date else None} for c in Competition.query.all()],
        'matches': [{'id': m.id, 'match_code': m.match_code, 'competition_id': m.competition_id, 'week_number': m.week_number, 'day_number': m.day_number, 'match_number': m.match_number, 'home_team': m.home_team, 'away_team': m.away_team, 'status': m.status} for m in Match.query.all()],
        'questions': [{'id': q.id, 'question_code': q.question_code, 'question_text': q.question_text, 'match_id': q.match_id, 'status': q.status, 'correct_option_id': q.correct_option_id} for q in Question.query.all()],
        'options': [{'id': o.id, 'question_id': o.question_id, 'option_text': o.option_text, 'base_rate': o.base_rate, 'total_coins': o.total_coins} for o in Option.query.all()],
        'bets': [{'id': b.id, 'user_id': b.user_id, 'question_id': b.question_id, 'option_id': b.option_id, 'coins': b.coins} for b in Bet.query.all()],
        'prizes': [{'id': p.id, 'competition_id': p.competition_id, 'name': p.name, 'quantity': p.quantity, 'condition': p.condition, 'provider': p.provider, 'notes': p.notes, 'creator_id': p.creator_id} for p in Prize.query.all()],
        'livestreams': [{'id': l.id, 'name': l.name, 'intro': l.intro, 'platform': l.platform, 'room_id': l.room_id, 'url': l.url, 'cover_url': l.cover_url, 'creator_id': l.creator_id, 'sort_order': l.sort_order} for l in Livestream.query.all()],
        'leaderboard': [{'id': e.id, 'competition_id': e.competition_id, 'team_id': e.team_id, 'wins': e.wins, 'losses': e.losses, 'draws': e.draws, 'net_wins': e.net_wins, 'rank': e.rank, 'prev_rank': e.prev_rank} for e in LeaderboardEntry.query.all()],
        'match_scores': [{'id': s.id, 'competition_id': s.competition_id, 'match_date': s.match_date, 'home_team_id': s.home_team_id, 'away_team_id': s.away_team_id,
                          'bo1_home': s.bo1_home, 'bo1_away': s.bo1_away, 'bo2_home': s.bo2_home, 'bo2_away': s.bo2_away,
                          'bo3_home': s.bo3_home, 'bo3_away': s.bo3_away, 'bo4_home': s.bo4_home, 'bo4_away': s.bo4_away,
                          'ot_winner_team_id': s.ot_winner_team_id, 'home_wins': s.home_wins, 'away_wins': s.away_wins,
                          'home_net': s.home_net, 'away_net': s.away_net, 'home_draws': s.home_draws, 'away_draws': s.away_draws,
                          'is_settled': s.is_settled} for s in MatchScore.query.all()],
        'logs': [{'id': l.id, 'user_id': l.user_id, 'nickname': l.nickname, 'action': l.action, 'detail': l.detail, 'created_at': str(l.created_at) if l.created_at else None} for l in OperationLog.query.order_by(OperationLog.id.desc()).limit(500).all()]
    }
    from flask import Response
    import json
    return Response(json.dumps(data, ensure_ascii=False, indent=2), mimetype='application/json', headers={'Content-Disposition': 'attachment; filename=backup.json'})

@admin_bp.route('/import', methods=['POST'])
@superadmin_required
def import_data():
    """导入数据"""
    try:
        data = request.get_json()
        from datetime import date as date_type
        # 记录导入者身份: 用户表会被重建, 导入者必须保留超级管理员权限
        importer_openid = None
        uid = request.headers.get('X-User-Id')
        importer = User.query.get(int(uid)) if uid and uid.isdigit() else None
        if importer:
            importer_openid = importer.openid

        # SQLite时代的脏数据清洗: 整数字段可能存了空字符串等非数值内容
        def _int(v, default=0):
            try:
                return int(v)
            except (TypeError, ValueError):
                return default

        def _int_opt(v):
            if v in (None, ''):
                return None
            try:
                return int(v)
            except (TypeError, ValueError):
                return None

        def _float(v, default=0.0):
            try:
                return float(v)
            except (TypeError, ValueError):
                return default
        # 用户按备份的显式id重建, 保证bets等表中的user_id引用一致
        # (需先删除bets: PostgreSQL外键约束, 且bets随后会按原id重新导入)
        Bet.query.delete()
        User.query.delete()
        db.session.commit()
        # 性能: 一次性内存比对, 避免逐行查库(跨国数据库逐行往返会超时)
        users_by_openid = {}
        for u_data in data.get('users', []):
            user = User(id=u_data['id'], openid=u_data['openid'])
            db.session.add(user)
            user.nickname = u_data.get('nickname', '')
            user.cn = u_data.get('cn', '')
            user.coins = _int(u_data.get('coins'), 5000)
            user.is_admin = u_data.get('is_admin', False)
            user.is_superadmin = bool(u_data.get('is_superadmin', False))
            user.password = u_data.get('password', '')
            user.avatar_url = u_data.get('avatar_url', '')
            user.rules_viewed = u_data.get('rules_viewed', False)
            users_by_openid[user.openid] = user
        # 导入者保持超级管理员(旧版本备份没有is_superadmin字段也不会丢权限)
        if importer_openid:
            imp = users_by_openid.get(importer_openid)
            if imp is None:
                # 显式分配不冲突的id: 序列可能因历史导入错位, 自动取值会撞已有主键
                max_id = max([u_data['id'] for u_data in data.get('users', [])] or [0])
                imp = User(id=max_id + 1, openid=importer_openid, nickname='admin', coins=0,
                           is_admin=True, is_superadmin=True, rules_viewed=True)
                db.session.add(imp)
                users_by_openid[importer_openid] = imp
            imp.is_superadmin = True
        db.session.commit()
        teams_by_id = {t.id: t for t in Team.query.all()}
        teams_by_name = {}
        for t_ in teams_by_id.values():
            teams_by_name.setdefault(t_.name, t_)
        for t_data in data.get('teams', []):
            team = teams_by_id.get(t_data['id']) or teams_by_name.get(t_data.get('name', ''))
            if not team:
                team = Team(id=t_data['id'])
                teams_by_id[team.id] = team
                db.session.add(team)
            team.name = t_data.get('name', '')
            teams_by_name[team.name] = team
            team.logo_url = t_data.get('logo_url', '')
        db.session.commit()
        comps_by_id = {c.id: c for c in Competition.query.all()}
        comps_by_name = {}
        for c_ in comps_by_id.values():
            comps_by_name.setdefault(c_.name, c_)
        for c_data in data.get('competitions', []):
            comp = comps_by_id.get(c_data['id']) or comps_by_name.get(c_data.get('name', ''))
            if not comp:
                comp = Competition(id=c_data['id'])
                comps_by_id[comp.id] = comp
                db.session.add(comp)
            comp.name = c_data.get('name', '')
            comps_by_name[comp.name] = comp
            comp.year = _int_opt(c_data.get('year'))
            comp.season = c_data.get('season', '')
            comp.status = c_data.get('status', 'active')
            sd = c_data.get('start_date')
            if sd:
                try: comp.start_date = date_type.fromisoformat(sd)
                except: pass
        db.session.commit()
        # 构建comp_id→start_date映射，用于转换旧格式day_number
        backup_version = data.get('version', 1)
        comp_start_dates = {}
        imported_comp_ids = set()
        for c_data in data.get('competitions', []):
            sd_str = c_data.get('start_date')
            if sd_str:
                try: comp_start_dates[c_data['id']] = date_type.fromisoformat(sd_str)
                except: pass
            imported_comp_ids.add(c_data['id'])
        # 旧格式导入前清空已有比赛数据，避免match_code冲突
        if backup_version < 2 and imported_comp_ids:
            for cid in imported_comp_ids:
                for m in Match.query.filter_by(competition_id=cid).all():
                    for q in Question.query.filter_by(match_id=m.id).all():
                        Option.query.filter_by(question_id=q.id).delete()
                        Bet.query.filter_by(question_id=q.id).delete()
                        db.session.delete(q)
                    db.session.delete(m)
            db.session.commit()
        with db.session.no_autoflush:
            # 预加载已有比赛(id与match_code两个索引), 避免逐行查询
            matches_by_id = {m.id: m for m in Match.query.all()}
            matches_by_code = {}
            for m_ in matches_by_id.values():
                matches_by_code.setdefault(m_.match_code, m_)
            # 预计算每个赛事+周的day_number→序号映射
            day_seq_map = {}
            for m_data in data.get('matches', []):
                cid = _int_opt(m_data.get('competition_id'))
                wk = _int_opt(m_data.get('week_number'))
                dn = m_data.get('day_number')
                if backup_version < 2:
                    sd = comp_start_dates.get(cid)
                    if dn and sd:
                        dn = ((dn - 1 + sd.weekday()) % 7) + 1
                key = (cid, wk)
                if key not in day_seq_map:
                    day_seq_map[key] = []
                if dn not in day_seq_map[key]:
                    day_seq_map[key].append(dn)
            for key in day_seq_map:
                day_seq_map[key] = sorted(day_seq_map[key])
            for m_data in data.get('matches', []):
                cid = _int_opt(m_data.get('competition_id'))
                if cid is not None and cid not in comps_by_id:
                    skipped.append(f"比赛{m_data['id']}引用了不存在的赛事{cid}")
                    continue
                match = matches_by_id.get(m_data['id']) or matches_by_code.get(m_data.get('match_code', ''))
                if not match:
                    match = Match(id=m_data['id'])
                    matches_by_id[match.id] = match
                    db.session.add(match)
                match.competition_id = cid
                match.week_number = _int_opt(m_data.get('week_number'))
                old_day = m_data.get('day_number')
                sd = comp_start_dates.get(cid)
                if old_day and sd and backup_version < 2:
                    start_wd = sd.weekday()
                    match.day_number = ((old_day - 1 + start_wd) % 7) + 1
                else:
                    match.day_number = _int_opt(old_day)
                match.match_number = _int_opt(m_data.get('match_number'))
                match.home_team = m_data.get('home_team', '')
                match.away_team = m_data.get('away_team', '')
                match.status = m_data.get('status', 'active')
                key = (cid, match.week_number)
                day_list = day_seq_map.get(key, [])
                day_seq = day_list.index(match.day_number) + 1 if match.day_number in day_list else 1
                if sd and backup_version < 2:
                    comp_name = ''
                    for c_data in data.get('competitions', []):
                        if c_data['id'] == m_data.get('competition_id'):
                            comp_name = c_data.get('name', '')
                            break
                    if comp_name:
                        match.match_code = f"{comp_name}Week{match.week_number}Day{day_seq}Match{match.match_number}"
                else:
                    match.match_code = m_data.get('match_code', '')
            db.session.commit()
        skipped = []
        questions_by_id = {q.id: q for q in Question.query.all()}
        questions_by_code = {}
        for q_ in questions_by_id.values():
            questions_by_code.setdefault(q_.question_code, q_)
        for q_data in data.get('questions', []):
            q_match = _int_opt(q_data.get('match_id'))
            if q_match is not None and q_match not in matches_by_id:
                skipped.append(f"题目{q_data['id']}引用了不存在的比赛{q_match}")
                continue
            q = questions_by_id.get(q_data['id']) or questions_by_code.get(q_data.get('question_code', ''))
            if not q:
                q = Question(id=q_data['id'])
                questions_by_id[q.id] = q
                db.session.add(q)
            q.question_code = q_data.get('question_code', '')
            questions_by_code[q.question_code] = q
            q.question_text = q_data.get('question_text', '')
            q.match_id = q_match
            q.status = q_data.get('status', 'active')
            q.correct_option_id = _int_opt(q_data.get('correct_option_id'))
        db.session.commit()
        options_by_id = {o.id: o for o in Option.query.all()}
        for o_data in data.get('options', []):
            # 跳过孤儿选项(引用的题目已不存在的历史残留数据)
            if o_data.get('question_id') not in questions_by_id:
                skipped.append(f"选项{o_data['id']}引用了不存在的题目{o_data.get('question_id')}")
                continue
            opt = options_by_id.get(o_data['id'])
            if not opt:
                opt = Option(id=o_data['id'])
                options_by_id[opt.id] = opt
                db.session.add(opt)
            opt.question_id = o_data.get('question_id')
            opt.option_text = o_data.get('option_text', '')
            opt.base_rate = _float(o_data.get('base_rate'), 2.0)
            opt.total_coins = _int(o_data.get('total_coins'), 0)
        db.session.commit()
        users_by_id = {u.id: u for u in User.query.all()}
        bets_by_id = {b.id: b for b in Bet.query.all()}
        for b_data in data.get('bets', []):
            # 跳过孤儿投注(引用的题目/选项/用户已不存在)
            if b_data.get('question_id') not in questions_by_id or b_data.get('option_id') not in options_by_id \
                    or (b_data.get('user_id') and b_data['user_id'] not in users_by_id):
                skipped.append(f"投注{b_data['id']}引用的对象已不存在(题目{b_data.get('question_id')})")
                continue
            bet = bets_by_id.get(b_data['id'])
            if not bet:
                bet = Bet(id=b_data['id'])
                bets_by_id[bet.id] = bet
                db.session.add(bet)
            bet.user_id = b_data.get('user_id')
            bet.question_id = b_data.get('question_id')
            bet.option_id = b_data.get('option_id')
            bet.coins = _int(b_data.get('coins'), 0)
        db.session.commit()
        comps_all = {c.id for c in Competition.query.all()}
        prizes_by_id = {p.id: p for p in Prize.query.all()}
        for p_data in data.get('prizes', []):
            prize_competition = _int_opt(p_data.get('competition_id'))
            if prize_competition is not None and prize_competition not in comps_all:
                skipped.append(f"奖品{p_data['id']}引用了不存在的赛事{prize_competition}")
                continue
            prize = prizes_by_id.get(p_data['id'])
            if not prize:
                prize = Prize(id=p_data['id'])
                prizes_by_id[prize.id] = prize
                db.session.add(prize)
            prize.competition_id = prize_competition
            prize.name = p_data.get('name', '')
            prize.quantity = _int(p_data.get('quantity'), 1)
            prize.condition = p_data.get('condition', '')
            prize.provider = p_data.get('provider', '')
            prize.notes = p_data.get('notes', '')
            prize.creator_id = _int_opt(p_data.get('creator_id'))
        db.session.commit()
        from models import Livestream, LeaderboardEntry, MatchScore
        livestreams_by_id = {l.id: l for l in Livestream.query.all()}
        for l_data in data.get('livestreams', []):
            ls = livestreams_by_id.get(l_data['id'])
            if not ls:
                ls = Livestream(id=l_data['id'])
                livestreams_by_id[ls.id] = ls
                db.session.add(ls)
            ls.name = l_data.get('name', '')
            ls.intro = l_data.get('intro', '')
            ls.platform = l_data.get('platform', '')
            ls.room_id = l_data.get('room_id', '')
            ls.url = l_data.get('url', '')
            ls.cover_url = l_data.get('cover_url', '')
            ls.creator_id = l_data.get('creator_id')
            ls.sort_order = l_data.get('sort_order', 0)
        db.session.commit()
        teams_all = {t.id for t in Team.query.all()}
        lb_by_key = {(e.competition_id, e.team_id): e for e in LeaderboardEntry.query.all()}
        for e_data in data.get('leaderboard', []):
            key = (e_data.get('competition_id'), e_data.get('team_id'))
            if key[1] not in teams_all or (key[0] and key[0] not in comps_all):
                skipped.append(f"积分条目{e_data['id']}引用的队伍或赛事不存在")
                continue
            e = lb_by_key.get(key)
            if not e:
                e = LeaderboardEntry(id=e_data['id'], competition_id=key[0], team_id=key[1])
                lb_by_key[key] = e
                db.session.add(e)
            e.wins = _int(e_data.get('wins'), 0)
            e.losses = _int(e_data.get('losses'), 0)
            e.draws = _int(e_data.get('draws'), 0)
            e.net_wins = _int(e_data.get('net_wins'), 0)
            e.rank = _int(e_data.get('rank'), 0)
            e.prev_rank = _int(e_data.get('prev_rank'), 0)
        db.session.commit()
        scores_by_id = {s.id: s for s in MatchScore.query.all()}
        for s_data in data.get('match_scores', []):
            if (s_data.get('home_team_id') not in teams_all or s_data.get('away_team_id') not in teams_all):
                skipped.append(f"比分{s_data['id']}引用的队伍不存在")
                continue
            s = scores_by_id.get(s_data['id'])
            if not s:
                s = MatchScore(id=s_data['id'])
                scores_by_id[s.id] = s
                db.session.add(s)
            s.competition_id = _int_opt(s_data.get('competition_id'))
            s.match_date = s_data.get('match_date', '')
            s.home_team_id = _int_opt(s_data.get('home_team_id'))
            s.away_team_id = _int_opt(s_data.get('away_team_id'))
            for k in ['bo1', 'bo2', 'bo3', 'bo4']:
                setattr(s, k + '_home', _int(s_data.get(k + '_home'), 0))
                setattr(s, k + '_away', _int(s_data.get(k + '_away'), 0))
            s.ot_winner_team_id = _int_opt(s_data.get('ot_winner_team_id'))
            s.home_wins = _int(s_data.get('home_wins'), 0)
            s.away_wins = _int(s_data.get('away_wins'), 0)
            s.home_net = _int(s_data.get('home_net'), 0)
            s.away_net = _int(s_data.get('away_net'), 0)
            s.home_draws = _int(s_data.get('home_draws'), 0)
            s.away_draws = _int(s_data.get('away_draws'), 0)
            s.is_settled = bool(s_data.get('is_settled', False))
        db.session.commit()
        # PostgreSQL: 导入用了显式主键, 必须重置序列, 否则新记录会主键冲突
        if db.engine.dialect.name == 'postgresql':
            from sqlalchemy import text
            for model in [User, Team, Competition, Match, Question, Option, Bet, Prize, OperationLog, Livestream, LeaderboardEntry, MatchScore]:
                table = model.__tablename__
                db.session.execute(text(
                    "SELECT setval(pg_get_serial_sequence('" + table + "', 'id'), "
                    "GREATEST((SELECT COALESCE(MAX(id), 0) FROM " + table + "), 1))"
                ))
            db.session.commit()
        return jsonify({'message': '导入成功', 'skipped_count': len(skipped), 'skipped': skipped[:20]})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
