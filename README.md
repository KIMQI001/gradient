# Gradient Bot

一个基于 Selenium 的自动化工具，支持多代理并发运行。

## 功能特点

- 支持多代理并发运行
- 使用 PM2 进行进程管理
- 支持 Docker 部署
- 自动状态监控和日志记录

## 快速开始

1. 配置环境变量
```bash
export APP_USER=your_username
export APP_PASS=your_password
```

2. 配置代理
在 `proxies.txt` 中添加代理地址，每行一个：
```
http://username:password@host:port
```

3. 启动服务
```bash
# 使用 PM2 启动
node start.js

# 或使用 Docker 启动
./start_gradient.sh
```

## Docker 部署

1. 构建镜像
```bash
docker build -t gradient-bot .
```

2. 运行容器
```bash
./start_gradient.sh
```

## 配置文件

- `config.txt`: 用户名和密码配置
- `proxies.txt`: 代理服务器列表
- `app.js`: 主程序
- `start.js`: PM2 启动脚本
- `start_gradient.sh`: Docker 启动脚本

## 注意事项

- 确保系统已安装 Node.js 和 PM2
- Docker 环境需要安装 Docker Engine
- 代理格式必须符合要求
- 建议每个实例之间保持适当的启动间隔
