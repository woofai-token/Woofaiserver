// server.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import {
  Connection,
  PublicKey,
  Keypair,
  sendAndConfirmTransaction
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

// 🔐 Load secret key
const SECRET_KEY_ARRAY = process.env.SECRET_KEY_ARRAY;
if (!SECRET_KEY_ARRAY) throw new Error("SECRET_KEY_ARRAY not set");

const secretKey = Uint8Array.from(JSON.parse(SECRET_KEY_ARRAY));
const presaleAuthority = Keypair.fromSecretKey(secretKey);

// 🪙 Token-2022 Mint Address
const TOKEN_MINT = new PublicKey("GhX61gZrBwmGQfQWyL7jvjANnLN6smHcYDZxYrA5yfcn");

// Helper to get or create ATA using Token-2022
async function safelyGetOrCreateATA(connection, payer, mint, owner) {
  return await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    owner,
    false,
    "confirmed",
    undefined,
    TOKEN_2022_PROGRAM_ID // ✅ MUST use this
  );
}

app.post("/verify", async (req, res) => {
  const { signature, buyer, amount } = req.body;

  try {
    const confirmation = await connection.getConfirmedTransaction(signature);
    if (!confirmation) {
      return res.status(400).json({ message: "Transaction not confirmed." });
    }

    const buyerPubkey = new PublicKey(buyer);
    const tokensToSend = amount * 1_000_000; // 1 SOL = 1M WFAI

    // 🏦 Get buyer ATA (Token-2022)
    let buyerATA;
    try {
      buyerATA = await safelyGetOrCreateATA(connection, presaleAuthority, TOKEN_MINT, buyerPubkey);
    } catch (e) {
      console.error("❌ Error creating buyer ATA:", e);
      return res.status(500).json({ message: "Failed to create buyer token account" });
    }

    // 🧑‍💼 Sender ATA (Token-2022)
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

    // 🚀 Transfer Tokens (Token-2022)
    const txSig = await transfer(
      connection,
      presaleAuthority,
      senderATA,
      buyerATA.address,
      presaleAuthority.publicKey,
      tokensToSend * 1e9, // Convert to correct decimals
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    return res.json({
      success: true,
      tokensSent: tokensToSend,
      tokenTx: txSig
    });
  } catch (err) {
    console.error("❌ Token send error:", err);
    return res.status(500).json({ message: "Error verifying or sending tokens." });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
