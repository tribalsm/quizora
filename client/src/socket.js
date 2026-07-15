import { io } from "socket.io-client";

export function createQuizSocket(token) {
  return io({ auth: { token }, transports: ["websocket", "polling"] });
}
