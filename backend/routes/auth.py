# -*- coding: utf-8 -*-
from flask import Blueprint, request, jsonify
from models import db, User, resolve_image_url, image_output_url
from config import Config

auth_bp = Blueprint('auth', __name__)

import os

MAIN_ADMIN = {
    'username': os.environ.get('ADMIN_USERNAME') or 'admin',
    'password': os.environ.get('ADMIN_PASSWORD') or 'admin'
}

def _is_default_superadmin(user):
    """是否仍在使用默认超管账号(用于触发首次修改提示)"""
    return user.openid == 'dev_admin' and (user.password or '') == 'admin'

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

    avatar_url = image_output_url('users', user.id, user.avatar_url)

    return jsonify({
        'user_id': user.id,
        'openid': user.openid,
        'nickname': user.nickname,
        'avatar_url': avatar_url,
        'cn': user.cn,
        'coins': user.coins,
        'is_admin': user.is_admin,
        'is_superadmin': bool(user.is_superadmin),
        'need_setup': bool(user.is_superadmin) and _is_default_superadmin(user),
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

    avatar_url = image_output_url('users', user.id, user.avatar_url)

    return jsonify({
        'user_id': user.id,
        'openid': user.openid,
        'nickname': user.nickname,
        'avatar_url': avatar_url,
        'cn': user.cn,
        'coins': user.coins,
        'is_admin': user.is_admin,
        'is_superadmin': bool(user.is_superadmin),
        'need_setup': False,
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
    if user and user.is_admin and user.password and user.password == password:
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
        'openid': u.openid,
        'is_superadmin': bool(u.is_superadmin),
        'is_debug': bool(u.is_debug),
        'created_at': u.created_at.isoformat() if u.created_at else None
    } for u in users])

@auth_bp.route('/admin/user/<int:user_id>/admin', methods=['PUT'])
def admin_toggle_admin(user_id):
    """用户管理开关 (字段可选, 传哪个改哪个): is_admin / is_superadmin / is_debug"""
    data = request.get_json()
    uid = request.headers.get('X-User-Id')
    operator = User.query.get(int(uid)) if uid and uid.isdigit() else None

    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': '用户户不存在在'}), 404

    is_admin_change = 'is_admin' in data
    super_change = 'is_superadmin' in data
    debug_change = 'is_debug' in data
    if not (is_admin_change or super_change or debug_change):
        return jsonify({'error': '缺少要修改的字段'}), 400

    # 调试标签: 仅超级管理员可调整, 不能给自己打
    if debug_change:
        if not operator or not operator.is_superadmin:
            return jsonify({'error': '需要超级管理员权限'}), 403
        if user.id == operator.id:
            return jsonify({'error': '不能给自己设置调试标签'}), 400
        user.is_debug = bool(data['is_debug'])

    # 超管标识: 仅超级管理员可操作, 不能自降/清空最后一名
    if super_change:
        if not operator or not operator.is_superadmin:
            return jsonify({'error': '需要超级管理员权限'}), 403
        if not data['is_superadmin']:
            if user.id == operator.id:
                return jsonify({'error': '不能取消自己的超级管理员'}), 400
            others = User.query.filter(User.is_superadmin == True, User.id != user.id).count()
            if others == 0:
                return jsonify({'error': '至少保留一名超级管理员'}), 400
            user.is_superadmin = bool(data['is_superadmin'])

    # 管理员开关: 超管或管理员都可操作(出题组工作台原行为)
    if is_admin_change:
        if not operator or not (operator.is_superadmin or operator.is_admin):
            return jsonify({'error': '需要管理员权限'}), 403
        user.is_admin = bool(data['is_admin'])

    db.session.commit()

    return jsonify({
        'message': '已设置为管理员' if is_admin else '已取消管理员',
        'user_id': user.id,
        'is_admin': user.is_admin
    })
