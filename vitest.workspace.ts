import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/*",
  "modules/*",
  "apps/*"
]);
