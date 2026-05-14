import type { NextConfig } from "next";

// In Next.js 15+ App Router, FormData/multipart is handled natively by the framework.
// No bodyParser config needed — route handlers receive Request objects directly.
const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static", "sharp"],
};

export default nextConfig;
