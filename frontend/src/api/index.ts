import { config } from "./config";
import type { ProclenzApi } from "./contract";
import { httpApi } from "./http";

export type { ProclenzApi } from "./contract";

export const api: ProclenzApi = httpApi;

export { config };
