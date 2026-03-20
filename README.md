# GenomeShield — Private Genomic Matching on Solana

> Compare genetic markers without exposing raw sequences. Only authorized similarity scores are revealed — never the underlying data.

**Live Demo:** https://genome-shield.vercel.app  
**Program ID:** [2NaVBnwtSzp32CMnhrZw8CWbhj4Ftx3u94zbkLptqbTP](https://explorer.solana.com/address/2NaVBnwtSzp32CMnhrZw8CWbhj4Ftx3u94zbkLptqbTP?cluster=devnet) (Solana Devnet)

## The Problem

Genomic matching provides critical insights for healthcare, ancestry, and research — but requires exposing highly sensitive genetic data. Centralized platforms store raw sequences, creating massive privacy risks. Data breaches expose immutable biological information that cannot be changed like a password.

## The Solution

GenomeShield uses **Arcium's MPC network** to compute genomic similarity on encrypted data. Two users can discover how genetically similar they are without either party, any platform, or any MPC node individually ever seeing raw genetic sequences.

## How Arcium Enables This

### Step 1: Local Hashing
Genomic markers (SNP identifiers like rs1426654, rs12913832) are hashed deterministically in the user's browser. No raw genetic data ever leaves the client device.

### Step 2: Rescue Cipher Encryption
Hashed markers are encrypted using Arcium's **Rescue cipher** in CTR mode with 128-bit security. A **x25519 Diffie-Hellman key exchange** derives a shared key between the client and MXE cluster. Only the intended MPC cluster can process the data.

### Step 3: MPC Comparison via Arcium
Encrypted profiles are submitted to Arcium's **ARX node network**. Using **secret sharing**, data is split into random-looking fragments across nodes. The nodes execute the `compute_similarity` circuit — comparing every marker pair — without any node learning which markers matched or what the genetic data is.

### Step 4: Score Only
The circuit returns only a similarity score and match count, encrypted separately per user. Which specific markers matched and all non-matching data remain permanently hidden.

### Privacy Guarantees
- **Genomic secrecy:** Raw sequences never exist on-chain or in any node's memory
- **Full-threshold security:** ALL ARX nodes would need to collude to break privacy
- **Marker-level privacy:** Which specific markers matched is never revealed
- **Immutable protection:** Genetic data, unlike passwords, cannot be changed if leaked
- **Client-side hashing:** Raw SNP data never leaves the browser

## Architecture
```
Browser (User)
  |-- Input SNP markers (rs numbers)
  |-- Hash markers locally (deterministic hash)
  |-- Generate x25519 keypair
  |-- Encrypt hashes with Rescue cipher
  v
Solana Program [2NaVBnwtSzp3...on devnet]
  |-- Receive encrypted marker sets from both users
  |-- Build computation arguments via ArgBuilder
  |-- Queue computation to Arcium (queue_computation CPI)
  v
Arcium MPC Cluster (ARX Nodes)
  |-- Convert ciphertexts to secret shares (.to_arcis())
  |-- Execute compute_similarity circuit:
  |   |-- Compare 16 marker positions pairwise
  |   |-- Count matches on secret-shared data
  |   |-- Compute similarity score (matched/compared * 10000)
  |-- Re-encrypt results per user (.from_arcis())
  v
Callback to Solana Program
  |-- Verify signatures (SignedComputationOutputs)
  |-- Emit SimilarityComputedEvent
  v
Browser (User)
  |-- Decrypt similarity score
  |-- Display: score, matched count, compared count
  |-- Non-matching markers remain permanently hidden
```

## Technical Implementation

### Arcis Circuit (encrypted-ixs/src/lib.rs)
The genomic comparison runs inside Arcium's MPC:
- **GenomeProfile struct:** markers [u128; 16] + count (u8)
- **MatchResult struct:** similarity_score (u128) + matched_markers (u8) + total_compared (u8)
- Iterates over 16 marker positions, validates both profiles have data at each position
- Compares marker hashes using secret-shared equality check
- Computes similarity as (matched * 10000) / compared for precision without floating point
- Returns encrypted results per user — no node sees raw markers or match details

### Solana Program (programs/genome_shield/src/lib.rs)
- `initialize` — sets up program state
- `register_profile` — registers user's genome profile hash on-chain
- `init_compute_similarity_comp_def` — registers MPC circuit on-chain
- `compute_similarity` — encrypts and queues comparison via ArgBuilder + queue_computation
- `compute_similarity_callback` — receives verified results via SignedComputationOutputs
- Custom accounts: ProgramState, GenomeProfile, ComparisonRecord

### Frontend (app/)
- React + TypeScript + Vite with Anchor SDK
- Real on-chain transactions (initialize, register profile) on Solana Explorer
- Phantom wallet integration with devnet balance
- SNP marker input with local hashing visualization
- Dark biotech-themed UI with DNA marker visualization
- Similarity score display with progress bar

## Project Structure
```
genome-shield/
├── encrypted-ixs/src/lib.rs       -- Arcis MPC circuit (compute_similarity)
├── programs/genome_shield/
│   └── src/lib.rs                  -- Solana program with Arcium integration
├── build/
│   ├── compute_similarity.arcis    -- Compiled MPC circuit
│   └── compute_similarity.hash     -- Circuit hash for verification
├── app/
│   ├── src/App.tsx                 -- Frontend with on-chain calls
│   ├── src/idl/                    -- Program IDL for Anchor
│   └── src/index.css               -- Dark biotech UI
├── Anchor.toml                     -- Anchor configuration
└── Arcium.toml                     -- Arcium configuration
```

## Build and Deploy
```bash
curl --proto '=https' --tlsv1.2 -sSfL https://install.arcium.com/ | bash
arcium build --skip-keys-sync
anchor build
arcium deploy --cluster-offset 456 --recovery-set-size 4 \
  --keypair-path ~/.config/solana/id.json \
  --rpc-url https://api.devnet.solana.com
cd app && npm install && npm run dev
```

## How to Test

1. Install Phantom wallet, switch to Devnet
2. Get devnet SOL from faucet
3. Visit https://genome-shield.vercel.app
4. Connect wallet
5. Click "Initialize" — real Solana devnet transaction
6. Click "Register Profile" — registers your genome profile on-chain
7. Enter SNP markers and a partner's wallet address
8. Click "Run Private Comparison"
9. View similarity score — raw markers remain encrypted
10. Verify transactions on Solana Explorer

## Deployed on Solana Devnet

- **Program:** 2NaVBnwtSzp32CMnhrZw8CWbhj4Ftx3u94zbkLptqbTP
- **MXE:** Successfully initialized with cluster migration
- **Explorer:** https://explorer.solana.com/address/2NaVBnwtSzp32CMnhrZw8CWbhj4Ftx3u94zbkLptqbTP?cluster=devnet
- **Demo:** https://genome-shield.vercel.app

## Tech Stack

Solana · Arcium · Arcis · Anchor 0.32.1 · React + Vite · Phantom

## License

MIT
