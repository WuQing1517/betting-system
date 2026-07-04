import sqlite3

conn = sqlite3.connect('betting.db')
c = conn.cursor()

c.execute('DELETE FROM bets')
c.execute('DELETE FROM options')
c.execute('DELETE FROM questions')
c.execute('DELETE FROM matches')

try:
    c.execute('DELETE FROM sqlite_sequence')
except:
    pass

conn.commit()

c.execute('SELECT COUNT(*) FROM matches')
print('matches:', c.fetchone()[0])
c.execute('SELECT COUNT(*) FROM questions')
print('questions:', c.fetchone()[0])

conn.close()
print('done')
