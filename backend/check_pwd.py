import sqlite3
conn = sqlite3.connect('betting.db')
c = conn.cursor()
c.execute("SELECT id, nickname, password FROM users WHERE nickname='wuqing'")
rows = c.fetchall()
for row in rows:
    print(f"ID: {row[0]}, 昵称: {row[1]}, 密码: {row[2]}")
conn.close()
