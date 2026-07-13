module.exports = {
  apps: [{
    name: "paperplane",
    script: "dist/index.js",
    cwd: "./",
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
