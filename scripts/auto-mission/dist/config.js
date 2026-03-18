"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHATGPT_URL = exports.TIMEZONES = exports.LOCALES = exports.USER_AGENTS = exports.VIEWPORTS = exports.TIMING = exports.PROXY_ENABLED = exports.SUPABASE_ANON_KEY = exports.SUPABASE_URL = void 0;
exports.getProxyForUser = getProxyForUser;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Load .env.local from project root (works from both source and dist)
const envPath1 = path_1.default.resolve(__dirname, "../../.env.local"); // from scripts/auto-mission/
const envPath2 = path_1.default.resolve(__dirname, "../../../.env.local"); // from scripts/auto-mission/dist/
const envPath = fs_1.default.existsSync(envPath1) ? envPath1 : envPath2;
dotenv_1.default.config({ path: envPath });
// ─── Supabase ───────────────────────────────────────
exports.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
exports.SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PROXY_HOST = process.env.PROXY_HOST || "";
const PROXY_PORT = parseInt(process.env.PROXY_PORT || "0", 10);
const PROXY_USERNAME = process.env.PROXY_USERNAME || "";
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || "";
const PROXY_COUNTRY = process.env.PROXY_COUNTRY || "";
const PROXY_MAX_SLOTS = parseInt(process.env.PROXY_MAX_SLOTS || "100", 10);
exports.PROXY_ENABLED = !!(PROXY_HOST && PROXY_PORT && PROXY_USERNAME);
/**
 * Get a proxy for a specific user index.
 * Webshare Residential format: username-COUNTRY-N (e.g., yxbwhbfu-KR-1)
 * Each user gets a unique Korean IP address.
 */
function getProxyForUser(userIndex) {
    if (!exports.PROXY_ENABLED)
        return null;
    // Slot number 1-based, wraps around if more users than slots
    const slot = (userIndex % PROXY_MAX_SLOTS) + 1;
    // Build username with country and slot suffix
    const username = PROXY_COUNTRY
        ? `${PROXY_USERNAME}-${PROXY_COUNTRY}-${slot}`
        : PROXY_USERNAME;
    return {
        host: PROXY_HOST,
        port: PROXY_PORT,
        username,
        password: PROXY_PASSWORD,
    };
}
// ─── Human Behavior Timing (ms) ─────────────────────
exports.TIMING = {
    /** Per-character typing delay range */
    typeMin: 45,
    typeMax: 160,
    /** Pause after typing before pressing Enter */
    preEnterDelay: [800, 2500],
    /** Wait for ChatGPT response streaming to complete */
    responseTimeout: 120000, // 2 minutes max
    /** Random delay between users */
    interUserDelayMin: 3000, // 3 seconds
    interUserDelayMax: 7000, // 7 seconds
    /** Small pauses during interaction */
    microPauseMin: 500,
    microPauseMax: 2000,
    /** Page load settle time */
    pageLoadSettle: [3000, 6000],
};
// ─── Viewport Pools ─────────────────────────────────
exports.VIEWPORTS = [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
    { width: 1600, height: 900 },
    { width: 1360, height: 768 },
    { width: 1680, height: 1050 },
];
// ─── User Agent Pool ────────────────────────────────
exports.USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
];
// ─── Language Pool ──────────────────────────────────
exports.LOCALES = ["ko-KR", "ko", "en-US", "en-GB"];
exports.TIMEZONES = [
    "Asia/Seoul",
    "Asia/Tokyo",
    "America/Los_Angeles",
    "America/New_York",
    "Europe/London",
];
// ─── ChatGPT ────────────────────────────────────────
exports.CHATGPT_URL = "https://chatgpt.com/";
