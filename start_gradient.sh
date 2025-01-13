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

# 停止已存在的容器
existing_container=$(docker ps -q --filter "ancestor=overtrue/gradient-bot")
if [ ! -z "$existing_container" ]; then
    echo "停止已存在的容器..."
    docker stop "$existing_container"
    docker rm "$existing_container"
fi


# 启动新容器
group=$1
container_name="gradient-${group}"
echo "启动 Gradient 容器..."
docker run -d \
    --name $container_name \
    --restart unless-stopped \
    -e APP_USER="$email" \
    -e APP_PASS="$password" \
    -e NODE_ENV=development \
    -v "$(pwd)/$PROXIES_FILE:/app/proxies.txt" \
    -v "$(pwd)/app.js:/app/app.js" \
    overtrue/gradient-bot

# 检查容器是否成功启动
if [ $? -eq 0 ]; then
    echo "Gradient 容器已成功启动！"
    echo "容器日志："
    docker logs -f $container_name
else
    echo "错误: 容器启动失败"
    exit 1
fi
