# 竞猜系统部署指南

## 一、购买服务器

### 腾讯云轻量应用服务器
1. 访问：https://cloud.tencent.com/product/lighthouse
2. 选择：2核2G 40GB（约50元/月，新用户有优惠）
3. 系统选择：Ubuntu 22.04
4. 购买后记录：
   - 服务器IP地址
   - root密码（或设置密钥）

### 阿里云ECS
1. 访问：https://www.aliyun.com/product/ecs
2. 选择：2核2G 40GB
3. 系统选择：Ubuntu 22.04

## 二、连接服务器

### Windows用户
1. 下载并安装 PuTTY：https://www.putty.org/
2. 打开PuTTY，输入服务器IP
3. 点击Open，输入用户名 `root` 和密码

### 或者使用Windows Terminal
```bash
ssh root@你的服务器IP
```

## 三、部署代码

### 方法1：使用scp上传（推荐）

在本地电脑打开PowerShell或CMD：

```bash
# 进入项目目录
cd C:\Users\hzb15\betting-system

# 上传整个项目
scp -r ./* root@你的服务器IP:/var/www/betting-system/
```

### 方法2：使用Git（如果代码在GitHub上）

```bash
# 在服务器上
cd /var/www/betting-system
git clone https://github.com/你的用户名/你的仓库.git .
```

## 四、在服务器上配置

```bash
# 1. 进入项目目录
cd /var/www/betting-system/backend

# 2. 创建虚拟环境
python3 -m venv venv

# 3. 激活虚拟环境
source venv/bin/activate

# 4. 安装依赖
pip install -r requirements.txt

# 5. 测试运行
python app.py
```

## 五、配置开机自启

```bash
# 1. 创建systemd服务文件
sudo nano /etc/systemd/system/betting.service

# 2. 粘贴以下内容（按i进入编辑模式，Ctrl+X退出，Y保存）
[Unit]
Description=Betting System Flask App
After=network.target

[Service]
User=root
WorkingDirectory=/var/www/betting-system/backend
Environment="PATH=/var/www/betting-system/backend/venv/bin"
ExecStart=/var/www/betting-system/backend/venv/bin/gunicorn -w 4 -b 0.0.0.0:5000 app:app
Restart=always

[Install]
WantedBy=multi-user.target

# 4. 启用并启动服务
sudo systemctl daemon-reload
sudo systemctl enable betting
sudo systemctl start betting

# 5. 查看状态
sudo systemctl status betting
```

## 六、开放端口

### 腾讯云
1. 登录控制台 → 轻量应用服务器 → 防火墙
2. 添加规则：TCP 5000 端口

### 阿里云
1. 登录控制台 → ECS → 安全组
2. 添加规则：TCP 5000 端口

## 七、修改小程序配置

修改 `miniprogram/app.js`：

```javascript
globalData: {
  baseUrl: 'http://你的服务器IP:5000/api'
}
```

## 八、测试访问

浏览器访问：`http://你的服务器IP:5000/api/competitions`

如果返回JSON数据，说明部署成功！

## 九、配置HTTPS（可选但推荐）

```bash
# 安装certbot
sudo apt install certbot python3-certbot-nginx -y

# 安装nginx
sudo apt install nginx -y

# 配置nginx反向代理
sudo nano /etc/nginx/sites-available/betting
```

添加以下内容：
```nginx
server {
    listen 80;
    server_name 你的域名;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
# 启用配置
sudo ln -s /etc/nginx/sites-available/betting /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# 申请SSL证书（需要域名）
sudo certbot --nginx -d 你的域名
```

## 十、修改小程序为HTTPS

如果有域名和SSL证书，修改 `miniprogram/app.js`：

```javascript
globalData: {
  baseUrl: 'https://你的域名/api'
}
```

## 常见问题

### Q1: 无法连接服务器
- 检查安全组/防火墙是否开放5000端口
- 检查服务器是否正常运行

### Q2: 小程序无法访问后端
- 确认服务器IP和端口正确
- 检查小程序是否勾选了"不校验合法域名"

### Q3: 数据库文件在哪里？
- SQLite数据库文件：`backend/betting.db`
- 部署时会自动创建

### Q4: 如何重启服务？
```bash
sudo systemctl restart betting
```

### Q5: 如何查看日志？
```bash
sudo journalctl -u betting -f
```
