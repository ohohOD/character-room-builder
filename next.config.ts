import type { NextConfig } from "next";

const isGitHubPagesBuild = process.env.CRB_GITHUB_PAGES === "true";

const nextConfig: NextConfig = isGitHubPagesBuild
  ? {
      output: "export",
      basePath: "/character-room-builder",
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
