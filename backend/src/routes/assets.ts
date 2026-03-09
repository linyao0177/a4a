import { ethers } from "ethers";
import type { FastifyInstance } from "fastify";
import { ADDR, DECIMALS } from "@arkreen/a4a-sdk";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
] as const;
import { getRunner } from "../runner-service.js";

export interface AssetsSnapshot {
  wallet: string;
  akre: string;
  matic: string;
  art: string;
  kwh: string;
  timestamp: number;
}

export async function fetchAssets(): Promise<AssetsSnapshot> {
  const runner = getRunner();
  // Access the provider via the runner's wallet — use getStatus() to get wallet address
  const status = runner.getStatus();
  const wallet = status.wallet;

  const pk = process.env.AGENT_PK!;
  const rpc = process.env.POLYGON_RPC ?? "https://polygon-rpc.com";
  const provider = new ethers.JsonRpcProvider(rpc);

  const akre = new ethers.Contract(ADDR.AKRE, ERC20_ABI, provider);
  const art  = new ethers.Contract(ADDR.ART,  ERC20_ABI, provider);
  const kwh  = new ethers.Contract(ADDR.KWH,  ERC20_ABI, provider);

  const [akreBal, maticBal, artBal, kwhBal] = await Promise.all([
    akre.balanceOf(wallet) as Promise<bigint>,
    provider.getBalance(wallet),
    art.balanceOf(wallet) as Promise<bigint>,
    kwh.balanceOf(wallet) as Promise<bigint>,
  ]);

  return {
    wallet,
    akre:  ethers.formatUnits(akreBal,  DECIMALS.AKRE),
    matic: ethers.formatEther(maticBal),
    art:   ethers.formatUnits(artBal,   DECIMALS.ART),
    kwh:   ethers.formatUnits(kwhBal,   DECIMALS.KWH),
    timestamp: Date.now(),
  };
}

export async function assetsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/assets", async (_req, reply) => {
    try {
      const snapshot = await fetchAssets();
      return reply.send(snapshot);
    } catch (err) {
      console.error("[assets] error:", err);
      const msg = err instanceof Error
        ? `${err.message} ${JSON.stringify((err as NodeJS.ErrnoException).code ?? "")}`
        : JSON.stringify(err);
      return reply.status(500).send({ error: msg });
    }
  });
}
