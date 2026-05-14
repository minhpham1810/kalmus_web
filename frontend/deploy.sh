SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

npm run build

if pm2 describe kalmus > /dev/null; then
  echo "Restarting kalmus..."
  pm2 restart kalmus
else
  echo "Starting kalmus..."
  pm2 start npm --name kalmus -- start
fi
