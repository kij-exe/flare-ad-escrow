"use client";

import { useState, useEffect } from "react";
import { WagmiProvider, type Config } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
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
                    theme={darkTheme({
                        accentColor: "#3b82f6",
                        accentColorForeground: "white",
                        borderRadius: "medium",
                        overlayBlur: "small",
                    })}
                >
                    <Toaster
                        position="bottom-right"
                        toastOptions={{
                            style: {
                                background: "#18181b",
                                color: "#fafafa",
                                border: "1px solid #27272a",
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
