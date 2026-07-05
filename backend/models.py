from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    openid = db.Column(db.String(128), unique=True, nullable=False)
    password = db.Column(db.String(128), default='')
    nickname = db.Column(db.String(64))
    avatar_url = db.Column(db.String(256))
    cn = db.Column(db.String(64))
    coins = db.Column(db.Integer, default=5000)
    is_admin = db.Column(db.Boolean, default=False)
    rules_viewed = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    bets = db.relationship('Bet', backref='user', lazy=True)

class Team(db.Model):
    __tablename__ = 'teams'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(64), unique=True, nullable=False)
    logo_url = db.Column(db.String(256))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Competition(db.Model):
    __tablename__ = 'competitions'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(128), unique=True, nullable=False)  # 如 2026IVL秋季赛
    year = db.Column(db.Integer)
    season = db.Column(db.String(32))  # 春季赛/秋季赛
    status = db.Column(db.String(32), default='active')  # active, completed
    start_date = db.Column(db.Date, nullable=True)  # 赛事起始日期
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    matches = db.relationship('Match', backref='competition', lazy=True)

class Match(db.Model):
    __tablename__ = 'matches'

    id = db.Column(db.Integer, primary_key=True)
    match_code = db.Column(db.String(128), unique=True, nullable=False)
    competition_id = db.Column(db.Integer, db.ForeignKey('competitions.id'))
    week_number = db.Column(db.Integer)
    day_number = db.Column(db.Integer)
    match_number = db.Column(db.Integer)
    home_team = db.Column(db.String(64))  # 主场队伍
    away_team = db.Column(db.String(64))  # 客场队伍
    status = db.Column(db.String(32), default='active')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    questions = db.relationship('Question', backref='match', lazy=True)

class Question(db.Model):
    __tablename__ = 'questions'
    
    id = db.Column(db.Integer, primary_key=True)
    question_code = db.Column(db.String(128), unique=True, nullable=False)  # 如 2026IVL秋季赛Week1Day1Match1Q1
    match_id = db.Column(db.Integer, db.ForeignKey('matches.id'))
    question_text = db.Column(db.Text)
    correct_option_id = db.Column(db.Integer)
    status = db.Column(db.String(32), default='active')  # active, completed
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    options = db.relationship('Option', backref='question', lazy=True)
    bets = db.relationship('Bet', backref='question', lazy=True)

class Option(db.Model):
    __tablename__ = 'options'
    
    id = db.Column(db.Integer, primary_key=True)
    question_id = db.Column(db.Integer, db.ForeignKey('questions.id'))
    option_text = db.Column(db.String(128))
    base_rate = db.Column(db.Float)  # 基础倍率
    total_coins = db.Column(db.Integer, default=0)  # 该选项总投注额
    
    bets = db.relationship('Bet', backref='option', lazy=True)

class Bet(db.Model):
    __tablename__ = 'bets'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    question_id = db.Column(db.Integer, db.ForeignKey('questions.id'))
    option_id = db.Column(db.Integer, db.ForeignKey('options.id'))
    coins = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (db.UniqueConstraint('user_id', 'question_id', 'option_id'),)

class Prize(db.Model):
    __tablename__ = 'prizes'
    
    id = db.Column(db.Integer, primary_key=True)
    competition_id = db.Column(db.Integer, db.ForeignKey('competitions.id'))
    name = db.Column(db.String(128), nullable=False)
    quantity = db.Column(db.Integer, default=1)
    condition = db.Column(db.String(256))
    provider = db.Column(db.String(128))
    notes = db.Column(db.Text)
    creator_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class OperationLog(db.Model):
    __tablename__ = 'operation_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer)
    nickname = db.Column(db.String(64))
    action = db.Column(db.String(64))
    detail = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Livestream(db.Model):
    __tablename__ = 'livestreams'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(128), nullable=False)
    intro = db.Column(db.String(256))
    platform = db.Column(db.String(32))
    room_id = db.Column(db.String(64))
    url = db.Column(db.String(512))
    creator_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
