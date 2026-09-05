import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))

    # 数据库: Render提供DATABASE_URL环境变量(PostgreSQL), 否则用本地SQLite
    db_url = os.environ.get('DATABASE_URL')
    if db_url and db_url.startswith('postgres://'):
        db_url = db_url.replace('postgres://', 'postgresql://', 1)
    SQLALCHEMY_DATABASE_URI = db_url or f'sqlite:///{os.path.join(BASE_DIR, "betting.db")}'

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SERVER_URL = os.environ.get('SERVER_URL') or 'https://106.53.67.7'
    INITIAL_COINS = 5000
