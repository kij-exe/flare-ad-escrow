"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export function Navbar() {
    return (
        <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between">
                    <div className="flex items-center gap-8">
                        <Link href="/" className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
                                <span className="text-sm font-bold text-white">TT</span>
                            </div>
                            <span className="text-lg font-semibold text-zinc-100">
                                TrustTube
                            </span>
                        </Link>
                        <div className="hidden sm:flex items-center gap-6">
                            <Link
                                href="/marketplace"
                                className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
                            >
                                Marketplace
                            </Link>
                            <Link
                                href="/create-order"
                                className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
                            >
                                Create Order
                            </Link>
                            <Link
                                href="/dashboard"
                                className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
                            >
                                Dashboard
                            </Link>
                            <Link
                                href="/keeper"
                                className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
                            >
                                Keeper
                            </Link>
                        </div>
                    </div>
                    <ConnectButton
                        showBalance={false}
                        chainStatus="icon"
                        accountStatus="address"
                    />
                </div>
            </div>
        </nav>
    );
}
