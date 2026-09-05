# -*- coding: utf-8 -*-
"""把备份JSON中的图片路径(/uploads/...)转换为base64内嵌, 用于迁移到纯数据库存储
用法: python convert_backup_images.py <原备份.json> <输出.json> [图片基础URL]
图片优先从本地 backend/uploads/ 目录读取; 本地没有且提供了基础URL(如 https://xxx.pythonanywhere.com)则联网下载
"""
import base64, json, os, sys, urllib.request

sys.stdout.reconfigure(encoding='utf-8')
if len(sys.argv) < 3:
    print(__doc__)
    sys.exit(1)
src, dst = sys.argv[1], sys.argv[2]
base_url = sys.argv[3].rstrip('/') if len(sys.argv) > 3 else ''
HERE = os.path.dirname(os.path.abspath(__file__))
MIME = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp'}

def load_image_bytes(rel):
    """本地文件优先, 其次从基础URL下载, 都没有返回None"""
    path = os.path.join(HERE, 'uploads', *rel.split('/'))
    if os.path.exists(path):
        return open(path, 'rb').read()
    if base_url:
        try:
            req = urllib.request.Request(base_url + '/uploads/' + rel,
                                         headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=20) as resp:
                return resp.read()
        except Exception as e:
            print(f'  [下载失败] {rel}: {e}')
    return None

def sniff_mime(data, rel):
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    if data[:3] == b'\xff\xd8\xff':
        return 'image/jpeg'
    if data[:4] == b'GIF8':
        return 'image/gif'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    return MIME.get(os.path.splitext(rel)[1].lower(), 'application/octet-stream')

def to_data_uri(url):
    """返回 (新地址, 是否转换成功)"""
    if not url or url.startswith('data:') or '/uploads/' not in url:
        return url, None
    rel = url.split('/uploads/')[1]
    data = load_image_bytes(rel)
    if data is None:
        return url, False
    return 'data:%s;base64,%s' % (sniff_mime(data, rel), base64.b64encode(data).decode()), True

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
    print('以下图片获取失败, 保持原地址:')
    for m in missing:
        print('  -', m)
    sys.exit(1)
