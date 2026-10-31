#!/usr/bin/env bash
#
# Lokal bazani noldan tayyorlaydi: rol, baza, sxema va demo ma'lumot.
#
#   bash scripts/setup-db.sh
#
# ⚠️ `sudo -u postgres` talab qilinadi — rol va baza yaratish uchun.
# Allaqachon rol/baza bor bo'lsa, skript ularni qayta yaratmaydi.

set -euo pipefail
cd "$(dirname "$0")/.."

DB_USER="${DB_USERNAME:-buildings}"
DB_PASS="${DB_PASSWORD:-buildings}"
DB_NAME="${DB_NAME:-buildings_db}"

echo "▶ 1/4  Rol va baza: ${DB_USER} / ${DB_NAME}"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}')\gexec
SQL

# `pg_trgm` kengaytmasini oddiy foydalanuvchi o'rnata olmaydi — superuser qiladi.
sudo -u postgres psql -d "${DB_NAME}" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" >/dev/null

echo "▶ 2/4  .env tekshirilmoqda"
[ -f .env ] || cp .env.example .env

echo "▶ 3/4  Migratsiyalar"
npm run migration:run

echo "▶ 4/4  Demo ma'lumot"
npm run seed

echo
echo "✅ Tayyor. Ishga tushirish: npm run start:dev"
echo "   Kirish: hokim@andijon.uz / Hokim2026!"
