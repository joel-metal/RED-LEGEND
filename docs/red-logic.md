# RED & State Archival Logic

## How RED Works

Each vault tracks `last_check_in` and `check_in_interval` (seconds). When `current_time >= last_check_in + check_in_interval`, the vault is expired.

## Check-In Flow

1. Owner calls `check_in(vault_id)`
2. Contract updates `last_check_in` to current timestamp

## Release Flow

1. Anyone calls `trigger_release(vault_id)`
2. If expired: transfers funds to beneficiary
3. If not: returns `ContractError::NotExpired`
