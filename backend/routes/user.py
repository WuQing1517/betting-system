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

    return jsonify({'message': 'Rules marked as viewed'})
