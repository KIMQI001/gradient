const { Builder, By, until, Capabilities } = require("selenium-webdriver")
const chrome = require("selenium-webdriver/chrome")
const url = require("url")
const fs = require("fs")
const crypto = require("crypto")
const request = require("request")
const path = require("path")
const FormData = require("form-data")
const proxy = require("selenium-webdriver/proxy")
const proxyChain = require("proxy-chain")
require('console-stamp')(console, {
  format: ':date(yyyy/mm/dd HH:MM:ss.l)'
})
require("dotenv").config()

const extensionId = "caacbgbklghmpodbdafajbgdnegacfmo"
const CRX_URL = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=98.0.4758.102&acceptformat=crx2,crx3&x=id%3D${extensionId}%26uc&nacl_arch=x86-64`
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36"

const USER = process.env.APP_USER || ""
const PASSWORD = process.env.APP_PASS || ""
const ALLOW_DEBUG = !!process.env.DEBUG?.length || false
const EXTENSION_FILENAME = "app.crx"
const PROXY = process.env.PROXY || undefined

console.log("-> 启动中...")
console.log("-> 用户:", USER)
console.log("-> 密码:", PASSWORD)
console.log("-> 代理:", PROXY)
console.log("-> 调试模式:", ALLOW_DEBUG)

if (!USER || !PASSWORD) {
  console.error("请设置 APP_USER 和 APP_PASS 环境变量")
  process.exit()
}

if (ALLOW_DEBUG) {
  console.log(
    "-> 调试模式已启用! 错误时会生成截图和控制台日志!"
  )
}

async function downloadExtension(extensionId) {
  const url = CRX_URL.replace(extensionId, extensionId)
  const headers = { "User-Agent": USER_AGENT }

  console.log("-> 正在从以下地址下载扩展:", url)

  if (fs.existsSync(EXTENSION_FILENAME) && fs.statSync(EXTENSION_FILENAME).mtime > Date.now() - 86400000) {
    console.log("-> 扩展已下载! 跳过下载...")
    return
  }

  return new Promise((resolve, reject) => {
    request({ url, headers, encoding: null }, (error, response, body) => {
      if (error) {
        console.error("下载扩展时出错:", error)
        return reject(error)
      }
      fs.writeFileSync(EXTENSION_FILENAME, body)
      if (ALLOW_DEBUG) {
        const md5 = crypto.createHash("md5").update(body).digest("hex")
        console.log("-> 扩展 MD5: " + md5)
      }
      resolve()
    })
  })
}

async function takeScreenshot(driver, filename) {
  if (!ALLOW_DEBUG) {
    return
  }

  const data = await driver.takeScreenshot()
  fs.writeFileSync(filename, Buffer.from(data, "base64"))
}

async function generateErrorReport(driver) {
  const dom = await driver.findElement(By.css("html")).getAttribute("outerHTML")
  fs.writeFileSync("error.html", dom)

  await takeScreenshot(driver, "error.png")

  const logs = await driver.manage().logs().get("browser")
  fs.writeFileSync(
    "error.log",
    logs.map((log) => `${log.level.name}: ${log.message}`).join("\n")
  )
}

async function getDriverOptions() {
  const options = new chrome.Options()

  // 基础设置
  options.addArguments("--headless")
  options.addArguments("--single-process")
  options.addArguments(`user-agent=${USER_AGENT}`)
  
  // 内存和性能优化
  options.addArguments("--disable-dev-shm-usage")  // 禁用/dev/shm使用
  options.addArguments("--disable-gpu")  // 禁用GPU
  options.addArguments("--js-flags=--max-old-space-size=512")
  options.addArguments("--disk-cache-size=1")
  options.addArguments("--disable-extensions")  // 禁用扩展
  options.addArguments("--disable-software-rasterizer")
  
  // 减少文件描述符使用
  options.addArguments("--no-sandbox")  // 禁用沙箱
  options.addArguments("--disable-logging")  // 禁用日志
  options.addArguments("--disable-dev-tools")  // 禁用开发者工具
  options.addArguments("--disable-browser-side-navigation")  // 禁用浏览器端导航
  options.addArguments("--disable-site-isolation-trials")  // 禁用站点隔离
  options.addArguments("--disable-features=site-per-process")  // 禁用每个进程一个站点
  options.addArguments("--disable-ipc-flooding-protection")  // 禁用IPC洪水保护
  
  // 窗口设置
  options.addArguments("--window-size=1920,1080")
  options.addArguments("--start-maximized")

  if (!ALLOW_DEBUG) {
    options.addArguments("--blink-settings=imagesEnabled=false")
  }

  if (PROXY) {
    console.log("-> 设置代理中...", PROXY)

    let proxyUrl = PROXY

    if (!proxyUrl.includes("://")) {
      proxyUrl = `http://${proxyUrl}`
    }

    const newProxyUrl = await proxyChain.anonymizeProxy(proxyUrl)

    console.log("-> 新代理地址:", newProxyUrl)

    options.setProxy(
      proxy.manual({
        http: newProxyUrl,
        https: newProxyUrl,
      })
    )
    const url = new URL(newProxyUrl)
    console.log("-> 代理主机:", url.hostname)
    console.log("-> 代理端口:", url.port)
    options.addArguments(`--proxy-server=socks5://${url.hostname}:${url.port}`)
    console.log("-> 代理设置完成!")
  } else {
    console.log("-> 未设置代理!")
  }

  return options
}

async function getProxyIpInfo(driver, proxyUrl) {
  const url = "https://myip.ipip.net"

  console.log("-> 获取代理IP信息:", proxyUrl)

  try {
    await driver.get(url)
    await driver.wait(until.elementLocated(By.css("body")), 30000)
    const pageText = await driver.findElement(By.css("body")).getText()
    console.log("-> 代理IP信息:", pageText)
  } catch (error) {
    console.error("-> 获取代理IP信息失败:", error)
    throw new Error("获取代理IP信息失败!")
  }
}

// 添加超时设置函数
async function setPageTimeout(driver) {
  await driver.manage().setTimeouts({
    implicit: 10000,  // 隐式等待
    pageLoad: 30000,  // 页面加载超时
    script: 30000     // 脚本执行超时
  });
}

// 清理浏览器数据
async function clearBrowserData(driver) {
  try {
    await driver.manage().deleteAllCookies();
    await driver.executeScript('window.localStorage.clear();');
    await driver.executeScript('window.sessionStorage.clear();');
  } catch (error) {
    console.log('清理浏览器数据时出错:', error);
  }
}

(async () => {
  await downloadExtension(extensionId)

  const options = await getDriverOptions()

  options.addExtensions(path.resolve(__dirname, EXTENSION_FILENAME))

  console.log(`-> 扩展已添加! ${EXTENSION_FILENAME}`)

  if (ALLOW_DEBUG) {
    options.addArguments("--enable-logging")
    options.addArguments("--v=1")
  }

  let driver
  try {
    console.log("-> 启动浏览器...")

    driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .build()

    console.log("-> 浏览器已启动!")

    // 设置超时
    await setPageTimeout(driver);

    if (PROXY) {
      try {
        await getProxyIpInfo(driver, PROXY)
      } catch (error) {
        throw new Error("获取代理IP信息失败，请通过命令 'curl -vv -x ${PROXY} https://myip.ipip.net' 检查代理")
      }
    }

    console.log("-> 已启动! 正在登录 https://app.gradient.network/...")
    await driver.get("https://app.gradient.network/")

    const emailInput = By.css('[placeholder="Enter Email"]')
    const passwordInput = By.css('[type="password"]')
    const loginButton = By.css("button")

    await driver.wait(until.elementLocated(emailInput), 30000)
    await driver.wait(until.elementLocated(passwordInput), 30000)
    await driver.wait(until.elementLocated(loginButton), 30000)

    await driver.findElement(emailInput).sendKeys(USER)
    await driver.findElement(passwordInput).sendKeys(PASSWORD)
    await driver.findElement(loginButton).click()

    await driver.wait(until.elementLocated(By.css('a[href="/dashboard/setting"]')), 30000)

    console.log("-> 已登录! 等待打开扩展...")

    takeScreenshot(driver, "logined.png")

    await driver.get(`chrome-extension://${extensionId}/popup.html`)

    console.log("-> 扩展已打开!")

    await driver.wait(
      until.elementLocated(By.xpath('//div[contains(text(), "Status")]')),
      30000
    )

    console.log("-> 扩展已加载!")
    takeScreenshot(driver, "extension-loaded.png")

    try {
      const gotItButton = await driver.findElement(
        By.xpath('//button[contains(text(), "I got it")]')
      )
      await gotItButton.click()
      console.log('-> "我知道了"按钮已点击!')
    } catch (error) {
      const dom = await driver
        .findElement(By.css("html"))
        .getAttribute("outerHTML")
      fs.writeFileSync("dom.html", dom)
      console.error('-> 未找到 "我知道了" 按钮!(跳过)')
    }

    try {
      const notAvailable = await driver.findElement(
        By.xpath(
          '//*[contains(text(), "Sorry, Gradient is not yet available in your region.")]'
        )
      )
      console.log("-> 抱歉,Gradient 在您所在的地区暂不可用。")
      await driver.quit()
      process.exit(1)
    } catch (error) {
      console.log("-> Gradient 在您所在的地区可用。")
    }

    const supportStatus = await driver
      .findElement(By.css(".absolute.mt-3.right-0.z-10"))
      .getText()

    if (ALLOW_DEBUG) {
      const dom = await driver
        .findElement(By.css("html"))
        .getAttribute("outerHTML")
      fs.writeFileSync("dom.html", dom)
      await takeScreenshot(driver, "status.png")
    }

    console.log("-> 状态:", supportStatus)

    if (supportStatus.includes("Disconnected")) {
      console.log("-> 当前状态: Disconnected, 等待重连...")
      console.log(`
    提示：
    - Disconnected 状态是正常的，请耐心等待自动重连
    - 如果长时间未重连，可能是代理问题，请检查代理状态
    - 建议使用稳定的住宅代理
  `)
      // 继续保持会话，不退出
      await new Promise(resolve => setTimeout(resolve, 10000)); // 等待10秒后继续
    }

    console.log("-> 已连接! 开始运行...")

    takeScreenshot(driver, "connected.png")

    console.log({
      support_status: supportStatus,
    })

    console.log("-> 已启动!")

    // 定期清理数据
    setInterval(async () => {
      if (driver) {
        await clearBrowserData(driver);
      }
    }, 5 * 60 * 1000); // 每5分钟清理一次

    setInterval(async () => {
      try {
        const title = await driver.getTitle()
        
        // 重新获取 supportStatus
        const statusElement = await driver.findElement(By.css(".absolute.mt-3.right-0.z-10"))
        const currentStatus = await statusElement.getText()

        if (PROXY) {
          console.log(`-> [${USER}] 使用代理 ${PROXY} 运行中... (标题: ${title}, 状态: ${currentStatus})`)
        } else {
          console.log(`-> [${USER}] 未使用代理运行中... (标题: ${title}, 状态: ${currentStatus})`)
        }
      } catch (error) {
        console.log("-> 状态更新失败:", error.message)
      }
    }, 30000)
  } catch (error) {
    console.error("发生错误:", error)
    console.error(error.stack)

    if (driver) {
      await generateErrorReport(driver)
      console.error("-> 错误报告已生成!")
      console.error(fs.readFileSync("error.log").toString())
      driver.quit()
    }

    process.exit(1)
  }
})()
