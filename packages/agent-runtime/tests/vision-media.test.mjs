import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  detectImageFormat,
  readImageAttachmentTool,
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

  await t.test("removed tools are no longer exported", async () => {
    const mod = await import("../src/index.ts");

    // Screenshot capture and image generation fabricated results: each wrote a
    // 1x1 transparent PNG while reporting success. They must not be exported.
    assert.equal(mod.captureScreenshotTool, undefined, "capture_screenshot must not be exported");
    assert.equal(mod.generateImageTool, undefined, "generate_image must not be exported");
    assert.ok(mod.readImageAttachmentTool, "read_image_attachment (honest tool) must remain");
  });

  await t.test("removed tools are rejected by the real tool registry", async () => {
    const agent = createStrandsAgent();

    // NOTE: `agent.tool` is a Proxy that synthesises a handle for ANY property
    // name, so `agent.tool.capture_screenshot` is truthy regardless of what is
    // registered. The authoritative check is the SDK ToolRegistry refusing to
    // resolve the name.
    for (const name of ["generate_image", "capture_screenshot"]) {
      await assert.rejects(
        () => invokeDirectTool(agent, name, { prompt: "x", url: "http://localhost" }),
        (err) => {
          assert.match(
            String(err?.message ?? err),
            /not found|not registered/i,
            `${name} must not resolve in the registry`
          );
          return true;
        }
      );
    }

    // The honest tool still resolves and returns real bytes.
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const ok = await invokeDirectTool(agent, "read_image_attachment", { base64: png });
    assert.ok(Array.isArray(ok.content), "read_image_attachment must still produce real content");
  });
});
