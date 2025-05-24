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
  getAssociatedTokenAddress,
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

// 🔐 Load presale wallet
const SECRET_KEY_ARRAY = process.env.SECRET_KEY_ARRAY;
if (!SECRET_KEY_ARRAY) throw new Error("SECRET_KEY_ARRAY not set");

const secretKey = Uint8Array.from(JSON.parse(SECRET_KEY_ARRAY));
const presaleAuthority = Keypair.fromSecretKey(secretKey);

// 🪙 Token-2022 Mint
const TOKEN_MINT = new PublicKey("GhX61gZrBwmGQfQWyL7jvjANnLN6smHcYDZxYrA5yfcn");
const TOKEN_DECIMALS = 9;

app.post("/verify", async (req, res) => {
  const { signature, buyer, wfaiAmount } = req.body;

  if (!signature || !buyer || !wfaiAmount) {
    return res.status(400).json({ message: "Missing fields in request." });
  }

  try {
    console.log("🔍 Verifying transaction:", signature);
    const confirmation = await connection.getConfirmedTransaction(signature);
    if (!confirmation) {
      return res.status(400).json({ message: "Transaction not confirmed." });
    }

    const buyerPubkey = new PublicKey(buyer);
    const tokensToSend = BigInt(wfaiAmount); // already scaled to smallest unit (raw integer)

    // 🧑‍💼 Sender ATA
    const senderATA = await getAssociatedTokenAddress(
      TOKEN_MINT,
      presaleAuthority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // ✅ Buyer ATA (create if needed)
    const buyerATA = await getOrCreateAssociatedTokenAccount(
      connection,
      presaleAuthority,
      TOKEN_MINT,
      buyerPubkey,
      false,
      "confirmed",
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    console.log("✅ Buyer ATA ready:", buyerATA.address.toBase58());

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

    console.log("🎉 Tokens sent! Tx:", txSig);
    return res.json({
      success: true,
      tokensSent: tokensToSend.toString(),
      tokenTx: txSig
    });

  } catch (err) {
    console.error("❌ Error:", err);
    return res.status(500).json({ message: "Error verifying or sending tokens." });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
