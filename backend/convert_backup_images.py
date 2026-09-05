# -*- coding: utf-8 -*-
"""把备份JSON中的图片路径(/uploads/...)转换为base64内嵌, 用于迁移到纯数据库存储
用法: python convert_backup_images.py <原备份.json> <输出.json>
图片文件从本地 backend/uploads/ 目录读取(相对路径和指向旧服务器的绝对路径均可识别)
"""
import base64, json, os, sys

sys.stdout.reconfigure(encoding='utf-8')
if len(sys.argv) < 3:
    print(__doc__)
    sys.exit(1)
src, dst = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
MIME = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp'}

def to_data_uri(url):
    """返回 (新地址, 是否转换成功)"""
    if not url or not url.startswith('data:') and '/uploads/' not in url:
        return url, None          # 非图片路径, 不处理
    if url.startswith('data:'):
        return url, None          # 已经是base64
    rel = url.split('/uploads/')[1]
    path = os.path.join(HERE, 'uploads', *rel.split('/'))
    if not os.path.exists(path):
        return url, False         # 文件缺失
    ext = os.path.splitext(path)[1].lower()
    data = base64.b64encode(open(path, 'rb').read()).decode()
    return 'data:%s;base64,%s' % (MIME.get(ext, 'application/octet-stream'), data), True

data = json.load(open(src, encoding='utf-8'))
converted, missing = 0, []

for t in data.get('teams', []):
    orig = t.get('logo_url')
    new, ok = to_data_uri(orig)
    t['logo_url'] = new
    if ok is True:
        converted += 1
    elif ok is False:
        missing.append('队伍 %s: %s' % (t.get('name', '?'), orig))
for u in data.get('users', []):
    orig = u.get('avatar_url')
    new, ok = to_data_uri(orig)
    u['avatar_url'] = new
    if ok is True:
        converted += 1
    elif ok is False:
        missing.append('用户 %s: %s' % (u.get('nickname', '?'), orig))

json.dump(data, open(dst, 'w', encoding='utf-8'), ensure_ascii=False)
print(f'转换完成: 成功内嵌 {converted} 张图片, 输出 {dst}')
if missing:
    print('以下图片本地文件缺失, 保持原地址:')
    for m in missing:
        print('  -', m)
    sys.exit(1)
