#!/usr/bin/env bash
# seed の item_media は行だけを入れる (SQL では Storage にファイルを置けない)。
# このスクリプトが supabase/seed/fixtures/*.jpg を item-media バケットの
# {org_id}/{item_id}/{filename} へ置き、db reset 直後でもサムネイルが出るようにする。
# 使い方:
#   ローカル: supabase db reset && supabase/seed/upload_fixtures.sh
#   リモート: SUPABASE_URL=... SERVICE_ROLE_KEY=... SUPABASE_DB_URL=postgresql://... supabase/seed/upload_fixtures.sh
set -euo pipefail

cd "$(dirname "$0")/../.."
fixtures="supabase/seed/fixtures"

api_url="${SUPABASE_URL:-}"
service_key="${SERVICE_ROLE_KEY:-}"
if { [ -n "$api_url" ] && [ -z "$service_key" ]; } || { [ -z "$api_url" ] && [ -n "$service_key" ]; }; then
  echo "SUPABASE_URL と SERVICE_ROLE_KEY は両方指定する (片方だけだとローカルへ投入してしまう)" >&2
  exit 1
fi
if [ -z "$api_url" ]; then
  status=$(supabase status -o json)
  api_url=$(printf '%s' "$status" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).API_URL))')
  service_key=$(printf '%s' "$status" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).SERVICE_ROLE_KEY))')
fi

# seed が入れた item_media の行から storage_path を取り、同名のフィクスチャを流し込む。
# ローカルでは psql が Supabase CLI のコンテナ内にしか無いので docker exec 経由。
select_paths="select storage_path from public.item_media order by storage_path"
if [ -n "${SUPABASE_DB_URL:-}" ]; then
  paths=$(psql "$SUPABASE_DB_URL" -At -c "$select_paths")
else
  paths=$(docker exec -i supabase_db_acerora2 psql -U postgres -At -c "$select_paths")
fi

for path in $paths; do
  file="$fixtures/$(basename "$path")"
  if [ ! -f "$file" ]; then
    echo "skip (fixture なし): $path"
    continue
  fi
  code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
    "$api_url/storage/v1/object/item-media/$path" \
    -H "Authorization: Bearer $service_key" \
    -H "Content-Type: image/jpeg" \
    -H "x-upsert: true" \
    --data-binary "@$file")
  echo "$code $path"
done
