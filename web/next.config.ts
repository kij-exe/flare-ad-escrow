import type { NextConfig } from "next";
import { resolve } from "path";

const nextConfig: NextConfig = {
    reactCompiler: true,
    turbopack: {
        root: process.cwd(),
    },
};

export default nextConfig;
