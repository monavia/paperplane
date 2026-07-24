module.exports = {
  apps: [{
    name: "paperplane",
    script: "dist/index.js",
    interpreter: "node",
    cwd: "./",
    kill_timeout: 30000,
    exec_mode: "fork",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "1G",
    env: {
      NODE_ENV: "production",
    },
  }]
};
