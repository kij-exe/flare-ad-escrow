import Link from "next/link";

const features = [
    {
        title: "Trustless Escrow",
        description:
            "Funds are locked in audited smart contracts on Flare. Neither party can rug -- payments release only when milestones are met.",
        icon: (
            <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                />
            </svg>
        ),
    },
    {
        title: "View Count Verification",
        description:
            "YouTube view counts are verified on-chain using Flare's Data Connector (FDC). No trust assumptions -- pure cryptographic proof.",
        icon: (
            <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z"
                />
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
            </svg>
        ),
    },
    {
        title: "Tamper Protection",
        description:
            "Video changes are detected automatically via etag monitoring. If a creator swaps the sponsored content, funds return to the client.",
        icon: (
            <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                />
            </svg>
        ),
    },
];

export default function Home() {
    return (
        <div className="flex flex-col items-center">
            {/* Hero Section */}
            <div className="relative w-full max-w-4xl py-20 text-center">
                {/* Gradient glow effect */}
                <div className="absolute inset-0 -z-10 mx-auto h-64 w-64 rounded-full bg-blue-600/20 blur-[120px]" />

                <div className="mb-4 inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900 px-4 py-1.5 text-sm text-zinc-400">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-500" />
                    Powered by Flare Network
                </div>

                <h1 className="mb-2 text-5xl font-bold tracking-tight text-zinc-50 sm:text-6xl">
                    TrustTube
                </h1>
                <p className="mb-4 text-xl font-medium text-blue-400 sm:text-2xl">
                    Decentralized YouTube Sponsorships
                </p>
                <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-zinc-400">
                    Connect creators with clients for trustless video sponsorship
                    deals. Milestones verified on-chain using Flare&apos;s FDC
                    protocol. No middlemen.
                </p>

                <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                    <Link
                        href="/marketplace"
                        className="inline-flex h-12 items-center justify-center rounded-lg bg-blue-600 px-8 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:ring-offset-zinc-950"
                    >
                        Browse Marketplace
                    </Link>
                    <Link
                        href="/create-order"
                        className="inline-flex h-12 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-8 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:ring-offset-2 focus:ring-offset-zinc-950"
                    >
                        Create an Order
                    </Link>
                </div>
            </div>

            {/* Features Section */}
            <div className="w-full max-w-5xl py-16">
                <h2 className="mb-2 text-center text-sm font-semibold uppercase tracking-wider text-blue-400">
                    How It Works
                </h2>
                <p className="mb-12 text-center text-2xl font-bold text-zinc-100">
                    Trustless sponsorships, from start to finish
                </p>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    {features.map((feature) => (
                        <div
                            key={feature.title}
                            className="group rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 transition-all hover:border-zinc-700 hover:bg-zinc-900"
                        >
                            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/10 text-blue-400">
                                {feature.icon}
                            </div>
                            <h3 className="mb-2 text-lg font-semibold text-zinc-100">
                                {feature.title}
                            </h3>
                            <p className="text-sm leading-relaxed text-zinc-400">
                                {feature.description}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            {/* How It Works Steps */}
            <div className="w-full max-w-3xl py-16">
                <div className="space-y-8">
                    {[
                        {
                            step: "01",
                            title: "Client creates a sponsorship order",
                            desc: "Define milestones with view targets and payout amounts, or set a linear pay-per-view rate.",
                        },
                        {
                            step: "02",
                            title: "Creator accepts and produces the video",
                            desc: "A creator picks up the order from the marketplace and produces the sponsored content.",
                        },
                        {
                            step: "03",
                            title: "Client reviews and funds the escrow",
                            desc: "After reviewing the video, the client approves it and USDC is locked in the smart contract.",
                        },
                        {
                            step: "04",
                            title: "Views verified, payments released",
                            desc: "Flare's FDC verifies YouTube view counts on-chain. Milestones unlock automatically as targets are hit.",
                        },
                    ].map((item) => (
                        <div key={item.step} className="flex gap-6">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-sm font-bold text-blue-400">
                                {item.step}
                            </div>
                            <div>
                                <h3 className="mb-1 font-semibold text-zinc-100">
                                    {item.title}
                                </h3>
                                <p className="text-sm text-zinc-400">
                                    {item.desc}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
