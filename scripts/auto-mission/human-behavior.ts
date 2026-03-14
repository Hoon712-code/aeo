import { Page } from "playwright";
import { TIMING } from "./config";

/**
 * Random integer between min and max (inclusive)
 */
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Random float between min and max
 */
export function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Sleep for a random duration between min and max ms
 */
export function randomDelay(min: number, max: number): Promise<void> {
  const ms = randInt(min, max);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Small micro-pause to simulate human thinking
 */
export function microPause(): Promise<void> {
  return randomDelay(TIMING.microPauseMin, TIMING.microPauseMax);
}

/**
 * Generate a Bezier-like jittery path between two points.
 * Humans don't move the mouse in a straight line — they curve and jitter.
 */
function generateJitteryPath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  steps: number
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];

  // Random control points for Bezier-like curve
  const cp1x = fromX + (toX - fromX) * randFloat(0.2, 0.5) + randFloat(-50, 50);
  const cp1y = fromY + (toY - fromY) * randFloat(0.1, 0.4) + randFloat(-50, 50);
  const cp2x = fromX + (toX - fromX) * randFloat(0.5, 0.8) + randFloat(-30, 30);
  const cp2y = fromY + (toY - fromY) * randFloat(0.6, 0.9) + randFloat(-30, 30);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;

    // Cubic Bezier
    let x = u * u * u * fromX + 3 * u * u * t * cp1x + 3 * u * t * t * cp2x + t * t * t * toX;
    let y = u * u * u * fromY + 3 * u * u * t * cp1y + 3 * u * t * t * cp2y + t * t * t * toY;

    // Add small jitter (1-3 pixels of noise)
    x += randFloat(-2, 2);
    y += randFloat(-2, 2);

    points.push({ x: Math.round(x), y: Math.round(y) });
  }

  return points;
}

/**
 * Move mouse along a realistic, jittery curved path.
 * Unlike Playwright's built-in linear interpolation, this creates
 * human-like Bezier curves with micro-jitter.
 */
export async function realisticMouseMove(
  page: Page,
  toX: number,
  toY: number
): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) return;

  // Get approximate current position (center of viewport as fallback)
  const fromX = randInt(viewport.width * 0.3, viewport.width * 0.7);
  const fromY = randInt(viewport.height * 0.3, viewport.height * 0.7);

  const steps = randInt(15, 40);
  const points = generateJitteryPath(fromX, fromY, toX, toY, steps);

  for (const pt of points) {
    await page.mouse.move(pt.x, pt.y);
    // Variable speed: faster in the middle, slower at start/end
    const idx = points.indexOf(pt);
    const progress = idx / points.length;
    const baseDelay = progress < 0.2 || progress > 0.8 ? 15 : 5;
    await new Promise((r) => setTimeout(r, baseDelay + randInt(0, 8)));
  }
}

/**
 * Random idle mouse movements — simulates a person casually moving
 * the mouse while reading/waiting. Includes small jittery drifts
 * and occasional pauses.
 */
export async function idleMouseMovement(
  page: Page,
  durationMs: number
): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) return;

  const startTime = Date.now();

  while (Date.now() - startTime < durationMs) {
    // Pick a random action
    const action = Math.random();

    if (action < 0.4) {
      // Small drift (like hand twitching on mouse)
      const drift = randInt(5, 30);
      const currentX = randInt(200, viewport.width - 200);
      const currentY = randInt(200, viewport.height - 200);
      await page.mouse.move(
        currentX + randInt(-drift, drift),
        currentY + randInt(-drift, drift)
      );
      await randomDelay(100, 400);
    } else if (action < 0.7) {
      // Medium movement (reading different part of page)
      const targetX = randInt(100, viewport.width - 100);
      const targetY = randInt(100, viewport.height - 100);
      await realisticMouseMove(page, targetX, targetY);
      await randomDelay(500, 2000);
    } else if (action < 0.85) {
      // Pause (hand off mouse momentarily)
      await randomDelay(1000, 4000);
    } else {
      // Quick small jitter burst (fidgeting)
      for (let i = 0; i < randInt(2, 5); i++) {
        const jx = randInt(300, viewport.width - 300);
        const jy = randInt(300, viewport.height - 300);
        await page.mouse.move(jx + randInt(-5, 5), jy + randInt(-5, 5));
        await randomDelay(50, 150);
      }
      await randomDelay(300, 800);
    }
  }
}

/**
 * Move mouse to random positions on the page (simulates idle mouse movement)
 */
export async function randomMouseMovement(page: Page, count = 3): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) return;

  for (let i = 0; i < count; i++) {
    const x = randInt(100, viewport.width - 100);
    const y = randInt(100, viewport.height - 100);
    await realisticMouseMove(page, x, y);
    await randomDelay(200, 800);
  }
}

/**
 * Type text character by character with human-like delays.
 * Includes occasional typo-pauses (longer pauses as if thinking).
 */
export async function humanType(
  page: Page,
  selector: string,
  text: string
): Promise<void> {
  await page.click(selector);
  await randomDelay(300, 800);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // Occasionally add a longer pause (simulating thinking)
    if (Math.random() < 0.05) {
      await randomDelay(500, 1500);
    }

    await page.keyboard.type(char, {
      delay: randInt(TIMING.typeMin, TIMING.typeMax),
    });
  }
}

/**
 * Click an element with human-like behavior:
 * 1. Move mouse towards the element with Bezier path
 * 2. Brief pause
 * 3. Click
 */
export async function humanClick(page: Page, selector: string): Promise<void> {
  const element = await page.waitForSelector(selector, { timeout: 10000 });
  if (!element) throw new Error(`Element not found: ${selector}`);

  const box = await element.boundingBox();
  if (!box) throw new Error(`Cannot get bounding box: ${selector}`);

  const targetX = box.x + box.width * randFloat(0.3, 0.7);
  const targetY = box.y + box.height * randFloat(0.3, 0.7);

  await realisticMouseMove(page, targetX, targetY);
  await randomDelay(100, 400);
  await page.mouse.click(targetX, targetY);
}

/**
 * Scroll page naturally (small increments with pauses, like reading)
 */
export async function humanScroll(
  page: Page,
  direction: "down" | "up" = "down",
  scrollAmount = 300
): Promise<void> {
  const steps = randInt(3, 7);
  const perStep = scrollAmount / steps;

  for (let i = 0; i < steps; i++) {
    const delta = direction === "down" ? perStep + randFloat(-20, 20) : -(perStep + randFloat(-20, 20));
    await page.mouse.wheel(0, delta);
    await randomDelay(150, 500);
  }
}

/**
 * Scroll to the bottom of the page content gradually,
 * simulating a person reading from top to bottom.
 */
export async function scrollToReadFully(page: Page): Promise<void> {
  // Get total page height and current scroll position
  const scrollInfo = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    scrollTop: document.documentElement.scrollTop,
  }));

  const remaining = scrollInfo.scrollHeight - scrollInfo.scrollTop - scrollInfo.clientHeight;
  if (remaining <= 10) return; // Already at bottom

  // Scroll down in human-like chunks
  let scrolled = 0;
  while (scrolled < remaining) {
    // Variable scroll speed: sometimes fast skim, sometimes slow read
    const chunkSize = randInt(80, 250);
    const delta = Math.min(chunkSize, remaining - scrolled);

    await page.mouse.wheel(0, delta);
    scrolled += delta;

    // Reading pause: longer pauses every few scrolls
    if (Math.random() < 0.3) {
      // Longer reading pause
      await randomDelay(1000, 3000);
      // Idle mouse during reading
      await idleMouseMovement(page, randInt(500, 1500));
    } else {
      await randomDelay(200, 600);
    }
  }

  // Final settle at bottom
  await randomDelay(1000, 2500);
}

/**
 * Simulate reading a page (random scroll + pauses + mouse movement)
 */
export async function simulateReading(page: Page): Promise<void> {
  await randomDelay(1000, 3000);
  await humanScroll(page, "down", randInt(100, 400));
  await idleMouseMovement(page, randInt(1000, 3000));
  await randomDelay(500, 2000);
}

/**
 * Log with timestamp
 */
export function log(message: string, ...args: unknown[]): void {
  const ts = new Date().toLocaleTimeString("ko-KR", { hour12: false });
  console.log(`[${ts}] ${message}`, ...args);
}
