// XAdES-BES enveloped signing with a PEM certificate + private key.
//
// Nothing here is KSeF-specific: it takes an XML document and a keypair and
// returns the signed document. Everything runs client-side — the private key
// never leaves the browser.
//
// Keys are turned into JWKs and imported straight into WebCrypto rather than
// round-tripped through PKCS#8 DER, which avoids ASN.1 (re)encoding bugs that
// made crypto.subtle reject some real-world certificates with an opaque
// DataError.

import * as forge from 'node-forge'
import * as xadesjs from 'xadesjs'

interface SigningKeyMaterial {
  algorithm: RsaHashedImportParams | EcKeyImportParams
  jwk: JsonWebKey
}

const RSA_ENCRYPTION_OID = forge.pki.oids.rsaEncryption as string
const EC_PUBLIC_KEY_OID = '1.2.840.10045.2.1'

const EC_CURVES: Record<string, { jwkName: string; hash: string }> = {
  '1.2.840.10045.3.1.7': { jwkName: 'P-256', hash: 'SHA-256' },
  '1.3.132.0.34': { jwkName: 'P-384', hash: 'SHA-384' },
  '1.3.132.0.35': { jwkName: 'P-521', hash: 'SHA-512' },
}

function pemCertToBase64Der(certPem: string): string {
  return certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '')
}

function byteStringToBase64Url(bytes: string): string {
  return forge.util.encode64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Converts a forge BigInteger to the base64url encoding JWK expects (minimal
// big-endian byte representation, no padding).
function bigIntToBase64Url(value: forge.jsbn.BigInteger): string {
  let hex = value.toString(16)
  if (hex.length % 2) hex = `0${hex}`
  return byteStringToBase64Url(forge.util.hexToBytes(hex))
}

// Parses a SEC1 ECPrivateKey DER structure (RFC 5915), optionally falling back
// to a curve OID inherited from the enclosing PKCS#8 AlgorithmIdentifier.
function parseEcPrivateKeyOctet(octetBytes: string, curveOidFromOuter?: string): SigningKeyMaterial {
  const ecAsn1 = forge.asn1.fromDer(octetBytes)
  const seq = ecAsn1.value as forge.asn1.Asn1[]
  const privateKeyOctet = seq[1].value as string

  let curveOid = curveOidFromOuter
  let publicKeyBits: string | undefined

  for (let i = 2; i < seq.length; i++) {
    const item = seq[i]
    if (item.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && item.type === 0) {
      const inner = (item.value as forge.asn1.Asn1[])[0]
      curveOid = forge.asn1.derToOid(inner.value as string)
    }
    if (item.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && item.type === 1) {
      const bitString = (item.value as forge.asn1.Asn1[])[0]
      publicKeyBits = bitString.value as string
    }
  }

  if (!curveOid || !EC_CURVES[curveOid]) {
    throw new Error(`Unsupported EC curve${curveOid ? `: ${curveOid}` : ''}`)
  }
  if (!publicKeyBits) {
    throw new Error('EC private key does not embed its public key point - unsupported')
  }

  // BIT STRING content: first byte is the "unused bits" count, then
  // 0x04 || X || Y (uncompressed point encoding).
  const pointBytes = publicKeyBits.slice(1)
  if (pointBytes.charCodeAt(0) !== 0x04) {
    throw new Error('Only uncompressed EC public key points are supported')
  }
  const coordLength = (pointBytes.length - 1) / 2

  const curve = EC_CURVES[curveOid]
  return {
    algorithm: { name: 'ECDSA', hash: curve.hash, namedCurve: curve.jwkName } as EcKeyImportParams,
    jwk: {
      kty: 'EC',
      crv: curve.jwkName,
      x: byteStringToBase64Url(pointBytes.slice(1, 1 + coordLength)),
      y: byteStringToBase64Url(pointBytes.slice(1 + coordLength)),
      d: byteStringToBase64Url(privateKeyOctet),
    },
  }
}

function rsaPrivateKeyToJwk(rsaPrivateKey: forge.pki.rsa.PrivateKey): SigningKeyMaterial {
  return {
    algorithm: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    jwk: {
      kty: 'RSA',
      n: bigIntToBase64Url(rsaPrivateKey.n),
      e: bigIntToBase64Url(rsaPrivateKey.e),
      d: bigIntToBase64Url(rsaPrivateKey.d),
      p: bigIntToBase64Url(rsaPrivateKey.p),
      q: bigIntToBase64Url(rsaPrivateKey.q),
      dp: bigIntToBase64Url(rsaPrivateKey.dP),
      dq: bigIntToBase64Url(rsaPrivateKey.dQ),
      qi: bigIntToBase64Url(rsaPrivateKey.qInv),
    },
  }
}

// Reads a (decrypted) PKCS#8 PrivateKeyInfo ASN.1 structure and builds signing
// key material for whichever algorithm it actually contains — RSA or EC. KSeF
// accepts XAdES signatures made with either, so we can't assume RSA.
function privateKeyInfoToSigningMaterial(privateKeyInfo: forge.asn1.Asn1): SigningKeyMaterial {
  const seq = privateKeyInfo.value as forge.asn1.Asn1[]
  const algorithmIdSeq = seq[1].value as forge.asn1.Asn1[]
  const algorithmOid = forge.asn1.derToOid(algorithmIdSeq[0].value as string)

  if (algorithmOid === RSA_ENCRYPTION_OID) {
    const rsaPrivateKey = forge.pki.privateKeyFromAsn1(privateKeyInfo) as forge.pki.rsa.PrivateKey
    return rsaPrivateKeyToJwk(rsaPrivateKey)
  }

  if (algorithmOid === EC_PUBLIC_KEY_OID) {
    const curveOidFromParams = algorithmIdSeq[1]
      ? forge.asn1.derToOid(algorithmIdSeq[1].value as string)
      : undefined
    return parseEcPrivateKeyOctet(seq[2].value as string, curveOidFromParams)
  }

  throw new Error(`Unsupported private key algorithm (OID ${algorithmOid}) - expected RSA or EC`)
}

// Decrypts the (password protected) private key, regardless of whether it's
// stored as encrypted PKCS#8, traditional encrypted PKCS#1 RSA, or
// unencrypted PEM.
function decryptPrivateKeyToSigningMaterial(keyPem: string, password: string): SigningKeyMaterial {
  if (keyPem.includes('ENCRYPTED PRIVATE KEY')) {
    const encryptedPrivateKeyInfo = forge.pki.encryptedPrivateKeyFromPem(keyPem)
    let privateKeyInfo: forge.asn1.Asn1 | null
    try {
      privateKeyInfo = forge.pki.decryptPrivateKeyInfo(encryptedPrivateKeyInfo, password)
    } catch {
      privateKeyInfo = null
    }
    if (!privateKeyInfo) {
      throw new Error('Could not decrypt private key - check the password')
    }
    return privateKeyInfoToSigningMaterial(privateKeyInfo)
  }

  if (keyPem.includes('RSA PRIVATE KEY')) {
    const decrypted = forge.pki.decryptRsaPrivateKey(keyPem, password)
    if (!decrypted) {
      throw new Error('Could not decrypt private key - check the password')
    }
    return rsaPrivateKeyToJwk(decrypted)
  }

  if (keyPem.includes('EC PRIVATE KEY')) {
    // Traditional SEC1 format is not password-encrypted the same way PKCS#8
    // is; encrypted variants (Proc-Type/DEK-Info headers) aren't supported.
    if (keyPem.includes('Proc-Type')) {
      throw new Error('Encrypted traditional EC keys are not supported - convert with `openssl pkcs8 -topk8` first')
    }
    return parseEcPrivateKeyOctet(forge.pem.decode(keyPem)[0].body)
  }

  if (keyPem.includes('PRIVATE KEY')) {
    // Unencrypted PKCS#8 — still works, the password is simply ignored.
    const der = forge.pem.decode(keyPem)[0].body
    return privateKeyInfoToSigningMaterial(forge.asn1.fromDer(der))
  }

  throw new Error('Unrecognized private key format - expected a PEM encoded RSA or EC key')
}

export interface SigningCertificate {
  certPem: string
  keyPem: string
  keyPassword: string
}

// Signs an XML document with an XAdES-BES enveloped signature. Supports both
// RSA and EC (ECDSA) certificates, matching the reference KSeF client SDKs.
export async function signXmlWithCertificate(xml: string, certificate: SigningCertificate): Promise<string> {
  const { algorithm, jwk } = decryptPrivateKeyToSigningMaterial(certificate.keyPem, certificate.keyPassword)
  const signingKey = await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['sign'])

  const signedXml = new xadesjs.SignedXml()
  await signedXml.Sign(algorithm, signingKey, xadesjs.Parse(xml), {
    x509: [pemCertToBase64Der(certificate.certPem)],
    // uri: '' must be explicit — xmldsigjs.Reference.Uri defaults to
    // `undefined` and is only serialized when explicitly assigned. Without it
    // the enveloped reference is emitted without a URI attribute at all,
    // which KSeF's backend parses as a null reference ("Element wskazywany
    // przez referencję 'null' nie został odnaleziony" / exceptionCode 9105).
    references: [{ uri: '', hash: 'SHA-256', transforms: ['enveloped'] }],
  })

  return signedXml.toString()
}
