import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";
import ClickSpark from "@/components/ClickSpark";
import Threads from "@/components/Threads";

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
            <body className="min-h-screen bg-white text-[#232323]">
                <Providers>
                    <ClickSpark sparkColor="#E62058">
                        <Navbar />
                        <main className="relative mx-auto max-w-[1448px] px-[1.6rem] py-[2.4rem]">
                            <div className="pointer-events-none fixed inset-0 -z-10">
                                <Threads
                                    color="#E62058"
                                    amplitude={1}
                                    distance={0}
                                    enableMouseInteraction
                                />
                            </div>
                            {children}
                        </main>
                    </ClickSpark>
                </Providers>
            </body>
        </html>
    );
}
