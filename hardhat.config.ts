import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
require("dotenv").config();

const config: HardhatUserConfig = {
  solidity: "0.8.17",
  networks: {
    hardhat: {},
    onigiri: {
      url: process.env.CHAIN_RPC_URL,
      gasPrice: 700000000000,
      accounts: [process.env.PRIVATE_KEY || ""],
    },
  },
};

export default config;