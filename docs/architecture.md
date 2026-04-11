# RED-LEGEND — Architecture Overview

## System Components

### Smart Contract (Soroban)

**red_vault** — The sole on-chain component. Manages the full vault lifecycle: creation, deposits, check-ins, withdrawals, expiry detection, and fund release to beneficiaries.

Built with `soroban-sdk` targeting `wasm32-unknown-unknown`. No external dependencies beyond the SDK.

---

## Contract: `red_vault`

### Entry Points

| Function | Caller | Description |
|---|---|---|
| `initialize` | Admin | One-time setup: sets XLM token address, admin, version |
| `pause` / `unpause` | Admin | Halts / resumes all state-mutating operations |
| `set_min_check_in_interval` | Admin | Sets lower bound for vault check-in intervals |
| `set_max_check_in_interval` | Admin | Sets upper bound for vault check-in intervals |
| `propose_admin` / `accept_admin` | Admin / Pending | Two-step admin transfer |
| `upgrade` | Admin | Upgrades contract WASM hash |
| `create_vault` | Owner | Creates a new vault with a beneficiary and check-in interval |
| `deposit` | Anyone | Deposits XLM into a vault |
| `batch_deposit` | Anyone | Deposits into multiple vaults in one token transfer |
| `check_in` | Owner | Resets the vault expiry timer |
| `withdraw` | Owner | Withdraws funds back to owner |
| `partial_release` | Owner | Sends a portion of funds to beneficiary without releasing the vault |
| `set_beneficiaries` | Owner | Configures multi-beneficiary BPS splits |
| `trigger_release` | Anyone | Releases all funds to beneficiary/beneficiaries after expiry |
| `cancel_vault` | Owner | Cancels vault and refunds owner |
| `ping_expiry` | Anyone | Emits a warning event if vault is within 24h of expiry |
| `transfer_ownership` | Owner | Transfers vault ownership to a new address |

---

## Data Flow

```
Admin → initialize()
  └─ Sets token, admin, version in instance storage

Owner → create_vault(beneficiary, interval)
  └─ Vault stored in persistent storage
  └─ Owner + beneficiary indexes updated
  └─ VaultCount incremented atomically

Owner → deposit(vault_id, amount)
  └─ XLM transferred from caller to contract
  └─ vault.balance incremented

Owner → check_in(vault_id)
  └─ vault.last_check_in = current timestamp
  └─ RED countdown resets

  [Time passes, no check-in]

Anyone → trigger_release(vault_id)
  └─ Checks: current_time >= last_check_in + check_in_interval
  └─ Transfers vault.balance to beneficiary (or splits by BPS)
  └─ vault.status = Released
```

---

## Storage Layout

Soroban provides three storage tiers used as follows:

| Tier | Keys | RED Policy |
|---|---|---|
| Instance | `Admin`, `TokenAddress`, `Paused`, `Version`, `PendingAdmin`, `MinCheckInInterval`, `MaxCheckInInterval` | Extended on every mutating call (`200_000` ledgers) |
| Persistent | `Vault(id)`, `VaultCount`, `OwnerVaults(addr)`, `BeneficiaryVaults(addr)` | Extended on vault creation, check-in, deposit, withdraw. Sized to `2× check_in_interval`, capped at Soroban max (~180 days) |
| Temporary | — | Not used |

---

## Core Data Types

### `Vault`

```rust
pub struct Vault {
    pub owner: Address,
    pub beneficiary: Address,       // primary (single-beneficiary path)
    pub balance: i128,              // in stroops (1 XLM = 10_000_000)
    pub check_in_interval: u64,     // seconds between required check-ins
    pub last_check_in: u64,         // unix timestamp of last check-in
    pub created_at: u64,
    pub status: ReleaseStatus,      // Locked | Released | Cancelled
    pub beneficiaries: Vec<BeneficiaryEntry>, // empty = use primary beneficiary
    pub metadata: String,           // max 256 chars, label or IPFS hash
}
```

### `BeneficiaryEntry`

```rust
pub struct BeneficiaryEntry {
    pub address: Address,
    pub bps: u32,  // basis points; all entries must sum to 10_000
}
```

### `ReleaseStatus`

```
Locked → Released   (via trigger_release)
Locked → Cancelled  (via cancel_vault)
```

---

## RED & Expiry Logic

A vault is considered expired when:

```
current_ledger_timestamp >= vault.last_check_in + vault.check_in_interval
```

Persistent storage RED is computed as:

```rust
fn vault_red_ledgers(check_in_interval: u64) -> u32 {
    let ledgers = (check_in_interval as u32).saturating_mul(2) / 5; // 5s per ledger
    ledgers.clamp(200_000, 3_110_400) // floor ~11.6 days, cap ~180 days
}
```

The 2× buffer ensures vault data stays accessible for at least one full interval after the last check-in.

---

## Multi-Beneficiary Release

When `beneficiaries` is non-empty, `trigger_release` and `partial_release` split funds by BPS:

- Each beneficiary receives `total * bps / 10_000`
- The last entry absorbs any rounding dust to ensure full distribution
- Single-beneficiary path (empty `beneficiaries`) sends 100% to `vault.beneficiary`

---

## Events

| Topic | Payload | Emitted by |
|---|---|---|
| `v_created` | `(vault_id, owner, beneficiary, interval, timestamp)` | `create_vault` |
| `deposit` | `(amount, new_balance)` | `deposit` |
| `withdraw` | `(amount, new_balance)` | `withdraw` |
| `check_in` | `last_check_in` | `check_in` |
| `release` | `ReleaseEvent { vault_id, beneficiary, amount }` | `trigger_release` |
| `partial` | `(beneficiary, amount)` | `partial_release` |
| `cancel` | `vault_id` | `cancel_vault` |
| `ping_exp` | `red_remaining` | `ping_expiry` (only when < 24h) |
| `own_xfer` | `(vault_id, old_owner, new_owner)` | `transfer_ownership` |

---

## Error Codes

| Code | Value | Meaning |
|---|---|---|
| `AlreadyInitialized` | 1 | `initialize` called twice |
| `InvalidInterval` | 2 | Interval is 0 or outside min/max bounds |
| `VaultNotFound` | 3 | No vault exists for given ID |
| `EmptyVault` | 4 | Release attempted on zero-balance vault |
| `InvalidAmount` | 5 | Amount ≤ 0 |
| `NotOwner` | 6 | Caller is not the vault owner |
| `AlreadyReleased` | 7 | Vault is not in `Locked` status |
| `InsufficientBalance` | 8 | Vault balance < requested amount |
| `NotAdmin` | 9 | Caller is not the admin |
| `Paused` | 10 | Contract is paused |
| `NoPendingAdmin` | 11 | `accept_admin` called with no pending transfer |
| `InvalidBps` | 12 | BPS entries don't sum to 10,000 |
| `NotExpiringSoon` | 13 | `ping_expiry` called but vault is not near expiry |
| `IntervalTooLow` | 14 | Interval below configured minimum |
| `IntervalTooHigh` | 15 | Interval above configured maximum |
| `NotExpired` | 16 | `trigger_release` called before expiry |
| `InvalidBeneficiary` | 17 | Owner set as their own beneficiary |
| `BalanceOverflow` | 18 | Deposit would overflow `i128` |
| `VaultExpired` | 19 | Deposit/partial_release on an expired vault |
| `InvalidAdmin` | 20 | Token address equals admin address |
| `NotInitialized` | 21 | Contract not yet initialized |

---

## Security Model

- All owner actions require `owner.require_auth()` — enforced by Soroban's auth framework
- Admin actions require `require_admin()` which checks storage and calls `require_auth()`
- Admin transfer is two-step (propose + accept) to prevent accidental lockout
- Pause mechanism blocks all state-mutating operations instantly
- Vault expiry check on `deposit` prevents funding a vault that can no longer be saved
- BPS validation ensures 100% distribution with no funds left stranded in the contract
