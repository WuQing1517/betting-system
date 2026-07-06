from flask import Blueprint, request, jsonify, current_app
from models import db, User, Team, Competition, Match, Question, Option, Bet
from config import Config
from functools import wraps
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
        
        user = User.query.get(user_id)
        if not user or user.openid != 'dev_wuqing':
            return jsonify({'error': '需要超级管理员权限'}), 403
        
        return f(*args, **kwargs)
    return decorated_function

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

    # 不能删除主管理员
    if user.openid == 'dev_wuqing':
        return jsonify({'error': '不能删除主管理员'}), 400

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

    filename = uuid.uuid4().hex + ext
    upload_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], 'teams')
    os.makedirs(upload_folder, exist_ok=True)
    filepath = os.path.join(upload_folder, filename)
    file.save(filepath)

    url = '/uploads/teams/' + filename
    team.logo_url = Config.SERVER_URL + url
    db.session.commit()

    return jsonify({'url': url})

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

    # 生成比赛代码
    match_code = f"{competition.name}Week{week_number}Day{day_number}Match{match_number}"

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

    # 重新生成比赛代码
    match.match_code = f"{competition.name}Week{match.week_number}Day{match.day_number}Match{match.match_number}"

    db.session.commit()
    return jsonify({'message': 'Match updated', 'match_code': match.match_code})

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
    is_superadmin = user and user.openid == 'dev_wuqing'
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
    is_superadmin = user and user.openid == 'dev_wuqing'
    if not is_superadmin and prize.creator_id != user_id:
        return jsonify({'error': '\u53EA\u80FD\u5220\u9664\u81EA\u5DF1\u6DFB\u52A0\u7684\u5956\u54C1'}), 403
    db.session.delete(prize)
    db.session.commit()
    return jsonify({'message': 'Prize deleted'})

@admin_bp.route('/export', methods=['GET'])
@superadmin_required
def export_data():
    """导出所有数据为JSON"""
    from models import User, Team, Competition, Match, Question, Option, Bet, Prize, OperationLog
    data = {
        'users': [{'id': u.id, 'nickname': u.nickname, 'cn': u.cn, 'coins': u.coins, 'is_admin': u.is_admin, 'openid': u.openid} for u in User.query.all()],
        'teams': [{'id': t.id, 'name': t.name, 'logo_url': t.logo_url} for t in Team.query.all()],
        'competitions': [{'id': c.id, 'name': c.name, 'year': c.year, 'season': c.season, 'status': c.status, 'start_date': str(c.start_date) if c.start_date else None} for c in Competition.query.all()],
        'matches': [{'id': m.id, 'match_code': m.match_code, 'competition_id': m.competition_id, 'week_number': m.week_number, 'day_number': m.day_number, 'match_number': m.match_number, 'home_team': m.home_team, 'away_team': m.away_team, 'status': m.status} for m in Match.query.all()],
        'questions': [{'id': q.id, 'question_code': q.question_code, 'question_text': q.question_text, 'match_id': q.match_id, 'status': q.status, 'correct_option_id': q.correct_option_id} for q in Question.query.all()],
        'options': [{'id': o.id, 'question_id': o.question_id, 'option_text': o.option_text, 'base_rate': o.base_rate, 'total_coins': o.total_coins} for o in Option.query.all()],
        'bets': [{'id': b.id, 'user_id': b.user_id, 'question_id': b.question_id, 'option_id': b.option_id, 'coins': b.coins} for b in Bet.query.all()],
        'prizes': [{'id': p.id, 'competition_id': p.competition_id, 'name': p.name, 'quantity': p.quantity, 'condition': p.condition, 'provider': p.provider, 'notes': p.notes, 'creator_id': p.creator_id} for p in Prize.query.all()],
        'logs': [{'id': l.id, 'user_id': l.user_id, 'nickname': l.nickname, 'action': l.action, 'detail': l.detail, 'created_at': str(l.created_at) if l.created_at else None} for l in OperationLog.query.order_by(OperationLog.id.desc()).limit(500).all()]
    }
    from flask import Response
    import json
    return Response(json.dumps(data, ensure_ascii=False, indent=2), mimetype='application/json', headers={'Content-Disposition': 'attachment; filename=backup.json'})

@admin_bp.route('/import', methods=['POST'])
@superadmin_required
def import_data():
    """导入数据"""
    data = request.get_json()
    from datetime import date as date_type
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
    for t_data in data.get('teams', []):
        team = Team.query.get(t_data['id'])
        if not team:
            team = Team(id=t_data['id'])
            db.session.add(team)
        team.name = t_data.get('name', '')
        team.logo_url = t_data.get('logo_url', '')
    db.session.commit()
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
    return jsonify({'message': '\u5BFC\u5165\u6210\u529F'})
