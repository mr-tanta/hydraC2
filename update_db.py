import sqlite3

def update_db():
    with sqlite3.connect('c2.db') as conn:
        c = conn.cursor()
        try:
            c.execute('ALTER TABLE implants ADD COLUMN ip_address TEXT')
            conn.commit()
            print("[+] Successfully added ip_address column")
        except sqlite3.OperationalError as e:
            if 'duplicate column name' in str(e):
                print("[*] ip_address column already exists")
            else:
                print(f"[-] Error: {e}")

if __name__ == "__main__":
    update_db() 