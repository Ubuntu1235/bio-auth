# CipherGate - Decentralized Access Control on Solana

Encrypted key management, policies, and licensing enforced via Arcium MPC over arbitrary storage (IPFS/S3/Arweave).

**Live Demo:** https://cipher-gate.vercel.app
**Program ID:** [2mytDh5J6gN1BAyrwgGfdrCPHAe6v6BbGTbTDANVQXKP](https://explorer.solana.com/address/2mytDh5J6gN1BAyrwgGfdrCPHAe6v6BbGTbTDANVQXKP?cluster=devnet) (Solana Devnet)

## The Problem

Apps need cryptographic access control without trusted servers. Traditional key management relies on centralized gatekeepers who can be compromised, coerced, or corrupted. Encrypted data on IPFS or S3 is useless without secure, policy-driven key distribution.

## The Solution

CipherGate uses **Arcium MPC** to enforce access policies in encrypted shared state. Keys, policies, metering, and licensing are evaluated inside the MPC network. Decryption key fragments are released only when all conditions pass - no single server or node controls access.

## How Arcium Enables This

### Step 1: Encrypted Access Request
The requester encrypts their identity, resource ID, timestamp, and payment amount using Arcium Rescue cipher with x25519 key exchange. The request never exists in plaintext on-chain.

### Step 2: Encrypted Policy Evaluation
Access policies (allowed users, expiry times, minimum payments, revocation status) are encrypted and submitted to Arcium ARX nodes. Using secret sharing, each node sees only random fragments.

### Step 3: MPC Policy Check
The check_access circuit evaluates all conditions on secret-shared data: user identity match, time-bound validity, payment sufficiency, and revocation status. No single node learns the policies or the request details.

### Step 4: Conditional Key Release
Only if ALL conditions pass, a decryption key fragment is generated and returned encrypted to the requester. If any check fails, no key material is released. The decision is cryptographically enforced.

## Privacy Guarantees

- **Policy secrecy:** Access rules never visible to any single party
- **Request privacy:** Who accesses what is hidden from MPC nodes
- **Conditional release:** Key fragments only on full policy match
- **Revocation support:** Instant access revocation via on-chain flag
- **Storage agnostic:** Works with IPFS, S3, Arweave, or any storage
- **Full-threshold security:** ALL ARX nodes must collude to break privacy

## Technical Implementation

### Arcis Circuit (encrypted-ixs/src/lib.rs)
- AccessRequest: requester_id, resource_id, timestamp, payment_amount (all u128)
- AccessPolicy: resource_id, owner_id, allowed_users[8], expiry_times[8], min_payments[8], policy_count, revoked[8]
- AccessResult: granted (u8), decryption_key_fragment (u128), policy_index (u8), reason_code (u8)
- Iterates 8 policy slots checking: user match, expiry, payment, revocation
- Returns key fragment only when all conditions pass

### Solana Program (programs/cipher_gate/src/lib.rs)
- initialize: program state setup
- register_resource: register encrypted resource with URI and storage type
- add_policy: add access policy (allowed user, expiry, min payment)
- revoke_access: instant policy revocation
- check_access: encrypted policy evaluation via ArgBuilder + queue_computation
- check_access_callback: verified results via SignedComputationOutputs
- Custom accounts: ProgramState, Resource, AccessLog

### Frontend (app/)
- React + TypeScript + Vite with Anchor SDK
- Real on-chain transactions (initialize, register resource)
- Industrial brutalist UI with monospace typography
- Resource management with IPFS/S3/Arweave support
- MPC access check visualization with progress

## How to Test

1. Install Phantom wallet, switch to Devnet
2. Get devnet SOL from faucet
3. Visit https://cipher-gate.vercel.app
4. Connect wallet
5. Click INITIALIZE - real Solana devnet transaction
6. Click + RESOURCE to register an encrypted resource
7. Select a resource, click REQUEST ACCESS VIA MPC
8. Watch policy evaluation progress
9. Verify transactions on Solana Explorer

## Deployed on Solana Devnet

- Program: 2mytDh5J6gN1BAyrwgGfdrCPHAe6v6BbGTbTDANVQXKP
- MXE: Successfully initialized with cluster migration
- Explorer: https://explorer.solana.com/address/2mytDh5J6gN1BAyrwgGfdrCPHAe6v6BbGTbTDANVQXKP?cluster=devnet
- Demo: https://cipher-gate.vercel.app

## Tech Stack

Solana - Arcium - Arcis - Anchor 0.32.1 - React + Vite - Phantom

## License

MIT
