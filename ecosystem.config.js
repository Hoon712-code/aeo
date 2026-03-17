module.exports = {
  apps: [
    {
      name: "mission-listener",
      script: "pm2-launcher.js",
      cwd: "c:\\Users\\User\\Desktop\\Dev\\Antidetector\\Antidetector",
      interpreter: "node",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 10000,
      env: {
        NODE_ENV: "production",
        PATH: "C:\\Program Files\\nodejs;" + process.env.PATH,
      },
    },
  ],
};
