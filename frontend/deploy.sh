SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

npm run build

if pm2 describe kalmus > /dev/null; then
  echo "kalmus is already running – stopping it..."
  pm2 kill
fi

echo "starting kalmus..."
pm2 start "npm start" --name kalmus
