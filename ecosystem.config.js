module.exports = {
  apps: [
    {
      name: "mission-listener",
      script: "scripts/auto-mission/dist/command-listener.js",
      cwd: "c:\\Users\\User\\Desktop\\Dev\\Antidetector\\Antidetector",
      interpreter: "node",
      watch: false,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 15000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
