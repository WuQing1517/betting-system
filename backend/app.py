from flask import Flask, send_from_directory
from flask_cors import CORS
from config import Config
from models import db
import os

# 预加载所有路由模块，加速首次请求
from routes import auth, user, betting, admin

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

    # 初始化扩展
    CORS(app)
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

    # 创建数据库表
    with app.app_context():
        db.create_all()

    return app

app = create_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
