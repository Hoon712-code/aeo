@echo off
chcp 65001 >nul
echo ╔═══════════════════════════════════════════════════════════╗
echo ║   🥩 BATCH MISSION RUNNER - Round 1 + Round 2           ║
echo ║   Started: %date% %time%                                ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.

echo [%date% %time%] === ROUND 1 START (91 users, max-users=100) ===
call npx tsx scripts/auto-mission/index.ts --max-users=100 --round=1
echo.
echo [%date% %time%] === ROUND 1 COMPLETE ===
echo.

echo [%date% %time%] === ROUND 2 START (91 users, max-users=100) ===
call npx tsx scripts/auto-mission/index.ts --max-users=100 --round=2
echo.
echo [%date% %time%] === ROUND 2 COMPLETE ===
echo.

echo [%date% %time%] === ALL ROUNDS DONE ===
echo Mission execution finished at %date% %time%
