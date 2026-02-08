"use client";

import { useState, useEffect } from "react";
import { WagmiProvider, type Config } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import { Toaster } from "react-hot-toast";
import { RoleProvider } from "@/context/RoleContext";
import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
    const [config, setConfig] = useState<Config | null>(null);

    useEffect(() => {
        import("@/config/wagmi").then((mod) => setConfig(mod.config));
    }, []);

    if (!config) {
        return null;
    }

    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider
                    theme={lightTheme({
                        accentColor: "#E62058",
                        accentColorForeground: "white",
                        borderRadius: "medium",
                        overlayBlur: "small",
                        fontStack: "system",
                    })}
                >
                    <Toaster
                        position="bottom-right"
                        toastOptions={{
                            style: {
                                background: "#ffffff",
                                color: "#232323",
                                border: "1px solid #c4c4c4",
                                borderRadius: "10px",
                                fontFamily: "Satoshi, sans-serif",
                                fontSize: "0.8rem",
                                fontWeight: 500,
                            },
                        }}
                    />
                    <RoleProvider>
                        {children}
                    </RoleProvider>
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
