module.exports = {
  apps: [{
    name: "paperplane",
    script: "src/index.ts",
    interpreter: "node",
    node_args: "--import ./node_modules/tsx/dist/loader.mjs",
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
