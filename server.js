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

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

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
const TOKEN_MINT = new PublicKey('3ygaDrWchsifigCw64gbVfRQv4RtQcnHCNbrKwJFNFTk');

// ========== POST /verify ========== //
app.post('/verify', async (req, res) => {
  const { signature, buyer, amount } = req.body;

  try {
    const confirmation = await connection.getConfirmedTransaction(signature);
    if (!confirmation) {
      return res.status(400).json({ message: 'Transaction not confirmed.' });
    }

    const buyerPubkey = new PublicKey(buyer);

    // Get or create the buyer's associated token account
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      presaleAuthority,
      TOKEN_MINT,
      buyerPubkey
    );

    const tokensToSend = amount * 1000000; // 1000 WFAI per 1 SOL

    // Get presaleAuthority's associated token account
    const senderTokenAccount = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        presaleAuthority,
        TOKEN_MINT,
        presaleAuthority.publicKey
      )
    ).address;

    // Transfer tokens
    const tx = await transfer(
      connection,
      presaleAuthority,
      senderTokenAccount,
      tokenAccount.address,
      presaleAuthority,
      tokensToSend * 1e6 // 6 decimal places
    );

    res.json({
      success: true,
      tokensSent: tokensToSend,
      tokenTx: tx
    });
  } catch (err) {
    console.error('Token send error:', err);
    res.status(500).json({ message: 'Error verifying or sending tokens.' });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
