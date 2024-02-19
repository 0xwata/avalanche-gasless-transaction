import * as ethSigUtil from "@metamask/eth-sig-util";
import axios from "axios";
import { ethers } from "hardhat";


const DOMAIN_NAME = process.env.DOMAIN_NAME;
const DOMAIN_VERSION = process.env.DOMAIN_VERSION;
const REQUEST_TYPE = process.env.REQUEST_TYPE || "";
const REQUEST_TYPE_SUFFIX = process.env.REQUEST_TYPE_SUFFIX || "";

const types = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  [REQUEST_TYPE]: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "gas", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "validUntilTime", type: "uint256" },
    { name: "typeSuffixData", type: "bytes32" },
  ],
};

async function main() {
    const [account] = await ethers.getSigners();

    // get network info from node
    const network = await ethers.provider.getNetwork();
    const hexChainId = ethers.utils.hexValue(network.chainId);

    // get forwarder contract
    const Forwarder = await ethers.getContractFactory("Forwarder");
    const forwarder = await Forwarder.attach(process.env.FORWARDER_ADDRESS || "");

    console.log(`using chain id ${network.chainId}(${hexChainId})`);

    console.log(`using account ${await account.getAddress()}`);

    // get current nonce in forwarder contract
    const nonce = await forwarder.getNonce(account.getAddress());
    const hexNonce = ethers.utils.hexValue(nonce);

    console.log(`using nonce ${nonce}(${hexNonce})`);

    // get gaslessERC20 contract
    const GaslessERC721 = await ethers.getContractFactory("GaslessNft");
    const recipientContractAddress = process.env.RECIPIENT_CONTRACT_ADDRESS || '';
    if (!recipientContractAddress) {
      throw new Error('RECIPIENT_CONTRACT_ADDRESS environment variable is not defined or empty');
    } 
    const gaslessERC721 = await GaslessERC721.attach(recipientContractAddress);

    // get desired transaction data
    const desiredTx = await gaslessERC721.populateTransaction.mint()
    const estimatedGas = ethers.utils.hexlify(700000);

    const domain = {
      name: DOMAIN_NAME,
      version: DOMAIN_VERSION,
      chainId: network.chainId,
      verifyingContract: process.env.FORWARDER_ADDRESS,
    };

    const message = {
      data: desiredTx.data,
      from: await account.getAddress(),
      gas: estimatedGas,
      nonce: hexNonce,
      to: desiredTx.to,
      validUntilTime: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      value: "0x0",
    };

    const dataToSign = {
      domain,
      types,
      primaryType: REQUEST_TYPE as any,
      message: {
        ...message,
        typeSuffixData: Buffer.from(REQUEST_TYPE_SUFFIX, "utf8"),
      },
    };

    const signature = ethSigUtil.signTypedData({
      privateKey: Buffer.from(process.env.PRIVATE_KEY || "", "hex"),
      data: dataToSign,
      version: ethSigUtil.SignTypedDataVersion.V4,
    });

    // // recover test locally. This may be always success.
    const recovered = ethSigUtil.recoverTypedSignature({
      data: dataToSign,
      signature,
      version: ethSigUtil.SignTypedDataVersion.V4,
    });

    if (recovered.toLowerCase() !== (await account.getAddress()).toLowerCase()) {
      throw new Error("Invalid signature");
    } else {
      console.log('account:', await account.getAddress());
      console.log('valid signature:', recovered)
    }

    const forwardRequest = {
      domain,
      types,
      primaryType: REQUEST_TYPE,
      message,
    };

    // forwardRequest.types[REQUEST_TYPE] = forwardRequest.types[REQUEST_TYPE].slice(0, -1);

    // convert to relay tx.
    const relayTx = {
      forwardRequest: forwardRequest,
      metadata: {
        signature: signature.slice(2),
      },
    };

    console.log(JSON.stringify(relayTx, null, 2));

    // encode relay tx with relay server `eth_sendRawTransaction` format.
    const hexRawTx = "0x" + Buffer.from(JSON.stringify(relayTx)).toString("hex");

    // wrap relay tx with json rpc request format.
    const fetchBody = {
      id: 1,
      jsonrpc: "2.0",
      method: "eth_sendRawTransaction",
      params: [hexRawTx],
    };

    // send relay tx to relay server
    try {
      console.log(`relayer server : ${process.env.RELAYER_URL}`);
      const result = await axios.post(process.env.RELAYER_URL as string, fetchBody, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      const txHash = result.data.result;

      console.log(`txHash : ${txHash}`);

      // wait for tx mined
      const receipt = await ethers.provider.waitForTransaction(txHash);

      console.log(`tx mined : ${JSON.stringify(receipt, null, 2)}`);
    } catch (e: any) {
      console.error("you got error:", e.response.data);
    }
  }

  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
  