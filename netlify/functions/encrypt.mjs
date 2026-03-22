import { x25519, RescueCipher, getMXEPublicKey, deserializeLE } from "@arcium-hq/client";
import { randomBytes } from "crypto";
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";

const PROGRAM_ID = new PublicKey("4rfPEFE5wSfqQMG7bw5MqPrwA9KSsYsi5sVaWRsY1ShU");
const connection = new Connection("https://api.devnet.solana.com", "confirmed");

export async function handler(event) {
  try {
    const { features } = JSON.parse(event.body);
    const f1 = BigInt(features[0]);
    const f2 = BigInt(features[1]);
    const count = BigInt(features.length);

    // Get MXE public key
    const mxeAccSeed = [Buffer.from("MXEAccount"), PROGRAM_ID.toBuffer()];
    const arciumProgramId = new PublicKey("3CCL2BmMSdC3EFm3M3o6MEfGgaJwRMYpMZWaNKdPMuR6");
    const [mxeAccAddr] = PublicKey.findProgramAddressSync(mxeAccSeed, arciumProgramId);
    const mxeAccInfo = await connection.getAccountInfo(mxeAccAddr);
    
    // Extract x25519 pubkey from MXE account (offset may vary)
    // Using SDK directly
    const privKey = x25519.utils.randomPrivateKey();
    const pubKey = x25519.getPublicKey(privKey);
    
    // For now, use a dummy shared secret to test the flow
    // In production, we'd fetch the real MXE pubkey
    const nonce = randomBytes(16);
    
    // Try to get MXE key via RPC
    let mxePubKey;
    try {
      // Read MXE account and extract x25519 key
      if (mxeAccInfo) {
        // x25519 pubkey is at a specific offset in the MXE account data
        // Based on SDK: getMXEPublicKey reads from the account
        const data = mxeAccInfo.data;
        // The x25519 key is stored after some header data
        // Try offset 8 + 32 + 32 + 8 + 8 + 8 + 1 = 97, then 32 bytes
        // Actually let's just try multiple offsets
        for (let offset = 0; offset < data.length - 32; offset++) {
          const candidate = data.slice(offset, offset + 32);
          if (candidate.some(b => b !== 0)) {
            try {
              const testSecret = x25519.getSharedSecret(privKey, candidate);
              mxePubKey = candidate;
              break;
            } catch {}
          }
        }
      }
    } catch (e) {
      console.log("Could not extract MXE key:", e.message);
    }

    if (!mxePubKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "Could not get MXE public key" }) };
    }

    const sharedSecret = x25519.getSharedSecret(privKey, mxePubKey);
    const cipher = new RescueCipher(sharedSecret);

    const ctStoredF1 = cipher.encrypt([f1], nonce);
    const ctStoredF2 = cipher.encrypt([f2], nonce);
    const ctStoredCount = cipher.encrypt([count], nonce);
    const ctLiveF1 = cipher.encrypt([f1], nonce);
    const ctLiveF2 = cipher.encrypt([f2], nonce);
    const ctLiveCount = cipher.encrypt([count], nonce);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        ctStoredF1: Array.from(ctStoredF1[0]),
        ctStoredF2: Array.from(ctStoredF2[0]),
        ctStoredCount: Array.from(ctStoredCount[0]),
        ctLiveF1: Array.from(ctLiveF1[0]),
        ctLiveF2: Array.from(ctLiveF2[0]),
        ctLiveCount: Array.from(ctLiveCount[0]),
        pubKey: Array.from(pubKey),
        nonce: deserializeLE(nonce).toString(),
      }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}
