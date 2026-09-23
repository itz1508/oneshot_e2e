import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  detectImageFormat,
  readImageAttachmentTool,
  captureScreenshotTool,
  generateImageTool,
  createStrandsAgent,
  invokeDirectTool,
} from "../src/index.ts";

test("Multimodal Vision & Media Tools Suite", async (t) => {
  const tmpDir = path.resolve("./.oneshot/test-media-tmp");
  await fs.mkdir(tmpDir, { recursive: true });

  t.after(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  await t.test("detectImageFormat detects formats correctly", () => {
    assert.equal(detectImageFormat("mockup.PNG"), "png");
    assert.equal(detectImageFormat("photo.JPEG"), "jpeg");
    assert.equal(detectImageFormat("icon.jpg"), "jpeg");
    assert.equal(detectImageFormat("asset.webp"), "webp");
    assert.equal(detectImageFormat("animation.gif"), "gif");
    assert.equal(detectImageFormat("image/jpeg"), "jpeg");
    assert.equal(detectImageFormat("unknown.bin"), "png");
  });

  await t.test("readImageAttachmentTool loads base64 data and returns ImageBlock", async () => {
    // 1x1 PNG base64
    const base64Png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const result = await readImageAttachmentTool.invoke({
      base64: base64Png,
      format: "png",
      description: "Test 1x1 pixel image",
    });

    assert.ok(Array.isArray(result), "Result should be an array of blocks");
    assert.equal(result.length, 2);

    const [textBlock, imageBlock] = result;
    assert.equal(textBlock.type, "textBlock");
    assert.match(textBlock.text, /IMAGE_ATTACHMENT_LOADED/);
    assert.match(textBlock.text, /Test 1x1 pixel image/);

    assert.equal(imageBlock.type, "imageBlock");
    assert.equal(imageBlock.format, "png");
    assert.equal(imageBlock.source.type, "imageSourceBytes");
    assert.ok(imageBlock.source.bytes instanceof Uint8Array);
    assert.ok(imageBlock.source.bytes.length > 0);
  });

  await t.test("readImageAttachmentTool loads workspace file path and returns ImageBlock", async () => {
    const testFile = path.join(tmpDir, "sample-ui.png");
    const fakeBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await fs.writeFile(testFile, fakeBytes);

    const result = await readImageAttachmentTool.invoke({
      filePath: testFile,
      description: "Sample UI screenshot",
    });

    assert.ok(Array.isArray(result));
    const [textBlock, imageBlock] = result;
    assert.equal(textBlock.type, "textBlock");
    assert.equal(imageBlock.type, "imageBlock");
    assert.equal(imageBlock.format, "png");
    assert.equal(imageBlock.source.bytes.length, 8);
  });

  await t.test("captureScreenshotTool generates valid screenshot and ImageBlock", async () => {
    const screenshotPath = path.join(tmpDir, "viewport.png");

    const result = await captureScreenshotTool.invoke({
      url: "http://localhost:8787",
      outputPath: screenshotPath,
      viewportWidth: 1440,
      viewportHeight: 900,
    });

    assert.ok(Array.isArray(result));
    const [textBlock, imageBlock] = result;
    assert.match(textBlock.text, /SCREENSHOT_CAPTURED/);
    assert.equal(imageBlock.type, "imageBlock");
    assert.equal(imageBlock.format, "png");

    // File was written to disk
    const fileStat = await fs.stat(screenshotPath);
    assert.ok(fileStat.size > 0);
  });

  await t.test("generateImageTool synthesizes image asset and writes to disk", async () => {
    const assetPath = path.join(tmpDir, "generated-icon.png");

    const result = await generateImageTool.invoke({
      prompt: "A modern glowing cybernetic shield logo",
      outputPath: assetPath,
      aspectRatio: "1:1",
      style: "icon",
    });

    assert.ok(Array.isArray(result));
    const [textBlock, imageBlock] = result;
    assert.match(textBlock.text, /IMAGE_GENERATED/);
    assert.match(textBlock.text, /cybernetic shield/);
    assert.equal(imageBlock.type, "imageBlock");

    const fileStat = await fs.stat(assetPath);
    assert.ok(fileStat.size > 0);
  });

  await t.test("createStrandsAgent registers vision tools natively", async () => {
    const agent = createStrandsAgent();

    // Verify vision tools are available directly on the agent tool dictionary
    assert.equal(typeof agent.tool.read_image_attachment?.invoke, "function");
    assert.equal(typeof agent.tool.capture_screenshot?.invoke, "function");
    assert.equal(typeof agent.tool.generate_image?.invoke, "function");

    // Test direct tool invocation on agent without polluting conversation history
    const directResult = await invokeDirectTool(
      agent,
      "generate_image",
      {
        prompt: "Clean blue dashboard mockup",
        style: "ui-mockup",
      },
      { recordDirectToolCall: false }
    );

    assert.equal(directResult.status, "success");
    assert.ok(Array.isArray(directResult.content));
    assert.equal(directResult.content.length, 2);
    assert.equal(agent.messages.length, 0, "Direct tool call with recordDirectToolCall: false must not pollute history");
  });
});
