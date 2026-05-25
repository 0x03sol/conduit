/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    typescript: { ignoreBuildErrors: false },
    eslint: { ignoreDuringBuilds: false },
    webpack: (config) => {
        // wagmi → @metamask/sdk has an optional @react-native-async-storage/async-storage
        // dependency that doesn't exist in browser builds. Mark it as a missing module
        // so webpack doesn't emit a "Module not found" warning.
        config.externals = config.externals || [];
        config.externals.push("@react-native-async-storage/async-storage");
        // pino-pretty is an optional dependency of pino used at the relayer; the dashboard
        // doesn't ship pino but transitive deps may pull it. Ignore.
        config.externals.push("pino-pretty");
        return config;
    },
};

module.exports = nextConfig;
