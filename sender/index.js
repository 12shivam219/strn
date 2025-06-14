const isBrowser =
  typeof window !== "undefined" && typeof window.document !== "undefined";

let senderImpl;
if (isBrowser) {
  senderImpl = require("./sender.browser");
} else {
  senderImpl = require("./sender.node");
}

module.exports = senderImpl;
