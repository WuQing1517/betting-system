import urllib.request, re, sys
sys.path.insert(0, 'C:\\Users\\hzb15\\betting-system\\backend')
from app import create_app
app = create_app()
with app.app_context():
    from models import Livestream
    huya = Livestream.query.filter_by(platform='huya').first()
    req = urllib.request.Request('https://www.huya.com/298142', headers={'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', 'Accept': 'text/html', 'Accept-Language': 'zh-CN'})
    resp = urllib.request.urlopen(req, timeout=10)
    html = resp.read().decode('utf-8', errors='ignore')
    # Find all image URLs
    all_imgs = re.findall(r'https?://[^\s"<>]+\.(?:jpg|jpeg|png|webp)', html)
    unique = list(set(all_imgs))
    unique.sort(key=len, reverse=True)
    for u in unique[:10]:
        print(u[:120])
