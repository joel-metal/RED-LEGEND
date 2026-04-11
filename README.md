# RED-LEGEND — Micro-Endowment Check-In Vault on Stellar

[![CI](https://github.com/joel-metal/RED-LEGEND/actions/workflows/ci.yml/badge.svg)](https://github.com/joel-metal/RED-LEGEND/actions/workflows/ci.yml)

A decentralized "Dead Man's Switch" built on Stellar/Soroban smart contracts.

RED-LEGEND is a time-capsule vault where funds (XLM or tokenized assets) are released to a beneficiary only if the owner fails to "check in" via a Passkey-powered interface. It leverages Soroban's State Archival and RED (Time to Live) features to automate asset inheritance — no seed phrase complexity required.

## 🎯 What is RED-LEGEND?

RED-LEGEND turns Stellar's native state archival mechanics into a programmable inheritance trigger. Vault owners:

- Deposit funds into a personal vault contract
- Periodically "check in" to extend the contract's RED and prove liveness
- Designate a beneficiary address for automatic release
- Authenticate exclusively via Passkeys (WebAuthn) — no seed phrases

If the owner stops checking in, the contract's RED expires and the vault automatically releases funds to the beneficiary.

This Soroban implementation makes RED-LEGEND:

✅ Trustless (no executor, lawyer, or coordinator needed)  
✅ Transparent (all vault state and transfers are on-chain)  
✅ Secure (Passkey/WebAuthn authentication, no exposed seed phrases)  
✅ Automated (RED expiry triggers transfer without manual intervention)

---

## �️ Project Structure

```
RED-LEGEND/
├── contracts/
│   └── red_vault/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs       # Contract entry points & logic
│           ├── types.rs     # Data types, storage keys, events
│           └── test.rs      # Full test suite
├── docs/
│   ├── architecture.md      # System design & storage layout
│   └── red-logic.md         # RED expiry & state archival logic
├── scripts/
│   ├── build.sh             # Build contract to WASM
│   ├── test.sh              # Run test suite
│   └── deploy_testnet.sh    # Deploy to Stellar testnet
├── Cargo.toml               # Workspace manifest
├── environments.toml        # Network configurations
├── .env.example             # Environment variable template
└── README.md
```

---

## � Quick Start

### Prerequisites

- Rust (1.70+)
- Soroban CLI
- Stellar CLI

### Build

```bash
./scripts/build.sh
```

### Test

```bash
./scripts/test.sh
```

### Setup Environment

```bash
cp .env.example .env
```

```env
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
CONTRACT_RED_VAULT=<your-contract-id>
REMINDER_EMAIL_API_KEY=<your-key>
REMINDER_SMS_API_KEY=<your-key>
```

### Deploy to Testnet

```bash
stellar keys generate deployer --network testnet
./scripts/deploy_testnet.sh
```

---

## 🎓 Contract API & Code Snippets

### Initialize

```rust
// One-time setup — sets XLM token address and admin
red_vault::initialize(env, xlm_token, admin);
```

### Create a Vault

```rust
// Returns a unique vault_id
// check_in_interval is in seconds (e.g. 604800 = 7 days)
let vault_id = red_vault::create_vault(
    env,
    owner,       // Address — must authorize
    beneficiary, // Address — receives funds on expiry
    604_800u64,  // check_in_interval in seconds
);
```

### Deposit Funds

```rust
// Deposit 10 XLM (in stroops: 1 XLM = 10_000_000)
red_vault::deposit(env, vault_id, from, 100_000_000i128);

// Batch deposit into multiple vaults in one transfer
red_vault::batch_deposit(env, from, vec![
    (vault_id_1, 50_000_000i128),
    (vault_id_2, 50_000_000i128),
]);
```

### Check In (Reset Expiry Timer)

```rust
// Owner proves liveness — resets the RED countdown
red_vault::check_in(env, vault_id, caller)?;
```

### Trigger Release (After Expiry)

```rust
// Anyone can call this once the vault has expired
// Funds are sent to beneficiary (or split by BPS if multi-beneficiary)
red_vault::trigger_release(env, vault_id);
```

### Multi-Beneficiary Split

```rust
// Split funds 70/30 between two beneficiaries
red_vault::set_beneficiaries(env, vault_id, caller, vec![
    BeneficiaryEntry { address: alice, bps: 7_000 },
    BeneficiaryEntry { address: bob,   bps: 3_000 },
])?;
```

### Partial Release

```rust
// Send a portion to beneficiary while keeping vault active
red_vault::partial_release(env, vault_id, 50_000_000i128)?;
```

### Withdraw (Owner)

```rust
// Owner reclaims funds from an active vault
red_vault::withdraw(env, vault_id, caller, 50_000_000i128)?;
```

### Query Vault State

```rust
// Get full vault struct
let vault: Vault = red_vault::get_vault(env, vault_id);

// Check seconds remaining before expiry (None if already expired)
let remaining: Option<u64> = red_vault::get_red_remaining(env, vault_id);

// Check if vault has expired
let expired: bool = red_vault::is_expired(env, vault_id);

// Get release status: Locked | Released | Cancelled
let status: ReleaseStatus = red_vault::get_release_status(env, vault_id);

// List all vault IDs owned by an address (paginated)
let ids: Vec<u64> = red_vault::get_vaults_by_owner(env, owner, None, 0, 10);
```

### Monitor Expiry

```rust
// Emits a warning event if vault is within 24h of expiry
// Returns remaining seconds (0 if expired)
let ttl_secs: u64 = red_vault::ping_expiry(env, vault_id);
```

### Admin Controls

```rust
// Pause / unpause all state-mutating operations
red_vault::pause(env);
red_vault::unpause(env);

// Two-step admin transfer
red_vault::propose_admin(env, new_admin);
red_vault::accept_admin(env); // called by new_admin

// Set global check-in interval bounds
red_vault::set_min_check_in_interval(env, 3_600u64);   // 1 hour min
red_vault::set_max_check_in_interval(env, 31_536_000u64); // 1 year max
```

---

## 📖 Documentation

- [Architecture Overview](docs/architecture.md)
- [RED & State Archival Logic](docs/red-logic.md)
- [Security Policy](SECURITY.md)

---

## 🧪 Testing

```bash
cargo test
```

---

## 🌍 Why This Matters

Over $140 billion in crypto assets are estimated to be permanently lost due to inaccessible wallets. RED-LEGEND provides a trustless, on-chain inheritance mechanism — no executor, no lawyer, no seed phrase exposure.

---

## 📄 License

MIT License — see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Stellar Development Foundation](https://stellar.org) for Soroban
- The WebAuthn/Passkey standards community
