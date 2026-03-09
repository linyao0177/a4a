import axios from "axios";
import { OPENAPI_URL, ADDR } from "./constants.js";
import type { RecOwnerData, RecIssueResult } from "./types.js";

async function call<T>(method: string, params: unknown[]): Promise<T> {
  const { data } = await axios.post(OPENAPI_URL, {
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  }, { timeout: 30_000, headers: { "Content-Type": "application/json" } });
  if (data.error) throw new Error(`Arkreen API error: ${JSON.stringify(data.error)}`);
  return data.result as T;
}

/** Get available generation data for the agent wallet. */
export async function getOwnerRecData(owner: string): Promise<RecOwnerData> {
  // API requires lowercase address
  return call<RecOwnerData>("rec_getOwnerRecDataNew", [{ owner: owner.toLowerCase() }]);
}

/**
 * Request an IPFS CID for the AREC from Arkreen backend.
 * Must be called before mintRECRequest.
 */
export async function issueOwnerRec(params: {
  owner: string;
  startDate: string;
  endDate: string;
  totalARECPower: string;  // hex mWh
  valueApproval: bigint;
  deadlineApproval: number;
  sigV: number;
  sigR: string;
  sigS: string;
}): Promise<RecIssueResult> {
  const signatureApproval =
    "0x" +
    params.sigV.toString(16).padStart(2, "0") +
    params.sigR.replace("0x", "") +
    params.sigS.replace("0x", "");

  return call<RecIssueResult>("rec_issueOwnerRecNew", [
    {
      owner:              params.owner.toLowerCase(),
      issuer:             ADDR.ISSUER,
      startDate:          params.startDate,
      endDate:            params.endDate,
      totalARECPower:     params.totalARECPower,
      valueApproval:      "0x" + params.valueApproval.toString(16),
      deadlineApproval:   params.deadlineApproval,
      signatureApproval,
      byPower:            false,
    },
  ]);
}
