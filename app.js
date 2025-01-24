const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const proxy = require("selenium-webdriver/proxy");
const proxyChain = require("proxy-chain");
const path = require('path');
require("dotenv").config();

const USER = process.env.APP_USER;
const PASSWORD = process.env.APP_PASS;
const PROXY = process.env.PROXY;
const EXTENSION_ID = "caacbgbklghmpodbdafajbgdnegacfmo";
const CRX_PATH = path.join(__dirname, "app.crx");

let isShuttingDown = false;
let driver = null;
let proxyServer = null;

if (!USER || !PASSWORD) process.exit(1);

async function setupProxy() {
  if (!PROXY) return null;
  try {
    const proxyUrl = PROXY.includes("://") ? PROXY : `http://${PROXY}`;
    const newProxyUrl = await proxyChain.anonymizeProxy(proxyUrl);
    return newProxyUrl;
  } catch (error) {
    console.error('代理设置失败:', error.message);
    return null;
  }
}

async function getDriverOptions() {
  const options = new chrome.Options();
  options.addArguments(
    "--headless",
    "--single-process",
    "--no-sandbox",
    "--no-zygote",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-dev-tools",
    "--disable-software-rasterizer",
    "--disable-logging",
    "--disable-browser-side-navigation",
    "--disable-site-isolation-trials",
    "--disable-features=site-per-process",
    "--disable-ipc-flooding-protection",
    "--disable-default-apps",
    "--disable-popup-blocking",
    "--disable-sync",
    "--disable-remote-fonts",
    "--disable-client-side-phishing-detection",
    "--disable-component-extensions-with-background-pages",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-domain-reliability",
    "--disable-breakpad",
    "--disable-notifications",
    "--mute-audio",
    "--no-default-browser-check",
    "--no-first-run",
    "--password-store=basic",
    "--use-mock-keychain",
    "--force-gpu-mem-available-mb=32",
    "--js-flags=--max-old-space-size=64",
    "--memory-pressure-off",
    "--disk-cache-size=1",
    "--media-cache-size=1",
    "--window-size=800,600",
    "--blink-settings=imagesEnabled=false",
    "--proxy-bypass-list=<-loopback>",  // 绕过本地连接
    "--ignore-certificate-errors",       // 忽略证书错误
    "--disable-web-security"            // 禁用web安全策略
  );

  options.addExtensions(CRX_PATH);

  if (PROXY) {
    const proxyUrl = await setupProxy();
    if (proxyUrl) {
      options.setProxy(proxy.manual({http: proxyUrl, https: proxyUrl}));
    }
  }

  return options;
}

async function cleanup() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log('正在清理资源...');
  if (driver) {
    try {
      await driver.quit();
    } catch {}
    driver = null;
  }

  if (proxyServer) {
    try {
      await proxyChain.closeAnonymizedProxy(proxyServer, true);
    } catch {}
    proxyServer = null;
  }
  
  setTimeout(() => {
    console.log('清理完成，正常退出');
    process.exit(0);
  }, 1000);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', async (err) => {
  console.error('未捕获的异常:', err);
  await cleanup();
});
process.on('unhandledRejection', async (err) => {
  console.error('未处理的Promise拒绝:', err);
  await cleanup();
});

async function waitForElement(locator, timeout = 15000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      const element = await driver.findElement(locator);
      if (await element.isDisplayed()) {
        return element;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`等待元素超时: ${locator}`);
}

async function initializeDriver() {
  while (!isShuttingDown) {
    try {
      if (driver) {
        try {
          await driver.quit();
        } catch {}
        driver = null;
      }

      console.log('正在初始化浏览器...');
      driver = await new Builder()
        .forBrowser("chrome")
        .setChromeOptions(await getDriverOptions())
        .build();

      await driver.manage().setTimeouts({
        implicit: 5000,
        pageLoad: 30000,  // 增加页面加载超时
        script: 30000
      });

      // 尝试登录
      console.log('尝试登录...');
      await driver.get("https://app.gradient.network/");
      
      // 等待并填写登录表单
      const emailInput = await waitForElement(By.css('[placeholder="Enter Email"]'));
      const passwordInput = await waitForElement(By.css('[type="password"]'));
      const loginButton = await waitForElement(By.css("button"));

      await emailInput.sendKeys(USER);
      await passwordInput.sendKeys(PASSWORD);
      await loginButton.click();

      // 等待登录成功
      await waitForElement(By.css('a[href="/dashboard/setting"]'));
      console.log('登录成功！');

      // 打开扩展
      console.log('正在打开扩展...');
      await driver.get(`chrome-extension://${EXTENSION_ID}/popup.html`);
      await waitForElement(By.xpath('//div[contains(text(), "Status")]'));

      try {
        const gotItButton = await driver.findElement(By.xpath('//button[contains(text(), "I got it")]'));
        if (await gotItButton.isDisplayed()) {
          await gotItButton.click();
        }
      } catch {}

      console.log('初始化成功！');
      return true;
    } catch (error) {
      console.error('连接失败:', error.message);
      console.log('10秒后重试...');
      await new Promise(r => setTimeout(r, 10000));
    }
  }
  return false;
}

async function main() {
  const CHECK_INTERVAL = 60000;
  const MAX_RETRIES = 3;
  let retryCount = 0;

  if (!await initializeDriver()) {
    console.error('无法建立连接，程序退出');
    process.exit(1);
  }

  while (!isShuttingDown) {
    try {
      if (!driver) {
        console.log('重新连接中...');
        if (!await initializeDriver()) {
          break;
        }
        retryCount = 0;
      }

      const status = await waitForElement(By.css(".absolute.mt-3.right-0.z-10"));
      const statusText = await status.getText();
      
      if (statusText.includes("Disconnected")) {
        throw new Error("Disconnected");
      }
      
      console.log('状态正常:', statusText);
      retryCount = 0;
      await new Promise(r => setTimeout(r, CHECK_INTERVAL));

    } catch (error) {
      if (isShuttingDown) break;
      
      console.error('发生错误:', error.message);
      if (driver) {
        try {
          await driver.quit();
        } catch {}
        driver = null;
      }

      if (++retryCount >= MAX_RETRIES) {
        console.error('达到最大重试次数，退出程序');
        await cleanup();
        break;
      }

      console.log(`开始第 ${retryCount}/${MAX_RETRIES} 次重试...`);
    }
  }
}

main().catch(async (err) => {
  console.error('主程序异常:', err);
  await cleanup();
});
