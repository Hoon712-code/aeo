/**
 * PM2용 런처 — tsx를 프로그래밍 방식으로 호출
 */
const { execSync } = require("child_process");
const path = require("path");

const projectDir = path.resolve(__dirname);
process.chdir(projectDir);

try {
    execSync(
        "npx tsx scripts/auto-mission/command-listener.ts",
        {
            cwd: projectDir,
            stdio: "inherit",
            env: {
                ...process.env,
                PATH: "C:\\Program Files\\nodejs;" + process.env.PATH,
            },
        }
    );
} catch (e) {
    console.error("Listener crashed:", e.message);
    process.exit(1);
}
