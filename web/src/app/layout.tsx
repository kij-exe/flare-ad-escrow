import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
    title: "TrustTube - Decentralized YouTube Sponsorships",
    description:
        "Trustless milestone-based payments for YouTube creator sponsorships, powered by Flare",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className="min-h-screen bg-zinc-950 text-zinc-100">
                <Providers>
                    <Navbar />
                    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                        {children}
                    </main>
                </Providers>
            </body>
        </html>
    );
}
