require('dotenv').config();
const express = require('express');
const { Connection, PublicKey, clusterApiUrl, Keypair, Transaction } = require('@solana/web3.js');
const {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getMint,
} = require('@solana/spl-token');
const bs58 = require('bs58');
const { mnemonicToSeedSync } = require('bip39');
const { derivePath } = require('ed25519-hd-key');

const app = express();
app.use(express.json());

const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');

// ENV VARIABLES
const RECEIVER_ADDRESS = process.env.RECEIVER_ADDRESS;
const TOKEN_MINT = process.env.TOKEN_MINT;
const SEED_PHRASE = process.env.SEED_PHRASE;

const deriveKeypairFromSeed = () => {
  const seed = mnemonicToSeedSync(SEED_PHRASE, ''); // No password
  const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
  return Keypair.fromSeed(derivedSeed);
};

const WofaiPerSol = 1_000_000;

async function getOrCreateAssociatedAccount(userPublicKey, mint, payerPublicKey) {
  const associatedTokenAddress = await getAssociatedTokenAddress(mint, userPublicKey);
  const accountInfo = await connection.getAccountInfo(associatedTokenAddress);

  const instructions = [];
  if (!accountInfo) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payerPublicKey,
        associatedTokenAddress,
        userPublicKey,
        mint
      )
    );
  }

  return { associatedTokenAddress, instructions };
}

app.post('/handle-payment', async (req, res) => {
  try {
    const { sender, amount } = req.body;
    const userPublicKey = new PublicKey(sender);
    const amountSol = parseFloat(amount);
    const tokenAmount = amountSol * WofaiPerSol;

    const mint = new PublicKey(TOKEN_MINT);
    const receiverKeypair = deriveKeypairFromSeed();

    const { associatedTokenAddress, instructions } = await getOrCreateAssociatedAccount(
      userPublicKey,
      mint,
      receiverKeypair.publicKey
    );

    const senderTokenAccount = await getAssociatedTokenAddress(
      mint,
      receiverKeypair.publicKey
    );

    const transferInstruction = createTransferInstruction(
      senderTokenAccount,
      associatedTokenAddress,
      receiverKeypair.publicKey,
      tokenAmount
    );

    const transaction = new Transaction().add(...instructions, transferInstruction);
    transaction.feePayer = receiverKeypair.publicKey;
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    const signature = await connection.sendTransaction(transaction, [receiverKeypair]);
    await connection.confirmTransaction(signature, 'confirmed');

    res.json({ success: true, tx: signature });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
