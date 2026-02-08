import Link from "next/link";

const features = [
    {
        title: "Trustless Escrow",
        description:
            "Funds are locked in audited smart contracts on Flare. Neither party can rug -- payments release only when milestones are met.",
        icon: (
            <svg
                className="h-[1.4rem] w-[1.4rem]"
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
                className="h-[1.4rem] w-[1.4rem]"
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
                className="h-[1.4rem] w-[1.4rem]"
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
            <div className="relative w-full max-w-[900px] py-[4.8rem] text-center">
                <div className="mb-[1.2rem] inline-flex items-center rounded-full border border-[#c4c4c4] bg-white px-[1rem] py-[0.4rem] text-[0.7rem] font-medium text-[#777]">
                    <span className="mr-[0.5rem] inline-block h-[0.4rem] w-[0.4rem] rounded-full bg-emerald-500" />
                    Powered by Flare Network
                </div>

                <h1 className="mb-[0.6rem] text-[4rem] leading-[4rem] font-bold tracking-[0.02em] text-[#232323] sm:text-[5rem] sm:leading-[5rem]">
                    TrustTube
                </h1>
                <p className="mb-[1rem] text-[1.4rem] leading-[1.8rem] font-medium text-[#E62058]">
                    Decentralized YouTube Sponsorships
                </p>
                <p className="mx-auto mb-[2.4rem] max-w-[600px] text-[0.95rem] leading-[1.5rem] text-[#777]">
                    Connect creators with clients for trustless video sponsorship
                    deals. Milestones verified on-chain using Flare&apos;s FDC
                    protocol. No middlemen.
                </p>

                <div className="flex flex-col items-center justify-center gap-[0.8rem] sm:flex-row">
                    <Link
                        href="/marketplace"
                        className="inline-flex h-[3rem] items-center justify-center rounded-[10px] bg-[#E62058] px-[2rem] text-[0.8rem] font-bold text-white transition-all hover:bg-[#c10f45] active:scale-95 duration-200 focus:outline-none focus:ring-2 focus:ring-[#E62058] focus:ring-offset-2"
                    >
                        Browse Marketplace
                    </Link>
                    <Link
                        href="/create-order"
                        className="inline-flex h-[3rem] items-center justify-center rounded-[10px] border border-[#232323] bg-white px-[2rem] text-[0.8rem] font-bold text-[#232323] transition-all hover:bg-[#f6f6f6] active:scale-95 duration-200 focus:outline-none focus:ring-2 focus:ring-[#232323] focus:ring-offset-2"
                    >
                        Create an Order
                    </Link>
                </div>
            </div>

            {/* Features Section */}
            <div className="w-full py-[4.4rem]">
                <h2 className="mb-[0.6rem] text-center text-[0.7rem] font-bold uppercase tracking-[0.1em] text-[#E62058]">
                    How It Works
                </h2>
                <p className="mb-[2.4rem] text-center text-[2rem] leading-[2.4rem] font-bold text-[#232323]">
                    Trustless sponsorships, from start to finish
                </p>

                <div className="grid grid-cols-1 gap-[1.2rem] md:grid-cols-3">
                    {features.map((feature) => (
                        <div
                            key={feature.title}
                            className="group rounded-[10px] border border-[#c4c4c4] bg-white p-[1.6rem] transition-all duration-300 hover:border-[#a0a0a0] hover:shadow-lg hover:shadow-[#E62058]/5 hover:-translate-y-[10px]"
                        >
                            <div className="mb-[1rem] inline-flex h-[2.4rem] w-[2.4rem] items-center justify-center rounded-[6px] bg-[#fff1f3] text-[#E62058]">
                                {feature.icon}
                            </div>
                            <h3 className="mb-[0.4rem] text-[1.1rem] leading-[1.4rem] font-bold text-[#232323]">
                                {feature.title}
                            </h3>
                            <p className="text-[0.8rem] leading-[1.3rem] text-[#777]">
                                {feature.description}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            {/* How It Works Steps */}
            <div className="w-full max-w-[700px] py-[4.4rem]">
                <div className="space-y-[2rem]">
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
                        <div key={item.step} className="flex gap-[1.2rem]">
                            <div className="flex h-[2.4rem] w-[2.4rem] shrink-0 items-center justify-center rounded-full border border-[#a0a0a0] bg-[#f6f6f6] text-[0.7rem] font-bold text-[#E62058]">
                                {item.step}
                            </div>
                            <div>
                                <h3 className="mb-[0.2rem] text-[0.95rem] font-bold text-[#232323]">
                                    {item.title}
                                </h3>
                                <p className="text-[0.8rem] leading-[1.3rem] text-[#777]">
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
