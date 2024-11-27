# SolanaShot

A Node.js app to retrieve a snapshot of token holders from Solana blockchain

## Usage

`node solanashot.js "2024-11-01" "TOKEN_MINT_ADDRESS_HERE"`

## Requirements

- [@solana/web3.js](https://www.npmjs.com/package/@solana/web3.js)

- A premium RPC provider such as (Public Solana RPC will not work):
  - [Helius](https://www.helius.dev) - Works with FREE plan
  - [Alchemy](https://www.alchemy.com) - Does not work with FREE plan
  - [QuickNode](https://www.quicknode.com) - Not tested with FREE plan

## Installation

1. Clone repository to working directory

2. Run `npm install`

3. Set up `.env` file with `SOLANA_RPC_URL` set to the RPC URL from your provider

## Author

[Patrick S. Davis](https://x.com/PatrionDigital)
