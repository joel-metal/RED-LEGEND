# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in RED-LEGEND, please **do not open a public GitHub issue**.

Report it privately by emailing the maintainer or opening a [GitHub Security Advisory](https://github.com/joel-metal/RED-LEGEND/security/advisories/new).

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

You will receive a response within 72 hours. We will coordinate a fix and disclosure timeline with you.

---

## Scope

### In scope
- `contracts/red_vault/src/lib.rs` — all public contract functions
- `contracts/red_vault/src/types.rs` — data structures
- Frontend authentication flows (`frontend/src/lib/passkey.ts`, `useAuth.ts`)
- Incorrect BPS arithmetic leading to fund loss
- Auth bypass on owner-only functions
- Reentrancy or double-spend vectors

### Out of scope
- **Testnet deployments** — this contract has not been audited and is testnet-only
- Issues requiring physical access to the user's device
- Social engineering attacks
- Stellar network-level issues (report those to the [Stellar Bug Bounty](https://www.stellar.org/bug-bounty-program))

---

## Known risks

| Risk | Mitigation |
|---|---|
| Owner key compromise | Attacker can withdraw all funds before expiry. Use hardware wallet. |
| Beneficiary address error | Funds sent to wrong address are unrecoverable. Double-check before creating vault. |
| Reminder system failure | No on-chain reminder exists. Owner must maintain their own check-in schedule. |
| No oracle for real-world death | Contract only enforces the check-in deadline, not actual death. |
| TTL exhaustion attack | **Not applicable** — expiry is timestamp-based, not TTL-based. Anyone extending TTL cannot prevent or delay release. |
| Admin key compromise | Admin can pause the contract but cannot access vault funds. Two-step admin transfer reduces risk. |

---

## Audit status

**No security audit has been performed.** Do not use this contract on Stellar mainnet or with real funds until a professional audit is completed.
