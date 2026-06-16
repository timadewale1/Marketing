import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig({});

config.cloudflare = {
  // Prevent workerd-specific export resolution that breaks jose/jwks-rsa packaging.
  useWorkerdCondition: false,
};

export default config;
