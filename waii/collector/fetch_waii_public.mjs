#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const waiiDir = path.resolve(__dirname, "..");
const dataDir = path.join(waiiDir, "data");
const rawDir = path.join(dataDir, "raw");
const snapshotsDir = path.join(dataDir, "snapshots");

const chromeCandidates = [
  process.env.CHROME_BIN,
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean);

const pageTargets = [
  { name: "home", url: "https://wwii.one/" },
  { name: "yeekee", url: "https://wwii.one/yeekee" },
];

const apiEndpoints = new Set([
  "https://api.waii.site/api/home",
  "https://api.waii.site/api/home/cf",
  "https://api.waii.site/api/yeekee",
]);

function makeTimestamp() {
  return new Date().toISOString();
}

async function ensureDirs() {
  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(snapshotsDir, { recursive: true });
}

async function removeIfExists(target) {
  try {
    await fs.unlink(target);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function fileExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(target, value) {
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function snapshotFilename(isoTimestamp) {
  return `${isoTimestamp.replaceAll(":", "-").replaceAll(".", "-")}.json`;
}

async function resolveChromePath() {
  for (const candidate of chromeCandidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  throw new Error("Chrome executable not found. Set CHROME_BIN if needed.");
}

async function collectPageSnapshot(page, target) {
  const [title, finalUrl, textPreview, html] = await Promise.all([
    page.title(),
    page.url(),
    page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 4000)),
    page.content(),
  ]);

  const htmlPath = path.join(rawDir, `${target.name}-rendered.html`);
  await fs.writeFile(htmlPath, html, "utf8");

  return {
    name: target.name,
    requestedUrl: target.url,
    finalUrl,
    title,
    textPreview,
    renderedHtmlPath: path.relative(waiiDir, htmlPath),
  };
}

async function main() {
  await ensureDirs();
  await Promise.all([
    removeIfExists(path.join(dataDir, "api-home.json")),
    removeIfExists(path.join(dataDir, "api-home-cf.json")),
    removeIfExists(path.join(dataDir, "api-yeekee.json")),
  ]);

  const chromePath = await resolveChromePath();
  const capturedAt = makeTimestamp();
  const consoleMessages = [];
  const requestFailures = [];
  const responses = {};
  const pages = [];
  const payloads = {
    home: null,
    homeConfig: null,
    yeekee: null,
  };

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    page.on("console", (msg) => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
      });
    });

    page.on("requestfailed", (request) => {
      requestFailures.push({
        url: request.url(),
        method: request.method(),
        errorText: request.failure()?.errorText ?? "unknown",
      });
    });

    page.on("response", async (response) => {
      const url = response.url();
      if (!apiEndpoints.has(url)) {
        return;
      }

      const contentType = response.headers()["content-type"] ?? "";
      let body = "";
      try {
        body = await response.text();
      } catch (error) {
        body = `<read-error:${error.message}>`;
      }

      responses[url] = {
        status: response.status(),
        contentType,
        bodyPreview: body.slice(0, 5000),
      };

      if (contentType.includes("application/json")) {
        try {
          const parsed = JSON.parse(body);
          const filename = url.endsWith("/api/home")
            ? "api-home.json"
            : url.endsWith("/api/home/cf")
              ? "api-home-cf.json"
              : "api-yeekee.json";
          if (url.endsWith("/api/home")) payloads.home = parsed;
          if (url.endsWith("/api/home/cf")) payloads.homeConfig = parsed;
          if (url.endsWith("/api/yeekee")) payloads.yeekee = parsed;
          await writeJson(path.join(dataDir, filename), parsed);
        } catch (error) {
          consoleMessages.push({
            type: "json-parse-error",
            text: `${url}: ${error.message}`,
          });
        }
      }
    });

    for (const target of pageTargets) {
      try {
        await page.goto(target.url, { waitUntil: "networkidle2", timeout: 45000 });
      } catch (error) {
        consoleMessages.push({
          type: "goto-error",
          text: `${target.url}: ${error.message}`,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 2500));
      pages.push(await collectPageSnapshot(page, target));
    }
  } finally {
    await browser.close();
  }

  const status = {
    capturedAt,
    chromePath,
    pages,
    apiResponses: responses,
    requestFailures,
    consoleMessages,
    availability: {
      homeApiCaptured: await fileExists(path.join(dataDir, "api-home.json")),
      homeConfigCaptured: await fileExists(path.join(dataDir, "api-home-cf.json")),
      yeekeeApiCaptured: await fileExists(path.join(dataDir, "api-yeekee.json")),
    },
  };

  await writeJson(path.join(dataDir, "status.json"), status);
  await writeJson(path.join(snapshotsDir, snapshotFilename(capturedAt)), {
    capturedAt,
    pages,
    apiResponses: responses,
    requestFailures,
    consoleMessages,
    availability: status.availability,
    home: payloads.home,
    homeConfig: payloads.homeConfig,
    yeekee: payloads.yeekee,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
