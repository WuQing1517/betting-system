import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'betting.db')

def add_password_column():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 检查是否已有password列
    cursor.execute("PRAGMA table_info(users)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if 'password' not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN password VARCHAR(128) DEFAULT ''")
        conn.commit()
        print("password字段添加成功")
    else:
        print("password字段已存在")
    
    conn.close()

if __name__ == '__main__':
    add_password_column()
