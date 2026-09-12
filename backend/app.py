from flask import Flask, send_from_directory, request, jsonify
from config import Config
from models import db, User, parse_user_id
import os

# 预加载所有路由模块，加速首次请求
from routes import auth, user, betting, admin

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

    # 初始化扩展
    db.init_app(app)

    # 上传目录
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
    app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

    # 注册蓝图
    from routes.auth import auth_bp
    from routes.user import user_bp
    from routes.betting import betting_bp
    from routes.admin import admin_bp

    app.register_blueprint(auth_bp, url_prefix='/api')
    app.register_blueprint(user_bp, url_prefix='/api')
    app.register_blueprint(betting_bp, url_prefix='/api')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')

    # 会话校验: 登录态请求必须携带与账号当前令牌一致的 X-Session-Token。
    # 令牌在登录时签发, 账号信息变更(改昵称/密码/头像等)时轮换 ——
    # 发起变更的浏览器拿到新令牌继续在线, 其他浏览器的旧令牌在这里被401踢下线。
    SESSION_PUBLIC_PREFIXES = ('/api/dev-login', '/api/dev-register', '/api/admin/login', '/api/img/', '/api/site-info')

    @app.before_request
    def check_session_token():
        path = request.path
        if not path.startswith('/api/'):
            return
        for prefix in SESSION_PUBLIC_PREFIXES:
            if path.startswith(prefix):
                return
        uid = parse_user_id(request.headers.get('X-User-Id'))
        if uid is None:
            return  # 未登录的公开访问(题目列表/排行榜等)
        user = db.session.get(User, uid)
        if not user:
            return jsonify({'error': '登录状态已失效，请重新登录', 'code': 'SESSION_EXPIRED'}), 401
        token = request.headers.get('X-Session-Token')
        if not token or token != user.session_token:
            return jsonify({'error': '账号信息已变更，请重新登录', 'code': 'SESSION_EXPIRED'}), 401

    # 静态文件服务（上传的图片）
    @app.route('/uploads/<path:filename>')
    def uploaded_file(filename):
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

    # 网页前端静态文件
    WEB_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web')

    @app.route('/')
    def index():
        return send_from_directory(WEB_FOLDER, 'index.html')

    @app.route('/css/<path:filename>')
    def css_file(filename):
        return send_from_directory(os.path.join(WEB_FOLDER, 'css'), filename)

    @app.route('/js/<path:filename>')
    def js_file(filename):
        return send_from_directory(os.path.join(WEB_FOLDER, 'js'), filename)

    @app.route('/images/<path:filename>')
    def image_file(filename):
        return send_from_directory(os.path.join(WEB_FOLDER, 'images'), filename)

    # 创建数据库表 + 自动迁移
    with app.app_context():
        db.create_all()

        # 自动添加缺失列(兼容SQLite和PostgreSQL)
        from sqlalchemy import text, inspect
        engine = db.engine

        def add_column_if_missing(table, column, col_def):
            """安全添加列, 已存在则跳过"""
            try:
                cols = [c['name'] for c in inspect(engine).get_columns(table)]
                if column not in cols:
                    with engine.begin() as conn:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}"))
            except Exception:
                pass

        add_column_if_missing('livestreams', 'cover_url', "VARCHAR(512) DEFAULT ''")
        add_column_if_missing('match_scores', 'bo4_home', 'INTEGER DEFAULT 0')
        add_column_if_missing('match_scores', 'bo4_away', 'INTEGER DEFAULT 0')
        add_column_if_missing('match_scores', 'ot_winner_team_id', 'INTEGER')
        add_column_if_missing('users', 'is_superadmin',
                              'BOOLEAN DEFAULT 0' if engine.dialect.name == 'sqlite' else 'BOOLEAN DEFAULT FALSE')
        add_column_if_missing('users', 'is_debug',
                              'BOOLEAN DEFAULT 0' if engine.dialect.name == 'sqlite' else 'BOOLEAN DEFAULT FALSE')
        add_column_if_missing('users', 'notice_confirmed',
                              'BOOLEAN DEFAULT 0' if engine.dialect.name == 'sqlite' else 'BOOLEAN DEFAULT FALSE')
        add_column_if_missing('operation_logs', 'change_amount', 'INTEGER')
        add_column_if_missing('users', 'session_token', 'VARCHAR(64)')
        add_column_if_missing('questions', 'question_type', "VARCHAR(32) DEFAULT 'match'")
        add_column_if_missing('questions', 'open_time', 'VARCHAR(32)')
        add_column_if_missing('questions', 'close_time', 'VARCHAR(32)')

        # base64图片存库: PostgreSQL下把图片列拓宽为TEXT (SQLite不校验长度无需处理)
        if engine.dialect.name != 'sqlite':
            insp = inspect(engine)
            for table, column in [('users', 'avatar_url'), ('teams', 'logo_url')]:
                try:
                    cols = {c['name']: c for c in insp.get_columns(table)}
                    if column in cols and 'VARCHAR' in str(cols[column]['type']).upper():
                        with engine.begin() as conn:
                            conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE TEXT"))
                except Exception:
                    pass

        # 确保超级管理员账号存在
        # 全新部署: 默认账号 admin/admin, 首次登录会强制提示修改
        # 旧部署升级: 已存在的 dev_wuqing 自动继承超级管理员权限
        from models import User
        if not User.query.filter_by(is_superadmin=True).first():
            legacy = User.query.filter_by(openid='dev_wuqing').first()
            if legacy:
                legacy.is_superadmin = True
            else:
                db.session.add(User(openid='dev_admin', password='admin', nickname='admin', cn='',
                                    coins=999999, is_admin=True, is_superadmin=True, rules_viewed=True))
            db.session.commit()

    return app

app = create_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
