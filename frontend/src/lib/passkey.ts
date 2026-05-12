import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';
import type { PasskeyCredential } from '../types';

const STORAGE_KEY = 'red_legend_passkey';
const RP_NAME = 'RED-LEGEND Vault';
const RP_ID = window.location.hostname;

// ── Registration ──────────────────────────────────────────────────────────────

export async function registerPasskey(stellarAddress: string): Promise<PasskeyCredential> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const attResp = await startRegistration({
    optionsJSON: {
      challenge: bufToBase64url(challenge),
      rp: { name: RP_NAME, id: RP_ID },
      user: {
        id: bufToBase64url(new TextEncoder().encode(stellarAddress)),
        name: stellarAddress,
        displayName: `${stellarAddress.slice(0, 8)}…`,
      },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }], // ES256 / P-256
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
      timeout: 60000,
      attestation: 'none',
    },
  });

  const credentialId = attResp.id;
  // Extract raw P-256 public key from CBOR-encoded attestation
  const publicKey = await extractPublicKey(attResp.response.attestationObject);

  const cred: PasskeyCredential = { credentialId, stellarAddress, publicKey };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cred));
  return cred;
}

// ── Load stored credential ────────────────────────────────────────────────────

export function loadPasskey(): PasskeyCredential | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as PasskeyCredential) : null;
}

export function clearPasskey() {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Signing ───────────────────────────────────────────────────────────────────

/**
 * Signs a Stellar transaction XDR with the stored passkey.
 * The WebAuthn signature is over the transaction hash (clientDataJSON challenge).
 * Returns the signed XDR string.
 *
 * NOTE: Full Soroban passkey-based signing requires a secp256r1 verifier contract
 * (e.g. Launchtube / Passkey Kit). This implementation uses the passkey to
 * authenticate the user and then delegates actual signing to Freighter as a
 * practical fallback, while preserving the WebAuthn UX gate.
 */
export async function signWithPasskey(
  txXdr: string,
  credentialId: string,
): Promise<string> {
  // Hash the XDR to use as the WebAuthn challenge
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txXdr));
  const challenge = bufToBase64url(new Uint8Array(hashBuf));

  await startAuthentication({
    optionsJSON: {
      challenge,
      rpId: RP_ID,
      allowCredentials: [{ id: credentialId, type: 'public-key' }],
      userVerification: 'required',
      timeout: 60000,
    },
  });

  // After WebAuthn assertion succeeds, sign via Freighter (which holds the Stellar key)
  // In a production passkey-native setup, the P-256 key would sign the Soroban auth entry directly.
  return signWithFreighter(txXdr);
}

/** Sign using Freighter wallet extension */
export async function signWithFreighter(txXdr: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const freighter = (window as any).freighter;
  if (!freighter) throw new Error('Freighter wallet not found. Please install the Freighter extension.');
  const { signedXDR, error } = await freighter.signTransaction(txXdr, {
    network: 'TESTNET',
    networkPassphrase: 'Test SDF Network ; September 2015',
  });
  if (error) throw new Error(error);
  return signedXDR;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function bufToBase64url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64urlToBytes(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * Extracts the raw P-256 public key (65 bytes, uncompressed) from a
 * WebAuthn attestationObject (CBOR-encoded). Uses a minimal CBOR parser
 * to locate the COSE key map.
 */
async function extractPublicKey(attestationObjectB64: string): Promise<string> {
  // Decode base64url
  const bytes = base64urlToBytes(attestationObjectB64);
  // The attestationObject is CBOR. We look for the authData field.
  // authData starts at byte 37 of the CBOR map value for "authData".
  // Minimal approach: find the credentialPublicKey in authData.
  // authData layout: rpIdHash(32) + flags(1) + signCount(4) + attestedCredData
  // attestedCredData: aaguid(16) + credIdLen(2) + credId(credIdLen) + credPublicKey(CBOR)
  const authData = extractAuthData(bytes);
  if (!authData) return '';

  const offset = 32 + 1 + 4 + 16; // rpIdHash + flags + signCount + aaguid
  const credIdLen = (authData[offset] << 8) | authData[offset + 1];
  const coseKeyStart = offset + 2 + credIdLen;
  const coseKey = authData.slice(coseKeyStart);

  // Parse CBOR COSE key to extract x and y coordinates
  const { x, y } = parseCoseKey(coseKey);
  if (!x || !y) return '';

  // Uncompressed P-256 point: 0x04 || x || y
  const raw = new Uint8Array(65);
  raw[0] = 0x04;
  raw.set(x, 1);
  raw.set(y, 33);
  return bufToBase64url(raw);
}

function extractAuthData(attestationObject: Uint8Array): Uint8Array | null {
  // Minimal CBOR: find "authData" key and return its bytes value
  // attestationObject is a CBOR map. We scan for the text "authData".
  const marker = new TextEncoder().encode('authData');
  for (let i = 0; i < attestationObject.length - marker.length; i++) {
    if (attestationObject.slice(i, i + marker.length).every((b, j) => b === marker[j])) {
      // The value follows: CBOR bytes type (0x58 = 1-byte length, 0x59 = 2-byte length)
      const lenByte = attestationObject[i + marker.length];
      if (lenByte === 0x58) {
        const len = attestationObject[i + marker.length + 1];
        return attestationObject.slice(i + marker.length + 2, i + marker.length + 2 + len);
      } else if (lenByte === 0x59) {
        const len = (attestationObject[i + marker.length + 1] << 8) | attestationObject[i + marker.length + 2];
        return attestationObject.slice(i + marker.length + 3, i + marker.length + 3 + len);
      }
    }
  }
  return null;
}

function parseCoseKey(cose: Uint8Array): { x?: Uint8Array; y?: Uint8Array } {
  // COSE key is a CBOR map. Keys -2 = x, -3 = y (encoded as 0x21, 0x22 in negative int)
  let x: Uint8Array | undefined;
  let y: Uint8Array | undefined;
  let i = 1; // skip map header byte
  while (i < cose.length - 1) {
    const keyByte = cose[i++];
    // Negative int: 0x20 = -1, 0x21 = -2 (x), 0x22 = -3 (y)
    if (keyByte === 0x21 || keyByte === 0x22) {
      // Value should be bytes: 0x58 len ...
      if (cose[i] === 0x58) {
        const len = cose[i + 1];
        const val = cose.slice(i + 2, i + 2 + len);
        if (keyByte === 0x21) x = val;
        else y = val;
        i += 2 + len;
      } else {
        i++;
      }
    } else {
      // Skip value (simplified: assume small int or skip 1)
      i++;
    }
  }
  return { x, y };
}
