#!/bin/bash
echo "==================================="
echo "Cloudflare API Token 設定"
echo "==================================="
echo ""
echo "トークンを入力してください（入力中は表示されません）:"
read -s CLOUDFLARE_API_TOKEN
echo ""
echo "トークンを設定しています..."
export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN"

# .envファイルにも保存
echo "CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN" > .env

echo ""
echo "✅ トークンを設定しました！"
echo ""
echo "確認中..."
npx wrangler whoami

echo ""
echo "==================================="
echo "設定完了！"
echo "==================================="
