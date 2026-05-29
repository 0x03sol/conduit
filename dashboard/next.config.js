/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    typescript: { ignoreBuildErrors: false },
    eslint: { ignoreDuringBuilds: false },
    /**
     * Proxy the Ponder indexer through the Next.js server so the browser
     * never has to reach the indexer directly. The browser hits
     * `/_indexer/...` (same origin as the dashboard, so any SSH port-
     * forward / domain just works), and Next.js (running on the same
     * host as Ponder) forwards the request to localhost:42069.
     *
     * NEXT_PUBLIC_INDEXER_HOST overrides the upstream when Ponder lives
     * on a different host than Next; defaults to localhost:42069 which
     * matches Ponder's default dev port.
     */
    async rewrites() {
        const upstream = process.env.INDEXER_UPSTREAM ?? "http://localhost:42069";
        return [
            {
                source: "/_indexer/:path*",
                destination: `${upstream}/:path*`,
            },
        ];
    },
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
