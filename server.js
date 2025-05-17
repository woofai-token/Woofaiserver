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
  TOKEN_2022_PROGRAM_ID,
  getMint
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

// Get token decimals (cache this if possible)
let tokenDecimals;
async function getTokenDecimals() {
  if (!tokenDecimals) {
    const mintInfo = await getMint(connection, TOKEN_MINT, "confirmed", TOKEN_2022_PROGRAM_ID);
    tokenDecimals = mintInfo.decimals;
  }
  return tokenDecimals;
}

app.post("/verify", async (req, res) => {
  const { signature, buyer, amount, solAmount } = req.body;

  try {
    // 1. Verify transaction exists
    const confirmation = await connection.getConfirmedTransaction(signature);
    if (!confirmation) {
      return res.status(400).json({ message: "Transaction not confirmed." });
    }
     const TOKEN_RATE = 1_000_000; // 1 SOL = 10M tokens
    const decimals = 9; // Your token decimals

    // 2. Calculate correct token amount
    const decimals = await getTokenDecimals();
    const tokensToSend = Math.floor(solAmount * TOKEN_RATE * (10 ** decimals));

    console.log(`Sending ${tokensToSend} tokens (${solAmount} SOL)`);

    // 3. Get buyer ATA
    const buyerPubkey = new PublicKey(buyer);
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

    // 4. Get sender ATA
    const senderATA = await getOrCreateAssociatedTokenAccount(
      connection,
      presaleAuthority,
      TOKEN_MINT,
      presaleAuthority.publicKey,
      false,
      "confirmed",
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    // 5. Transfer tokens with proper amount
    const txSig = await transfer(
      connection,
      presaleAuthority,
      senderATA.address,
      buyerATA.address,
      presaleAuthority,
      tokensToSend,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    return res.json({
      success: true,
      tokensSent: tokensToSend,
      tokenTx: txSig,
      rateUsed: TOKEN_RATE,
      solAmount: solAmount
    });

  } catch (err) {
    console.error("❌ Token send error:", err);
    return res.status(500).json({ 
      message: "Error verifying or sending tokens.",
      error: err.message 
    });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
