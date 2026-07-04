#!/bin/bash
# 竞猜系统部署脚本 - 适用于腾讯云/阿里云 Ubuntu服务器

echo "=== 竞猜系统部署开始 ==="

# 1. 更新系统
echo "[1/6] 更新系统..."
sudo apt update && sudo apt upgrade -y

# 2. 安装Python环境
echo "[2/6] 安装Python环境..."
sudo apt install python3 python3-pip python3-venv -y

# 3. 创建项目目录
echo "[3/6] 创建项目目录..."
sudo mkdir -p /var/www/betting-system
sudo chown $USER:$USER /var/www/betting-system

# 4. 上传代码（需要先在本地打包上传）
echo "[4/6] 请将代码上传到 /var/www/betting-system/"
echo "可以用 scp 命令："
echo "scp -r ./* root@你的服务器IP:/var/www/betting-system/"

# 5. 安装依赖
echo "[5/6] 安装依赖..."
cd /var/www/betting-system/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 6. 启动服务
echo "[6/6] 启动服务..."
gunicorn -w 4 -b 0.0.0.0:5000 app:app

echo "=== 部署完成 ==="
echo "访问: http://你的服务器IP:5000"
