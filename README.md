# GenomeShield - Private Genomic Matching on Solana

Compare genetic markers without exposing raw sequences. Only authorized similarity scores are revealed.

Live Demo: https://genome-shield.vercel.app

Program ID: 2NaVBnwtSzp32CMnhrZw8CWbhj4Ftx3u94zbkLptqbTP (Solana Devnet)

Explorer: https://explorer.solana.com/address/2NaVBnwtSzp32CMnhrZw8CWbhj4Ftx3u94zbkLptqbTP?cluster=devnet

## The Problem

Genomic matching provides critical insights for healthcare, ancestry, and research but requires exposing highly sensitive genetic data. Centralized platforms store raw sequences, creating massive privacy risks. Data breaches expose immutable biological information that cannot be changed like a password.

## The Solution

GenomeShield uses Arcium MPC network to compute genomic similarity on encrypted data. Two users can discover how genetically similar they are without either party, any platform, or any MPC node individually ever seeing raw genetic sequences.

## How Arcium Enables This

### Step 1: Local Hashing
Genomic markers (SNP identifiers like rs1426654, rs12913832) are hashed deterministically in the browser. No raw genetic data ever leaves the client device.

### Step 2: Rescue Cipher Encryption
Hashed markers are encrypted using Arcium Rescue cipher in CTR mode with 128-bit security. A x25519 Diffie-Hellman key exchange derives a shared key between the client and MXE cluster.

### Step 3: MPC Comparison via Arcium
Encrypted profiles are submitted to Arcium ARX node network. Using secret sharing, data is split into random-looking fragments across nodes. The nodes execute the compute_similarity circuit comparing every marker pair without any node learning which markers matched.

### Step 4: Score Only
The circuit returns only a similarity score and match count, encrypted separately per user. Which specific markers matched and all non-matching data remain permanently hidden.

## Privacy Guarantees

- Genomic secrecy: Raw sequences never exist on-chain or in any node memory
- Full-threshold security: ALL ARX nodes would need to collude to break privacy
- Marker-level privacy: Which specific markers matched is never revealed
- Immutable protection: Genetic data cannot be changed if leaked
- Client-side hashing: Raw SNP data never leaves the browser

## Technical Implementation

### Arcis Circuit (encrypted-ixs/src/lib.rs)
- GenomeProfile struct: markers [u128; 16] + count (u8)
- MatchResult struct: similarity_score (u128) + matched_markers (u8) + total_compared (u8)
- Iterates over 16 marker positions with secret-shared equality checks
- Computes similarity as (matched * 10000) / compared for precision
- Returns encrypted results per user

### Solana Program (programs/genome_shield/src/lib.rs)
- initialize: sets up program state
- register_profile: registers genome profile hash on-chain
- init_compute_similarity_comp_def: registers MPC circuit on-chain
- compute_similarity: encrypts and queues via ArgBuilder + queue_computation
- compute_similarity_callback: verified results via SignedComputationOutputs
- Custom accounts: ProgramState, GenomeProfile, ComparisonRecord

### Frontend (app/)
- React + TypeScript + Vite with Anchor SDK
- Real on-chain transactions on Solana Explorer
- Phantom wallet integration with devnet balance
- SNP marker input with local hashing visualization
- Dark biotech UI with DNA marker visualization

## How to Test

1. Install Phantom wallet, switch to Devnet
2. Get devnet SOL from faucet
3. Visit https://genome-shield.vercel.app
4. Connect wallet
5. Click Initialize - real Solana devnet transaction
6. Click Register Profile - registers genome profile on-chain
7. Enter SNP markers and a partner wallet address
8. Click Run Private Comparison
9. View similarity score - raw markers remain encrypted
10. Verify transactions on Solana Explorer

## Deployed on Solana Devnet

- Program: 2NaVBnwtSzp32CMnhrZw8CWbhj4Ftx3u94zbkLptqbTP
- MXE: Successfully initialized with cluster migration
- Demo: https://genome-shield.vercel.app

## Tech Stack

Solana - Arcium - Arcis - Anchor 0.32.1 - React + Vite - Phantom

## License

MIT
