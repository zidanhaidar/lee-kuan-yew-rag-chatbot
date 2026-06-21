/** @type {import('next').NextConfig} */
const nextConfig = {
  // The corpus + generated vectors are read at runtime from the filesystem.
  // Make sure they are traced into the serverless function bundle.
  outputFileTracingIncludes: {
    "/api/chat": ["./data/**/*"],
  },
};

export default nextConfig;
