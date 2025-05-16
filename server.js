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

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=fabdaf9f-b1de-4a1b-bb03-58532838cea3', 'confirmed');

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
    const tokensToSend = amount * 1_000_000;
    const tokenAmount = BigInt(tokensToSend) * 10n ** 6n; // 6 decimal precision

    // ✅ Create receiver's ATA (Buyer's)
    let buyerTokenAccount;
    try {
      buyerTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        presaleAuthority, // Payer of fees
        TOKEN_MINT,
        buyerPubkey,
        true // allow owner off curve (especially important for PDA or weird wallets)
      );
      console.log("✅ Buyer ATA:", buyerTokenAccount.address.toBase58());
    } catch (err) {
      console.error("❌ Error creating buyer ATA:", err);
      throw new Error("Failed to create buyer token account");
    }

    // ✅ Create sender's ATA (Presale Authority's)
    let senderTokenAccount;
    try {
      senderTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        presaleAuthority, // Payer
        TOKEN_MINT,
        presaleAuthority.publicKey,
        true
      );
      console.log("✅ Sender ATA:", senderTokenAccount.address.toBase58());
    } catch (err) {
      console.error("❌ Error creating sender ATA:", err);
      throw new Error("Failed to create sender token account");
    }

    // 🔁 Transfer tokens
    const txSig = await transfer(
      connection,
      presaleAuthority,
      senderTokenAccount.address,
      buyerTokenAccount.address,
      presaleAuthority.publicKey,
      tokenAmount
    );

    res.json({
      success: true,
      tokensSent: tokensToSend,
      tokenTx: txSig
    });

  } catch (err) {
    console.error('❌ Token send error:', err);
    res.status(500).json({ message: 'Error verifying or sending tokens.', error: err.message });
  }
});


app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
