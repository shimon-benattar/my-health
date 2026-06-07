/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['mongoose'],
  },
  env: {
    NEXT_PUBLIC_BUILD_ID:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.npm_package_version ?? 'dev',
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString(),
    NEXT_PUBLIC_BLOB_ACCESS_MODE:
      process.env.NEXT_PUBLIC_BLOB_ACCESS_MODE ?? process.env.BLOB_ACCESS_MODE ?? 'private',
  },
};

export default nextConfig;
