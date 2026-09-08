import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The engine and core packages are TypeScript source, not built artefacts —
   * ADR-0006 keeps them buildless so they run under Node's strip-only
   * execution. Next therefore has to compile them itself.
   */
  transpilePackages: ["@greenlit/engine", "@greenlit/core"],
};

export default nextConfig;
