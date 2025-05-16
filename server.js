// server.js
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  transfer
} from '@solana/spl-token';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

// 🔐 Load secret key
const SECRET_KEY_ARRAY = process.env.SECRET_KEY_ARRAY;
if (!SECRET_KEY_ARRAY) {
  throw new Error("❌ SECRET_KEY_ARRAY not set in environment");
}
let secretKey;
try {
  secretKey = Uint8Array.from(JSON.parse(SECRET_KEY_ARRAY));
} catch (e) {
  throw new Error("❌ Invalid SECRET_KEY_ARRAY format — must be a JSON array");
}
const presaleAuthority = Keypair.fromSecretKey(secretKey);

// 🎯 Your token mint address (Mainnet)
const TOKEN_MINT = new PublicKey('GhX61gZrBwmGQfQWyL7jvjANnLN6smHcYDZxYrA5yfcn');

// 🔧 Safe ATA creation utility
async function safelyGetOrCreateATA(payer, mint, owner) {
  const ata = await getAssociatedTokenAddress(mint, owner, true); // allow off-curve
  try {
    await getAccount(connection, ata);
    console.log(`✅ ATA exists: ${ata.toBase58()}`);
  } catch (e) {
    if (e.name === 'TokenAccountNotFoundError') {
      console.log(`⚠️ ATA missing, creating for ${owner.toBase58()}`);
      const ix = createAssociatedTokenAccountInstruction(
        payer.publicKey,
        ata,
        owner,
        mint
      );
      const tx = new Transaction().add(ix);
      await sendAndConfirmTransaction(connection, tx, [payer]);
      console.log(`✅ ATA created: ${ata.toBase58()}`);
    } else {
      console.error("❌ ATA check/create failed:", e);
      throw new Error("Failed to create buyer token account");
    }
  }
  return ata;
}

// 🚀 POST /verify
app.post('/verify', async (req, res) => {
  const { signature, buyer, amount } = req.body;
  console.log(`🔎 Verifying tx: ${signature} for buyer: ${buyer} amount: ${amount}`);

  try {
    const confirmation = await connection.getConfirmedTransaction(signature);
    if (!confirmation) {
      return res.status(400).json({ message: '❌ Transaction not confirmed.' });
    }

    const buyerPubkey = new PublicKey(buyer);
    const tokensToSend = amount * 1_000_000; // Adjust based on your token logic

    // 🔄 Get/create ATAs
    const buyerTokenAccount = await safelyGetOrCreateATA(presaleAuthority, TOKEN_MINT, buyerPubkey);
    const senderTokenAccount = await safelyGetOrCreateATA(presaleAuthority, TOKEN_MINT, presaleAuthority.publicKey);

    // 💸 Transfer tokens
    const tx = await transfer(
      connection,
      presaleAuthority,
      senderTokenAccount,
      buyerTokenAccount,
      presaleAuthority,
      tokensToSend * 1e3 // Your token uses 6 decimals → 1e6 multiplier
    );

    console.log(`✅ Tokens sent. TX: ${tx}`);
    res.json({
      success: true,
      tokensSent: tokensToSend,
      tokenTx: tx
    });
  } catch (err) {
    console.error('❌ Token send error:', err);
    res.status(500).json({ message: 'Error verifying or sending tokens.' });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
