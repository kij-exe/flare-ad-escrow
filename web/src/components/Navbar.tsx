"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useRole } from "@/context/RoleContext";

export function Navbar() {
    const { role, setRole } = useRole();

    return (
        <nav className="border-b border-[#c4c4c4] bg-white/90 backdrop-blur-sm sticky top-0 z-50">
            <div className="mx-auto max-w-[1448px] px-[1.6rem]">
                <div className="flex h-[4rem] items-center justify-between">
                    <div className="flex items-center gap-[2.4rem]">
                        <Link href="/" className="flex items-center gap-[0.6rem]">
                            <div className="h-[2rem] w-[2rem] rounded-[6px] bg-[#E62058] flex items-center justify-center">
                                <span className="text-[0.7rem] font-bold text-white">TT</span>
                            </div>
                            <span className="text-[1.1rem] font-bold text-[#232323]">
                                TrustTube
                            </span>
                        </Link>
                        <div className="hidden sm:flex items-center gap-[1.6rem]">
                            <Link
                                href="/marketplace"
                                className="text-[0.8rem] font-medium text-[#777] hover:text-[#E62058] transition-colors duration-200"
                            >
                                Marketplace
                            </Link>
                            {role === "client" && (
                                <Link
                                    href="/create-order"
                                    className="text-[0.8rem] font-medium text-[#777] hover:text-[#E62058] transition-colors duration-200"
                                >
                                    Create Order
                                </Link>
                            )}
                            <Link
                                href="/dashboard"
                                className="text-[0.8rem] font-medium text-[#777] hover:text-[#E62058] transition-colors duration-200"
                            >
                                Dashboard
                            </Link>
                            <Link
                                href="/keeper"
                                className="text-[0.8rem] font-medium text-[#777] hover:text-[#E62058] transition-colors duration-200"
                            >
                                Keeper
                            </Link>
                        </div>
                    </div>
                    <div className="flex items-center gap-[0.8rem]">
                        <div className="flex gap-[0.2rem] rounded-[6px] bg-[#f6f6f6] p-[0.2rem] border border-[#c4c4c4]">
                            <button
                                onClick={() => setRole("client")}
                                className={`rounded-[4px] px-[0.8rem] py-[0.4rem] text-[0.7rem] font-medium transition-all duration-200 ${
                                    role === "client"
                                        ? "bg-white text-[#232323] shadow-sm"
                                        : "text-[#777] hover:text-[#232323]"
                                }`}
                            >
                                Client
                            </button>
                            <button
                                onClick={() => setRole("creator")}
                                className={`rounded-[4px] px-[0.8rem] py-[0.4rem] text-[0.7rem] font-medium transition-all duration-200 ${
                                    role === "creator"
                                        ? "bg-white text-[#232323] shadow-sm"
                                        : "text-[#777] hover:text-[#232323]"
                                }`}
                            >
                                Creator
                            </button>
                        </div>
                        <ConnectButton
                            showBalance={false}
                            chainStatus="icon"
                            accountStatus="address"
                        />
                    </div>
                </div>
            </div>
        </nav>
    );
}
