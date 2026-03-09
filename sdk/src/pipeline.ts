import { ethers } from "ethers";
import {
  ADDR, AREC_ABI, ERC20_ABI, KWH_ABI, GREEN_ABI,
  RECStatus, KWH_PER_BOX_STEP, DECIMALS,
} from "./constants.js";
import { signAkреPermit } from "./permit.js";
import { getOwnerRecData, issueOwnerRec } from "./api.js";
import type { StrategyConfig } from "./types.js";

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const ZERO_TOPIC = "0x" + "0".repeat(64);

// ── Helpers ────────────────────────────────────────────────────────────────────

async function waitTx(
  provider: ethers.Provider,
  hash: string,
  timeout = 180_000
): Promise<ethers.TransactionReceipt> {
  const receipt = await provider.waitForTransaction(hash, 1, timeout);
  if (!receipt || receipt.status === 0) throw new Error(`Tx reverted: ${hash}`);
  return receipt;
}

/** Extract minted ERC721 tokenId from receipt (topics[3] for Transfer from 0x0) */
function extractTokenId(receipt: ethers.TransactionReceipt): number {
  for (const log of receipt.logs) {
    if (
      log.topics.length >= 4 &&
      log.topics[0] === TRANSFER_TOPIC &&
      log.topics[1] === ZERO_TOPIC
    ) {
      return Number(BigInt(log.topics[3]));
    }
  }
  // Fallback: any small-integer topic that looks like a token ID
  for (const log of receipt.logs) {
    for (const topic of log.topics.slice(1)) {
      const v = BigInt(topic);
      if (v > 0n && v < 10_000_000n) return Number(v);
    }
  }
  throw new Error("Could not extract tokenId from receipt");
}

// ── Step 1: Mint AREC ──────────────────────────────────────────────────────────

export async function mintARECRequest(
  signer: ethers.Wallet
): Promise<{ tokenId: number; txHash: string }> {
  const arec = new ethers.Contract(ADDR.AREC, AREC_ABI, signer);

  // 1a. Query available generation from Arkreen API
  const recData = await getOwnerRecData(signer.address);
  const totalPowerHex = recData.totalREOutput ?? recData.totalPowerOutput;
  if (!totalPowerHex) throw new Error("No generation data available from Arkreen API");

  const amountREC = BigInt(totalPowerHex); // mWh in hex

  // 1b. Get fee rate (AKRE per unit)
  const rate: bigint = await arec.paymentTokenPrice(ADDR.AKRE);
  const valueApproval = amountREC * rate;

  // 1c. Sign AKRE permit
  const deadline = Math.floor(Date.now() / 1000) + 7200; // 2 hours
  const { v, r, s } = await signAkреPermit(signer, ADDR.AREC, valueApproval, deadline);

  // 1d. Get IPFS CID from Arkreen backend
  const { cid, uri } = await issueOwnerRec({
    owner:           signer.address,
    startDate:       recData.startDate,
    endDate:         recData.endDate,
    totalARECPower:  totalPowerHex,
    valueApproval,
    deadlineApproval: deadline,
    sigV: v, sigR: r, sigS: s,
  });

  // 1e. Encode timestamps (yyyyMMdd → unix)
  const toUnix = (d: string) =>
    Math.floor(new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`).getTime() / 1000);

  const startTime = toUnix(recData.startDate);
  const endTime   = toUnix(recData.endDate);

  // 1f. Submit on-chain
  const tx = await arec.mintRECRequest(
    {
      issuer:    ADDR.ISSUER,
      startTime,
      endTime,
      amountREC,
      cID:       cid,
      region:    "",
      url:       uri,
      memo:      "",
    },
    {
      token:    ADDR.AKRE,
      value:    valueApproval,
      deadline,
      v, r, s,
    }
  );

  const receipt = await waitTx(signer.provider!, tx.hash, 180_000);
  const tokenId = extractTokenId(receipt);
  return { tokenId, txHash: receipt.hash };
}

// ── Step 2: Poll for Certification ────────────────────────────────────────────

export async function waitForCertification(
  provider: ethers.Provider,
  tokenId: number,
  opts = { pollIntervalMs: 60_000, timeoutMs: 24 * 3600 * 1000 }
): Promise<void> {
  const arec = new ethers.Contract(ADDR.AREC, AREC_ABI, provider);
  const deadline = Date.now() + opts.timeoutMs;

  while (Date.now() < deadline) {
    const [, , statusRaw] = await arec.getRECDataCore(tokenId);
    const status: RECStatus = Number(statusRaw);

    if (status === RECStatus.Certified) return;
    if (status === RECStatus.Rejected)  throw new Error(`REC #${tokenId} was rejected by Issuer`);
    if (status === RECStatus.Cancelled) throw new Error(`REC #${tokenId} was cancelled`);

    await new Promise(r => setTimeout(r, opts.pollIntervalMs));
  }
  throw new Error(`REC #${tokenId} certification timed out after ${opts.timeoutMs / 3600000}h`);
}

// ── Step 3: Liquidize AREC → ART ──────────────────────────────────────────────

export async function liquidizeREC(
  signer: ethers.Wallet,
  tokenId: number
): Promise<{ artReceived: bigint; txHash: string }> {
  const arec = new ethers.Contract(ADDR.AREC, AREC_ABI, signer);
  const art  = new ethers.Contract(ADDR.ART,  ERC20_ABI, signer);

  const balBefore: bigint = await art.balanceOf(signer.address);
  const tx = await arec.liquidizeREC(tokenId);
  const receipt = await waitTx(signer.provider!, tx.hash, 120_000);
  const balAfter: bigint  = await art.balanceOf(signer.address);

  return { artReceived: balAfter - balBefore, txHash: receipt.hash };
}

// ── Step 4: Convert ART → kWh ─────────────────────────────────────────────────

export async function convertToKWh(
  signer: ethers.Wallet,
  artAmount?: bigint
): Promise<{ kwhReceived: bigint; txHash: string }> {
  const art = new ethers.Contract(ADDR.ART, ERC20_ABI, signer);
  const kwh = new ethers.Contract(ADDR.KWH, KWH_ABI, signer);

  if (!artAmount) {
    artAmount = await art.balanceOf(signer.address) as bigint;
  }
  if (artAmount === 0n) throw new Error("No ART balance to convert");

  // Manage nonce manually to avoid race between approve + convert
  const nonce = await signer.provider!.getTransactionCount(signer.address, "pending");

  // Approve if needed
  const allowance: bigint = await art.allowance(signer.address, ADDR.KWH);
  if (allowance < artAmount) {
    const approveTx = await art.approve(ADDR.KWH, artAmount, { nonce });
    await waitTx(signer.provider!, approveTx.hash, 60_000);
  }

  const kwhBefore: bigint = await kwh.balanceOf(signer.address);
  const convertTx = await kwh.convertKWh(ADDR.ART, artAmount, {
    nonce: allowance < artAmount ? nonce + 1 : nonce,
  });
  const receipt = await waitTx(signer.provider!, convertTx.hash, 120_000);
  const kwhAfter: bigint  = await kwh.balanceOf(signer.address);

  return { kwhReceived: kwhAfter - kwhBefore, txHash: receipt.hash };
}

// ── Step 5: Offset via GreenBTC ───────────────────────────────────────────────

export async function makeGreenBox(
  signer: ethers.Wallet,
  config: Pick<StrategyConfig, "domainIds">,
  kwhAmount?: bigint
): Promise<{ boxSteps: bigint; kwhBurned: bigint; txHash: string }> {
  const kwh   = new ethers.Contract(ADDR.KWH,   KWH_ABI,  signer);
  const green = new ethers.Contract(ADDR.GREEN,  GREEN_ABI, signer);

  if (!kwhAmount) {
    kwhAmount = await kwh.balanceOf(signer.address) as bigint;
  }
  if (kwhAmount < KWH_PER_BOX_STEP) {
    throw new Error(`Need ≥ ${KWH_PER_BOX_STEP} kWh base units (got ${kwhAmount})`);
  }

  const boxSteps = kwhAmount / KWH_PER_BOX_STEP;
  const kwhBurned = boxSteps * KWH_PER_BOX_STEP;

  // Pick first available domain ID
  const domainID = config.domainIds[0] ?? 2;

  const nonce = await signer.provider!.getTransactionCount(signer.address, "pending");

  // Approve kWh → GreenBTC
  const allowance: bigint = await kwh.allowance(signer.address, ADDR.GREEN);
  if (allowance < kwhBurned) {
    const approveTx = await kwh.approve(ADDR.GREEN, kwhBurned, { nonce });
    await waitTx(signer.provider!, approveTx.hash, 60_000);
  }

  const tx = await green.makeGreenBox(domainID, boxSteps, {
    nonce: allowance < kwhBurned ? nonce + 1 : nonce,
  });
  const receipt = await waitTx(signer.provider!, tx.hash, 300_000);

  return { boxSteps, kwhBurned, txHash: receipt.hash };
}

// ── Utility: scan certified tokens ────────────────────────────────────────────

export async function getCertifiedTokenIds(
  provider: ethers.Provider,
  walletAddress: string
): Promise<number[]> {
  const arec = new ethers.Contract(ADDR.AREC, AREC_ABI, provider);
  const balance: bigint = await arec.balanceOf(walletAddress);
  const certified: number[] = [];

  for (let i = 0n; i < balance; i++) {
    const tokenId: bigint = await arec.tokenOfOwnerByIndex(walletAddress, i);
    const [, , statusRaw] = await arec.getRECDataCore(tokenId);
    if (Number(statusRaw) === RECStatus.Certified) {
      certified.push(Number(tokenId));
    }
  }
  return certified;
}
