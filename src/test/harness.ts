import request from "supertest";
import { createApp } from "../bot/api/apiServer.js";

export async function createTestServer() {
  const app = await createApp();
  return { app, request: request(app) };
}
