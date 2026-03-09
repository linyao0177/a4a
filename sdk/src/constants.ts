// Polygon Mainnet — all addresses verified against arec-green-bot

export const CHAIN_ID = 137; // Polygon mainnet

export const ADDR = {
  AREC:  "0x954585adf9425f66a0a2fd8e10682eb7c4f1f1fd", // AREC NFT (ERC721 proxy)
  ART:   "0x58e4d14ccddd1e993e6368a8c5eaa290c95cafdf", // ART token — 9 decimals
  KWH:   "0x5740A27990d4AaA4FB83044a6C699D435B9BA6F1", // kWh token — 6 decimals
  AKRE:  "0xe9c21de62c5c5d0ceacce2762bf655afdceb7ab3", // AKRE token — 18 decimals, EIP-2612
  GREEN: "0x3221F5818A5CF99e09f5BE0E905d8F145935e3E0", // GreenBTC2S proxy
  ISSUER:"0xFedD52848Cb44dcDBA95df4cf2BCBD71D58df879", // Arkreen Issuer
} as const;

// ⚠️  Decimals differ per token — do NOT assume 18
export const DECIMALS = {
  AREC: 0,  // NFT
  ART:  9,
  KWH:  6,
  AKRE: 18,
} as const;

export const OPENAPI_URL = "https://openapi.arkreen.com/v1";

// GreenBTC domain IDs that still have capacity
// Domain 1 = fully greenized; 4-10 = not opened
export const ACTIVE_DOMAINS = [2, 3, 11, 12, 13, 14, 15, 16, 17, 18];

// 10 kWh tokens (in base units) = 1 GreenBox step = 1 Bitcoin block greened
export const KWH_PER_BOX_STEP = BigInt(10) * BigInt(10 ** DECIMALS.KWH); // 10_000_000n

// REC status enum from ArkreenRECIssuance contract
export enum RECStatus {
  Pending   = 0,
  Rejected  = 1,
  Cancelled = 2,
  Certified = 3,
  Retired   = 4,
  Liquidized = 5,
}

// Minimal ABIs — only the functions we call

export const AREC_ABI = [
  // Issue
  "function mintRECRequest((address issuer, uint32 startTime, uint32 endTime, uint128 amountREC, string cID, string region, string url, string memo) recRequest, (address token, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) permitToPay) returns (uint256 tokenId)",
  // Status — use this, NOT allRECData
  "function getRECDataCore(uint256 tokenId) view returns (address issuer, uint128 amountREC, uint8 status, uint16 idAsset)",
  // Liquidize
  "function liquidizeREC(uint256 tokenId)",
  // Enumerate owned tokens
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  // Fee
  "function paymentTokenPrice(address token) view returns (uint256)",
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
] as const;

export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function nonces(address owner) view returns (uint256)",
  "function name() view returns (string)",
] as const;

export const KWH_ABI = [
  ...ERC20_ABI,
  "function convertKWh(address tokenToPay, uint256 amountPayment)",
] as const;

export const GREEN_ABI = [
  "function makeGreenBox(uint256 domainID, uint256 boxSteps)",
] as const;
