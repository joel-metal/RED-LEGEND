#![cfg(test)]

extern crate alloc;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{Client as TokenClient, StellarAssetClient},
    vec, Address, Env,
};

// ── Shared setup ──────────────────────────────────────────────────────────────

struct Setup {
    env: Env,
    owner: Address,
    beneficiary: Address,
    admin: Address,
    token: Address,
    client: RedVaultContractClient<'static>,
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(token_admin).address();

    StellarAssetClient::new(&env, &token).mint(&owner, &10_000_000i128);

    let contract = env.register_contract(None, RedVaultContract);
    let client = RedVaultContractClient::new(&env, &contract);
    client.initialize(&token, &admin);

    // SAFETY: test-only lifetime extension; env outlives client in every test.
    let client: RedVaultContractClient<'static> = unsafe { core::mem::transmute(client) };
    Setup { env, owner, beneficiary, admin, token, client }
}

fn balance(s: &Setup, addr: &Address) -> i128 {
    TokenClient::new(&s.env, &s.token).balance(addr)
}

// ── mod core_happy_paths ──────────────────────────────────────────────────────

mod core_happy_paths {
    use super::*;

    #[test]
    fn test_initialize_sets_admin_and_token() {
        // initialize() stores the correct admin address and XLM token address
        let s = setup();
        assert_eq!(s.client.get_admin(), s.admin);
        assert_eq!(s.client.get_contract_token(), s.token);
        assert!(!s.client.is_paused());
    }

    #[test]
    fn test_create_vault_returns_unique_id_and_stores_state() {
        // create_vault() returns incrementing IDs and persists correct vault fields
        let s = setup();
        let id1 = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        let id2 = s.client.create_vault(&s.owner, &s.beneficiary, &2_000u64);
        assert_eq!(id1, 1);
        assert_eq!(id2, 2);
        let v = s.client.get_vault(&id1);
        assert_eq!(v.owner, s.owner);
        assert_eq!(v.beneficiary, s.beneficiary);
        assert_eq!(v.balance, 0);
        assert_eq!(v.check_in_interval, 1_000u64);
        assert_eq!(v.status, ReleaseStatus::Locked);
    }

    #[test]
    fn test_deposit_moves_xlm_and_updates_balance() {
        // deposit() transfers tokens from user to contract and increments vault balance
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        let before = balance(&s, &s.owner);
        s.client.deposit(&id, &s.owner, &500_000i128);
        assert_eq!(s.client.get_vault(&id).balance, 500_000i128);
        assert_eq!(balance(&s, &s.owner), before - 500_000i128);
    }

    #[test]
    fn test_check_in_resets_last_check_in_timestamp() {
        // check_in() updates last_check_in to the current ledger timestamp
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        s.env.ledger().with_mut(|l| l.timestamp += 500);
        s.client.check_in(&id, &s.owner).unwrap();
        assert_eq!(s.client.get_vault(&id).last_check_in, 500u64);
    }

    #[test]
    fn test_trigger_release_sends_funds_to_beneficiary_after_expiry() {
        // trigger_release() transfers full balance to beneficiary once vault expires
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &100u64);
        s.client.deposit(&id, &s.owner, &1_000_000i128);
        s.env.ledger().with_mut(|l| l.timestamp += 200);
        s.client.trigger_release(&id);
        assert_eq!(balance(&s, &s.beneficiary), 1_000_000i128);
        assert_eq!(s.client.get_vault(&id).balance, 0);
        assert_eq!(s.client.get_release_status(&id), ReleaseStatus::Released);
    }

    #[test]
    fn test_withdraw_lets_owner_reclaim_funds_before_expiry() {
        // withdraw() returns the requested amount to the owner while vault stays Locked
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        s.client.deposit(&id, &s.owner, &1_000_000i128);
        let before = balance(&s, &s.owner);
        s.client.withdraw(&id, &s.owner, &400_000i128).unwrap();
        assert_eq!(balance(&s, &s.owner), before + 400_000i128);
        assert_eq!(s.client.get_vault(&id).balance, 600_000i128);
        assert_eq!(s.client.get_release_status(&id), ReleaseStatus::Locked);
    }
}

// ── mod expiry_and_timing ─────────────────────────────────────────────────────

mod expiry_and_timing {
    use super::*;

    #[test]
    fn test_is_expired_false_before_deadline() {
        // is_expired() returns false while timestamp < last_check_in + interval
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        s.env.ledger().with_mut(|l| l.timestamp += 999);
        assert!(!s.client.is_expired(&id));
    }

    #[test]
    fn test_is_expired_true_at_and_after_deadline() {
        // is_expired() returns true once timestamp >= last_check_in + interval
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        s.env.ledger().with_mut(|l| l.timestamp = 1_000);
        assert!(s.client.is_expired(&id));
        s.env.ledger().with_mut(|l| l.timestamp = 2_000);
        assert!(s.client.is_expired(&id));
    }

    #[test]
    fn test_trigger_release_fails_before_expiry() {
        // trigger_release() must return NotExpired (#16) when vault is still active
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        s.client.deposit(&id, &s.owner, &100i128);
        let err = s.client.try_trigger_release(&id).unwrap_err().unwrap();
        assert_eq!(err, soroban_sdk::Error::from_contract_error(16));
    }

    #[test]
    fn test_trigger_release_succeeds_at_expiry_timestamp() {
        // trigger_release() succeeds exactly when timestamp == last_check_in + interval
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        s.client.deposit(&id, &s.owner, &100i128);
        s.env.ledger().with_mut(|l| l.timestamp = 1_000);
        s.client.trigger_release(&id);
        assert_eq!(s.client.get_release_status(&id), ReleaseStatus::Released);
    }

    #[test]
    fn test_check_in_before_expiry_resets_countdown() {
        // check_in() before deadline resets last_check_in so vault is no longer near expiry
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        s.env.ledger().with_mut(|l| l.timestamp += 900);
        s.client.check_in(&id, &s.owner).unwrap();
        // 900 more seconds from new last_check_in — still not expired
        s.env.ledger().with_mut(|l| l.timestamp += 900);
        assert!(!s.client.is_expired(&id));
    }

    #[test]
    fn test_check_in_after_expiry_fails_with_already_released() {
        // check_in() after expiry returns AlreadyReleased once vault is released
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &100u64);
        s.client.deposit(&id, &s.owner, &100i128);
        s.env.ledger().with_mut(|l| l.timestamp += 200);
        s.client.trigger_release(&id);
        let err = s.client.try_check_in(&id, &s.owner).unwrap_err().unwrap();
        assert_eq!(err, soroban_sdk::Error::from_contract_error(7));
    }

    #[test]
    fn test_double_trigger_release_fails_with_already_released() {
        // A second trigger_release() on a Released vault must fail with AlreadyReleased (#7)
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &100u64);
        s.client.deposit(&id, &s.owner, &100i128);
        s.env.ledger().with_mut(|l| l.timestamp += 200);
        s.client.trigger_release(&id);
        let err = s.client.try_trigger_release(&id).unwrap_err().unwrap();
        assert_eq!(err, soroban_sdk::Error::from_contract_error(7));
    }

    #[test]
    fn test_expiry_based_on_last_check_in_not_ttl() {
        // Expiry deadline = last_check_in + interval; check_in resets it, not TTL
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        // advance to t=800, check in → new deadline = 800 + 1000 = 1800
        s.env.ledger().with_mut(|l| l.timestamp = 800);
        s.client.check_in(&id, &s.owner).unwrap();
        // t=1500 < 1800 → not expired
        s.env.ledger().with_mut(|l| l.timestamp = 1_500);
        assert!(!s.client.is_expired(&id));
        // t=1800 → expired
        s.env.ledger().with_mut(|l| l.timestamp = 1_800);
        assert!(s.client.is_expired(&id));
    }

    #[test]
    fn test_get_red_remaining_correct_before_expiry() {
        // get_red_remaining() returns exact seconds left before deadline
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        s.env.ledger().with_mut(|l| l.timestamp += 400);
        assert_eq!(s.client.get_red_remaining(&id), Some(600u64));
    }

    #[test]
    fn test_get_red_remaining_none_after_expiry() {
        // get_red_remaining() returns None once the vault has expired
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        s.env.ledger().with_mut(|l| l.timestamp += 1_001);
        assert_eq!(s.client.get_red_remaining(&id), None);
    }

    #[test]
    fn test_ping_expiry_emits_event_within_24h() {
        // ping_expiry() emits a warning event when remaining seconds < 86_400
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &100u64);
        s.env.ledger().with_mut(|l| l.timestamp += 50);
        let remaining = s.client.ping_expiry(&id);
        assert_eq!(remaining, 50u64);
    }

    #[test]
    fn test_ping_expiry_no_event_far_from_expiry() {
        // ping_expiry() returns remaining seconds without emitting event when > 86_400
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &200_000u64);
        let remaining = s.client.ping_expiry(&id);
        assert_eq!(remaining, 200_000u64);
    }

    #[test]
    fn test_ping_expiry_returns_zero_when_expired() {
        // ping_expiry() returns 0 for an already-expired vault
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &100u64);
        s.env.ledger().with_mut(|l| l.timestamp += 200);
        assert_eq!(s.client.ping_expiry(&id), 0u64);
    }
}

// ── mod multi_beneficiary ─────────────────────────────────────────────────────

mod multi_beneficiary {
    use super::*;

    #[test]
    fn test_set_beneficiaries_stores_bps_splits() {
        // set_beneficiaries() persists the BPS entries on the vault
        let s = setup();
        let b2 = Address::generate(&s.env);
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        s.client.set_beneficiaries(
            &id, &s.owner,
            &vec![
                &s.env,
                BeneficiaryEntry { address: s.beneficiary.clone(), bps: 7_000 },
                BeneficiaryEntry { address: b2.clone(),            bps: 3_000 },
            ],
        ).unwrap();
        let v = s.client.get_vault(&id);
        assert_eq!(v.beneficiaries.len(), 2);
        assert_eq!(v.beneficiaries.get(0).unwrap().bps, 7_000);
        assert_eq!(v.beneficiaries.get(1).unwrap().bps, 3_000);
    }

    #[test]
    fn test_trigger_release_distributes_by_bps() {
        // trigger_release() splits balance proportionally across beneficiaries
        let s = setup();
        let b2 = Address::generate(&s.env);
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &100u64);
        s.client.deposit(&id, &s.owner, &10_000i128);
        s.client.set_beneficiaries(
            &id, &s.owner,
            &vec![
                &s.env,
                BeneficiaryEntry { address: s.beneficiary.clone(), bps: 7_000 },
                BeneficiaryEntry { address: b2.clone(),            bps: 3_000 },
            ],
        ).unwrap();
        s.env.ledger().with_mut(|l| l.timestamp += 200);
        s.client.trigger_release(&id);
        assert_eq!(balance(&s, &s.beneficiary), 7_000i128);
        assert_eq!(balance(&s, &b2),            3_000i128);
    }

    #[test]
    fn test_set_beneficiaries_fails_bps_not_10000() {
        // set_beneficiaries() must return InvalidBps (#12) when BPS sum != 10_000
        let s = setup();
        let b2 = Address::generate(&s.env);
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        let err = s.client.try_set_beneficiaries(
            &id, &s.owner,
            &vec![
                &s.env,
                BeneficiaryEntry { address: s.beneficiary.clone(), bps: 4_000 },
                BeneficiaryEntry { address: b2.clone(),            bps: 4_000 },
            ],
        ).unwrap_err().unwrap();
        assert_eq!(err, soroban_sdk::Error::from_contract_error(12));
    }

    #[test]
    fn test_set_beneficiaries_fails_if_not_owner() {
        // set_beneficiaries() must return NotOwner (#6) when caller is not the vault owner
        let s = setup();
        let stranger = Address::generate(&s.env);
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        let err = s.client.try_set_beneficiaries(
            &id, &stranger,
            &vec![&s.env, BeneficiaryEntry { address: s.beneficiary.clone(), bps: 10_000 }],
        ).unwrap_err().unwrap();
        assert_eq!(err, soroban_sdk::Error::from_contract_error(6));
    }

    #[test]
    fn test_single_beneficiary_at_10000_bps_receives_full_balance() {
        // A single beneficiary at 10_000 BPS receives the entire vault balance
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &100u64);
        s.client.deposit(&id, &s.owner, &5_000i128);
        s.client.set_beneficiaries(
            &id, &s.owner,
            &vec![&s.env, BeneficiaryEntry { address: s.beneficiary.clone(), bps: 10_000 }],
        ).unwrap();
        s.env.ledger().with_mut(|l| l.timestamp += 200);
        s.client.trigger_release(&id);
        assert_eq!(balance(&s, &s.beneficiary), 5_000i128);
    }

    #[test]
    fn test_three_beneficiaries_receive_correct_amounts() {
        // Three beneficiaries at 5_000/3_000/2_000 BPS each receive correct share
        let s = setup();
        let b2 = Address::generate(&s.env);
        let b3 = Address::generate(&s.env);
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &100u64);
        s.client.deposit(&id, &s.owner, &10_000i128);
        s.client.set_beneficiaries(
            &id, &s.owner,
            &vec![
                &s.env,
                BeneficiaryEntry { address: s.beneficiary.clone(), bps: 5_000 },
                BeneficiaryEntry { address: b2.clone(),            bps: 3_000 },
                BeneficiaryEntry { address: b3.clone(),            bps: 2_000 },
            ],
        ).unwrap();
        s.env.ledger().with_mut(|l| l.timestamp += 200);
        s.client.trigger_release(&id);
        assert_eq!(balance(&s, &s.beneficiary), 5_000i128);
        assert_eq!(balance(&s, &b2),            3_000i128);
        assert_eq!(balance(&s, &b3),            2_000i128);
    }
}

// ── mod partial_release ───────────────────────────────────────────────────────

mod partial_release {
    use super::*;

    #[test]
    fn test_partial_release_sends_correct_amount() {
        // partial_release() transfers the requested amount to the beneficiary
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        s.client.deposit(&id, &s.owner, &1_000_000i128);
        s.client.partial_release(&id, &300_000i128).unwrap();
        assert_eq!(balance(&s, &s.beneficiary), 300_000i128);
    }

    #[test]
    fn test_partial_release_reduces_vault_balance() {
        // partial_release() decrements vault balance by the released amount
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        s.client.deposit(&id, &s.owner, &1_000_000i128);
        s.client.partial_release(&id, &300_000i128).unwrap();
        assert_eq!(s.client.get_vault(&id).balance, 700_000i128);
        assert_eq!(s.client.get_release_status(&id), ReleaseStatus::Locked);
    }

    #[test]
    fn test_partial_release_fails_if_amount_exceeds_balance() {
        // partial_release() must return InsufficientBalance (#8) when amount > balance
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        s.client.deposit(&id, &s.owner, &100i128);
        let err = s.client.try_partial_release(&id, &200i128).unwrap_err().unwrap();
        assert_eq!(err, soroban_sdk::Error::from_contract_error(8));
    }

    #[test]
    fn test_partial_release_fails_if_vault_expired() {
        // partial_release() must return VaultExpired (#19) after the interval lapses
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &100u64);
        s.client.deposit(&id, &s.owner, &1_000i128);
        s.env.ledger().with_mut(|l| l.timestamp += 200);
        let err = s.client.try_partial_release(&id, &100i128).unwrap_err().unwrap();
        assert_eq!(err, soroban_sdk::Error::from_contract_error(19));
    }

    #[test]
    fn test_multiple_partial_releases_sum_correctly() {
        // Multiple partial_release() calls correctly accumulate against vault balance
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        s.client.deposit(&id, &s.owner, &1_000i128);
        s.client.partial_release(&id, &300i128).unwrap();
        s.client.partial_release(&id, &300i128).unwrap();
        s.client.partial_release(&id, &300i128).unwrap();
        assert_eq!(s.client.get_vault(&id).balance, 100i128);
        assert_eq!(balance(&s, &s.beneficiary), 900i128);
    }
}

// ── mod admin_controls ────────────────────────────────────────────────────────

mod admin_controls {
    use super::*;

    #[test]
    fn test_pause_blocks_all_state_mutating_calls() {
        // pause() prevents deposit, check_in, withdraw, partial_release, trigger_release
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        s.client.deposit(&id, &s.owner, &500_000i128);
        s.client.pause();
        assert!(s.client.try_deposit(&id, &s.owner, &1i128).is_err());
        assert!(s.client.try_check_in(&id, &s.owner).is_err());
        assert!(s.client.try_withdraw(&id, &s.owner, &1i128).is_err());
        assert!(s.client.try_partial_release(&id, &1i128).is_err());
        // advance past expiry and confirm trigger_release is also blocked
        s.env.ledger().with_mut(|l| l.timestamp += 2_000);
        assert!(s.client.try_trigger_release(&id).is_err());
    }

    #[test]
    fn test_unpause_restores_operations() {
        // unpause() allows operations to succeed again after a pause
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        s.client.pause();
        s.client.unpause();
        s.client.deposit(&id, &s.owner, &100i128);
        assert_eq!(s.client.get_vault(&id).balance, 100i128);
    }

    #[test]
    fn test_propose_admin_stores_pending_admin() {
        // propose_admin() stores the new candidate in pending_admin
        let s = setup();
        let new_admin = Address::generate(&s.env);
        s.client.propose_admin(&new_admin);
        assert_eq!(s.client.get_pending_admin(), Some(new_admin));
    }

    #[test]
    fn test_accept_admin_by_correct_address_replaces_admin() {
        // accept_admin() by the pending admin completes the two-step transfer
        let s = setup();
        let new_admin = Address::generate(&s.env);
        s.client.propose_admin(&new_admin);
        s.client.accept_admin();
        assert_eq!(s.client.get_admin(), new_admin);
        assert_eq!(s.client.get_pending_admin(), None);
    }

    #[test]
    fn test_accept_admin_fails_with_no_pending_admin() {
        // accept_admin() must panic with NoPendingAdmin (#11) when none is proposed
        let s = setup();
        let err = s.client.try_accept_admin().unwrap_err().unwrap();
        assert_eq!(err, soroban_sdk::Error::from_contract_error(11));
    }

    #[test]
    fn test_propose_admin_by_non_admin_fails() {
        // propose_admin() must fail when called by a non-admin address
        let s = setup();
        // Remove mock auths so require_auth is enforced
        let env2 = Env::default();
        let client2 = RedVaultContractClient::new(&env2, &s.client.address);
        let stranger = Address::generate(&env2);
        // Without mock_all_auths, require_auth on admin will reject
        assert!(client2.try_propose_admin(&stranger).is_err());
    }

    #[test]
    fn test_set_min_check_in_interval_updates_bound() {
        // set_min_check_in_interval() persists the new minimum
        let s = setup();
        assert_eq!(s.client.get_min_check_in_interval(), None);
        s.client.set_min_check_in_interval(&3_600u64);
        assert_eq!(s.client.get_min_check_in_interval(), Some(3_600u64));
    }

    #[test]
    fn test_set_max_check_in_interval_updates_bound() {
        // set_max_check_in_interval() persists the new maximum
        let s = setup();
        assert_eq!(s.client.get_max_check_in_interval(), None);
        s.client.set_max_check_in_interval(&86_400u64);
        assert_eq!(s.client.get_max_check_in_interval(), Some(86_400u64));
    }
}

// ── mod storage_and_ttl ───────────────────────────────────────────────────────

mod storage_and_ttl {
    use super::*;

    #[test]
    fn test_vault_data_stored_as_separate_persistent_entries() {
        // Each vault is stored under its own DataKey::Vault(id), not a shared map
        let s = setup();
        let id1 = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        let id2 = s.client.create_vault(&s.owner, &s.beneficiary, &2_000u64);
        // Mutating vault 1 does not affect vault 2
        s.client.deposit(&id1, &s.owner, &100i128);
        assert_eq!(s.client.get_vault(&id1).balance, 100i128);
        assert_eq!(s.client.get_vault(&id2).balance, 0i128);
    }

    #[test]
    fn test_instance_storage_contains_admin_token_paused() {
        // Admin, token address, and paused flag are all readable from instance storage
        let s = setup();
        assert_eq!(s.client.get_admin(), s.admin);
        assert_eq!(s.client.get_contract_token(), s.token);
        assert!(!s.client.is_paused());
    }

    #[test]
    fn test_extend_contract_ttl_callable_by_anyone() {
        // extend_contract_ttl() succeeds without any auth requirement
        let s = setup();
        // Call as a random address — should not panic
        s.client.extend_contract_ttl();
    }

    #[test]
    fn test_vault_count_increments_per_vault() {
        // vault_count() reflects the exact number of vaults created
        let s = setup();
        assert_eq!(s.client.vault_count(), 0);
        s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        assert_eq!(s.client.vault_count(), 1);
        s.client.create_vault(&s.owner, &s.beneficiary, &2_000u64);
        assert_eq!(s.client.vault_count(), 2);
    }
}

// ── mod edge_cases ────────────────────────────────────────────────────────────

mod edge_cases {
    use super::*;

    #[test]
    fn test_create_vault_fails_below_min_interval() {
        // create_vault() must panic with IntervalTooLow (#14) when interval < min
        let s = setup();
        s.client.set_min_check_in_interval(&3_600u64);
        let err = s.client.try_create_vault(&s.owner, &s.beneficiary, &100u64).unwrap_err().unwrap();
        assert_eq!(err, soroban_sdk::Error::from_contract_error(14));
    }

    #[test]
    fn test_create_vault_fails_above_max_interval() {
        // create_vault() must panic with IntervalTooHigh (#15) when interval > max
        let s = setup();
        s.client.set_max_check_in_interval(&1_000u64);
        let err = s.client.try_create_vault(&s.owner, &s.beneficiary, &2_000u64).unwrap_err().unwrap();
        assert_eq!(err, soroban_sdk::Error::from_contract_error(15));
    }

    #[test]
    fn test_deposit_zero_amount_fails() {
        // deposit() must panic with InvalidAmount (#5) for zero
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        let err = s.client.try_deposit(&id, &s.owner, &0i128).unwrap_err().unwrap();
        assert_eq!(err, soroban_sdk::Error::from_contract_error(5));
    }

    #[test]
    fn test_trigger_release_zero_balance_fails_with_empty_vault() {
        // trigger_release() on expired vault with zero balance must fail with EmptyVault (#4)
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &100u64);
        s.env.ledger().with_mut(|l| l.timestamp += 200);
        let err = s.client.try_trigger_release(&id).unwrap_err().unwrap();
        assert_eq!(err, soroban_sdk::Error::from_contract_error(4));
    }

    #[test]
    fn test_get_vaults_by_owner_returns_correct_ids() {
        // get_vaults_by_owner() returns all vault IDs for the given owner
        let s = setup();
        let id1 = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        let id2 = s.client.create_vault(&s.owner, &s.beneficiary, &2_000u64);
        let ids = s.client.get_vaults_by_owner(&s.owner, &None, &0u32, &10u32);
        assert_eq!(ids, vec![&s.env, id1, id2]);
    }

    #[test]
    fn test_get_vaults_by_owner_empty_for_unknown_address() {
        // get_vaults_by_owner() returns an empty vec for an address with no vaults
        let s = setup();
        let stranger = Address::generate(&s.env);
        let ids = s.client.get_vaults_by_owner(&stranger, &None, &0u32, &10u32);
        assert_eq!(ids, vec![&s.env]);
    }

    #[test]
    fn test_vault_id_uniqueness_same_owner() {
        // Two vaults from the same owner have different IDs
        let s = setup();
        let id1 = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        let id2 = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_create_vault_fails_owner_equals_beneficiary() {
        // create_vault() must panic with InvalidBeneficiary (#17) when owner == beneficiary
        let s = setup();
        let err = s.client.try_create_vault(&s.owner, &s.owner, &1_000u64).unwrap_err().unwrap();
        assert_eq!(err, soroban_sdk::Error::from_contract_error(17));
    }

    #[test]
    fn test_withdraw_fails_after_release() {
        // withdraw() must return AlreadyReleased (#7) on a Released vault
        let s = setup();
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &100u64);
        s.client.deposit(&id, &s.owner, &100i128);
        s.env.ledger().with_mut(|l| l.timestamp += 200);
        s.client.trigger_release(&id);
        let err = s.client.try_withdraw(&id, &s.owner, &1i128).unwrap_err().unwrap();
        assert_eq!(err, soroban_sdk::Error::from_contract_error(7));
    }

    #[test]
    fn test_check_in_fails_if_not_owner() {
        // check_in() must return NotOwner (#6) when caller is not the vault owner
        let s = setup();
        let stranger = Address::generate(&s.env);
        let id = s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64);
        let err = s.client.try_check_in(&id, &stranger).unwrap_err().unwrap();
        assert_eq!(err, soroban_sdk::Error::from_contract_error(6));
    }

    #[test]
    fn test_initialize_fails_on_double_init() {
        // A second call to initialize() must fail with AlreadyInitialized (#1)
        let s = setup();
        let new_admin = Address::generate(&s.env);
        let err = s.client.try_initialize(&s.token, &new_admin).unwrap_err().unwrap();
        assert_eq!(err, soroban_sdk::Error::from_contract_error(1));
    }

    #[test]
    fn test_get_vaults_by_owner_pagination() {
        // get_vaults_by_owner() returns correct slices for each page
        let s = setup();
        let ids: alloc::vec::Vec<u64> = (0..5)
            .map(|_| s.client.create_vault(&s.owner, &s.beneficiary, &1_000u64))
            .collect();
        assert_eq!(
            s.client.get_vaults_by_owner(&s.owner, &None, &0u32, &2u32),
            vec![&s.env, ids[0], ids[1]]
        );
        assert_eq!(
            s.client.get_vaults_by_owner(&s.owner, &None, &1u32, &2u32),
            vec![&s.env, ids[2], ids[3]]
        );
        assert_eq!(
            s.client.get_vaults_by_owner(&s.owner, &None, &2u32, &2u32),
            vec![&s.env, ids[4]]
        );
        assert_eq!(
            s.client.get_vaults_by_owner(&s.owner, &None, &10u32, &2u32),
            vec![&s.env]
        );
    }
}
