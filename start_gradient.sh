#!/bin/bash

# 配置文件路径
CONFIG_FILE="config.txt"
PROXIES_FILE="proxies.txt"

# 检查配置文件是否存在
if [ ! -f "$CONFIG_FILE" ]; then
    echo "错误: 配置文件 $CONFIG_FILE 不存在"
    echo "请创建配置文件，格式为："
    echo "email=your_email@example.com"
    echo "password=your_password"
    exit 1
fi

# 检查代理文件是否存在
if [ ! -f "$PROXIES_FILE" ]; then
    echo "错误: 代理文件 $PROXIES_FILE 不存在"
    echo "请创建代理文件，每行一个代理，格式为："
    echo "http://user:pass@host:port"
    exit 1
fi

# 读取配置文件
source "$CONFIG_FILE"

# 验证配置
if [ -z "$email" ] || [ -z "$password" ]; then
    echo "错误: 配置文件中缺少 email 或 password"
    exit 1
fi

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo "错误: Docker 服务未运行"
    exit 1
fi

group=$1
# 清理同组的旧容器
echo "清理旧容器 gradient-$group"
docker ps -a | grep "gradient-$group" | awk '{print $1}' | xargs -r docker rm -f

# 启动新容器
container_name="gradient-${group}"
echo "启动 Gradient 容器..."

# 创建专用网络（如果不存在）
if ! docker network inspect gradient-net >/dev/null 2>&1; then
    docker network create --driver bridge gradient-net
fi

docker run -d \
    --name $container_name \
    --network gradient-net \
    --dns 8.8.8.8 \
    --dns 8.8.4.4 \
    --restart on-failure:3 \
    --ulimit nofile=65535:65535 \
    --stop-timeout 30 \
    --memory="400m" \
    --memory-swap="4g" \
    --cpus=1 \
    -e APP_USER="$email" \
    -e APP_PASS="$password" \
    -e NODE_ENV=development \
    -v "$(pwd)/$PROXIES_FILE:/app/proxies.txt:ro" \
    -v "$(pwd)/app.js:/app/app.js:ro" \
    -v "$(pwd)/app.crx:/app/app.crx:ro" \
    overtrue/gradient-bot

# 设置信号处理
cleanup() {
    echo "正在停止容器 $container_name..."
    docker stop -t 30 $container_name >/dev/null 2>&1
    exit 0
}

trap cleanup SIGINT SIGTERM

# 检查容器是否成功启动
if [ $? -eq 0 ]; then
    echo "Gradient 容器已成功启动！"
    echo "容器日志："
    docker logs -f $container_name
else
    echo "错误: 容器启动失败"
    exit 1
fi
