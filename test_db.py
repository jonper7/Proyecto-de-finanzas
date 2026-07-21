import psycopg2

try:
    conn = psycopg2.connect(
        host="localhost",
        port=5432,
        dbname="finanzas_personales",
        user="jonper",
        password="jonper"
    )

    print("✅ Conectado correctamente")

    cur = conn.cursor()
    cur.execute("SELECT version();")

    print(cur.fetchone())

    cur.close()
    conn.close()

except Exception as e:
    print(type(e))
    print(repr(e))