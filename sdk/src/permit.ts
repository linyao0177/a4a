import { ethers } from "ethers";
import { ADDR, CHAIN_ID, ERC20_ABI } from "./constants.js";

/**
 * Signs an EIP-2612 permit for AKRE token.
 * Returns { v, r, s } ready for mintRECRequest's permitToPay param.
 */
export async function signAkреPermit(
  signer: ethers.Wallet,
  spender: string,
  value: bigint,
  deadline: number
): Promise<{ v: number; r: string; s: string }> {
  const akre = new ethers.Contract(ADDR.AKRE, ERC20_ABI, signer.provider);

  const [nonce, name] = await Promise.all([
    akre.nonces(signer.address) as Promise<bigint>,
    akre.name() as Promise<string>,
  ]);

  const domain = {
    name,
    version: "1",
    chainId: CHAIN_ID,
    verifyingContract: ADDR.AKRE,
  };

  const types = {
    Permit: [
      { name: "owner",    type: "address" },
      { name: "spender",  type: "address" },
      { name: "value",    type: "uint256" },
      { name: "nonce",    type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const message = {
    owner:    signer.address,
    spender,
    value,
    nonce,
    deadline,
  };

  const sig = await signer.signTypedData(domain, types, message);
  const { v, r, s } = ethers.Signature.from(sig);
  return { v, r, s };
}
