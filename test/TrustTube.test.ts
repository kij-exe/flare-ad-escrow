import { ethers } from "hardhat";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MockUSDCArtifact = require("../artifacts/contracts/trusttube/MockUSDC.sol/MockUSDC.json");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TrustTubeArtifact = require("../artifacts/contracts/trusttube/TrustTube.sol/TrustTube.json");

async function deployMockUSDC() {
    const factory = new ethers.ContractFactory(
        MockUSDCArtifact.abi,
        MockUSDCArtifact.bytecode,
        (await ethers.getSigners())[0]
    );
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    return contract;
}

async function deployTrustTube() {
    const factory = new ethers.ContractFactory(
        TrustTubeArtifact.abi,
        TrustTubeArtifact.bytecode,
        (await ethers.getSigners())[0]
    );
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    return contract;
}

describe("TrustTube", function () {
    let usdc: any;
    let trustTube: any;
    let owner: any, client: any, creator: any, anyone: any;

    beforeEach(async function () {
        [owner, client, creator, anyone] = await ethers.getSigners();

        usdc = await deployMockUSDC();
        trustTube = await deployTrustTube();

        // Mint USDC to client (100,000 USDC with 6 decimals)
        await usdc.mint(client.address, ethers.parseUnits("100000", 6));

        // Approve TrustTube to spend client's USDC
        await usdc.connect(client).approve(await trustTube.getAddress(), ethers.MaxUint256);
    });

    describe("MockUSDC", function () {
        it("should have 6 decimals", async function () {
            expect(await usdc.decimals()).to.equal(6n);
        });

        it("should allow minting", async function () {
            await usdc.mint(anyone.address, 1000);
            expect(await usdc.balanceOf(anyone.address)).to.equal(1000n);
        });
    });

    describe("Order Creation", function () {
        it("should create a milestone order", async function () {
            const viewTargets = [1000, 5000, 10000];
            const payouts = [ethers.parseUnits("100", 6), ethers.parseUnits("200", 6), ethers.parseUnits("300", 6)];
            const deadlines = [30 * 86400, 60 * 86400, 90 * 86400];

            const tx = await trustTube
                .connect(client)
                .createMilestoneOrder(await usdc.getAddress(), 7, viewTargets, payouts, deadlines);
            const receipt = await tx.wait();

            const deal = await trustTube.getDeal(0);
            expect(deal.client).to.equal(client.address);
            expect(deal.status).to.equal(0n); // Open
            expect(deal.paymentMode).to.equal(0n); // Milestone

            const ms = await trustTube.getMilestones(0);
            expect(ms.length).to.equal(3);
            expect(ms[0].viewTarget).to.equal(1000n);
            expect(ms[1].payoutAmount).to.equal(ethers.parseUnits("200", 6));
        });

        it("should create a linear order", async function () {
            const ratePerView = ethers.parseUnits("0.01", 6);
            const totalCap = ethers.parseUnits("1000", 6);

            await trustTube.connect(client).createLinearOrder(await usdc.getAddress(), 7, ratePerView, totalCap);

            const lc = await trustTube.getLinearConfig(0);
            expect(lc.ratePerView).to.equal(ratePerView);
            expect(lc.totalCap).to.equal(totalCap);
        });

        it("should reject milestone order with mismatched arrays", async function () {
            await expect(
                trustTube
                    .connect(client)
                    .createMilestoneOrder(
                        await usdc.getAddress(),
                        7,
                        [1000, 5000],
                        [ethers.parseUnits("100", 6)],
                        [86400]
                    )
            ).to.be.revertedWith("Array length mismatch");
        });
    });

    describe("Deal Lifecycle", function () {
        beforeEach(async function () {
            await trustTube
                .connect(client)
                .createMilestoneOrder(
                    await usdc.getAddress(),
                    7,
                    [1000, 5000],
                    [ethers.parseUnits("100", 6), ethers.parseUnits("200", 6)],
                    [30 * 86400, 60 * 86400]
                );
        });

        it("should accept a creator", async function () {
            await trustTube.connect(client).acceptCreator(0, creator.address);

            const deal = await trustTube.getDeal(0);
            expect(deal.creator).to.equal(creator.address);
            expect(deal.status).to.equal(1n); // InProgress
        });

        it("should reject non-client accepting creator", async function () {
            await expect(trustTube.connect(anyone).acceptCreator(0, creator.address)).to.be.revertedWithCustomError(
                trustTube,
                "OnlyClient"
            );
        });

        it("should allow creator to submit video", async function () {
            await trustTube.connect(client).acceptCreator(0, creator.address);

            const videoId = "dQw4w9WgXcQ";
            const etagHash = ethers.keccak256(ethers.toUtf8Bytes("some-etag-value"));

            await trustTube.connect(creator).submitVideo(0, videoId, etagHash);

            const deal = await trustTube.getDeal(0);
            expect(deal.status).to.equal(2n); // InReview
            expect(deal.youtubeVideoId).to.equal(videoId);
            expect(deal.etagHash).to.equal(etagHash);
        });

        it("should reject video submission after deadline", async function () {
            await trustTube.connect(client).acceptCreator(0, creator.address);
            await time.increase(8 * 86400);

            const etagHash = ethers.keccak256(ethers.toUtf8Bytes("etag"));
            await expect(trustTube.connect(creator).submitVideo(0, "videoId", etagHash)).to.be.revertedWithCustomError(
                trustTube,
                "VideoDeadlineExpired"
            );
        });

        it("should approve video and deposit funds", async function () {
            await trustTube.connect(client).acceptCreator(0, creator.address);
            const etagHash = ethers.keccak256(ethers.toUtf8Bytes("etag"));
            await trustTube.connect(creator).submitVideo(0, "videoId", etagHash);

            const totalExpected = ethers.parseUnits("300", 6);

            await trustTube.connect(client).approveVideo(0);

            const deal = await trustTube.getDeal(0);
            expect(deal.status).to.equal(3n); // Active
            expect(deal.totalDeposited).to.equal(totalExpected);

            expect(await usdc.balanceOf(await trustTube.getAddress())).to.equal(totalExpected);
        });
    });

    describe("Expired Milestones", function () {
        beforeEach(async function () {
            await trustTube
                .connect(client)
                .createMilestoneOrder(
                    await usdc.getAddress(),
                    7,
                    [1000, 5000],
                    [ethers.parseUnits("100", 6), ethers.parseUnits("200", 6)],
                    [30 * 86400, 60 * 86400]
                );
            await trustTube.connect(client).acceptCreator(0, creator.address);
            const etagHash = ethers.keccak256(ethers.toUtf8Bytes("etag"));
            await trustTube.connect(creator).submitVideo(0, "videoId", etagHash);
            await trustTube.connect(client).approveVideo(0);
        });

        it("should allow client to claim expired milestone", async function () {
            await time.increase(31 * 86400);

            const balBefore = await usdc.balanceOf(client.address);
            await trustTube.connect(client).claimExpired(0, 0);
            const balAfter = await usdc.balanceOf(client.address);

            expect(balAfter - balBefore).to.equal(ethers.parseUnits("100", 6));
        });

        it("should reject claiming non-expired milestone", async function () {
            await expect(trustTube.connect(client).claimExpired(0, 0)).to.be.revertedWithCustomError(
                trustTube,
                "DeadlineNotExpired"
            );
        });

        it("should complete deal when all milestones resolved", async function () {
            await time.increase(61 * 86400);

            await trustTube.connect(client).claimExpired(0, 0);
            await trustTube.connect(client).claimExpired(0, 1);

            const deal = await trustTube.getDeal(0);
            expect(deal.status).to.equal(4n); // Completed
        });
    });
});
