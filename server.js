require('dotenv').config();
const express = require('express');
const { Connection, PublicKey, Keypair, clusterApiUrl, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount, transfer } = require('@solana/spl-token');
const bs58 = require('bs58');

const app = express();
const port = 3000;

// === ENV VARIABLES ===
const RECEIVER_ADDRESS = process.env.RECEIVER_ADDRESS;
const SEED_PHRASE = process.env.SEED_PHRASE;
const MINT_ADDRESS = process.env.MINT_ADDRESS;

const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');
const payer = Keypair.fromSecretKey(bs58.decode(SEED_PHRASE));
const mint = new PublicKey(MINT_ADDRESS);
const receiverWallet = new PublicKey(RECEIVER_ADDRESS);

// Track processed transactions to prevent re-sending
let processedSigs = new Set();

async function monitorTransactions() {
  console.log('Monitoring transactions...');
  setInterval(async () => {
    const signatures = await connection.getSignaturesForAddress(receiverWallet, { limit: 10 });
    for (const sigInfo of signatures) {
      if (processedSigs.has(sigInfo.signature)) continue;

      const tx = await connection.getTransaction(sigInfo.signature, { commitment: 'confirmed' });
      if (!tx) continue;

      const instructions = tx.transaction.message.instructions;
      for (const ix of instructions) {
        if (ix.programId.toBase58() === '11111111111111111111111111111111') {
          const lamports = tx.meta.postBalances[1] - tx.meta.preBalances[1];
          const solAmount = lamports / LAMPORTS_PER_SOL;
          const fromAddress = tx.transaction.message.accountKeys[0].toBase58();

          // Send WoFAI
          const to = new PublicKey(fromAddress);
          const toTokenAccount = await getOrCreateAssociatedTokenAccount(connection, payer, mint, to);
          const amountToSend = solAmount * 1_000_000;

          await transfer(connection, payer, await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey),
            toTokenAccount.address, payer.publicKey, amountToSend);

          console.log(`Sent ${amountToSend} WoFAI to ${fromAddress} for ${solAmount} SOL`);
        }
      }

      processedSigs.add(sigInfo.signature);
    }
  }, 5000);
}

app.get('/', (req, res) => res.send('WoFAI Presale Server Running'));
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  monitorTransactions();
});
