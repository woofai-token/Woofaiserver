const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Connection, PublicKey, Keypair, clusterApiUrl } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount, transfer, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const bs58 = require('bs58');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 3000;

// ========== CONFIG ==========
const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

// Replace with your Devnet WFAI token mint address
const TOKEN_MINT = new PublicKey('3ygaDrWchsifigCw64gbVfRQv4RtQcnHCNbrKwJFNFTk');

// Replace with your presale wallet public + secret key
const PRESALE_WALLET_PUBLIC = new PublicKey('GWkwfF8BbA591V4ZFTLDJJ9eRy5Mhp2Z9zNBNFvf6cgy');
const PRESALE_WALLET_SECRET = bs58.decode('YOUR_PRESALE_WALLET_SECRET_BASE58'); // Or use JSON keypair
const presaleWallet = Keypair.fromSecretKey(PRESALE_WALLET_SECRET);

const TOKEN_DECIMALS = 9; // Usually 9 for SPL tokens
const TOKENS_PER_SOL = 1000000;
// ============================

app.post('/verify', async (req, res) => {
  const { signature, buyer, amount } = req.body;

  try {
    const tx = await connection.getParsedTransaction(signature, 'confirmed');
    if (!tx) return res.status(400).json({ message: 'Transaction not found' });

    const recipientMatch = tx.transaction.message.accountKeys.some(
      acc => acc.pubkey.toString() === PRESALE_WALLET_PUBLIC.toString()
    );
    if (!recipientMatch) return res.status(400).json({ message: 'Invalid recipient' });

    // Send WFAI tokens
    const buyerPubKey = new PublicKey(buyer);
    const tokenAmount = BigInt(amount * TOKENS_PER_SOL * 10 ** TOKEN_DECIMALS);

    const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      presaleWallet,
      TOKEN_MINT,
      presaleWallet.publicKey
    );

    const toTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      presaleWallet,
      TOKEN_MINT,
      buyerPubKey
    );

    const txSig = await transfer(
      connection,
      presaleWallet,
      fromTokenAccount.address,
      toTokenAccount.address,
      presaleWallet.publicKey,
      tokenAmount
    );

    return res.status(200).json({
      message: 'Success',
      tokenTx: txSig,
      tokensSent: amount * TOKENS_PER_SOL
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Token transfer failed', error: err.message });
  }
});

app.listen(PORT, () => console.log(`Backend running at http://localhost:${PORT}`));
