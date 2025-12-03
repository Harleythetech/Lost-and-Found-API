module.exports = {
  apps: [
    {
      name: "lost-and-found-api",
      script: "./index.js",
      cwd: "/home/harleyyyu/LAF",
      instances: 1,
      exec_mode: "fork",

      // Restart configuration
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",

      // Restart behavior
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: "10s",

      // Error handling
      exp_backoff_restart_delay: 100,

      // Logging
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_file: "./logs/pm2-combined.log",
      time: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      // Advanced features
      listen_timeout: 10000,
      kill_timeout: 5000,
      wait_ready: false,

      // Crash restart settings
      ignore_watch: ["node_modules", "logs", "uploads"],

      // Cron restart (optional - restart every day at 3 AM)
      // cron_restart: "0 3 * * *",
    },
  ],
};
