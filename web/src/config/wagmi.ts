import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { coston2 } from "./chain";

export const config = getDefaultConfig({
    appName: "TrustTube",
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_ID || "demo",
    chains: [coston2],
    ssr: true,
});
