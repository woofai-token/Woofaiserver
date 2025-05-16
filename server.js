// server.js
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import {
  Connection,
  PublicKey,
  Keypair
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  transfer
} from '@solana/spl-token';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

// 🔐 Read secret key as JSON array from environment
const SECRET_KEY_ARRAY = process.env.SECRET_KEY_ARRAY;
if (!SECRET_KEY_ARRAY) {
  throw new Error("SECRET_KEY_ARRAY not set in environment");
}

let secretKey;
try {
  secretKey = Uint8Array.from(JSON.parse(SECRET_KEY_ARRAY));
} catch (e) {
  throw new Error("Invalid SECRET_KEY_ARRAY format — must be a valid JSON array string.");
}

const presaleAuthority = Keypair.fromSecretKey(secretKey);

// Replace with your Devnet WFAI token mint address
const TOKEN_MINT = new PublicKey('GhX61gZrBwmGQfQWyL7jvjANnLN6smHcYDZxYrA5yfcn');

// ========== POST /verify ========== //
app.post('/verify', async (req, res) => {
  const { signature, buyer, amount } = req.body;

  try {
    const confirmation = await connection.getConfirmedTransaction(signature);
    if (!confirmation) {
      return res.status(400).json({ message: 'Transaction not confirmed.' });
    }

    const buyerPubkey = new PublicKey(buyer);

    const tokensToSend = amount * 1_000_000; // 1 SOL = 1,000,000 WFAI
    const tokenAmount = BigInt(tokensToSend) * 10n ** 6n; // Adjust to 6 decimals

    // 🔹 Get or create the buyer's associated token account
    const buyerTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      presaleAuthority,        // Fee payer
      TOKEN_MINT,              // Token mint
      buyerPubkey              // Wallet to receive tokens
    );

    // 🔹 Get or create presale authority's token account
    const senderTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      presaleAuthority,              // Fee payer
      TOKEN_MINT,                    // Token mint
      presaleAuthority.publicKey     // Owner
    );

    // 🔁 Transfer tokens
    const tx = await transfer(
      connection,
      presaleAuthority,                   // Payer
      senderTokenAccount.address,         // Source
      buyerTokenAccount.address,          // Destination
      presaleAuthority.publicKey,         // Owner of source
      tokenAmount                         // Amount in base units
    );

    res.json({
      success: true,
      tokensSent: tokensToSend,
      tokenTx: tx
    });

  } catch (err) {
    console.error('Token send error:', err);
    res.status(500).json({ message: 'Error verifying or sending tokens.', error: err.message });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
