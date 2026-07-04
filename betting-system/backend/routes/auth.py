# -*- coding: utf-8 -*-
from flask import Blueprint, request, jsonify
from models import db, User
from services.wechat import WechatService
from config import Config

auth_bp = Blueprint('auth', __name__)

MAIN_ADMIN = {
    'username': 'wuqing',
    'password': 'adminwq'
}

@auth_bp.route('/login', methods=['POST'])
def login():
    """微信登录"""
    data = request.get_json()
    code = data.get('code')

    if not code:
        return jsonify({'error': 'Missing code'}), 400

    is_dev_mode = Config.WECHAT_APP_ID == 'your-app-id'

    if is_dev_mode:
        openid = 'dev_user_' + code
    else:
        wechat_service = WechatService()
        openid = wechat_service.get_openid(code)
        if not openid:
            return jsonify({'error': '获取用户户信息失败'}), 400

    user = User.query.filter_by(openid=openid).first()
    if not user:
        user = User(
            openid=openid,
            nickname='user' + code[:6],
            coins=Config.INITIAL_COINS
        )
        db.session.add(user)
        db.session.commit()

    avatar_url = ('http://106.53.67.7' + user.avatar_url if user.avatar_url and not user.avatar_url.startswith('http') else (user.avatar_url or ''))

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

@auth_bp.route('/dev-login', methods=['POST'])
def dev_login():
    """登录 - 只允许已注册账号"""
    data = request.get_json()
    username = data.get('username', '')
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'error': '请输入用户户名和密码码'}), 400

    openid = 'dev_' + username
    user = User.query.filter_by(openid=openid).first()

    if not user:
        return jsonify({'error': '账号不存在在，请先注册'}), 401

    if not user.password:
        return jsonify({'error': '账号异常，请联系管理员'}), 401

    if user.password != password:
        return jsonify({'error': '密码码错误误'}), 401

    avatar_url = ('http://106.53.67.7' + user.avatar_url if user.avatar_url and not user.avatar_url.startswith('http') else (user.avatar_url or ''))

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

@auth_bp.route('/dev-register', methods=['POST'])
def dev_register():
    """注册 - 创建新账号"""
    data = request.get_json()
    username = data.get('username', '')
    password = data.get('password', '')
    cn = data.get('cn', '')

    if not username or not password:
        return jsonify({'error': '请输入用户户名和密码码'}), 400

    openid = 'dev_' + username
    user = User.query.filter_by(openid=openid).first()

    if user:
        return jsonify({'error': '该账号已存在在，请直接登录'}), 400

    user = User(
        openid=openid,
        password=password,
        nickname=username,
        cn=cn,
        coins=Config.INITIAL_COINS
    )
    db.session.add(user)
    db.session.commit()

    avatar_url = ('http://106.53.67.7' + user.avatar_url if user.avatar_url and not user.avatar_url.startswith('http') else (user.avatar_url or ''))

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

@auth_bp.route('/admin/login', methods=['POST'])
def admin_login():
    """管理员登录验证"""
    data = request.get_json()
    username = data.get('username', '')
    password = data.get('password', '')

    if username == MAIN_ADMIN['username'] and password == MAIN_ADMIN['password']:
        openid = 'dev_' + username
        user = User.query.filter_by(openid=openid).first()
        if not user:
            user = User(openid=openid, nickname=username, coins=0, is_admin=True, rules_viewed=True)
            db.session.add(user)
            db.session.commit()
        elif not user.is_admin:
            user.is_admin = True
            db.session.commit()
        return jsonify({
            'success': True,
            'is_main_admin': True,
            'user_id': user.id,
            'username': username
        })

    openid = 'dev_' + username
    user = User.query.filter_by(openid=openid).first()
    if user and user.is_admin:
        return jsonify({
            'success': True,
            'is_main_admin': False,
            'user_id': user.id,
            'nickname': user.nickname
        })

    return jsonify({'success': False, 'error': '账号或密码码错误误'}), 401

@auth_bp.route('/admin/users', methods=['GET'])
def admin_get_users():
    """获取所有用户户列表"""
    users = User.query.all()
    return jsonify([{
        'id': u.id,
        'nickname': u.nickname,
        'cn': u.cn,
        'coins': u.coins,
        'is_admin': u.is_admin,
        'created_at': u.created_at.isoformat() if u.created_at else None
    } for u in users])

@auth_bp.route('/admin/user/<int:user_id>/admin', methods=['PUT'])
def admin_toggle_admin(user_id):
    """设置/取消管理员权限"""
    data = request.get_json()
    is_admin = data.get('is_admin', False)

    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': '用户户不存在在'}), 404

    user.is_admin = is_admin
    db.session.commit()

    return jsonify({
        'message': '已设置为管理员' if is_admin else '已取消管理员',
        'user_id': user.id,
        'is_admin': user.is_admin
    })
