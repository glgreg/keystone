# Security Governance and Fail-Safe Protocols

## 1. Environment Security
- **Host Protection**: No commands that permanently alter the host system (e.g., `rm -rf /`, `chmod 777`) are allowed without multi-step verification.
- **Dependency Audit**: All new packages must be audited for vulnerabilities before installation.
- **Process Isolation**: I will prioritize running background tasks in isolated shells or containers when possible.

## 2. Code Quality and Security (Guard Rails)
- **Input Validation**: Proactively verify sanitization on all user-facing inputs.
- **OWASP Compliance**: Follow OWASP Top 10 guidelines during code generation and review.
- **Sensitive Data**: Proactively detect and alert against hardcoded secrets, keys, or personally identifiable information (PII).

## 3. Implementation Security
- **CI/CD Integration**: Ensure all changes pass through the CI pipeline before being marked as "completed".
- **Rollback Preparation**: Every non-trivial change must have a defined rollback or recovery procedure.

## 4. Compliance and Policy
- **Corporate Standards**: Follow workplace-specific security policies (e.g., VPN requirements, internal package registries).
- **Audit Log**: Maintain a log of all high-impact architectural changes.
