const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1350 },
    deviceScaleFactor: 2,
  });

  const svgPath = path.resolve("./public/synapse_v3_infographic.svg");
  const svgContent = fs.readFileSync(svgPath, "utf8");

  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: #080c14; overflow: hidden; width: 1080px; height: 1350px; }
          svg { width: 1080px; height: 1350px; display: block; }
        </style>
      </head>
      <body>
        ${svgContent}
      </body>
    </html>
  `);

  await page.waitForTimeout(600);

  const outPath = path.resolve("./public/synapse_v3_infographic.jpg");
  await page.screenshot({
    path: outPath,
    type: "jpeg",
    quality: 95,
  });

  await browser.close();
  console.log("Successfully generated JPG:", outPath);
})();
