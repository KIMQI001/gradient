// 1. 从文件读取代理列表
const fs = require('fs')
const path = require('path')
require('console-stamp')(console, {
  format: ':date(yyyy/mm/dd HH:MM:ss.l)'
})

let proxies = []

try {
  proxies = fs.readFileSync(path.resolve(__dirname, 'proxies.txt'), 'utf-8').split('\n').filter(Boolean)
} catch (error) {
  console.log('-> 未找到 proxies.txt 文件或读取出错，将不使用代理启动应用...')
}

// 2. 使用 PROXY 环境变量启动 pm2
const { execSync } = require('child_process')
const USER = process.env.APP_USER || ''
const PASSWORD = process.env.APP_PASS || ''

if (!USER || !PASSWORD) {
  console.error("请设置 APP_USER 和 APP_PASS 环境变量")
  process.exit()
}

if (proxies.length === 0) {
  console.error("proxies.txt 中未找到代理地址，将不使用代理启动应用...")
  execSync(`APP_USER='${USER}' APP_PASS='${PASSWORD}' pm2 start app.js --name gradient-bot-no-proxy -l gradient-bot-no-proxy.log`)
  console.log('-> ✓ 已启动 gradient-bot-no-proxy')
} else {
  console.log(`-> 在 proxies.txt 中找到 ${proxies.length} 个代理`)
  let index = 0
  for (const proxy of proxies) {
    const name = `gradient-${index++}`
    execSync(`PROXY=${proxy} APP_USER='${USER}' APP_PASS='${PASSWORD}' pm2 start app.js --name ${name} -l ${name}.log`)
    console.log(`-> 已使用代理 ${proxy} 启动 ${name}`)
    
    // 如果不是最后一个实例，等待10秒
    if (index < proxies.length) {
      console.log('-> 等待10秒后启动下一个实例...')
      execSync('sleep 10')
    }
  }

  // 3. 保存代理到文件
  console.log('-> ✓ 所有代理已启动完成！')
}

// 4. 显示 pm2 状态
execSync('pm2 status')
