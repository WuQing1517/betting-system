import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    # 使用绝对路径确保数据库文件位置正确
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or f'sqlite:///{os.path.join(BASE_DIR, "betting.db")}'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # 服务器地址（用于生成图片URL）
    SERVER_URL = os.environ.get('SERVER_URL') or 'https://106.53.67.7'
    
    # 初始币数
    INITIAL_COINS = 5000
