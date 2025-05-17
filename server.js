// server.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import {
  Connection,
  PublicKey,
  Keypair,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  transfer,
  TOKEN_2022_PROGRAM_ID
} from "@solana/spl-token";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

// 🔐 Load presale wallet secret key
const SECRET_KEY_ARRAY = process.env.SECRET_KEY_ARRAY;
if (!SECRET_KEY_ARRAY) throw new Error("SECRET_KEY_ARRAY not set");
const secretKey = Uint8Array.from(JSON.parse(SECRET_KEY_ARRAY));
const presaleAuthority = Keypair.fromSecretKey(secretKey);

// 🪙 Token-2022 Mint Address
const TOKEN_MINT = new PublicKey("GhX61gZrBwmGQfQWyL7jvjANnLN6smHcYDZxYrA5yfcn");

// Token constants
const TOKEN_DECIMALS = 9;
const TOKENS_PER_SOL = 1_000_000;

// 👷‍♂️ Create or get buyer's ATA using your wallet to pay rent
async function safelyGetOrCreateATA(payer, mint, owner) {
  try {
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      payer, // payer pays for account creation (you)
      mint,
      owner,
      true, // allowOwnerOffCurve (should be true unless you're using PDA as owner)
      "confirmed",
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    return ata;
  } catch (err) {
    console.error("❌ Failed to get/create ATA:", err.message);
    throw err;
  }
}

app.post("/verify", async (req, res) => {
  const { signature, buyer, amount } = req.body;

  try {
    console.log("🔍 Verifying transaction:", signature);
    const confirmation = await connection.getConfirmedTransaction(signature);
    if (!confirmation) {
      return res.status(400).json({ message: "Transaction not confirmed." });
    }

    const buyerPubkey = new PublicKey(buyer);
    const tokensToSend = BigInt(Math.floor(amount * TOKENS_PER_SOL * (10 ** TOKEN_DECIMALS)));

    console.log("🧮 Sending", tokensToSend.toString(), "tokens to", buyerPubkey.toBase58());

    // 🏦 Get or create buyer's ATA (you pay rent)
    const buyerATA = await safelyGetOrCreateATA(presaleAuthority, TOKEN_MINT, buyerPubkey);

    // 💼 Get sender (your) ATA
    const senderATA = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        presaleAuthority,
        TOKEN_MINT,
        presaleAuthority.publicKey,
        false,
        "confirmed",
        undefined,
        TOKEN_2022_PROGRAM_ID
      )
    ).address;

    // 🚀 Transfer tokens
    const txSig = await transfer(
      connection,
      presaleAuthority,
      senderATA,
      buyerATA.address,
      presaleAuthority.publicKey,
      tokensToSend,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    return res.json({
      success: true,
      tokensSent: tokensToSend.toString(),
      tokenTx: txSig
    });

  } catch (err) {
    console.error("❌ Token send error:", err);
    return res.status(500).json({ message: "Error verifying or sending tokens." });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
