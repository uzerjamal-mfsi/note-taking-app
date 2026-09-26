import { ticketReferencePlugin } from "./packages/config/src/commitlint-ticket-rule.js";

export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [ticketReferencePlugin],
  rules: {
    "ticket-reference": [2, "always"],
  },
};
