import requests
from config import Config

class WechatService:
    def __init__(self):
        self.app_id = Config.WECHAT_APP_ID
        self.app_secret = Config.WECHAT_APP_SECRET
    
    def get_openid(self, code):
        """通过code获取openid"""
        url = f"https://api.weixin.qq.com/sns/jscode2session"
        params = {
            'appid': self.app_id,
            'secret': self.app_secret,
            'js_code': code,
            'grant_type': 'authorization_code'
        }
        
        try:
            response = requests.get(url, params=params)
            data = response.json()
            
            if 'openid' in data:
                return data['openid']
            else:
                print(f"Wechat login error: {data}")
                return None
        except Exception as e:
            print(f"Wechat login exception: {e}")
            return None
