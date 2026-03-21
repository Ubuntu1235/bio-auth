# BioAuth - Private Biometric Authentication on Solana

Privacy-preserving biometric login powered by Arcium MPC. Templates are secret-shared and matching runs privately. Apps learn only match or no-match.

Live Demo: https://musical-tapioca-e660ec.netlify.app

Program ID: 4rfPEFE5wSfqQMG7bw5MqPrwA9KSsYsi5sVaWRsY1ShU (Solana Devnet)

Explorer: https://explorer.solana.com/address/4rfPEFE5wSfqQMG7bw5MqPrwA9KSsYsi5sVaWRsY1ShU?cluster=devnet

## The Problem

Biometric auth today is device-siloed and vendor-locked. Templates stored on centralized servers create catastrophic breach risks. Unlike passwords, biometric data cannot be changed if compromised.

## The Solution

BioAuth uses Arcium MPC to perform biometric matching on encrypted data. Templates are secret-shared across ARX nodes. The verify_biometric circuit compares feature vectors without any node seeing the raw biometric data. Apps receive only match or no-match.

## How Arcium Enables This

Step 1: Templates encrypted with Rescue cipher via x25519 key exchange. Raw biometric data never leaves the device.

Step 2: Encrypted templates submitted to Arcium ARX nodes. Using secret sharing, each node sees only random fragments.

Step 3: verify_biometric circuit compares 8 feature vectors on secret-shared data. 70 percent similarity threshold checked entirely inside MPC.

Step 4: Only boolean match/no-match result returned. Similarity scores, feature vectors, and raw data remain permanently hidden.

## Privacy Guarantees

- Template secrecy: Raw biometric data never exists on-chain or in any node
- Vendor agnostic: Works across devices without hardware dependency
- Portable identity: Same encrypted template usable across apps
- Full-threshold security: ALL ARX nodes must collude to break privacy
- Immutable protection: Biometric data cannot be changed if leaked

## Technical Implementation

### Arcis Circuit (encrypted-ixs/src/lib.rs)
- BiometricTemplate: features [u128; 8] + count (u8)
- AuthResult: is_match (u8) + similarity (u128) + compared (u8)
- Compares 8 feature positions with secret-shared equality checks
- Similarity = (matched * 10000) / compared
- 70 percent threshold: is_match = 1 if similarity >= 7000

### Solana Program (programs/bio_auth/src/lib.rs)
- initialize: program state
- register_identity: register biometric template hash on-chain
- init_verify_biometric_comp_def: register MPC circuit
- verify_biometric: encrypt and queue via ArgBuilder + queue_computation
- verify_biometric_callback: verified via SignedComputationOutputs
- Accounts: ProgramState, Identity, AuthLog

### Integration Test (tests/bio_auth.ts)
Full MPC flow using Arcium client SDK:
- Real Rescue cipher encryption with x25519 key exchange
- Real queue_computation call to Arcium MPC network
- Real awaitComputationFinalization for MPC result
- Uses getMXEPublicKey, RescueCipher, serializeLE from arcium-hq/client

### Frontend (app/)
- React + TypeScript + Vite with Anchor SDK
- Real on-chain transactions (initialize, register identity)
- Biometric scan animation with feature grid visualization
- Stacks-inspired warm dark UI
- Phantom wallet integration

## How to Test

1. Install Phantom wallet, switch to Devnet
2. Get devnet SOL from faucet
3. Visit https://musical-tapioca-e660ec.netlify.app
4. Connect wallet
5. Click Initialize - real Solana devnet transaction
6. Click Register Template - registers biometric identity on-chain
7. Select a template and click Verify Identity via MPC
8. Watch biometric scan and MPC verification progress
9. Verify transactions on Solana Explorer

For full MPC flow: arcium test --cluster devnet

## Deployed on Solana Devnet

- Program: 4rfPEFE5wSfqQMG7bw5MqPrwA9KSsYsi5sVaWRsY1ShU
- MXE: Successfully initialized with cluster migration
- Demo: https://musical-tapioca-e660ec.netlify.app

## Tech Stack

Solana - Arcium - Arcis - Anchor 0.32.1 - React + Vite - Phantom

## License

MIT
