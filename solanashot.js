const { Connection, PublicKey } = require("@solana/web3.js");
const fs = require("fs");
require("dotenv").config();

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const BATCH_SIZE = 10; // Number of requests to process per batch, due to RPC rate limits
const BATCH_DELAY = 2000; // Delay between batches to counter throttling
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isValidBase58Address(address) {
  try {
    new PublicKey(address);
    return true;
  } catch (e) {
    return false;
  }
}
async function fetchTokenHolders(connection, tokenMint) {
  const SPL_TOKEN_PROGRAM_ID = new PublicKey(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  );
  try {
    console.log("Fetching token accounts for mint:", tokenMint.toBase58());
    const accounts = await connection.getProgramAccounts(SPL_TOKEN_PROGRAM_ID, {
      filters: [
        {
          dataSize: 165, // Token account size
        },
        {
          memcmp: {
            offset: 0, // Mint address starts at byte 0
            bytes: tokenMint.toBase58(),
          },
        },
      ],
    });

    console.log("Fetched accounts from RPC:", accounts.length);

    const holders = accounts
      .map((account) => {
        const data = account.account.data;
        const address = account.pubkey.toBase58();
        const balance = data.readBigUInt64LE(64); // Account balance is at offset 64
        return {
          tokenAccount: address,
          balance: Number(balance),
        };
      })
      .filter((holder) => holder.balance > 0); // Remove zero-balance accounts

    return holders;
  } catch (error) {
    console.error("Error fetching token holder:", error);
    throw error;
  }
}

async function getOwnerOfTokenAccount(connection, tokenAccountAddress) {
  const accountInfo = await connection.getParsedAccountInfo(
    new PublicKey(tokenAccountAddress)
  );
  if (accountInfo.value) {
    const ownerAddress = accountInfo.value.data.parsed.info.owner;
    return ownerAddress;
  } else {
    throw new Error("Account information not found");
  }
}

const findAssociatedTokenAddress = async (walletAddress, tokenMintAddress) => {
  const { PublicKey } = require("@solana/web3.js");
  const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID = new PublicKey(
    "ATokenGPvskpXA7PhGsGhxihDuEpLfKSmEd2fE7zjGeMA"
  );

  const [ata] = await PublicKey.findProgramAddress(
    [
      walletAddress.toBuffer(),
      SPL_TOKEN_PROGRAM_ID.toBuffer(),
      tokenMintAddress.toBuffer(),
    ],
    SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
  );

  return ata.toBase58();
};

async function fetchParsedTokenAccounts(connection, tokenMint) {
  try {
    const accounts = await connection.getParsedTokenAccountsByOwner(tokenMint, {
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    });

    return accounts.value.map((accountInfo) => {
      const accountData = accountInfo.account.data.parsed.info;
      const ownerAddress = accountData.owner; // Owner of the token account
      const tokenAmount = accountData.tokenAmount.uiAmount; // Token balance
      return {
        ownerAddress,
        balance: tokenAmount,
      };
    });
  } catch (error) {
    console.error("Error fetching parsed token accounts:", error.message);
    throw error;
  }
}

async function processInBatches(items, batchSize, processFunction) {
  const batches = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  const results = [];
  const totalBatches = batches.length;
  let i = 0;
  for (const batch of batches) {
    console.log(`Processing batch ${i + 1} of ${totalBatches}`);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        try {
          return await processFunction(item);
        } catch (error) {
          console.error(
            `Error processing item ${JSON.stringify(item)}: ${error.message}`
          );
          return null;
        }
      })
    );
    results.push(...batchResults);
    i++;
    // Optional: delay between batches to avoid throttling
    await delay(BATCH_DELAY);
  }
  return results.filter((result) => result !== null);
}

async function takeSnapshot(date, tokenMintAddress) {
  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const tokenMint = new PublicKey(tokenMintAddress);
  const snapshotDate = new Date(date);

  if (isNaN(snapshotDate.getTime())) {
    console.error("Invalid date format. Use YYYY-MM-DD");
    process.exit(1);
  }

  try {
    console.log(
      `Taking snapshot for token mint: ${tokenMintAddress} on ${snapshotDate}`
    );
    // Step 1: Fetch token holders with non-zero balances
    const tokenHolders = await fetchTokenHolders(connection, tokenMint);
    console.log(`Non-zero accounts: ${tokenHolders.length}`);

    // Step 2: Get associated wallet addresses for each token account
    const holdersWithWallets = await processInBatches(
      tokenHolders,
      BATCH_SIZE,
      async (holder) => {
        try {
          const walletAddress = await getOwnerOfTokenAccount(
            connection,
            holder.tokenAccount
          );
          return {
            tokenAccount: holder.tokenAccount,
            walletAddress: walletAddress,
            balance: holder.balance,
          };
        } catch (error) {
          console.error(`Failed to process ${holder.address}: `, error.message);
          return null;
        }
      }
    );

    console.log("Final data:", holdersWithWallets);

    // Step 3: Save data to a JSON file
    const fileName = `snapshot_${tokenMintAddress}_${snapshotDate}.json`;
    fs.writeFileSync(fileName, JSON.stringify(holdersWithWallets, null, 2));

    console.log(`Snapshot saved to ${fileName}`);
  } catch (error) {
    console.error("Error taking snapshot:", error.message);
    process.exit(1);
  }
}

// Example Usage
const [date, mint] = process.argv.slice(2);
if (!date || !mint) {
  console.error("Usage: node solanashot.js <DATE> <TOKEN_MINT_ADDRESS>");
  process.exit(1);
}

if (!isValidBase58Address(mint)) {
  console.error("Invalid token mint address format.");
  process.exit(1);
}
takeSnapshot(date, mint).catch((error) =>
  console.error("Error taking snapshot:", error)
);
