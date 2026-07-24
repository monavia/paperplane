"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
const path_1 = __importDefault(require("path"));
exports.default = (0, config_1.defineConfig)({
    resolve: {
        alias: { "@": path_1.default.resolve(__dirname, "./src") },
    },
    test: {
        include: ["src/**/*.test.ts"],
        globals: true,
        environment: "node",
    },
});
//# sourceMappingURL=vitest.config.js.map