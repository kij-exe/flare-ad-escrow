import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();
    const mockUSDCAddress = await mockUSDC.getAddress();
    console.log("MockUSDC deployed to:", mockUSDCAddress);

    // Deploy TrustTube
    const TrustTube = await ethers.getContractFactory("TrustTube");
    const trustTube = await TrustTube.deploy();
    await trustTube.waitForDeployment();
    const trustTubeAddress = await trustTube.getAddress();
    console.log("TrustTube deployed to:", trustTubeAddress);

    // Save deployment addresses
    const deployments = {
        network: "coston2",
        chainId: 114,
        contracts: {
            MockUSDC: mockUSDCAddress,
            TrustTube: trustTubeAddress,
        },
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
    };

    const deploymentsDir = path.join(__dirname, "..", "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    fs.writeFileSync(path.join(deploymentsDir, "coston2.json"), JSON.stringify(deployments, null, 2));
    console.log("\nDeployment addresses saved to deployments/coston2.json");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
