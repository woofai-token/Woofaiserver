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
  getAccount,
  createAssociatedTokenAccount,
  transfer,
  TOKEN_2022_PROGRAM_ID
} from "@solana/spl-token";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

// 🔐 Load your presale wallet
const SECRET_KEY_ARRAY = process.env.SECRET_KEY_ARRAY;
if (!SECRET_KEY_ARRAY) throw new Error("SECRET_KEY_ARRAY not set");

const secretKey = Uint8Array.from(JSON.parse(SECRET_KEY_ARRAY));
const presaleAuthority = Keypair.fromSecretKey(secretKey);

// 🪙 Token-2022 Mint
const TOKEN_MINT = new PublicKey("GhX61gZrBwmGQfQWyL7jvjANnLN6smHcYDZxYrA5yfcn");
const TOKEN_DECIMALS = 9;
const TOKENS_PER_SOL = 1_000_000;

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

    // 🏦 Get buyer ATA address
    const buyerATA = await getAssociatedTokenAddress(
      TOKEN_MINT,
      buyerPubkey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // 🧪 Check if buyer's ATA exists
    let ataExists = false;
    try {
      await getAccount(connection, buyerATA, undefined, TOKEN_2022_PROGRAM_ID);
      ataExists = true;
    } catch (err) {
      ataExists = false;
    }

    // 🏗️ If ATA doesn't exist, create it using your wallet
    if (!ataExists) {
      console.log("📦 Creating ATA for buyer:", buyerPubkey.toBase58());
      await createAssociatedTokenAccount(
        connection,
        presaleAuthority,        // payer (your wallet pays)
        TOKEN_MINT,
        buyerPubkey,
        false,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
    } else {
      console.log("✅ Buyer ATA already exists:", buyerATA.toBase58());
    }

    // 🧑‍💼 Get your sender ATA
    const senderATA = await getAssociatedTokenAddress(
      TOKEN_MINT,
      presaleAuthority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // 🚀 Transfer tokens
    const txSig = await transfer(
      connection,
      presaleAuthority,
      senderATA,
      buyerATA,
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
