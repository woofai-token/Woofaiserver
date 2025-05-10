require('dotenv').config();
const express = require('express');
const {
  Connection,
  PublicKey,
  Keypair,
  clusterApiUrl,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const {
  getOrCreateAssociatedTokenAccount,
  transfer
} = require('@solana/spl-token');
const bip39 = require('bip39');
const ed25519 = require('ed25519-hd-key');

// === ENV VARIABLES ===
const RECEIVER_ADDRESS = process.env.RECEIVER_ADDRESS;
const SEED_PHRASE = process.env.SEED_PHRASE;
const MINT_ADDRESS = process.env.MINT_ADDRESS;

const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');
const mint = new PublicKey(MINT_ADDRESS);
const receiverWallet = new PublicKey(RECEIVER_ADDRESS);

// Wrap everything in async function
(async () => {
  const seed = await bip39.mnemonicToSeed(SEED_PHRASE);
  const derived = ed25519.derivePath("m/44'/501'/0'/0'", seed.toString('hex'));
  const payer = Keypair.fromSeed(derived.key);

  const app = express();
  const port = process.env.PORT || 3000;
  let processedSigs = new Set();

  async function monitorTransactions() {
    console.log('Monitoring transactions...');
    setInterval(async () => {
      const signatures = await connection.getSignaturesForAddress(receiverWallet, { limit: 10 });
      for (const sigInfo of signatures) {
        if (processedSigs.has(sigInfo.signature)) continue;

        const tx = await connection.getTransaction(sigInfo.signature, { commitment: 'confirmed' });
        if (!tx) continue;

        const lamports = tx.meta.postBalances[1] - tx.meta.preBalances[1];
        const solAmount = lamports / LAMPORTS_PER_SOL;
        const fromAddress = tx.transaction.message.accountKeys[0].toBase58();

        const to = new PublicKey(fromAddress);
        const toTokenAccount = await getOrCreateAssociatedTokenAccount(connection, payer, mint, to);
        const amountToSend = solAmount * 1_000_000;

        await transfer(
          connection,
          payer,
          await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey),
          toTokenAccount.address,
          payer.publicKey,
          amountToSend
        );

        console.log(`Sent ${amountToSend} WoFAI to ${fromAddress} for ${solAmount} SOL`);
        processedSigs.add(sigInfo.signature);
      }
    }, 5000);
  }

  app.get('/', (req, res) => res.send('WoFAI Presale Server Running'));
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    monitorTransactions();
  });
})();
