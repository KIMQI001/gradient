const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const proxy = require("selenium-webdriver/proxy");
const proxyChain = require("proxy-chain");
const https = require('https');
const path = require('path');
const fs = require('fs');
require("dotenv").config();

const USER = process.env.APP_USER;
const PASSWORD = process.env.APP_PASS;
const PROXY = process.env.PROXY;
const EXTENSION_ID = "caacbgbklghmpodbdafajbgdnegacfmo";
const CRX_PATH = path.join(__dirname, "extension.crx");

let isShuttingDown = false;
let driver = null;

if (!USER || !PASSWORD) process.exit(1);

// 优化的CRX下载函数
async function downloadCRX() {
  if (fs.existsSync(CRX_PATH)) {
    const stats = fs.statSync(CRX_PATH);
    if (Date.now() - stats.mtimeMs < 24 * 60 * 60 * 1000) {
      return;
    }
  }

  return new Promise((resolve, reject) => {
    const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=98.0.4758.102&acceptformat=crx2,crx3&x=id%3D${EXTENSION_ID}%26uc`;
    
    https.get(url, response => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      const writeStream = fs.createWriteStream(CRX_PATH);
      response.pipe(writeStream);
      
      writeStream.on('finish', () => {
        writeStream.close();
        resolve();
      });
      
      writeStream.on('error', err => {
        fs.unlink(CRX_PATH, () => reject(err));
      });
    }).on('error', reject);
  });
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
    "--blink-settings=imagesEnabled=false"
  );

  options.addExtensions(CRX_PATH);

  if (PROXY) {
    const proxyUrl = PROXY.includes("://") ? PROXY : `http://${PROXY}`;
    const newProxyUrl = await proxyChain.anonymizeProxy(proxyUrl);
    options.setProxy(proxy.manual({http: newProxyUrl, https: newProxyUrl}));
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
  
  // 确保所有资源都清理完毕
  setTimeout(() => {
    console.log('清理完成，正常退出');
    process.exit(0);
  }, 1000);
}

// 信号处理
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

async function main() {
  try {
    await downloadCRX();
  } catch (err) {
    console.error('下载扩展失败:', err);
    process.exit(1);
  }

  const RETRY_DELAY = 60000;
  const CHECK_INTERVAL = 60000;
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (!isShuttingDown) {
    try {
      if (!driver) {
        driver = await new Builder()
          .forBrowser("chrome")
          .setChromeOptions(await getDriverOptions())
          .build();

        await driver.manage().setTimeouts({
          implicit: 5000,
          pageLoad: 15000,
          script: 15000
        });

        await driver.get("https://app.gradient.network/");
        await driver.findElement(By.css('[placeholder="Enter Email"]')).sendKeys(USER);
        await driver.findElement(By.css('[type="password"]')).sendKeys(PASSWORD);
        await driver.findElement(By.css("button")).click();
        await driver.wait(until.elementLocated(By.css('a[href="/dashboard/setting"]')), 15000);

        await driver.get(`chrome-extension://${EXTENSION_ID}/popup.html`);
        await driver.wait(until.elementLocated(By.xpath('//div[contains(text(), "Status")]')), 15000);

        try {
          await driver.findElement(By.xpath('//button[contains(text(), "I got it")]')).click();
        } catch {}
      }

      const status = await driver.findElement(By.css(".absolute.mt-3.right-0.z-10")).getText();
      if (status.includes("Disconnected")) {
        throw new Error("Disconnected");
      }
      
      retryCount = 0;
      await new Promise(r => setTimeout(r, CHECK_INTERVAL));

    } catch (error) {
      if (isShuttingDown) break;
      
      console.error('发生错误:', error);
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

      console.log(`${retryCount}/${MAX_RETRIES} 次重试，等待 ${RETRY_DELAY/1000} 秒...`);
      await new Promise(r => setTimeout(r, RETRY_DELAY));
    }
  }
}

// 启动主程序
main().catch(async (err) => {
  console.error('主程序异常:', err);
  await cleanup();
});
