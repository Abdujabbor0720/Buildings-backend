#!/usr/bin/env bash
#
# ISHLAB CHIQARISH BAZASINI TAYYORLASH — rol, baza va kengaytma.
#
#   sudo DB_USERNAME=buildings DB_PASSWORD='...' DB_NAME=buildings_db \
#        bash scripts/provision-db.sh
#
# ⚠️ `setup-db.sh` DAN FARQI: bu skript migratsiya ham, demo ma'lumot ham
# YUKLAMAYDI. `setup-db.sh` oxirida `npm run seed` bor va u jadvallarni
# TRUNCATE qiladi — ishlab chiqarishda ishlatilsa butun ma'lumot yo'qoladi.
# Shuning uchun ikkita alohida skript.
#
# Migratsiyani deploy jarayoni o'zi ishga tushiradi
# (`npm run migration:run` build buyrug'ida).

set -euo pipefail

DB_USER="${DB_USERNAME:-buildings}"
DB_PASS="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-buildings_db}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"

if [ -z "$DB_PASS" ]; then
  echo "❌ DB_PASSWORD berilmadi."
  echo "   Yangi parol yaratish:  openssl rand -base64 24 | tr -d '/+='"
  exit 1
fi

# ⚠️ Parolda `'` bo'lsa SQL qatori buziladi va parol JIM ravishda
# noto'g'ri o'rnatiladi — keyin «password authentication failed» chiqadi
# va sababini topish qiyin bo'ladi.
case "$DB_PASS" in
  *"'"*) echo "❌ Parolda apostrof (') bo'lmasin — SQL qatorini buzadi."; exit 1 ;;
esac

psql_su() { sudo -u postgres psql -v ON_ERROR_STOP=1 "$@"; }

echo "▶ 1/4  Rol: ${DB_USER}"
# Rol bor bo'lsa paroli YANGILANADI: ko'pincha muammo aynan shunda —
# rol bor, lekin paneldagi parol unga mos kelmaydi.
psql_su <<SQL >/dev/null
DO \$\$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';
  ELSE
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
SQL

echo "▶ 2/4  Baza: ${DB_NAME}"
psql_su <<SQL >/dev/null
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}')\gexec
SQL

echo "▶ 3/4  pg_trgm kengaytmasi"
# ⚠️ Oddiy foydalanuvchi kengaytma o'rnata OLMAYDI. Busiz `SearchIndexes`
# migratsiyasi «permission denied to create extension» bilan yiqiladi —
# ya'ni parol tuzatilgandan keyingi KEYINGI xato aynan shu bo'lardi.
psql_su -d "${DB_NAME}" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" >/dev/null
psql_su -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};" >/dev/null

echo "▶ 4/4  Ulanish tekshirilmoqda (${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME})"
# Deploy'ni kutmasdan SHU YERDA tekshiramiz: parol mos kelmasa,
# xato build jurnalida emas, shu yerda — tushunarli matn bilan chiqadi.
if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
     -d "$DB_NAME" -tAc "select 1" >/dev/null 2>&1; then
  echo
  echo "✅ Baza tayyor va parol ishlayapti."
  echo "   Endi deploy panelida AYNI shu qiymatlarni qo'ying:"
  echo "     DB_HOST=${DB_HOST}"
  echo "     DB_PORT=${DB_PORT}"
  echo "     DB_USERNAME=${DB_USER}"
  echo "     DB_NAME=${DB_NAME}"
  echo "     DB_PASSWORD=<yuqorida bergan parolingiz>"
else
  echo
  echo "❌ Rol va baza yaratildi, lekin TCP orqali ulanib bo'lmadi."
  echo "   Sabab odatda pg_hba.conf da: 'host' qatori 'peer'/'ident' turibdi."
  echo "   Tekshiring:  sudo -u postgres psql -tAc 'show hba_file'"
  echo "   Kerakli qator:"
  echo "     host  ${DB_NAME}  ${DB_USER}  127.0.0.1/32  scram-sha-256"
  echo "   So'ng:  sudo systemctl reload postgresql"
  exit 1
fi
