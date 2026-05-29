/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    typescript: { ignoreBuildErrors: false },
    eslint: { ignoreDuringBuilds: false },

    /**
     * Static HTML export (Cloudflare Pages target). Every page in this app
     * is a client-side React surface (Win7 desktop, wagmi + Privy auth,
     * canvas games, terminal). No server actions, no route handlers,
     * nothing that needs a Node runtime at request time.
     *
     * Trade-off vs Node-rendered Next: no `rewrites()` or `redirects()`,
     * which is why the dev-time `/_indexer/*` proxy was removed. The
     * dashboard now reads the indexer directly when `NEXT_PUBLIC_PONDER_URL`
     * is reachable, and falls back to "indexer offline" inside the
     * Settlement Monitor when it isn't.
     */
    output: "export",
    /** next/image isn't used in this app, but the static exporter still
     *  expects this flag. Cheap to set defensively. */
    images: { unoptimized: true },
    /** Cloudflare Pages serves /foo as /foo/index.html; trailingSlash makes
     *  Next emit that layout consistently. */
    trailingSlash: true,

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
