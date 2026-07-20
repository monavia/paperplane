module.exports = {
  apps: [{
    name: "paperplane",
    script: "src/index.ts",
    interpreter: "./node_modules/.bin/tsx",
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
