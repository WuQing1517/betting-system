# Coin_V_Q 竞猜系统

一个基于Flask + Web的IVL竞猜系统，支持赛事竞猜、实时投币、自动结算、排行榜等功能。采用MIUIX设计风格，适配移动端和桌面端。

## 功能特性

### 用户端
- **账号系统** - 注册/登录，新用户获5000初始币
- **近期赛程** - 首页自动显示最近两天的比赛，直接点击投币
- **全部赛程** - 按周数筛选查看所有比赛
- **竞猜投币** - 每个选项独立投币，封盘前可随时修改（覆盖式）
- **结算公式** - 投币数 × 基础倍率 × (总币池 / 正确选项币池)
- **排行榜** - 按币数排名，显示用户头像
- **竞猜奖品** - 查看和提供赛事奖品
- **推荐直播** - B站/Huya直播间快捷入口

### 管理端（出题组工作台）
- **用户管理** - 查看/调整币数、设置管理员（三级权限）
- **队伍管理** - 管理战队信息和Logo
- **赛程管理** - Excel导入、手动添加、编辑比赛（周数/星期几/场次）
- **竞猜管理** - 问题编辑、封盘/开盘、结算、重置退币
- **投注详情** - 查看每个问题的投注明细

### 权限体系
| 角色 | 权限 |
|------|------|
| 超级管理员 | 全部操作 + 设置/取消管理员 + 删除账号 |
| 管理员 | 调币、队伍/赛程/竞猜管理 |
| 普通用户 | 投币、查看排行榜、提供奖品 |

## 技术栈

- **后端**: Python Flask + SQLAlchemy + SQLite
- **前端**: 原生HTML/CSS/JS + MIUIX设计风格
- **图标**: Remix Icon
- **UI框架**: 自定义MIUIX组件（下拉框、弹窗、毛玻璃导航栏）

## 项目结构

```
betting-system/
├── backend/
│   ├── app.py              # Flask应用入口
│   ├── config.py           # 配置文件（支持环境变量）
│   ├── models.py           # 数据模型
│   ├── routes/
│   │   ├── betting.py      # 公开API
│   │   ├── admin.py        # 管理API
│   │   ├── auth.py         # 登录注册
│   │   └── user.py         # 用户资料
│   ├── uploads/            # 上传文件
│   └── requirements.txt
└── web/
    ├── index.html          # 主页面
    ├── css/style.css       # MIUIX风格样式
    └── js/
        ├── app.js          # 前端逻辑
        └── xlsx.full.min.js
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SECRET_KEY` | Flask密钥 | dev-secret-key |
| `SERVER_URL` | 服务器地址（生成图片URL） | https://106.53.67.7 |

## 安装部署

### 本地开发
```bash
cd backend
pip install -r requirements.txt
python app.py
# 访问 http://localhost:5000
```

### 服务器部署
```bash
cd /var/www/betting-system
git pull origin main
cd backend
pip3 install -r requirements.txt gunicorn

# 数据库迁移
python3 -c "
from app import create_app
from sqlalchemy import text
app = create_app()
with app.app_context():
    from models import db
    db.create_all()
    with db.engine.connect() as conn:
        try: conn.execute(text('ALTER TABLE competitions ADD COLUMN start_date DATE')); conn.commit()
        except: pass
        try: conn.execute(text('ALTER TABLE prizes ADD COLUMN competition_id INTEGER REFERENCES competitions(id)')); conn.commit()
        except: pass
print('Done')
"

# 启动
pkill -f gunicorn
nohup gunicorn -w 4 -b 0.0.0.0:5000 app:app > /dev/null 2>&1 &
```

### Nginx配置
```nginx
server {
    listen 443 ssl;
    server_name your-domain;
    client_max_body_size 50m;
    location /uploads/ {
        alias /var/www/betting-system/backend/uploads/;
    }
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 赛程日期系统

赛事设置起始日期后，每场比赛日期自动推算：
```
比赛日期 = 赛事起始日期 + (周数-1) × 7 + (天数-1)
```

赛程输入使用"星期几"，系统自动推算day_number：
- 同一周内第一个有比赛的天 = day1
- 第二个有比赛的天 = day2，依此类推

## 版本

当前版本: **v0.2.5**

## 致谢

- [MiMo Code](https://mimo.xiaomi.com/coder) - AI编程助手
- [MIUIX](https://github.com/compose-miuix-ui/miuix) - 设计系统灵感

## 许可证

MIT License
