import {
  serviceMessage,
  serializeServiceMessageDescriptor,
  type ServiceMessageFragment,
} from "../shared/service-messages.js";
import forge from "node-forge";
import fs from "fs";
import path from "path";
import { configLoader } from "./config-loader.js";
import { assertWithinRoots } from "./path-security.js";

const { mkdir, writeFile, readFile } = fs.promises;

export function createHttpsServerOptions(key: Buffer, cert: Buffer) {
  return { key, cert, minVersion: "TLSv1.2" as const };
}

// Use the directory where config.yaml is located + /ssl
const SSL_DIR = path.join(configLoader.getConfigDir(), "ssl");

export async function ensureSslDir() {
  if (!fs.existsSync(SSL_DIR)) {
    await mkdir(SSL_DIR, { recursive: true });
  }
}

export async function generateSelfSignedCert() {
  await ensureSslDir();

  console.log("Generating 2048-bit key-pair...");
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  const attrs = [
    {
      name: "commonName",
      value: "Questarr Self-Signed",
    },
    {
      name: "countryName",
      value: "US",
    },
    {
      shortName: "ST",
      value: "Virginia",
    },
    {
      name: "localityName",
      value: "Blacksburg",
    },
    {
      name: "organizationName",
      value: "Questarr",
    },
    {
      shortName: "OU",
      value: "Questarr",
    },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey);

  const pemKey = forge.pki.privateKeyToPem(keys.privateKey);
  const pemCert = forge.pki.certificateToPem(cert);

  const keyPath = path.join(SSL_DIR, "server.key");
  const certPath = path.join(SSL_DIR, "server.crt");

  await writeFile(keyPath, pemKey);
  await writeFile(certPath, pemCert);

  return {
    keyPath,
    certPath,
  };
}

/** Preserve the original English result while carrying only explicitly owned copy. */
function invalidCertificate(fragment: ServiceMessageFragment) {
  return {
    valid: false,
    error: fragment.message,
    errorI18n: serializeServiceMessageDescriptor(fragment),
  };
}

export async function validateCertFiles(
  certPath: string,
  keyPath: string
): Promise<{ valid: boolean; error?: string; errorI18n?: string | null; expiry?: Date }> {
  try {
    const allowedRoots = [process.cwd(), SSL_DIR];
    const safeCertPath = await assertWithinRoots(
      certPath,
      allowedRoots,
      "Certificate path is outside the allowed directories"
    );
    const safeKeyPath = await assertWithinRoots(
      keyPath,
      allowedRoots,
      "Private key path is outside the allowed directories"
    );

    if (!fs.existsSync(safeCertPath)) {
      return invalidCertificate(serviceMessage("service.ssl_certificate_missing", {}));
    }
    if (!fs.existsSync(safeKeyPath)) {
      return invalidCertificate(serviceMessage("service.ssl_private_key_missing", {}));
    }

    // Read files
    const certPem = await readFile(safeCertPath, "utf8");
    const keyPem = await readFile(safeKeyPath, "utf8");

    // 1. Basic Content Check
    if (!certPem.includes("BEGIN CERTIFICATE")) {
      return invalidCertificate(serviceMessage("service.ssl_certificate_format_invalid", {}));
    }
    if (!keyPem.includes("PRIVATE KEY")) {
      return invalidCertificate(serviceMessage("service.ssl_private_key_format_invalid", {}));
    }

    // 2. Parse with node-forge to check details
    let cert;
    try {
      cert = forge.pki.certificateFromPem(certPem);
    } catch {
      return invalidCertificate(serviceMessage("service.ssl_certificate_content_invalid", {}));
    }

    // Check expiry
    const now = new Date();
    if (cert.validity.notAfter < now) {
      return {
        ...invalidCertificate(
          serviceMessage("service.ssl_certificate_expired", {
            date: cert.validity.notAfter.toISOString(),
          })
        ),
        expiry: cert.validity.notAfter,
      };
    }

    // 3. Verify Key Match using Node's crypto/tls (most reliable for runtime)
    // tls.createSecureContext will throw if the key doesn't match the cert
    try {
      const { createSecureContext } = await import("tls");
      createSecureContext({
        cert: certPem,
        key: keyPem,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return invalidCertificate(
        serviceMessage("service.ssl_certificate_key_invalid", { detail: message })
      );
    }

    return { valid: true, expiry: cert.validity.notAfter };
  } catch (error) {
    console.error("Certificate validation failed:", error);
    return invalidCertificate(serviceMessage("service.ssl_unknown_validation_error", {}));
  }
}

export async function getCertInfo(certPath: string): Promise<{
  valid: boolean;
  subject?: string;
  issuer?: string;
  validFrom?: Date;
  validTo?: Date;
  selfSigned?: boolean;
  error?: string;
}> {
  try {
    if (certPath.includes("\0") || certPath.includes("..")) {
      return { valid: false, error: "Invalid certificate path" };
    }

    if (!fs.existsSync(certPath)) {
      return { valid: false, error: "Certificate file not found" };
    }

    const certPem = await readFile(certPath, "utf8");
    const cert = forge.pki.certificateFromPem(certPem);

    const subject = cert.subject.attributes
      .map((attr: forge.pki.CertificateField) => `${attr.shortName || attr.name}=${attr.value}`)
      .join(", ");
    const issuer = cert.issuer.attributes
      .map((attr: forge.pki.CertificateField) => `${attr.shortName || attr.name}=${attr.value}`)
      .join(", ");

    // Check if self-signed (Issuer == Subject is a simple heuristic, though technically signature verification is better, this is sufficient for UI)
    // Actually, let's just compare the string representations of subject and issuer attributes
    const selfSigned = subject === issuer;

    return {
      valid: true,
      subject,
      issuer,
      validFrom: cert.validity.notBefore,
      validTo: cert.validity.notAfter,
      selfSigned,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { valid: false, error: `Failed to parse certificate: ${message}` };
  }
}
