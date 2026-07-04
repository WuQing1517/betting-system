"""
初始化脚本 - 创建管理员账号
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'betting.db')

def init_admin():
    """创建默认管理员账号"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 创建表（如果不存在）
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            openid TEXT UNIQUE NOT NULL,
            nickname TEXT,
            avatar_url TEXT,
            cn TEXT,
            coins INTEGER DEFAULT 5000,
            is_admin BOOLEAN DEFAULT FALSE,
            rules_viewed BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # 检查是否已有管理员
    cursor.execute('SELECT COUNT(*) FROM users WHERE is_admin = TRUE')
    admin_count = cursor.fetchone()[0]
    
    if admin_count == 0:
        # 创建默认管理员（使用测试openid）
        cursor.execute('''
            INSERT INTO users (openid, nickname, cn, coins, is_admin, rules_viewed)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', ('admin_test_001', '系统管理员', 'ADMIN', 100000, True, True))
        
        conn.commit()
        print("✓ 管理员账号创建成功！")
        print(f"  用户ID: 1")
        print(f"  昵称: 系统管理员")
        print(f"  CN: ADMIN")
        print(f"  币数: 100000")
        print(f"  请使用此ID登录管理后台")
    else:
        print("✓ 已存在管理员账号")
        cursor.execute('SELECT id, nickname, cn FROM users WHERE is_admin = TRUE LIMIT 1')
        admin = cursor.fetchone()
        if admin:
            print(f"  管理员ID: {admin[0]}")
            print(f"  昵称: {admin[1]}")
            print(f"  CN: {admin[2]}")
    
    conn.close()

if __name__ == '__main__':
    init_admin()
