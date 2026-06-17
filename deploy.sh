#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== KM-API 部署开始 ==="
echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"

echo ">>> 拉取最新代码..."
git pull origin master

echo ">>> 安装依赖..."
npm install --production

echo ">>> 检查服务进程..."
if pgrep -f "node.*dist/server.js" > /dev/null; then
    echo ">>> 发现旧进程，正在重启..."
    pkill -f "node.*dist/server.js"
    sleep 2
else
    echo ">>> 无旧进程，直接启动"
fi

echo ">>> 启动服务..."
nohup npm start > server.log 2>&1 &
sleep 3

if pgrep -f "node.*dist/server.js" > /dev/null; then
    echo "=== 部署成功，服务运行中 ==="
    echo "PID: $(pgrep -f 'node.*dist/server.js')"
    echo "日志: $SCRIPT_DIR/server.log"
else
    echo "=== 部署失败，请检查日志 ==="
    echo "tail -50 server.log"
    exit 1
fi