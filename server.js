// server.js (ES module version)
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import bs58 from 'bs58';
import { Connection, PublicKey, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, transfer } from '@solana/spl-token';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Replace with your actual base58 secret key (DO NOT expose in production)
const SECRET_KEY_B58 = process.env.SECRET_KEY_B58;
const secret = bs58.decode(SECRET_KEY_B58);
const presaleAuthority = Keypair.fromSecretKey(secret);
const TOKEN_MINT = new PublicKey('3ygaDrWchsifigCw64gbVfRQv4RtQcnHCNbrKwJFNFTk'); // replace with WFAI devnet mint

app.post('/verify', async (req, res) => {
  const { signature, buyer, amount } = req.body;
  try {
    const confirmation = await connection.getConfirmedTransaction(signature);
    if (!confirmation) return res.status(400).json({ message: 'Transaction not confirmed.' });

    const buyerPubkey = new PublicKey(buyer);
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      presaleAuthority,
      TOKEN_MINT,
      buyerPubkey
    );

    const tokensToSend = amount * 100000; // 1000 WFAI per 1 SOL

    const tx = await transfer(
      connection,
      presaleAuthority,
      await getOrCreateAssociatedTokenAccount(
        connection,
        presaleAuthority,
        TOKEN_MINT,
        presaleAuthority.publicKey
      ).then(acc => acc.address),
      tokenAccount.address,
      presaleAuthority,
      tokensToSend * 1e6 // if 6 decimals
    );

    res.json({ success: true, tokensSent: tokensToSend, tokenTx: tx });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error verifying or sending tokens.' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
