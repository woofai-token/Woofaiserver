require('dotenv').config();
const express = require('express');
const { Keypair, Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount, transfer } = require('@solana/spl-token');
const admin = require('firebase-admin');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.firestore();
const SOLANA_CONNECTION = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
const TOKEN_MINT = new PublicKey(process.env.TOKEN_MINT);
const PRESALE_START = new Date(process.env.PRESALE_START);
const TOTAL_SUPPLY = 18450000000; // 18.45B tokens
const YOUR_WALLET = Keypair.fromSecretKey(
  new Uint8Array(process.env.PRIVATE_KEY.split(',').map(Number))
);

// Presale configuration
const PRESALE_PHASES = [
  { duration: 45, rate: 1_000_000 },
  { duration: 45, rate: 600_000 },
  { duration: 45, rate: 450_000 }
];

// Get current presale phase
function getCurrentPhase() {
  const elapsed = Date.now() - PRESALE_START.getTime();
  const daysPassed = Math.floor(elapsed / (1000 * 3600 * 24));
  
  if (daysPassed <= PRESALE_PHASES[0].duration) return 0;
  if (daysPassed <= PRESALE_PHASES[0].duration + PRESALE_PHASES[1].duration) return 1;
  return 2;
}

// Buy tokens endpoint
app.post('/buy-tokens', async (req, res) => {
  try {
    const { userWallet, solAmount } = req.body;
    const currentPhase = getCurrentPhase();
    const tokenAmount = solAmount * PRESALE_PHASES[currentPhase].rate * Math.pow(10, 9);

    // Create SOL transfer transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(userWallet),
        toPubkey: YOUR_WALLET.publicKey,
        lamports: solAmount * LAMPORTS_PER_SOL
      })
    );

    // Send SOL
    const txSignature = await sendAndConfirmTransaction(SOLANA_CONNECTION, transaction, [
      { publicKey: new PublicKey(userWallet), secretKey: Buffer.from([]) }
    ]);

    // Transfer tokens
    const sourceAccount = await getOrCreateAssociatedTokenAccount(
      SOLANA_CONNECTION,
      YOUR_WALLET,
      TOKEN_MINT,
      YOUR_WALLET.publicKey
    );

    const destAccount = await getOrCreateAssociatedTokenAccount(
      SOLANA_CONNECTION,
      YOUR_WALLET,
      TOKEN_MINT,
      new PublicKey(userWallet)
    );

    const transferTx = await transfer(
      SOLANA_CONNECTION,
      YOUR_WALLET,
      sourceAccount.address,
      destAccount.address,
      YOUR_WALLET.publicKey,
      tokenAmount
    );

    // Save transaction
    await db.collection('transactions').doc(txSignature).set({
      user: userWallet,
      sol: solAmount,
      tokens: tokenAmount,
      phase: currentPhase,
      timestamp: new Date()
    });

    res.json({ success: true, txSignature });
  } catch (error) {
    console.error('Transaction failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get presale data
app.get('/presale-data', async (req, res) => {
  const phase = getCurrentPhase();
  const snapshot = await db.collection('stats').doc('current').get();
  res.json({
    phase,
    startDate: PRESALE_START,
    sold: snapshot.data().tokensSold,
    collected: snapshot.data().solCollected
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
