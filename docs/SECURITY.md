# Security Guide

**Last reviewed**: March 4, 2026

This document describes the threat model, security controls, and secure deployment requirements for the Hedera Hydropower MRV system.

---

## Threat Model

### Assets to Protect

| Asset | Impact if compromised |
|---|---|
| Hedera operator private key | Full control of HCS topic and HTS token; fraudulent credit minting |
| API keys | Ability to submit arbitrary telemetry readings |
| Redis store | Replay protection bypass if cleared or corrupted |
| HCS audit trail | Read-only on-chain; cannot be altered by any party |

### Threats Considered

| Threat | Likelihood | Mitigation |
|---|---|---|
| Fraudulent telemetry submission (inflated generation) | High | 5-layer verification engine; trust scoring |
| Replay attack (resubmitting a past approved reading) | Medium | Redis-backed deduplication by plant+device+timestamp |
| API key theft | Medium | Per-operator keys; rate limiting; key rotation procedure |
| Operator private key exposure | Medium | Environment variable isolation; never commit to repository |
| Man-in-the-middle on IoT transmission | Low | TLS required on all endpoints |
| Sensor hardware tampering | Low | Device DID attestation (Phase 3); statistical anomaly detection |

### Out of Scope (current version)

- Hardware security modules (HSMs) for private key storage
- Zero-knowledge proofs for reading privacy
- Formal smart contract audit

---

## API Keys

### What You Must Do

- **Generate one key per operator.** Never share a key between two plants or two operators.
- **Rotate keys immediately** if there is any suspicion of exposure.
- **Invalidate the demo key** (`demokey001`) before moving to production. It is not a valid production credential.
- **Store keys in environment variables**, not in code or configuration files committed to source control.

### What You Must Not Do

- Do not use `demokey001` in any environment that writes real telemetry data.
- Do not log API keys in application logs or monitoring systems.
- Do not pass API keys as URL query parameters (they appear in server logs).

### Key Generation

```bash
# Generate a cryptographically random key (32 bytes, hex-encoded)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Store the generated key in your deployment environment's secret management system (Vercel Environment Variables, AWS Secrets Manager, or equivalent).

---

## Hedera Operator Private Key

The Hedera operator private key is the most sensitive credential in the system. It authorises all HCS submissions and HTS token minting.

### Requirements

- Store exclusively in environment variables (`HEDERA_OPERATOR_KEY`). Never commit to version control.
- Use a dedicated testnet account for development. Use a dedicated mainnet account for production. Do not share accounts between environments.
- Rotate the key immediately if it is exposed. File a new operator key with Hedera and update all deployment environments.
- For production, consider using a Hardware Security Module (HSM) or Hedera's key management service.

### Environment Variable Setup

```bash
# .env (never commit this file)
HEDERA_OPERATOR_ID=0.0.XXXXXXX
HEDERA_OPERATOR_KEY=302e020100300506032b657004220420...
HEDERA_NETWORK=testnet
```

The `.env` file is listed in `.gitignore`. Verify this before any commit.

---

## Redis

Redis stores the replay protection deduplication index. If Redis is unavailable, the system falls back to pass-through mode (no deduplication), which is a security degradation.

### Production Requirements

- Run Redis with authentication enabled (`requirepass` directive).
- Do not expose Redis port (6379) to the public internet. Bind to localhost or a private network only.
- Use TLS if Redis is accessed over a network (managed Redis services provide this).
- Set a reasonable TTL on deduplication keys (recommended: 48 hours) to prevent unbounded memory growth.

### Environment Variable

```bash
REDIS_URL=redis://:yourpassword@localhost:6379
```

---

## Edge Device / IoT Security

For devices deployed at plant sites:

- **Use industrial-grade hardware** for production installations. Consumer-grade single-board computers (e.g. Raspberry Pi) require specific hardening before production use (see below).
- **Enable HTTPS only.** Disable HTTP on the device's outbound configuration.
- **Store credentials in hardware-backed storage** where available (TPM, secure element).
- **Apply OS security updates** regularly.
- **Disable unnecessary services** (SSH from public internet, unused network interfaces).
- **Use read-only filesystem** for the root partition where possible.

### Minimum Hardening for SBCs in Production

If deploying on a single-board computer:

```bash
# Change default credentials immediately
passwd

# Disable password auth for SSH; use key-based auth only
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no

# Restrict SSH to management VLAN only
# (configure at router/firewall level)

# Enable automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure unattended-upgrades

# Disable unused services
sudo systemctl disable bluetooth
sudo systemctl disable avahi-daemon
```

For production deployments handling more than 100 kW, an industrial gateway (e.g. Advantech, Moxa) is strongly recommended over a consumer SBC.

---

## Transport Security

- All API communication must use HTTPS (TLS 1.2 minimum, TLS 1.3 recommended).
- The Vercel deployment enforces HTTPS automatically.
- For self-hosted deployments, configure a reverse proxy (nginx, Caddy) to terminate TLS.

---

## Dependency Security

```bash
# Audit npm dependencies for known vulnerabilities
npm audit

# Apply automatic fixes where available
npm audit fix
```

Review the audit output before each production deployment. Do not deploy with high-severity unaddressed vulnerabilities.

---

## Reporting a Vulnerability

If you discover a security vulnerability, open a **private** GitHub Security Advisory rather than a public issue. Do not include exploit details in public issues or pull request descriptions.
