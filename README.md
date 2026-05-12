# RED-LEGEND — Trustless Dead Man's Switch on Stellar

[![CI](https://github.com/joel-metal/RED-LEGEND/actions/workflows/ci.yml/badge.svg)](https://github.com/joel-metal/RED-LEGEND/actions/workflows/ci.yml)

**Your crypto. Your rules. Even after you're gone.**

RED-LEGEND is a Soroban smart contract that holds XLM in a time-locked vault. The owner must periodically "check in" to prove they're alive. If they stop checking in, anyone can trigger the release and funds go automatically to the designated beneficiaries — no lawyers, no executors, no seed phrase exposure.

---

## What it does (plain English)

1. **Lock** — You deposit XLM into a personal vault and name a beneficiary.
2. **Check In** — Every N days you tap a button (signed with your Passkey) to reset the countdown.
3. **Release** — If you miss your check-in window, the vault expires and anyone can trigger the transfer to your beneficiary.

No trusted third party is involved at any step. The contract enforces the rules.

---

## Architecture

```
Owner ──► deposit()  ──► VaultState (Persistent Storage, keyed by vault_id)
Owner ──► check_in() ──► resets last_check_in timestamp
                              │
                              ▼
                    deadline = last_check_in + check_in_interval
                              │
                    now >= deadline?
                         │         │
                        YES        NO
                         │         │
                         ▼         ▼
Anyone ──► trigger_release()    (vault still active)
                │
                ▼
     Transfer balance to beneficiaries
     (proportional to BPS split)
```

### Storage type decisions

| Data | Storage type | Why |
|---|---|---|
| Admin, token address, paused flag, interval bounds | **Instance** | Global config; cheap to read; one entry for the whole contract |
| Per-vault state (`VaultState`) | **Persistent**, keyed by `vault_id` | One ledger entry per vault — enables parallel execution, no contention |
| Owner → vault ID index | **Persistent**, keyed by owner address | Must survive across ledger closings; queried infrequently |
| Beneficiary → vault ID index | **Persistent**, keyed by beneficiary address | Same rationale as owner index |
| Nothing | **Temporary** | No vault or balance data is stored in Temporary storage |

Reference: [Stellar Docs — State Archival](https://developers.stellar.org/docs/learn/encyclopedia/storage/state-archival)

---

## Why expiry is timestamp-based, not TTL-based

The Stellar docs explicitly state:

> "Entry TTL exhaustion should **never** be relied on for functionality or safety."

Anyone on the network can call `ExtendFootprintTTLOp` on any ledger entry without authorization, silently keeping a vault alive forever. RED-LEGEND therefore uses **ledger timestamps** stored inside contract state:

```rust
// is_expired() — the only expiry check in the contract
pub fn is_expired(env: Env, vault_id: u64) -> bool {
    let vault = Self::load_vault(&env, vault_id);
    env.ledger().timestamp() >= vault.last_check_in + vault.check_in_interval
}
```

TTL (`extend_ttl`) is used **only** to keep ledger entries from being archived — never as a trigger condition.

---

## TTL maintenance

The contract instance and vault entries must be periodically refreshed to avoid archival.

| Entry | TTL | Who refreshes |
|---|---|---|
| Contract instance | 30–365 days | `extend_contract_ttl()` — permissionless, run monthly |
| Vault entries | Refreshed on every mutation | Automatic — every `deposit`, `check_in`, `withdraw`, etc. calls `extend_ttl` |

**Run monthly via cron:**
```bash
0 0 1 * * /path/to/scripts/extend-ttl.sh
```

---

## Deploy on testnet

```bash
# 1. Generate a deployer key
stellar keys generate deployer --network testnet

# 2. Fund it
stellar keys fund deployer --network testnet

# 3. Copy and fill in .env
cp .env.example .env

# 4. Deploy + initialize
./scripts/deploy.sh
```

The script builds the WASM, deploys, initializes the contract, sets interval bounds, and writes `CONTRACT_RED_VAULT` to `.env` and `VITE_CONTRACT_ID` to `frontend/.env`.

---

## Run tests

```bash
cargo test
```

Tests are organized into modules in `contracts/red_vault/src/test.rs`:

| Module | What it covers |
|---|---|
| `core_happy_paths` | initialize, create_vault, deposit, check_in, trigger_release, withdraw |
| `expiry_and_timing` | is_expired, timestamp simulation, deadline math, double-release |
| `multi_beneficiary` | set_beneficiaries, BPS splits, dust handling |
| `partial_release` | partial transfers, balance checks, expiry guard |
| `admin_controls` | pause/unpause, two-step admin transfer, interval bounds |
| `storage_and_ttl` | separate persistent entries, extend_contract_ttl |
| `edge_cases` | zero amounts, invalid intervals, pagination, uniqueness |

---

## Run frontend

```bash
cd frontend
cp .env.example .env
# Set VITE_CONTRACT_ID in frontend/.env
npm install
npm run dev
```

Frontend stack: React 18 + TypeScript + Vite + TailwindCSS + `@stellar/stellar-sdk` + `@simplewebauthn/browser`.

---

## Security model

**What the contract can do:**
- Hold and transfer XLM on behalf of the vault owner
- Release funds to beneficiaries after the check-in deadline passes
- Enforce BPS splits with integer arithmetic (last beneficiary absorbs rounding dust)

**What the contract cannot do:**
- Know whether the owner is actually dead (no oracle)
- Prevent the owner from withdrawing funds before expiry
- Prevent a beneficiary from immediately re-depositing funds elsewhere

**Auth model:**
- `deposit`, `check_in`, `withdraw`, `partial_release`, `set_beneficiaries` — require vault owner auth
- `trigger_release` — permissionless (anyone can call on an expired vault)
- `pause`, `unpause`, `propose_admin`, `set_*_interval` — require admin auth
- `extend_contract_ttl` — permissionless

See [SECURITY.md](SECURITY.md) for the responsible disclosure policy.

---

## Project structure

```
RED-LEGEND/
├── contracts/red_vault/src/
│   ├── lib.rs       # Contract entry points, all public functions
│   ├── types.rs     # DataKey, Vault, BeneficiaryEntry, events
│   └── test.rs      # 54 tests across 7 modules
├── frontend/        # React + TypeScript + Vite frontend
├── scripts/
│   ├── deploy.sh        # Build, deploy, initialize
│   ├── extend-ttl.sh    # Monthly TTL refresh
│   └── monitor.sh       # Vault expiry monitoring + webhook alerts
├── .env.example
└── README.md
```

---

## Known limitations & roadmap

- **No on-chain reminder system** — the frontend polls for expiry; a separate off-chain cron job is needed for email/SMS reminders
- **Testnet only** — no security audit has been performed; do not use on mainnet
- **No oracle** — the contract cannot verify real-world death; it only enforces the check-in deadline
- **Passkey signing** — currently uses WebAuthn as a UX gate with Freighter for actual Stellar signing; full P-256 native signing requires a secp256r1 verifier contract

---

## License

MIT — see [LICENSE](LICENSE).
