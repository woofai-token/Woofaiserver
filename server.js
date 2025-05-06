require('dotenv').config(); const express = require('express'); const { Connection, Keypair, Transaction, SystemProgram, PublicKey, sendAndConfirmTransaction } = require('@solana/web3.js'); const { getOrCreateAssociatedTokenAccount, createTransferInstruction, TOKEN_PROGRAM_ID } = require('@solana/spl-token'); const bs58 = require('bs58'); const cors = require('cors'); const rateLimit = require('express-rate-limit');

const app = express();

// Middleware app.use(cors()); app.use(express.json());

// Rate limiting const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }); app.use(limiter);

// Environment check const requiredEnvVars = ['PRESALE_WALLET_SECRET_KEY', 'TOKEN_MINT_ADDRESS', 'SOL_RECIPIENT_ADDRESS']; for (const envVar of requiredEnvVars) { if (!process.env[envVar]) { console.error(Missing environment variable: ${envVar}); process.exit(1); } }

const connection = new Connection(process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com'); const presaleWallet = Keypair.fromSecretKey(bs58.decode(process.env.PRESALE_WALLET_SECRET_KEY)); const tokenMint = new PublicKey(process.env.TOKEN_MINT_ADDRESS); const solRecipient = new PublicKey(process.env.SOL_RECIPIENT_ADDRESS);

const TOTAL_SUPPLY = 18450000000; const PHASES = [ { id: 1, price: 921659, allocation: 0.1, duration: 45 * 24 * 60 * 60 * 1000 }, { id: 2, price: 460829, allocation: 0.2, duration: 45 * 24 * 60 * 60 * 1000 }, { id: 3, price: 230414, allocation: 0.3, duration: 45 * 24 * 60 * 60 * 1000 } ];

const START_TIME = new Date('2025-05-06T00:00:00Z').getTime(); PHASES[0].startTime = START_TIME; PHASES[1].startTime = START_TIME + PHASES[0].duration; PHASES[2].startTime = PHASES[1].startTime + PHASES[1].duration; PHASES.forEach((p, i) => p.endTime = p.startTime + p.duration);

const presaleState = { tokensSold: 0, totalRaised: 0, holders: new Set() };

function getCurrentPhase() { const now = Date.now(); return PHASES.find(p => now >= p.startTime && now < p.endTime) || { id: 0, isActive: false, message: "Presale ended" }; }

app.get('/', (req, res) => { res.send('WOOF AI Presale Server is Running'); });

app.get('/api/presale-info', (req, res) => { const phase = getCurrentPhase(); if (!phase.id) return res.json({ success: false, message: phase.message }); const tokensAllocated = TOTAL_SUPPLY * phase.allocation; res.json({ success: true, currentPhase: phase.id, isActive: true, price: phase.price, priceDisplay: 1 SOL = ${phase.price.toLocaleString()} WOOF, tokensSold: presaleState.tokensSold, tokensAllocated, totalRaised: presaleState.totalRaised, totalHolders: presaleState.holders.size, timeRemaining: phase.endTime - Date.now(), startDate: new Date(phase.startTime).toISOString(), phaseEndDate: new Date(phase.endTime).toISOString() }); });

app.post('/api/buy-tokens', async (req, res) => { try { const { solAmount, userWallet } = req.body; if (!solAmount || !userWallet) return res.status(400).json({ success: false, error: 'Missing solAmount or userWallet' }); const amount = parseFloat(solAmount); if (isNaN(amount) || amount <= 0) return res.status(400).json({ success: false, error: 'Invalid SOL amount' });

const phase = getCurrentPhase();
if (!phase.id) return res.status(400).json({ success: false, error: 'Presale is not active' });

const tokensToSend = Math.floor(amount * phase.price);
const tokensAllocated = TOTAL_SUPPLY * phase.allocation;
if (presaleState.tokensSold + tokensToSend > tokensAllocated) return res.status(400).json({ success: false, error: 'Phase allocation exhausted' });

const userPublicKey = new PublicKey(userWallet);
const lamports = amount * 1e9;

// Send SOL to recipient
const solTx = new Transaction().add(SystemProgram.transfer({
  fromPubkey: userPublicKey,
  toPubkey: solRecipient,
  lamports: Math.floor(lamports)
}));

// Get user's token account or create it
const userTokenAccount = await getOrCreateAssociatedTokenAccount(
  connection,
  presaleWallet,
  tokenMint,
  userPublicKey
);

// Transfer tokens
const tokenTx = new Transaction().add(
  createTransferInstruction(
    userTokenAccount.address,
    userPublicKey,
    presaleWallet.publicKey,
    tokensToSend * 1e9,
    [],
    TOKEN_PROGRAM_ID
  )
);

tokenTx.feePayer = presaleWallet.publicKey;
tokenTx.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
const signature = await sendAndConfirmTransaction(connection, tokenTx, [presaleWallet]);

presaleState.tokensSold += tokensToSend;
presaleState.totalRaised += amount;
presaleState.holders.add(userWallet);

res.json({ success: true, transactionId: signature, tokensReceived: tokensToSend });

} catch (err) { console.error(err); res.status(500).json({ success: false, error: err.message }); } });

const PORT = process.env.PORT || 3000; app.listen(PORT, () => console.log(Presale server running on port ${PORT}));

                      
