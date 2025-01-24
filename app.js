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
const CRX_PATH = path.join(__dirname, "extension.crx");

let isShuttingDown = false;
let driver = null;

if (!USER || !PASSWORD) process.exit(1);

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

async function main() {
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

main().catch(async (err) => {
  console.error('主程序异常:', err);
  await cleanup();
});
